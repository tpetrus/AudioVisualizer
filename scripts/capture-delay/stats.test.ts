import { describe, expect, it } from 'vitest';
import { percentile, summarizeDelays } from './stats';

describe('percentile', () => {
    it('interpolates between ranks', () => {
        expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
        expect(percentile([0, 100], 0.25)).toBe(25);
        expect(percentile([7], 0.95)).toBe(7);
    });
});

describe('summarizeDelays', () => {
    it('counts found and missed and ignores order', () => {
        const stats = summarizeDelays([30, null, 10, 20, null]);
        expect(stats).toMatchObject({ found: 3, missed: 2, medianMs: 20 });
        expect(stats.p5Ms).toBeCloseTo(11);
        expect(stats.p95Ms).toBeCloseTo(29);
    });

    it('has no figures when nothing was found', () => {
        expect(summarizeDelays([null, null])).toEqual({
            found: 0,
            missed: 2,
            medianMs: null,
            p5Ms: null,
            p95Ms: null,
        });
    });
});
