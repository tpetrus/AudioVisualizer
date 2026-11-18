import { describe, expect, it } from 'vitest';
import { constantTruth, driftingTruth, foldRatio, foldedError, localTempos } from './tempoTruth';

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

describe('local tempo', () => {
    // 0.5 s beats for 10 beats, then 0.25 s beats for 10.
    const beats: number[] = [];
    for (let i = 0; i < 10; i++) beats.push(i * 0.5);
    for (let i = 0; i < 10; i++) beats.push(5 + i * 0.25);

    it('measures each window of 8 beats', () => {
        const tempos = localTempos(beats);
        expect(tempos).toHaveLength(12);
        expect(tempos[0]).toBeCloseTo(120, 10);
        expect(tempos[11]).toBeCloseTo(240, 10);
        expect(localTempos([0, 1, 2])).toEqual([]);
    });

    it('picks the window centered on the nearest beat and clamps at the ends', () => {
        const truth = driftingTruth(beats, 100);
        expect(truth(0)).toBeCloseTo(120, 10);
        expect(truth(100)).toBeCloseTo(240, 10);
        // Between beats, the nearer beat decides.
        expect(truth(2.2)).toBe(truth(2));
        expect(truth(2.4)).toBe(truth(2.5));
    });

    it('falls back to the constant tempo with too few beats', () => {
        expect(driftingTruth([0, 1], 77)(5)).toBe(77);
        expect(constantTruth(90)(123)).toBe(90);
    });
});
