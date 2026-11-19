import { AudioHub } from '../../../app/features/audio/hub/audioHub';
import { BassBump, BUMP_GAIN, BUMP_MARGIN, hubLowEnd } from '../../../app/features/audio/hub/bassBump';
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
import { FEATURE_MESSAGE_VERSION, createRhythmState, type FeatureBatch } from '../../../app/features/rhythm/types';
import {
    createDanceTimingResult,
    createDanceTimingState,
    computeDanceTiming,
} from '../../../app/features/visualizers/dancing-character/dancingCharacterSync';
import { createCubesBassEnvelope, stepCubesBass } from '../../../app/features/visualizers/cubes/cubesBass';
import { DANCER_BUMP } from '../../../app/features/visualizers/dancing-character/dancingCharacterConfig';
import { applyAgc } from './agc';
import { countSoftBoundaries } from './boundaryProbe';
import type { GateTraceSink } from './gateTrace';
import { PrehubBass } from './prehubBass';

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
//  - Gain. The live engine runs an automatic gain control (AGC) before anything reads the audio; this replay applies the
//    same decision (agcStep) on the same 30 ms schedule to the PCM first (see agc.ts), so the post-gain signal feeds the
//    extractor and the pre-hub chain. What stays different: the engine's setInterval jitters and drifts against the audio
//    clock, a gain change takes effect at the next 128-sample render quantum rather than at the exact tick sample, and the
//    meter's 1024-sample window is read at the tick's exact sample rather than at an arbitrary moment of the audio thread.
//  - Pre-hub gate. The gate is also stepped from BassPulse, as the dancer was fed before the hub (see prehubBass.ts). Its
//    biquads are the spec's formulas run offline with float32 stage outputs, and the analyser window ends at the render
//    tick's audio time, where live it ends at whatever the audio thread had rendered.
//  - Output latency. The live render time subtracts the output latency and the sync offset, and the analysers see audio
//    that has already passed through the output path; none of that is modeled.
//  - Mono input. The worklet averages the channels; callers pass mono (readWav already mixes down).
//  - The cubes' bass trigger (S4) is stepped on the same render clock with the switch on and full strength, from the same
//    hub snapshot, and its pre-hub reference is BassPulse's own pulse at the render time, which is what the cubes showed
//    before the hub. Only the trigger is replayed: the cube grid's own bars read a private analyser and are not part of
//    any cell.
//  - The dancer's gate hears the hub's gate-input bass (contract C1, S4) through its bump envelope, as the scene does.
//    The hub reads that level at the render time from its own tap of the audio graph live; here its reader is the
//    pre-hub chain's filtered audio with the window ending at the render tick, so it is BassPulse's feature exactly as
//    the pre-hub gate reads it. Two more gates are stepped for comparison only (S4's measurement,
//    `npm run probe:gate-inputs`): the input before S4 (the hub's normalized low end through the old dancer envelope),
//    and BassPulse's feature read at the end of the newest delivered frame, the read S4 first shipped and live measured
//    10 to 20 ms late.

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
    // Time of the first render tick at which the dancer's own tempo lock holds; null if it never does.
    dancerLockSeconds: number | null;
    // The same gate fed the pre-hub way: BassPulse over the same post-gain audio, same rhythm state and tempo lock.
    prehubGate: GateSummary;
    // The cubes' bass pulse (the background flash) at every render tick, today and before the hub; tick k is at k / 60 s.
    cubes: {
        pulse: Float32Array;
        prehubPulse: Float32Array;
    };
    // Gate inputs compared with the dancer's in S4's measurement; nothing in the scorecard reads them.
    gateInputs: {
        // The gate fed by BassPulse's feature read at the end of the newest delivered worklet frame, through BassPulse.
        frameTimed: GateSummary;
        // The gate fed as before S4: the hub's normalized low end through the bump envelope tuned for it.
        hubLowEnd: GateSummary;
    };
}

export interface GateSummary {
    // Time of the first render tick at which the gate is open; null if it never opens.
    firstOpenSeconds: number | null;
    // Share of render ticks from the first opening on where it is open; 0 if it never opens.
    openShare: number;
}

export interface ReplayOptions {
    // Applies the engine's automatic gain control to the PCM first (default true); false replays the raw samples.
    agc?: boolean;
    // Steps every gate with a perfectly locked beat clock at this tempo (beats from time 0, tempo locked from the start,
    // no song changes) instead of the tracker's state and the dancer's lock, and skips the tracker. It isolates what the
    // gate inputs do from what the tracker does, as the gate specs drive the gate; `tempo` and `beats` are then empty,
    // there are no song changes and `dancerLockSeconds` is 0.
    lockedTempo?: number;
    // Receives, at every render tick, what the shipped gateBass gate was stepped with (see gateTrace.ts). It only
    // observes: the replay and its result are the same with or without it.
    gateTrace?: GateTraceSink;
}

export function replayPcm(pcm: Float32Array, sampleRate: number, options: ReplayOptions = {}): ReplayResult {
    const audio = options.agc === false ? pcm : applyAgc(pcm, sampleRate);
    const { result, softBoundaries } = countSoftBoundaries(() =>
        run(audio, sampleRate, options.lockedTempo, options.gateTrace),
    );
    return { ...result, softBoundaries };
}

// Counts the render ticks of one gate into its summary.
class GateTally {
    private firstOpen: number | null = null;
    private ticksSinceOpen = 0;
    private ticksOpen = 0;

    public tick(open: boolean, time: number): void {
        if (open && this.firstOpen === null) this.firstOpen = time;
        if (this.firstOpen !== null) {
            this.ticksSinceOpen++;
            if (open) this.ticksOpen++;
        }
    }

    public summary(): GateSummary {
        return {
            firstOpenSeconds: this.firstOpen,
            openShare: this.ticksSinceOpen === 0 ? 0 : this.ticksOpen / this.ticksSinceOpen,
        };
    }
}

function run(
    pcm: Float32Array,
    sampleRate: number,
    lockedTempo?: number,
    gateTrace?: GateTraceSink,
): Omit<ReplayResult, 'softBoundaries'> {
    const seconds = pcm.length / sampleRate;
    const blockSize = 128;
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const bandOnsets = new BandOnsets(sampleRate, extractor.frameRate);
    // The hub's gate-input bass reader: BassPulse's feature with its window ending at the current render tick (see the
    // fidelity note above). It shares the pre-hub chain's filtered audio once that is prepared below.
    const hubBass = new PrehubBass(sampleRate);
    let renderTime = 0;
    const hub = new AudioHub({
        gateBass: {
            level: () => {
                hubBass.update(renderTime);
                return hubBass.energy;
            },
            dispose: () => {},
        },
    });

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

    // The dancer's gate chain: the bump envelope with the dancer's own options, over the hub's gate-input bass, as the
    // scene builds it.
    const bump = new BassBump(DANCER_BUMP);
    // The input before S4, for comparison.
    const lowEndBump = new BassBump({ margin: BUMP_MARGIN, gain: BUMP_GAIN });
    const lowEndGate = createBassGateState();
    const timingState = createDanceTimingState();
    const timing = createDanceTimingResult();
    const timingSettings = { danceSpeed: 1 };
    const gate = createBassGateState();
    const prehubBass = new PrehubBass(sampleRate);
    prehubBass.prepare(pcm);
    hubBass.shareFiltered(prehubBass);
    const prehubGate = createBassGateState();
    // The frame-timed candidate: its own BassPulse envelope over the same filtered audio, read at the end sample of the
    // newest delivered frame (-1 before the first batch, which reads an all-zero window).
    const frameTimedBass = new PrehubBass(sampleRate);
    frameTimedBass.shareFiltered(prehubBass);
    const frameTimedGate = createBassGateState();
    let newestFrameEnd = -1;
    let dancerLockSeconds: number | null = null;
    let tick = 0;
    let everReportedLock = false;
    const hubTally = new GateTally();
    const prehubTally = new GateTally();
    const frameTimedTally = new GateTally();
    const lowEndTally = new GateTally();
    // The cubes' trigger, at full strength so its pulse is the reaction the scorecard scores.
    const cubesEnvelope = createCubesBassEnvelope();
    const cubesSettings = { bassBump: true, bgPulse: 1 };
    const ticks = Math.floor(seconds * RENDER_HZ) + 1;
    const cubesPulse = new Float32Array(ticks);
    const prehubCubesPulse = new Float32Array(ticks);
    // The locked clock of `lockedTempo`, written in place each tick.
    const lockedRhythm = createRhythmState();

    // One animation frame: the order of the scene's update. The tracker's phase is brought to the render time, the hub
    // reads its bands and onsets at that time, the low end goes through the bump envelope, and the gate steps with the
    // dancer's own tempo lock.
    const renderTick = (): void => {
        const time = tick * RENDER_DT;
        renderTime = time;
        tick++;
        let rhythm = state;
        let tempoLocked: boolean;
        if (lockedTempo === undefined) {
            analyzer.updatePhase(time);
            hub.update(time);
            if (state.bpm > 0 && state.beatPhase !== undefined) everReportedLock = true;
            computeDanceTiming(state, REPLAY_CLIP_BEATS, 0, timingSettings, timingState, RENDER_DT, timing);
            tempoLocked = timing.normalizedBpm !== undefined;
        } else {
            hub.update(time);
            const beat = (time * lockedTempo) / 60;
            lockedRhythm.bpm = lockedTempo;
            lockedRhythm.tempoConfidence = 1;
            lockedRhythm.beatPhase = beat % 1;
            lockedRhythm.beatCount = Math.floor(beat);
            rhythm = lockedRhythm;
            everReportedLock = true;
            tempoLocked = true;
        }
        const bass = bump.step(hub.snapshot.gateBass.pulse, RENDER_DT);
        gateTrace?.tick(bass, rhythm.beatPhase, rhythm.beatCount, rhythm.songChangeCount, tempoLocked);
        stepBassGate(bass, rhythm, tempoLocked, gate, RENDER_DT);
        hubTally.tick(gate.open, time);
        if (tempoLocked && dancerLockSeconds === null) dancerLockSeconds = time;
        const prehubPulse = prehubBass.update(time);
        stepBassGate(prehubPulse, rhythm, tempoLocked, prehubGate, RENDER_DT);
        if (tick - 1 < ticks) {
            cubesPulse[tick - 1] = stepCubesBass(cubesEnvelope, hub.snapshot.gateBass, RENDER_DT, cubesSettings);
            prehubCubesPulse[tick - 1] = prehubPulse;
        }
        prehubTally.tick(prehubGate.open, time);
        stepBassGate(frameTimedBass.updateAtSample(newestFrameEnd), rhythm, tempoLocked, frameTimedGate, RENDER_DT);
        frameTimedTally.tick(frameTimedGate.open, time);
        stepBassGate(
            lowEndBump.step(hubLowEnd(hub.snapshot.bands), RENDER_DT),
            rhythm,
            tempoLocked,
            lowEndGate,
            RENDER_DT,
        );
        lowEndTally.tick(lowEndGate.open, time);
    };

    // Every tick strictly before `until` has happened by the time a batch that arrives at `until` is delivered; a tick at
    // exactly `until` sees it.
    const renderBefore = (until: number): void => {
        while (tick * RENDER_DT < until) renderTick();
    };

    const deliver = (arrival: number): void => {
        renderBefore(arrival);
        // The tracker's analysis: the batch's frames in order, spaced by the frame rate from the first one's time. A
        // locked clock replaces the tracker, so it is skipped then.
        for (let i = 0; lockedTempo === undefined && i < batch.count; i++) {
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
        newestFrameEnd = batchEndSample;
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

    // End sample of the newest frame of the batch being filled.
    let batchEndSample = -1;
    const onFrame: FrameSink = (frame) => {
        batchEndSample = frame.endSample;
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
        gate: hubTally.summary(),
        dancerLockSeconds,
        prehubGate: prehubTally.summary(),
        cubes: { pulse: cubesPulse, prehubPulse: prehubCubesPulse },
        gateInputs: { frameTimed: frameTimedTally.summary(), hubLowEnd: lowEndTally.summary() },
    };
}
