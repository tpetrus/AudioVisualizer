import { BAND_COUNT, CHROMA_BINS } from './rhythmConfig';

export type BeatsPerBar = 3 | 4;

// What the rhythm tracker currently believes about the music. One preallocated object that is mutated in place and
// read directly by render loops: nothing here may be put into React state.
export interface RhythmState {
    // Tempo in beats per minute, or 0 while unknown.
    bpm: number;
    // 0..1 position inside the current beat / bar. Only meaningful after `updatePhase()` for the current frame.
    beatPhase: number;
    barPhase: number;
    // undefined means "unsure": barPhase then equals beatPhase.
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
        beatPhase: 0,
        barPhase: 0,
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
    state.beatPhase = 0;
    state.barPhase = 0;
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
