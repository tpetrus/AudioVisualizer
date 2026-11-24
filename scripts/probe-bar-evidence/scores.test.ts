import { describe, expect, it } from 'vitest';
import { autocorrelation, candidatesFor, foldContrast, foldProfile, halfScore, margin, scoreOf } from './scores';

// A series with a spike every `period` tatums, `count` long.
function spikes(period: number, count: number, height = 1, base = 0): number[] {
    return Array.from({ length: count }, (_, t) => (t % period === 0 ? height : base));
}

describe('autocorrelation', () => {
    it('is 1 at lag 0 and 0 for a constant series', () => {
        expect(autocorrelation(spikes(6, 60), 0)).toBeCloseTo(1, 12);
        expect(autocorrelation(new Array(30).fill(2), 6)).toBe(0);
    });

    it('is high at the period of a spike train and negative off it', () => {
        const x = spikes(6, 120);
        expect(autocorrelation(x, 6)).toBeGreaterThan(0.9);
        expect(autocorrelation(x, 3)).toBeLessThan(0);
    });

    it('averages the two neighboring lags for a lag that is not whole', () => {
        const x = spikes(4, 80);
        expect(autocorrelation(x, 1.5)).toBeCloseTo(0.5 * (autocorrelation(x, 1) + autocorrelation(x, 2)), 12);
    });
});

describe('foldProfile and foldContrast', () => {
    it('averages by phase', () => {
        expect(foldProfile([1, 2, 3, 5, 2, 7], 3)).toEqual([3, 2, 5]);
    });

    it('is 1 for a pure spike train at its period and 0 for a flat series', () => {
        expect(foldContrast(spikes(6, 60), 6)).toBeCloseTo(1, 6);
        expect(foldContrast(new Array(60).fill(1), 6)).toBe(0);
    });

    it('compares with the point P / 2 later, rounded down for odd P', () => {
        // p = [4, 1, 3]; the strongest is 4, the point floor(3 / 2) = 1 later holds 1.
        expect(foldContrast([4, 1, 3, 4, 1, 3], 3)).toBeCloseTo(0.75, 6);
    });
});

describe('halfScore', () => {
    it('prefers the bar over its half when only every second beat is accented', () => {
        // Accent every 6 tatums with a weaker mark at 3: A(6) is far above A(3).
        const x = Array.from({ length: 120 }, (_, t) => (t % 6 === 0 ? 1 : t % 6 === 3 ? 0.4 : 0));
        expect(halfScore(x, 6)).toBeGreaterThan(0.3);
    });

    it('is near 0 or negative for a series that repeats at the half', () => {
        expect(halfScore(spikes(3, 120), 6)).toBeLessThan(0.05);
    });
});

describe('scoreOf', () => {
    it('routes each function to its channel', () => {
        const series = { NK: spikes(6, 60), T: new Array(60).fill(1), C: new Array(60).fill(0) };
        expect(scoreOf('fold.NK', series, 6)).toBeCloseTo(1, 6);
        expect(scoreOf('fold.T', series, 6)).toBe(0);
        expect(scoreOf('half.C', series, 6)).toBe(0);
    });
});

describe('margin', () => {
    it('is the truth minus the best other candidate', () => {
        expect(
            margin(
                new Map([
                    [3, 0.5],
                    [6, 0.8],
                    [9, 0.2],
                ]),
                6,
            ),
        ).toBeCloseTo(0.3, 12);
        expect(
            margin(
                new Map([
                    [3, 0.9],
                    [6, 0.8],
                ]),
                6,
            ),
        ).toBeCloseTo(-0.1, 12);
    });

    it('is NaN when the truth is missing or alone', () => {
        expect(margin(new Map([[3, 1]]), undefined)).toBeNaN();
        expect(margin(new Map([[3, 1]]), 6)).toBeNaN();
        expect(margin(new Map([[6, 1]]), 6)).toBeNaN();
    });
});

describe('candidatesFor', () => {
    it('keeps the periods whose tempo is in range and finds the truth within 4%', () => {
        // Held 90: P 2 = 270 and P 3 = 180... the range 60..200 drops P 2 and keeps 3.
        const { periods, truthPeriod } = candidatesFor(90, 180, 60, 200);
        expect(periods).toEqual([3, 4, 6, 8, 9]);
        expect(truthPeriod).toBe(3);
    });

    it('has no truth period when no level is within 4%', () => {
        expect(candidatesFor(100, 135, 60, 200).truthPeriod).toBeUndefined();
    });
});
