import { OnsetExtractor, packFrame, type OnsetFrame } from './onsetExtractor';
import { RhythmAnalyzer } from './rhythmAnalyzer';
import { FFT_SIZE, FRAME_STRIDE } from './rhythmConfig';
import type { BeatsPerBar } from './types';

// Synthetic audio and a pipeline runner for the rhythm specs and the offline evaluation. Everything is deterministic:
// randomness comes from a seeded generator, never from Math.random.

export const TEST_SAMPLE_RATE = 44100;

// Small, fast seeded PRNG (mulberry32): uniform in [0, 1).
export function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface TrackOptions {
    sampleRate?: number;
    seconds: number;
    bpm: number;
    // Tempo at the end of the track; the tempo moves linearly in between (a ramp).
    endBpm?: number;
    beatsPerBar: BeatsPerBar;
    // Amplitude of white noise mixed over the whole track, 0 = none.
    noise?: number;
    seed?: number;
    // Overall gain, e.g. to model a quiet or loud song.
    gain?: number;
    // Adds a soft chord pad that alternates between two chords every bar, which gives the chroma cue something to find.
    chordChange?: boolean;
    // Level of the downbeat kick relative to the default. 0 puts the same kick on every beat (no accent at all).
    accent?: number;
    // Time in seconds of the first beat (a downbeat).
    firstBeat?: number;
    // Frequency of the click on every beat; changing it gives a different "song" for timbre-change tests.
    clickHz?: number;
}

export interface Track {
    pcm: Float32Array;
    // Time of every beat in seconds, and of the downbeats among them.
    beatTimes: number[];
    downbeatTimes: number[];
}

// Chord pad pitches (Hz) for the two chords that alternate bar by bar: C major and A minor.
const CHORD_A = [261.63, 329.63, 392.0];
const CHORD_B = [220.0, 261.63, 329.63];

function addBurst(
    pcm: Float32Array,
    sampleRate: number,
    time: number,
    hz: number,
    amplitude: number,
    decaySeconds: number,
    pitchDrop: number,
): void {
    const start = Math.round(time * sampleRate);
    const length = Math.round(decaySeconds * 6 * sampleRate);
    let phase = 0;
    for (let i = 0; i < length; i++) {
        const index = start + i;
        if (index < 0 || index >= pcm.length) {
            continue;
        }
        const t = i / sampleRate;
        const envelope = Math.exp(-t / decaySeconds);
        // A kick drum sweeps down in pitch; a click does not (pitchDrop 0).
        const frequency = hz * (1 + pitchDrop * envelope);
        phase += (2 * Math.PI * frequency) / sampleRate;
        pcm[index] += amplitude * envelope * Math.sin(phase);
    }
}

// A drum-like click track. Beat 1 of every bar has a low kick plus a click; the other beats have only a lighter,
// higher click, which is the accent the meter estimator looks for.
export function renderTrack(options: TrackOptions): Track {
    const sampleRate = options.sampleRate ?? TEST_SAMPLE_RATE;
    const gain = options.gain ?? 1;
    const accent = options.accent ?? 1;
    const clickHz = options.clickHz ?? 3000;
    const firstBeat = options.firstBeat ?? 0.1;
    const pcm = new Float32Array(Math.round(options.seconds * sampleRate));
    const beatTimes: number[] = [];
    const downbeatTimes: number[] = [];

    const endBpm = options.endBpm ?? options.bpm;
    let time = firstBeat;
    let beat = 0;
    while (time < options.seconds) {
        const isDownbeat = beat % options.beatsPerBar === 0;
        beatTimes.push(time);
        if (isDownbeat) {
            downbeatTimes.push(time);
        }
        if (isDownbeat && accent > 0) {
            addBurst(pcm, sampleRate, time, 55, 0.8 * accent, 0.06, 1.0);
        } else if (accent === 0) {
            addBurst(pcm, sampleRate, time, 55, 0.8, 0.06, 1.0);
        }
        addBurst(pcm, sampleRate, time, clickHz, 0.3, 0.008, 0);
        const bpm = options.bpm + (endBpm - options.bpm) * Math.min(1, time / options.seconds);
        time += 60 / bpm;
        beat++;
    }

    if (options.chordChange) {
        const barSeconds = downbeatTimes.length > 1 ? downbeatTimes[1] - downbeatTimes[0] : options.seconds;
        for (let i = 0; i < pcm.length; i++) {
            const t = i / sampleRate;
            const chord = Math.floor((t - firstBeat) / barSeconds) % 2 === 0 ? CHORD_A : CHORD_B;
            let sample = 0;
            for (const hz of chord) {
                sample += Math.sin(2 * Math.PI * hz * t);
            }
            pcm[i] += 0.04 * sample;
        }
    }

    if (options.noise) {
        addNoise(pcm, options.noise, options.seed ?? 1);
    }
    if (gain !== 1) {
        for (let i = 0; i < pcm.length; i++) {
            pcm[i] *= gain;
        }
    }
    return { pcm, beatTimes, downbeatTimes };
}

// Seconds of digital silence.
export function silence(seconds: number, sampleRate: number = TEST_SAMPLE_RATE): Float32Array {
    return new Float32Array(Math.round(seconds * sampleRate));
}

// Plays the parts one after another with no gap (a gapless album transition).
export function concat(...parts: Float32Array[]): Float32Array {
    let length = 0;
    for (const part of parts) {
        length += part.length;
    }
    const out = new Float32Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

// Fades `a` out and `b` in over `seconds`, overlapping them (a DJ-style crossfade). The result is shorter than the
// two parts together by the overlap.
export function crossfade(
    a: Float32Array,
    b: Float32Array,
    seconds: number,
    sampleRate: number = TEST_SAMPLE_RATE,
): Float32Array {
    const overlap = Math.min(Math.round(seconds * sampleRate), a.length, b.length);
    const out = new Float32Array(a.length + b.length - overlap);
    const joinAt = a.length - overlap;
    out.set(a.subarray(0, joinAt), 0);
    for (let i = 0; i < overlap; i++) {
        const mix = i / overlap;
        out[joinAt + i] = a[joinAt + i] * (1 - mix) + b[i] * mix;
    }
    out.set(b.subarray(overlap), a.length);
    return out;
}

// Adds seeded white noise in place and returns the same array.
export function addNoise(pcm: Float32Array, amplitude: number, seed: number): Float32Array {
    const random = createRandom(seed);
    for (let i = 0; i < pcm.length; i++) {
        pcm[i] += amplitude * (random() * 2 - 1);
    }
    return pcm;
}

// A pure sine, for front-end checks.
export function sine(hz: number, seconds: number, amplitude = 0.5, sampleRate: number = TEST_SAMPLE_RATE): Float32Array {
    const pcm = new Float32Array(Math.round(seconds * sampleRate));
    for (let i = 0; i < pcm.length; i++) {
        pcm[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
    }
    return pcm;
}

// One reading of the analyzer state while a signal plays.
export interface Sample {
    time: number;
    bpm: number;
    beatsPerBar: BeatsPerBar | undefined;
    meterConfidence: number;
    beatCount: number;
    downbeatCount: number;
    songChangeCount: number;
}

export interface RunResult {
    analyzer: RhythmAnalyzer;
    samples: Sample[];
    // Times at which downbeatCount increased, i.e. when the tracker said "a downbeat happened now".
    downbeatEvents: number[];
    // Times at which songChangeCount increased.
    songChangeEvents: number[];
    frameRate: number;
}

export interface RunOptions {
    sampleRate?: number;
    // Samples per block handed to the extractor; 128 is the Web Audio render quantum the worklet sees.
    blockSize?: number;
    // Seconds between recorded samples.
    sampleEvery?: number;
}

// Feeds PCM through OnsetExtractor into RhythmAnalyzer the way the worklet and tracker do, and records the state.
export function runPipeline(pcm: Float32Array, options: RunOptions = {}): RunResult {
    const sampleRate = options.sampleRate ?? TEST_SAMPLE_RATE;
    const blockSize = options.blockSize ?? 128;
    const sampleEvery = options.sampleEvery ?? 0.5;
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const packed = new Float32Array(FRAME_STRIDE);
    const samples: Sample[] = [];
    const downbeatEvents: number[] = [];
    const songChangeEvents: number[] = [];
    let nextSample = 0;
    let lastDownbeats = 0;
    let lastSongChanges = 0;

    const onFrame = (frame: OnsetFrame): void => {
        // The window is centred half its length before its end, exactly as the worklet computes the batch time.
        const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
        packFrame(frame, packed, 0);
        analyzer.pushFrame(time, packed, 0);
        analyzer.updatePhase(time);
        if (state.downbeatCount > lastDownbeats) {
            downbeatEvents.push(time);
            lastDownbeats = state.downbeatCount;
        }
        if (state.songChangeCount > lastSongChanges) {
            songChangeEvents.push(time);
            lastSongChanges = state.songChangeCount;
        }
        if (time >= nextSample) {
            nextSample += sampleEvery;
            samples.push({
                time,
                bpm: state.bpm,
                beatsPerBar: state.beatsPerBar,
                meterConfidence: state.meterConfidence,
                beatCount: state.beatCount,
                downbeatCount: state.downbeatCount,
                songChangeCount: state.songChangeCount,
            });
        }
    };

    for (let offset = 0; offset < pcm.length; offset += blockSize) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + blockSize)), onFrame);
    }
    return { analyzer, samples, downbeatEvents, songChangeEvents, frameRate: extractor.frameRate };
}

// Seconds after `from` at which the reported meter first equals `meter` and then stays so until `until` (or the end
// of the samples), or undefined if it never settles.
export function timeToLock(samples: Sample[], meter: BeatsPerBar, from = 0, until = Infinity): number | undefined {
    const window = samples.filter(sample => sample.time >= from && sample.time <= until);
    let lockedSince: number | undefined;
    for (const sample of window) {
        if (sample.beatsPerBar === meter) {
            lockedSince ??= sample.time;
        } else {
            lockedSince = undefined;
        }
    }
    return lockedSince === undefined ? undefined : lockedSince - from;
}

// Fraction of downbeat events (after `after` seconds) within `tolerance` seconds of a true downbeat.
export function downbeatHitRate(events: number[], truth: number[], after: number, tolerance = 0.12): number {
    const relevant = events.filter(time => time >= after);
    if (relevant.length === 0) {
        return 0;
    }
    let hits = 0;
    for (const event of relevant) {
        if (truth.some(t => Math.abs(t - event) <= tolerance)) {
            hits++;
        }
    }
    return hits / relevant.length;
}
