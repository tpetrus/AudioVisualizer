import { AudioHub } from '../../../app/features/audio/hub/audioHub';
import { BassBump, hubLowEnd } from '../../../app/features/audio/hub/bassBump';
import type { TempoSample } from '../../../app/features/rhythm/eval/metrics';
import { BandOnsets } from '../../../app/features/rhythm/bandOnsets';
import { createBassGateState, stepBassGate } from '../../../app/features/rhythm/bassGate';
import { OnsetExtractor, packFrame, type FrameSink } from '../../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../../app/features/rhythm/rhythmAnalyzer';
import {
    BATCH_FRAMES,
    FEATURE_ONSET_BANDS,
    FEATURE_ONSET_BAND_COUNT,
    FFT_SIZE,
    FRAME_STRIDE,
    HUB_BAND_COUNT,
} from '../../../app/features/rhythm/rhythmConfig';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch } from '../../../app/features/rhythm/types';
import {
    createDanceTimingResult,
    createDanceTimingState,
    computeDanceTiming,
} from '../../../app/features/visualizers/dancing-character/dancingCharacterSync';
import {
    DANCER_BUMP_GAIN,
    DANCER_BUMP_MARGIN,
} from '../../../app/features/visualizers/dancing-character/dancingCharacterConfig';
import { countSoftBoundaries } from './boundaryProbe';

// The offline replay: the app's own pipeline over decoded PCM, with no browser. Nothing here is DSP of its own. It wires
// the same classes the worklet, the tracker, the hub and the dancing character wire, in the same order, so a number
// measured here is a number the app would produce for this audio (see the fidelity notes below).
//
// Fidelity notes (what differs from the app, and why it matters):
//  - Timing. The worklet posts a batch of BATCH_FRAMES frames when it has them, the main thread analyzes the whole batch
//    at once and the hub is read once per animation frame. This replay delivers the frames to the analyzer and the hub
//    only as whole batches, at the time of the batch's last frame, and reads both on a 60 Hz render clock (t = k / 60).
//    That batch-arrival stepping is kept on purpose, because it is the suspected cause of the gate regression; it is not
//    smoothed away. A trailing partial batch is dropped, as the worklet drops it until the next reset.
//  - Render time. Live, the render time is the context time minus the sync offset and the output latency. Here it is
//    the audio time itself (offset 0).
//  - The gate's `tempoLocked` comes from computeDanceTiming, the function the dancing character calls, so it is the
//    dancer's own lock (tempo usable and confident, hysteresis included). The scene feeds that function the active
//    clip's beat count and phase; here the clip is a fixed 8-beat loop at phase 0. They only shape the phase nudge and
//    the clip speed, which never feed back into whether the tempo is locked, so the lock and the gate are unaffected.
//    The dance director, the club and the model are not part of the gate and are not replayed.
//  - The scene clamps the frame delta to MAX_FRAME_DT and the hub clamps nothing; at 1/60 s neither clamp acts.
//  - Mono input. The worklet averages the channels; callers pass mono (readWav already mixes down).

// The render clock of the replay: one hub read and one gate step per tick.
export const RENDER_HZ = 60;
const RENDER_DT = 1 / RENDER_HZ;

// The beats of the clip the dancer's timing is asked about; see the fidelity note above.
const REPLAY_CLIP_BEATS = 8;

export interface ReplayResult {
    // Length of the audio in seconds.
    seconds: number;
    // The held tempo after every analyzed frame (bpm 0 means none), as the evaluation code reads it.
    tempo: TempoSample[];
    // Beat times derived exactly as detectFromPcm derives them.
    beats: number[];
    // Onset events of BandOnsets per band, the detector the worklet runs.
    onsets: Record<(typeof FEATURE_ONSET_BANDS)[number], number[]>;
    // songChangeCount at the end, and how many of the boundaries behind it were soft.
    songChangeCount: number;
    softBoundaries: number;
    // True if, at any render tick, the shared snapshot's own lock test held: a tempo above 0 and a beat phase (the hub's
    // `beat.locked`, which is what every visualizer reads). Not the same as the dancer's stricter lock, which also needs
    // the tempo confidence.
    everReportedLock: boolean;
    // The dancing character's gate over the replay.
    gate: {
        // Time of the first render tick at which the gate is open; null if it never opens.
        firstOpenSeconds: number | null;
        // Share of render ticks from the first opening on where it is open; 0 if it never opens.
        openShare: number;
    };
}

export function replayPcm(pcm: Float32Array, sampleRate: number): ReplayResult {
    const { result, softBoundaries } = countSoftBoundaries(() => run(pcm, sampleRate));
    return { ...result, softBoundaries };
}

function run(pcm: Float32Array, sampleRate: number): Omit<ReplayResult, 'softBoundaries'> {
    const seconds = pcm.length / sampleRate;
    const blockSize = 128;
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const bandOnsets = new BandOnsets(sampleRate, extractor.frameRate);
    const hub = new AudioHub();

    // The batch the worklet would post. Its buffers are reused: the analyzer and the hub copy what they need.
    const onsetCapacity = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;
    const batch: FeatureBatch = {
        version: FEATURE_MESSAGE_VERSION,
        time0: 0,
        count: 0,
        frames: new Float32Array(BATCH_FRAMES * FRAME_STRIDE),
        frameTimes: new Float64Array(BATCH_FRAMES),
        bandEnergy: new Float32Array(BATCH_FRAMES * HUB_BAND_COUNT),
        onsetCount: 0,
        onsetBand: new Uint8Array(onsetCapacity),
        onsetTime: new Float64Array(onsetCapacity),
        onsetStrength: new Float32Array(onsetCapacity),
    };

    const tempo: TempoSample[] = [];
    const beats: number[] = [];
    const onsets: ReplayResult['onsets'] = { kick: [], bass: [], snare: [], highs: [] };
    let lastBeatCount = 0;

    // The dancer's gate chain: the bump envelope with the dancer's own margin and gain, as the scene builds it.
    const bump = new BassBump({ margin: DANCER_BUMP_MARGIN, gain: DANCER_BUMP_GAIN });
    const timingState = createDanceTimingState();
    const timing = createDanceTimingResult();
    const timingSettings = { danceSpeed: 1 };
    const gate = createBassGateState();
    let tick = 0;
    let everReportedLock = false;
    let firstOpenSeconds: number | null = null;
    let ticksSinceOpen = 0;
    let ticksOpen = 0;

    // One animation frame: the order of the scene's update. The tracker's phase is brought to the render time, the hub
    // reads its bands and onsets at that time, the low end goes through the bump envelope, and the gate steps with the
    // dancer's own tempo lock.
    const renderTick = (): void => {
        const time = tick * RENDER_DT;
        tick++;
        analyzer.updatePhase(time);
        hub.update(time);
        if (state.bpm > 0 && state.beatPhase !== undefined) everReportedLock = true;
        const lowEnd = hubLowEnd(hub.snapshot.bands);
        const bass = bump.step(lowEnd, RENDER_DT);
        computeDanceTiming(state, REPLAY_CLIP_BEATS, 0, timingSettings, timingState, RENDER_DT, timing);
        const tempoLocked = timing.normalizedBpm !== undefined;
        stepBassGate(bass, state, tempoLocked, gate, RENDER_DT);
        if (gate.open && firstOpenSeconds === null) firstOpenSeconds = time;
        if (firstOpenSeconds !== null) {
            ticksSinceOpen++;
            if (gate.open) ticksOpen++;
        }
    };

    // Every tick strictly before `until` has happened by the time a batch that arrives at `until` is delivered; a tick at
    // exactly `until` sees it.
    const renderBefore = (until: number): void => {
        while (tick * RENDER_DT < until) renderTick();
    };

    const deliver = (arrival: number): void => {
        renderBefore(arrival);
        // The tracker's analysis: the batch's frames in order, spaced by the frame rate from the first one's time.
        for (let i = 0; i < batch.count; i++) {
            const time = batch.time0 + i / analyzer.frameRate;
            analyzer.pushFrame(time, batch.frames, i * FRAME_STRIDE);
            analyzer.updatePhase(time);
            tempo.push({ time, bpm: state.bpm });
            if (state.beatCount > lastBeatCount) {
                lastBeatCount = state.beatCount;
                // The counter rises on the first frame past a beat, up to one frame late. The beat itself is the grid beat
                // behind `time`: phase beats of the grid's own period (read from the distance to the next beat) before it.
                const phase = state.beatPhase ?? 0;
                const period = (state.nextBeatTime - time) / (1 - phase);
                beats.push(time - phase * period);
            }
        }
        // The hub is told after the tracker's own analysis, as RhythmTracker does.
        hub.onBatch(batch);
        batch.count = 0;
        batch.onsetCount = 0;
    };

    const onOnset = (band: number, eventTime: number, strength: number): void => {
        onsets[FEATURE_ONSET_BANDS[band]].push(eventTime);
        // At most one event per band per frame, so the batch arrays cannot overflow; the guard keeps it honest if that
        // ever changes, as the worklet's does.
        if (batch.onsetCount >= onsetCapacity) return;
        batch.onsetBand[batch.onsetCount] = band;
        batch.onsetTime[batch.onsetCount] = eventTime;
        batch.onsetStrength[batch.onsetCount] = strength;
        batch.onsetCount++;
    };

    const onFrame: FrameSink = (frame) => {
        // The window is centered half its length before its end.
        const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
        if (batch.count === 0) batch.time0 = time;
        packFrame(frame, batch.frames, batch.count * FRAME_STRIDE);
        batch.frameTimes[batch.count] = time;
        bandOnsets.push(frame.logMagnitude, time, onOnset);
        batch.bandEnergy.set(bandOnsets.energy, batch.count * HUB_BAND_COUNT);
        if (++batch.count === BATCH_FRAMES) deliver(time);
    };

    for (let offset = 0; offset < pcm.length; offset += blockSize) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + blockSize)), onFrame);
    }
    // The render clock keeps running to the end of the audio.
    while (tick * RENDER_DT <= seconds) renderTick();

    return {
        seconds,
        tempo,
        beats,
        onsets,
        songChangeCount: state.songChangeCount,
        everReportedLock,
        gate: { firstOpenSeconds, openShare: ticksSinceOpen === 0 ? 0 : ticksOpen / ticksSinceOpen },
    };
}
