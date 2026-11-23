import { afterEach, describe, expect, it, vi } from 'vitest';
import { asEngine, FakeAudioEngine } from '../../../app/test/fakeEngines';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext, installFakeWebAudio } from '../../../app/test/fakeWebAudio';
import { buildFeatureBatches } from '../../../app/features/rhythm/__fixtures__/kickBatches';
import { BeatTracker } from '../../../app/features/rhythm/beatTracker';
import { OnsetExtractor } from '../../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../../app/features/rhythm/rhythmAnalyzer';
import { RhythmTracker } from '../../../app/features/rhythm/rhythmTracker';
import { TEST_SAMPLE_RATE, concat, renderTrack, silence } from '../../../app/features/rhythm/testSignals';
import { RENDER_HZ, pushBatchToAnalyzer, replayPcm } from './replay';

// The real import is a Vite worker-URL query that only exists in the bundler.
vi.mock('../../../app/features/rhythm/rhythmProcessor.worklet?worker&url', () => ({
    default: '/assets/rhythm-worklet.js',
}));

describe('replayPcm', () => {
    const click = renderTrack({ seconds: 20, bpm: 120, beatsPerBar: 4 }).pcm;

    it('locks the tempo on a click track, finds its beats and opens the gate', () => {
        const replay = replayPcm(click, TEST_SAMPLE_RATE);
        expect(replay.seconds).toBe(20);
        expect(replay.everReportedLock).toBe(true);
        expect(replay.tempo.length).toBeGreaterThan(1900);
        expect(replay.tempo[replay.tempo.length - 1].bpm).toBeCloseTo(120, 0);
        expect(replay.beats.length).toBeGreaterThan(30);
        expect(replay.songChangeCount).toBe(0);
        expect(replay.softBoundaries).toBe(0);
        expect(replay.gate.firstOpenSeconds).not.toBeNull();
        expect(replay.gate.openShare).toBeGreaterThan(0.9);
    });

    it('reads the soft boundary of a real tempo change and the time of its song change from the analyzer', () => {
        // 100 to 170 bpm is neither an octave nor a dotted ratio, so the tracker raises one soft boundary, some time
        // after the change at 24 s.
        const pcm = concat(
            renderTrack({ seconds: 24, bpm: 100, beatsPerBar: 4 }).pcm,
            renderTrack({ seconds: 30, bpm: 170, beatsPerBar: 4, clickHz: 2200 }).pcm,
        );
        const replay = replayPcm(pcm, TEST_SAMPLE_RATE);
        expect(replay.softBoundaries).toBe(1);
        expect(replay.songChangeCount).toBe(1);
        expect(replay.songChanges).toHaveLength(1);
        expect(replay.songChanges[0].time).toBeGreaterThan(24);
        expect(replay.songChanges[0].time).toBeLessThan(54);
    });

    it('records no song change on a steady track', () => {
        expect(replayPcm(click, TEST_SAMPLE_RATE).songChanges).toEqual([]);
    });

    it('sees nothing in silence', () => {
        const replay = replayPcm(silence(8), TEST_SAMPLE_RATE);
        expect(replay.everReportedLock).toBe(false);
        expect(replay.gate).toEqual({ firstOpenSeconds: null, openShare: 0 });
        expect(replay.beats).toEqual([]);
    });

    it('steps the gate on the render clock', () => {
        const replay = replayPcm(click, TEST_SAMPLE_RATE);
        expect(RENDER_HZ).toBe(60);
        // The first opening is a multiple of the render tick, never a time between ticks.
        const ticks = replay.gate.firstOpenSeconds! * RENDER_HZ;
        expect(ticks).toBeCloseTo(Math.round(ticks), 6);
    });

    it('reports the dancer lock and opens the pre-hub gate on a steady kick track', () => {
        const replay = replayPcm(click, TEST_SAMPLE_RATE);
        expect(replay.dancerLockSeconds).not.toBeNull();
        expect(replay.dancerLockSeconds!).toBeLessThan(replay.seconds);
        // The gate cannot open before the dancer's lock, hub-fed or pre-hub.
        expect(replay.prehubGate.firstOpenSeconds).not.toBeNull();
        expect(replay.prehubGate.firstOpenSeconds!).toBeGreaterThanOrEqual(replay.dancerLockSeconds!);
        expect(replay.gate.firstOpenSeconds!).toBeGreaterThanOrEqual(replay.dancerLockSeconds!);
        expect(replay.prehubGate.openShare).toBeGreaterThan(0.5);
    });

    it('has no lock and a closed pre-hub gate in silence', () => {
        const replay = replayPcm(silence(8), TEST_SAMPLE_RATE);
        expect(replay.dancerLockSeconds).toBeNull();
        expect(replay.prehubGate).toEqual({ firstOpenSeconds: null, openShare: 0 });
        expect(replay.gateInputs.frameTimed).toEqual({ firstOpenSeconds: null, openShare: 0 });
    });

    it('feeds the pipeline the gain-controlled signal unless agc is off', () => {
        const quiet = renderTrack({ seconds: 20, bpm: 120, beatsPerBar: 4, gain: 0.1 }).pcm;
        const raw = replayPcm(quiet, TEST_SAMPLE_RATE, { agc: false });
        const controlled = replayPcm(quiet, TEST_SAMPLE_RATE);
        const defaulted = replayPcm(quiet, TEST_SAMPLE_RATE, { agc: true });
        expect(defaulted).toEqual(controlled);
        expect(controlled.onsets).not.toEqual(raw.onsets);
    });

    it('gives identical results for identical input', () => {
        const first = replayPcm(click, TEST_SAMPLE_RATE);
        const second = replayPcm(click.slice(), TEST_SAMPLE_RATE);
        expect(second).toEqual(first);
    });
});

describe('replayPcm with a gate trace', () => {
    it('records one entry per render tick and changes nothing in the result', () => {
        const pcm = renderTrack({ seconds: 6, bpm: 120, beatsPerBar: 4 }).pcm;
        const records: number[] = [];
        const plain = replayPcm(pcm, TEST_SAMPLE_RATE);
        const traced = replayPcm(pcm, TEST_SAMPLE_RATE, { gateTrace: { tick: (bass) => records.push(bass) } });
        expect(traced).toEqual(plain);
        expect(records.length).toBe(Math.floor(plain.seconds * RENDER_HZ) + 1);
    });
});

// What the beat tracker is told, in order: each kick event, and each frame it is pushed.
type Call = ['kick', number, number] | ['frame', number];

function recordBeatTracker(log: Call[]): void {
    const pushKick = BeatTracker.prototype.pushKick;
    const push = BeatTracker.prototype.push;
    vi.spyOn(BeatTracker.prototype, 'pushKick').mockImplementation(function (this: BeatTracker, time, strength) {
        log.push(['kick', time, strength]);
        pushKick.call(this, time, strength);
    });
    vi.spyOn(BeatTracker.prototype, 'push').mockImplementation(function (this: BeatTracker, time, onset) {
        log.push(['frame', time]);
        return push.call(this, time, onset);
    });
}

describe('the kick input path', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Kick events on every beat, so that a batch often carries one, and a few that are older than their batch.
    const pcm = renderTrack({ seconds: 10, bpm: 140, beatsPerBar: 4, accent: 0, sampleRate: TEST_SAMPLE_RATE }).pcm;
    const batches = buildFeatureBatches(pcm, TEST_SAMPLE_RATE);

    it('gives RhythmTracker.onMessage and the replay the same kicks in the same order before the same frames', async () => {
        const live: Call[] = [];
        recordBeatTracker(live);
        const web = installFakeWebAudio();
        const engine = new FakeAudioEngine();
        const tracker = new RhythmTracker();
        engine.setAnalyser(
            asWebAudio<AnalyserNode>(new FakeAnalyserNode(new FakeAudioContext({ sampleRate: TEST_SAMPLE_RATE }))),
        );
        tracker.start(asEngine(engine));
        await vi.waitFor(() => expect(web.workletNodes).toHaveLength(1));
        let heard = 0;
        tracker.addFeatureListener({ onBatch: () => heard++, onReset: () => {} });
        for (const batch of batches) {
            web.workletNodes[0].processorPort.postMessage(batch);
        }
        await vi.waitFor(() => expect(heard).toBe(batches.length));
        tracker.dispose();

        vi.restoreAllMocks();
        const replayed: Call[] = [];
        recordBeatTracker(replayed);
        const analyzer = new RhythmAnalyzer(new OnsetExtractor(TEST_SAMPLE_RATE).frameRate);
        for (const batch of batches) {
            pushBatchToAnalyzer(analyzer, batch, () => {});
        }

        const kicks = live.filter((call) => call[0] === 'kick');
        expect(kicks.length).toBeGreaterThan(10);
        expect(replayed).toEqual(live);

        // Each batch's kick events arrive once, in arrival order with their own times, before its first frame.
        const expected: Call[] = [];
        for (const batch of batches) {
            for (let i = 0; i < batch.onsetCount; i++) {
                if (batch.onsetBand[i] === 0) expected.push(['kick', batch.onsetTime[i], batch.onsetStrength[i]]);
            }
            for (let i = 0; i < batch.count; i++) {
                expected.push(['frame', batch.time0 + i / analyzer.frameRate]);
            }
        }
        expect(live).toEqual(expected);
    });
});
