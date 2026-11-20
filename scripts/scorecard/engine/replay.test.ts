import { describe, expect, it } from 'vitest';
import { TEST_SAMPLE_RATE, renderTrack, silence } from '../../../app/features/rhythm/testSignals';
import { RENDER_HZ, replayPcm } from './replay';

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
