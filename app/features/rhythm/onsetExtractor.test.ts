import { describe, expect, it } from 'vitest';
import { OnsetExtractor, hopSizeFor, packFrame, type OnsetFrame } from './onsetExtractor';
import {
    BAND_COUNT,
    CHROMA_BINS,
    FRAME_CHROMA_OFFSET,
    FRAME_ENERGY_OFFSET,
    FRAME_FLUX_OFFSET,
    FRAME_RMS_OFFSET,
    FRAME_STRIDE,
    HOP_SECONDS,
} from './rhythmConfig';
import { TEST_SAMPLE_RATE, concat, silence, sine } from './testSignals';

interface Captured {
    flux: number[];
    energy: number[];
    rms: number;
    chroma: number[];
    endSample: number;
}

// Copies every frame, because the extractor reuses its arrays.
function extract(samples: Float32Array, sampleRate = TEST_SAMPLE_RATE, blockSize = 128): Captured[] {
    const extractor = new OnsetExtractor(sampleRate);
    const frames: Captured[] = [];
    const sink = (frame: OnsetFrame): void => {
        frames.push({
            flux: Array.from(frame.flux),
            energy: Array.from(frame.energy),
            rms: frame.rms,
            chroma: Array.from(frame.chroma),
            endSample: frame.endSample,
        });
    };
    for (let offset = 0; offset < samples.length; offset += blockSize) {
        extractor.push(samples.subarray(offset, Math.min(samples.length, offset + blockSize)), sink);
    }
    return frames;
}

function maxOf(frames: Captured[], pick: (frame: Captured) => number): number {
    return frames.reduce((best, frame) => Math.max(best, pick(frame)), 0);
}

// A decaying burst of a sine starting at `startSeconds` inside silence of `totalSeconds`.
function burst(hz: number, startSeconds: number, totalSeconds: number, amplitude = 0.8): Float32Array {
    const pcm = silence(totalSeconds);
    const start = Math.round(startSeconds * TEST_SAMPLE_RATE);
    const length = Math.round(0.05 * TEST_SAMPLE_RATE);
    for (let i = 0; i < length; i++) {
        // A short attack ramp keeps the burst from splattering energy across every band.
        const attack = Math.min(1, i / (0.004 * TEST_SAMPLE_RATE));
        pcm[start + i] =
            amplitude * attack * Math.exp((-6 * i) / length) * Math.sin((2 * Math.PI * hz * i) / TEST_SAMPLE_RATE);
    }
    return pcm;
}

describe('OnsetExtractor timing', () => {
    it('derives the hop and the frame rate from the sample rate', () => {
        const extractor = new OnsetExtractor(48000);
        expect(extractor.hopSize).toBe(hopSizeFor(48000));
        expect(extractor.hopSize).toBe(Math.round(48000 * HOP_SECONDS));
        expect(extractor.frameRate).toBeCloseTo(100, 6);
    });

    it('emits about 100 frames per second, spaced exactly one hop apart', () => {
        const seconds = 3;
        const frames = extract(sine(440, seconds));
        const hop = hopSizeFor(TEST_SAMPLE_RATE);
        // The first full window has nothing to compare with, so the first frames are withheld.
        expect(frames.length).toBeGreaterThan(seconds * 100 - 6);
        expect(frames.length).toBeLessThanOrEqual(seconds * 100);
        for (let i = 1; i < frames.length; i++) {
            expect(frames[i].endSample - frames[i - 1].endSample).toBe(hop);
        }
    });

    it('does not depend on the block size', () => {
        const pcm = concat(silence(0.2), sine(440, 0.5), burst(60, 0.05, 0.3));
        const small = extract(pcm, TEST_SAMPLE_RATE, 1);
        const quantum = extract(pcm, TEST_SAMPLE_RATE, 128);
        const huge = extract(pcm, TEST_SAMPLE_RATE, pcm.length);
        expect(quantum.length).toBe(small.length);
        expect(huge.length).toBe(small.length);
        for (let i = 0; i < small.length; i++) {
            expect(quantum[i].endSample).toBe(small[i].endSample);
            expect(quantum[i].flux).toEqual(small[i].flux);
            expect(huge[i].rms).toBeCloseTo(small[i].rms, 6);
        }
    });

    it('starts over after reset()', () => {
        const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
        const first: number[] = [];
        const second: number[] = [];
        const pcm = sine(440, 0.5);
        extractor.push(pcm, (frame) => first.push(frame.endSample));
        extractor.reset();
        extractor.push(pcm, (frame) => second.push(frame.endSample));
        expect(second).toEqual(first);
    });
});

describe('OnsetExtractor features', () => {
    it('reports the kick band flux on a low burst and the high band flux on a click', () => {
        const low = extract(burst(60, 0.3, 0.8));
        expect(maxOf(low, (f) => f.flux[0])).toBeGreaterThan(0.01);
        expect(maxOf(low, (f) => f.flux[0])).toBeGreaterThan(3 * maxOf(low, (f) => f.flux[2]));

        const high = extract(burst(6000, 0.3, 0.8));
        expect(maxOf(high, (f) => f.flux[2])).toBeGreaterThan(0.01);
        expect(maxOf(high, (f) => f.flux[2])).toBeGreaterThan(3 * maxOf(high, (f) => f.flux[0]));
    });

    it('puts a mid-range burst mostly into the mid band', () => {
        const mid = extract(burst(800, 0.3, 0.8));
        expect(maxOf(mid, (f) => f.flux[1])).toBeGreaterThan(3 * maxOf(mid, (f) => f.flux[0]));
        expect(maxOf(mid, (f) => f.flux[1])).toBeGreaterThan(3 * maxOf(mid, (f) => f.flux[2]));
    });

    it('has no flux while the signal is steady', () => {
        const frames = extract(sine(440, 2));
        // Skip the attack at the start of the tone.
        const steady = frames.slice(20);
        expect(maxOf(steady, (f) => Math.max(f.flux[0], f.flux[1], f.flux[2]))).toBeLessThan(0.01);
    });

    it('has about zero RMS and zero flux for silence', () => {
        const frames = extract(silence(1));
        expect(frames.length).toBeGreaterThan(90);
        for (const frame of frames) {
            expect(frame.rms).toBeCloseTo(0, 9);
            expect(frame.flux).toEqual([0, 0, 0]);
        }
    });

    it('measures the RMS of a sine as amplitude / sqrt(2)', () => {
        const frames = extract(sine(440, 1, 0.5));
        const last = frames[frames.length - 1];
        expect(last.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
    });

    it('peaks the chroma at A for a pure 440 Hz tone', () => {
        const frames = extract(sine(440, 1));
        const last = frames[frames.length - 1];
        // Pitch classes count from C, so A is 9.
        expect(last.chroma.indexOf(Math.max(...last.chroma))).toBe(9);
    });

    it.each([
        ['C5', 523.25, 0],
        ['E5', 659.26, 4],
        ['G5', 783.99, 7],
    ])('peaks the chroma at %s for its pure tone', (_name, hz, pitchClass) => {
        const frames = extract(sine(hz, 1));
        const last = frames[frames.length - 1];
        expect(last.chroma.indexOf(Math.max(...last.chroma))).toBe(pitchClass);
    });

    it('has no chroma at all for silence', () => {
        const frames = extract(silence(0.5));
        expect(Math.max(...frames[frames.length - 1].chroma)).toBe(0);
    });
});

describe('packFrame', () => {
    it('writes flux, energy, rms and chroma at the documented offsets', () => {
        expect(FRAME_STRIDE).toBe(19);
        const frame: OnsetFrame = {
            flux: Float32Array.from([1, 2, 3]),
            energy: Float32Array.from([4, 5, 6]),
            rms: 7,
            chroma: Float32Array.from({ length: CHROMA_BINS }, (_, i) => 10 + i),
            endSample: 0,
        };
        const out = new Float32Array(FRAME_STRIDE * 2);
        packFrame(frame, out, FRAME_STRIDE);
        const base = FRAME_STRIDE;
        for (let b = 0; b < BAND_COUNT; b++) {
            expect(out[base + FRAME_FLUX_OFFSET + b]).toBe(1 + b);
            expect(out[base + FRAME_ENERGY_OFFSET + b]).toBe(4 + b);
        }
        expect(out[base + FRAME_RMS_OFFSET]).toBe(7);
        for (let i = 0; i < CHROMA_BINS; i++) {
            expect(out[base + FRAME_CHROMA_OFFSET + i]).toBe(10 + i);
        }
        // The first slot is untouched.
        expect(out[0]).toBe(0);
    });
});
