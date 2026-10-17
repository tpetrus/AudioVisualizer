import { describe, expect, it } from 'vitest';
import { createBandBins, MAX_FREQUENCY, MIN_FREQUENCY, updateBandLevels, type BandResponse } from './bands';

describe('createBandBins', () => {
    it('returns one range per band', () => {
        expect(createBandBins(12, 48000, 2048)).toHaveLength(13);
    });

    it('covers log-spaced ranges that start at the minimum frequency and end at the maximum', () => {
        const sampleRate = 48000;
        const fftSize = 2048;
        const binWidth = sampleRate / fftSize;
        const bins = createBandBins(8, sampleRate, fftSize);
        expect(bins[0][0]).toBe(Math.floor(MIN_FREQUENCY / binWidth));
        expect(bins[bins.length - 1][1]).toBe(Math.floor(MAX_FREQUENCY / binWidth));
        // Contiguous, increasing, and each band is wider than the one before it (log spacing).
        for (let i = 1; i < bins.length; i++) {
            expect(bins[i][0]).toBeGreaterThanOrEqual(bins[i - 1][1] - 1);
            expect(bins[i][0]).toBeGreaterThanOrEqual(bins[i - 1][0]);
        }
        expect(bins[7][1] - bins[7][0]).toBeGreaterThan(bins[0][1] - bins[0][0]);
    });

    it('never makes an empty band, even when several bands fall inside one bin', () => {
        // A coarse FFT puts many low bands inside bin 0.
        const bins = createBandBins(20, 8000, 128);
        for (const [start, end] of bins) {
            expect(end).toBeGreaterThan(start);
        }
    });

    it('scales the bin indices with the sample rate and fft size', () => {
        const coarse = createBandBins(4, 44100, 1024);
        const fine = createBandBins(4, 44100, 4096);
        expect(fine[3][1]).toBeGreaterThan(coarse[3][1]);
    });
});

describe('updateBandLevels', () => {
    const response: BandResponse = { sensitivity: 1, gate: 0, smoothing: 0.5 };
    // Two single-bin bands, so the maths is easy to follow.
    const bins = [
        [0, 1],
        [1, 2],
    ] as const;

    it('rises quickly toward a louder band', () => {
        const levels = new Float32Array(2);
        updateBandLevels(levels, Uint8Array.from([255, 0]), bins, response);
        // raw = 1 * tilt 1 (band 0) -> target 1; rise closes 60% of the gap.
        expect(levels[0]).toBeCloseTo(0.6, 5);
        expect(levels[1]).toBe(0);
    });

    it('falls slowly using the smoothing factor', () => {
        const levels = Float32Array.from([1, 1]);
        updateBandLevels(levels, Uint8Array.from([0, 0]), bins, { ...response, smoothing: 0.8 });
        expect(levels[0]).toBeCloseTo(0.8, 5);
        expect(levels[1]).toBeCloseTo(0.8, 5);
    });

    it('tilts the upper bands up to compensate for music having less treble', () => {
        const levels = new Float32Array(2);
        updateBandLevels(levels, Uint8Array.from([100, 100]), bins, response);
        expect(levels[1]).toBeGreaterThan(levels[0]);
    });

    it('treats anything below the gate as silence and rescales what is above it', () => {
        const gated: BandResponse = { sensitivity: 1, gate: 0.5, smoothing: 0.5 };
        const quiet = new Float32Array(2);
        updateBandLevels(quiet, Uint8Array.from([80, 80]), bins, gated);
        expect(Array.from(quiet)).toEqual([0, 0]);

        const loud = new Float32Array(2);
        updateBandLevels(loud, Uint8Array.from([255, 0]), bins, gated);
        // raw 1 -> (1 - 0.5) / 0.5 = 1 -> 0.6 after the fast rise.
        expect(loud[0]).toBeCloseTo(0.6, 5);
    });

    it('scales with sensitivity and clamps the raw level to 1', () => {
        const levels = new Float32Array(2);
        updateBandLevels(levels, Uint8Array.from([255, 0]), bins, { ...response, sensitivity: 5 });
        expect(levels[0]).toBeCloseTo(0.6, 5);

        const low = new Float32Array(2);
        updateBandLevels(low, Uint8Array.from([255, 0]), bins, { ...response, sensitivity: 0.5 });
        expect(low[0]).toBeCloseTo(0.3, 5);
    });

    it('averages across the bins in a band', () => {
        const levels = new Float32Array(1);
        updateBandLevels(levels, Uint8Array.from([255, 0]), [[0, 2]], response);
        // Mean 127.5 / 255 = 0.5 -> 0.3 after the rise.
        expect(levels[0]).toBeCloseTo(0.3, 5);
    });

    it('updates the levels in place', () => {
        const levels = new Float32Array(2);
        updateBandLevels(levels, Uint8Array.from([255, 255]), bins, response);
        expect(levels[0]).toBeGreaterThan(0);
    });
});
