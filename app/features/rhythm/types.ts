import { BAND_COUNT, CHROMA_BINS } from './rhythmConfig';

export type BeatsPerBar = 3 | 4;

// What the rhythm tracker currently believes about the music. One preallocated object that is mutated in place and
// read directly by render loops: nothing here may be put into React state.
export interface RhythmState {
    // Tempo in beats per minute, or 0 while unknown.
    bpm: number;
    // 0..1 position inside the current beat / bar. Only meaningful after `updatePhase()` for the current frame.
    // beatPhase is undefined until a beat has been found: 0 would read as "exactly on a beat".
    beatPhase: number | undefined;
    // undefined while the meter is unsure (no beats per bar, or no tempo yet): a bar position is not known then, and
    // reusing the beat position would look like a real bar that is only one beat long.
    barPhase: number | undefined;
    beatsPerBar: BeatsPerBar | undefined;
    // 0..1 trust in the tempo and in the meter.
    tempoConfidence: number;
    meterConfidence: number;
    // 0..1 onset strength per band (kick, mid, high), peak-held and decaying.
    bandOnsets: Float32Array;
    // 0..1 smoothed strength of the 12 pitch classes (C first).
    chroma: Float32Array;
    // 0..1 how different the recent seconds are from the preceding ones (decaying peak).
    novelty: number;
    // AudioContext time in seconds of the next beat after the time of the last `updatePhase()`.
    nextBeatTime: number;
    // Monotonic counters: a render loop detects "a beat happened since my last frame" by comparing with its last value.
    beatCount: number;
    downbeatCount: number;
    songChangeCount: number;
}

export function createRhythmState(): RhythmState {
    return {
        bpm: 0,
        beatPhase: undefined,
        barPhase: undefined,
        beatsPerBar: undefined,
        tempoConfidence: 0,
        meterConfidence: 0,
        bandOnsets: new Float32Array(BAND_COUNT),
        chroma: new Float32Array(CHROMA_BINS),
        novelty: 0,
        nextBeatTime: 0,
        beatCount: 0,
        downbeatCount: 0,
        songChangeCount: 0,
    };
}

// Clears everything the tracker has learned except the counters, which only ever increase so that code comparing
// them with a remembered value keeps working across resets.
export function clearRhythmState(state: RhythmState): void {
    state.bpm = 0;
    state.beatPhase = undefined;
    state.barPhase = undefined;
    state.beatsPerBar = undefined;
    state.tempoConfidence = 0;
    state.meterConfidence = 0;
    state.bandOnsets.fill(0);
    state.chroma.fill(0);
    state.novelty = 0;
    state.nextBeatTime = 0;
}

// The message the worklet posts: `count` packed frames (FRAME_STRIDE values each); `time0` is the AudioContext time
// in seconds at the centre of the first frame.
export interface FrameBatch {
    time0: number;
    count: number;
    frames: Float32Array;
}

// Version of the message the worklet posts. Version 1 was a bare FrameBatch; version 2 adds the fields of
// FeatureBatch beside the packed frames, which are unchanged.
export const FEATURE_MESSAGE_VERSION = 2;

// Contract C3: the message the worklet posts. The packed frames are exactly a FrameBatch, so the tracker can keep
// reading `time0`, `count` and `frames` as before; the rest is for the analysis hub and the offline evaluation. All
// times are AudioContext seconds. Each array is a fresh buffer transferred with the message and may be longer than its
// valid part: only the first `count` frames and the first `onsetCount` events are meaningful.
export interface FeatureBatch extends FrameBatch {
    version: typeof FEATURE_MESSAGE_VERSION;
    // The centre of each frame's analysis window, one per frame. frameTimes[0] equals time0.
    frameTimes: Float64Array;
    // Energy per hub band, HUB_BAND_COUNT values per frame in HUB_BANDS order: the mean of log(1 + MAGNITUDE_LOG_GAIN *
    // magnitude) over the band's FFT bins, the same units as the packed frame's band energy. Not normalized: the hub
    // does that.
    bandEnergy: Float32Array;
    // Onset events decided while this batch's frames were analysed, in time order. An event is never sent twice and
    // does not wait for a tempo lock. Because of the look-ahead (ONSET_LOOKAHEAD_FRAMES), an event's time can be up to
    // that many frames earlier than frameTimes[0].
    onsetCount: number;
    // Index into FEATURE_ONSET_BANDS.
    onsetBand: Uint8Array;
    // The centre of the window of the frame where the onset was detected, not the time it was decided.
    onsetTime: Float64Array;
    // 0..1, comparable across events of the same band: 1 is a hit as strong as the band's recent loudest.
    onsetStrength: Float32Array;
}
