import { replayPcm, type ReplayResult } from './replay';

// The offline measurements S4 needs before it freezes contract C1 (the hub's gate-input bass): how often each candidate
// input opens the dancer's bass gate on random bass, where it should never open, and how soon it opens after the
// dancer's lock on real kick tracks. The inputs are the ones the replay steps:
//  - gateBass: the hub's gate-input bass through the dancer's envelope, the input the app ships since S4 (C1). The hub
//    reads it at the render time, so offline it is the prehub input exactly;
//  - hubLowEnd: the hub's normalized low end through the envelope tuned for it, the input from the hub until S4;
//  - frameTimed: BassPulse's feature from the pre-hub chain, read at the end of the newest delivered worklet frame (the
//    measurement C1 was chosen on, and the read S4 first shipped from the worklet, which live measured late);
//  - prehub: BassPulse read at the render time (the input before the hub, the reference);
//  - twoGates: the hubLowEnd and gateBass gates side by side, the dancer's gate open when either is (measured, not
//    chosen).

export const GATE_INPUTS = ['gateBass', 'hubLowEnd', 'frameTimed', 'prehub', 'twoGates'] as const;
export type GateInput = (typeof GATE_INPUTS)[number];

// The random bass of the gate specs (bassGate.test.ts, "two random notes per beat"), rendered as audio so it passes
// through the real analysis chains instead of being fed to the gate as levels.
export const RANDOM_BASS_BPM = 120;
export const RANDOM_BASS_SAMPLE_RATE = 48000;
// Each note is a low sine that sits in the hub's sub and kick bands (20 to 130 Hz) and under BassPulse's 120 Hz lowpass,
// with a short attack and a decay, so it reads as a bass hit to both inputs.
const NOTE_MIN_HZ = 45;
const NOTE_MAX_HZ = 100;
const NOTE_ATTACK_SECONDS = 0.005;
const NOTE_DECAY_SECONDS = 0.06;
const NOTE_SECONDS = 0.25;
const NOTE_MIN_GAIN = 0.3;
const NOTE_MAX_GAIN = 0.5;
// Audio after the last beat, so the last notes ring out and are analyzed.
const TAIL_SECONDS = 0.5;

// The gate specs' generator: a linear congruential one done with Math.imul, so every product wraps exactly in 32 bits
// and the sequence is the same on every machine.
export function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

// Two notes per beat at uniformly random places in the beat, at RANDOM_BASS_BPM, over `beats` beats. The same seed
// always gives the same samples.
export function randomBassPcm(seed: number, beats: number, sampleRate = RANDOM_BASS_SAMPLE_RATE): Float32Array {
    const random = createRandom(seed);
    const pcm = bassBuffer(beats, sampleRate);
    for (let beat = 0; beat < beats; beat++) {
        for (let note = 0; note < 2; note++) {
            const place = beat + random();
            const hz = NOTE_MIN_HZ + random() * (NOTE_MAX_HZ - NOTE_MIN_HZ);
            const gain = NOTE_MIN_GAIN + random() * (NOTE_MAX_GAIN - NOTE_MIN_GAIN);
            addNote(pcm, place, hz, gain, sampleRate);
        }
    }
    return pcm;
}

// The control for the random bass: the same notes, one on every beat at a fixed pitch and level. It is a real
// bassline, so every input should open the gate on it; if one did not, its zero false opens would mean nothing.
export function onBeatBassPcm(beats: number, sampleRate = RANDOM_BASS_SAMPLE_RATE): Float32Array {
    const pcm = bassBuffer(beats, sampleRate);
    const hz = (NOTE_MIN_HZ + NOTE_MAX_HZ) / 2;
    const gain = (NOTE_MIN_GAIN + NOTE_MAX_GAIN) / 2;
    for (let beat = 0; beat < beats; beat++) addNote(pcm, beat, hz, gain, sampleRate);
    return pcm;
}

function bassBuffer(beats: number, sampleRate: number): Float32Array {
    return new Float32Array(Math.ceil((beats * (60 / RANDOM_BASS_BPM) + TAIL_SECONDS) * sampleRate));
}

// Adds one note starting at beat position `place` (beats from the start, at RANDOM_BASS_BPM).
function addNote(pcm: Float32Array, place: number, hz: number, gain: number, sampleRate: number): void {
    const start = Math.floor(place * (60 / RANDOM_BASS_BPM) * sampleRate);
    const end = Math.min(pcm.length, start + Math.round(NOTE_SECONDS * sampleRate));
    for (let i = start; i < end; i++) {
        const t = (i - start) / sampleRate;
        const envelope = Math.min(1, t / NOTE_ATTACK_SECONDS) * Math.exp(-t / NOTE_DECAY_SECONDS);
        pcm[i] += gain * envelope * Math.sin(2 * Math.PI * hz * t);
    }
}

// The earlier of two gates' first openings: the two-gate input is open as soon as either gate is.
export function earlierOpening(a: number | null, b: number | null): number | null {
    if (a === null) return b;
    if (b === null) return a;
    return Math.min(a, b);
}

// First opening of each input in a replay, null where it never opens.
export function firstOpenings(replay: ReplayResult): Record<GateInput, number | null> {
    const gateBass = replay.gate.firstOpenSeconds;
    const hubLowEnd = replay.gateInputs.hubLowEnd.firstOpenSeconds;
    return {
        gateBass,
        hubLowEnd,
        frameTimed: replay.gateInputs.frameTimed.firstOpenSeconds,
        prehub: replay.prehubGate.firstOpenSeconds,
        twoGates: earlierOpening(hubLowEnd, gateBass),
    };
}

// Seconds from the dancer's lock to each input's first opening; a gate that never opens counts the rest of the track.
// Undefined when the dancer never locks, as then no gate can open.
export function secondsAfterLock(replay: ReplayResult): Record<GateInput, number> | undefined {
    const lock = replay.dancerLockSeconds;
    if (lock === null) return undefined;
    const openings = firstOpenings(replay);
    const result = {} as Record<GateInput, number>;
    for (const input of GATE_INPUTS) {
        const open = openings[input];
        result[input] = (open ?? replay.seconds) - lock;
    }
    return result;
}

// Whether each input's gate opened on `pcm` (at RANDOM_BASS_SAMPLE_RATE), with the beat clock locked at
// RANDOM_BASS_BPM, so only the input decides (as the gate specs drive the gate).
export function opensOnLockedClock(pcm: Float32Array): Record<GateInput, boolean> {
    const replay = replayPcm(pcm, RANDOM_BASS_SAMPLE_RATE, { lockedTempo: RANDOM_BASS_BPM });
    const openings = firstOpenings(replay);
    const result = {} as Record<GateInput, boolean>;
    for (const input of GATE_INPUTS) result[input] = openings[input] !== null;
    return result;
}

// How many of `patterns` random-bass patterns (seeds 1..patterns, as the gate specs use) open each input's gate.
export function countFalseOpens(
    patterns: number,
    beats: number,
    onPattern?: (seed: number) => void,
): Record<GateInput, number> {
    const counts = {} as Record<GateInput, number>;
    for (const input of GATE_INPUTS) counts[input] = 0;
    for (let seed = 1; seed <= patterns; seed++) {
        const opens = opensOnLockedClock(randomBassPcm(seed, beats));
        for (const input of GATE_INPUTS) if (opens[input]) counts[input]++;
        onPattern?.(seed);
    }
    return counts;
}
