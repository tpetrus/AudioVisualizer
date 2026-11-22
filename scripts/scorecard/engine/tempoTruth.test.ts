import { describe, expect, it } from 'vitest';
import { constantTruth, driftingTruth, foldRatio, foldedError } from './tempoTruth';

describe('foldRatio', () => {
    it('moves a ratio by powers of two into [0.75, 1.5)', () => {
        expect(foldRatio(1)).toBe(1);
        expect(foldRatio(2)).toBe(1);
        expect(foldRatio(0.5)).toBe(1);
        expect(foldRatio(4)).toBe(1);
        expect(foldRatio(0.74)).toBeCloseTo(1.48, 10);
        expect(foldRatio(1.49)).toBeCloseTo(1.49, 10);
        // The upper edge is excluded, so 3/2 and 3/4 are the same representative.
        expect(foldRatio(1.5)).toBe(0.75);
        expect(foldRatio(0.75)).toBe(0.75);
    });

    it('is NaN for no tempo', () => {
        expect(foldRatio(0)).toBeNaN();
        expect(foldRatio(-1)).toBeNaN();
        expect(foldRatio(Infinity)).toBeNaN();
    });
});

describe('foldedError', () => {
    it('is zero at an octave of the truth and the distance to it otherwise', () => {
        expect(foldedError(240, 120)).toBe(0);
        expect(foldedError(60, 120)).toBe(0);
        expect(foldedError(122.4, 120)).toBeCloseTo(0.02, 10);
        expect(foldedError(0, 120)).toBeNaN();
    });

    it('does not count the dotted rival as the tempo', () => {
        expect(foldedError(160, 120)).toBeGreaterThan(0.2);
    });
});

describe('drifting truth: a quadratic fit of the tapped beat times', () => {
    // Beat i at t(i) = 0.5 i - 0.002 i^2, so the tempo falls smoothly from 120 bpm; every tap is also nudged by a few
    // milliseconds of jitter, which an 8-beat window would read as tempo and a fit averages out.
    const exact = (i: number): number => 0.5 * i - 0.002 * i * i;
    const jitter = [0, 0.012, -0.01, 0.008, -0.012];
    const beats = Array.from({ length: 40 }, (_, i) => exact(i) + jitter[i % jitter.length]);
    const trueBpmAtBeat = (i: number): number => 60 / (0.5 - 0.004 * i);

    it('recovers the smooth tempo at a beat despite tap jitter', () => {
        const truth = driftingTruth(beats, 100);
        for (const i of [3, 10, 20, 30, 36]) {
            expect(truth(exact(i)) / trueBpmAtBeat(i)).toBeCloseTo(1, 2);
        }
    });

    it('stays within a fraction of a percent where 8-beat windows stray by more', () => {
        const truth = driftingTruth(beats, 100);
        const windowStray = Math.max(
            ...Array.from({ length: 28 }, (_, i) => {
                const window = (60 * 8) / (beats[i + 8] - beats[i]);
                return Math.abs(window / trueBpmAtBeat(i + 4) - 1);
            }),
        );
        const fitStray = Math.max(
            ...Array.from({ length: 40 }, (_, i) => Math.abs(truth(exact(i)) / trueBpmAtBeat(i) - 1)),
        );
        expect(fitStray).toBeLessThan(windowStray);
        expect(fitStray).toBeLessThan(0.005);
    });

    it('reads a constant tempo exactly and clamps outside the tapped span', () => {
        const even = Array.from({ length: 20 }, (_, i) => 1 + i * 0.5);
        const truth = driftingTruth(even, 100);
        expect(truth(1)).toBeCloseTo(120, 6);
        expect(truth(6)).toBeCloseTo(120, 6);
        expect(truth(-50)).toBeCloseTo(120, 6);
        expect(truth(500)).toBeCloseTo(120, 6);
    });

    it('falls back to the constant tempo with too few beats', () => {
        expect(driftingTruth([0, 1], 77)(5)).toBe(77);
        expect(driftingTruth([0, 1, 2], 77)(5)).toBe(77);
        expect(constantTruth(90)(123)).toBe(90);
    });

    it('falls back when the fit is not a forward-running tempo', () => {
        expect(driftingTruth([5, 5, 5, 5], 77)(5)).toBe(77);
    });
});
