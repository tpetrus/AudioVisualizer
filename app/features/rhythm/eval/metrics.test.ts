import { describe, expect, it } from 'vitest';
import {
    beatError,
    finalTempo,
    lockSeconds,
    median,
    percentile,
    scoreOnsets,
    standardDeviation,
    tapNoiseFloor,
    tempoRatio,
    type TempoSample,
} from './metrics';

// A tempo series with one reading per second.
function series(bpms: number[]): TempoSample[] {
    return bpms.map((bpm, time) => ({ time, bpm }));
}

describe('statistics', () => {
    it('takes the median of odd and even counts, and NaN of none', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 2, 3])).toBe(2.5);
        expect(median([])).toBeNaN();
    });

    it('takes the nearest-rank percentile', () => {
        const values = Array.from({ length: 20 }, (_, i) => i + 1);
        expect(percentile(values, 0.95)).toBe(19);
        expect(percentile(values, 1)).toBe(20);
        expect(percentile(values, 0)).toBe(1);
        expect(percentile([7], 0.95)).toBe(7);
        expect(percentile([], 0.95)).toBeNaN();
    });

    it('takes the population standard deviation', () => {
        expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
        expect(standardDeviation([5])).toBe(0);
        expect(standardDeviation([])).toBeNaN();
    });
});

describe('beatError', () => {
    const truth = [1, 1.5, 2, 2.5, 3];

    it('is the median, p95 and signed bias of the distance to the nearest detected beat', () => {
        // Errors in ms: +10, -20, +30, 0, +40 (detected minus truth).
        const detected = [1.01, 1.48, 2.03, 2.5, 3.04];
        const result = beatError(truth, detected, 0);
        expect(result?.median).toBeCloseTo(20);
        expect(result?.p95).toBeCloseTo(40);
        expect(result?.bias).toBeCloseTo(10);
    });

    it('reports a negative bias when the detected beats come early', () => {
        const result = beatError(truth, [0.99, 1.49, 1.99, 2.49, 2.99], 0);
        expect(result?.bias).toBeCloseTo(-10);
        expect(result?.median).toBeCloseTo(10);
    });

    it('skips truth beats before the lock time', () => {
        // The early beats are far off, but they come before the lock.
        const result = beatError(truth, [1.3, 1.5, 2, 2.5, 3], 1.5);
        expect(result?.median).toBeCloseTo(0);
        expect(result?.p95).toBeCloseTo(0);
    });

    it('is undefined without a lock, without detections, or with no truth after the lock', () => {
        expect(beatError(truth, [1, 2], undefined)).toBeUndefined();
        expect(beatError(truth, [], 0)).toBeUndefined();
        expect(beatError([], [1, 2], 0)).toBeUndefined();
        expect(beatError(truth, [1, 2], 10)).toBeUndefined();
    });

    it('measures to the nearest beat from either side, with a tie going to the earlier one', () => {
        expect(beatError([2], [1.9, 2.2], 0)?.bias).toBeCloseTo(-100);
        expect(beatError([2], [1.9, 2.1], 0)?.median).toBeCloseTo(100);
        expect(beatError([0.5], [1, 2], 0)?.bias).toBeCloseTo(500);
        expect(beatError([5], [1, 2], 0)?.bias).toBeCloseTo(-3000);
    });
});

describe('tempo ratio and lock time', () => {
    it('is the final tempo over the label, not folded to an octave', () => {
        expect(tempoRatio(series([120, 120, 120]), 120)).toBe(1);
        expect(tempoRatio(series([240, 240, 240]), 120)).toBe(2);
        expect(tempoRatio(series([160, 160, 160]), 120)).toBeCloseTo(4 / 3);
        expect(tempoRatio(series([90, 90]), 120)).toBe(0.75);
    });

    it('uses the median over the last seconds and ignores readings with no tempo', () => {
        const readings = series([0, 0, 0, 0, 0, 0, 0, 100, 100, 110, 100, 0, 100]);
        expect(finalTempo(readings)).toBe(100);
    });

    it('has no tempo ratio when no tempo was found', () => {
        expect(tempoRatio([], 120)).toBeUndefined();
        expect(tempoRatio(series([0, 0, 0]), 120)).toBeUndefined();
        // A tempo found early and lost before the final window does not count as the answer.
        expect(finalTempo(series([120, 120, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined();
    });

    it('locks at the first time the tempo stays within 2 percent to the end', () => {
        expect(lockSeconds(series([0, 0, 118, 119, 121, 120]), 120)).toBe(2);
        // 122.5 is 2.08 percent high: outside the tolerance, so the lock restarts after it.
        expect(lockSeconds(series([120, 120, 122.5, 120, 120]), 120)).toBe(3);
        expect(lockSeconds(series([120, 120, 122.3, 120]), 120)).toBe(0);
    });

    it('never locks when the run ends off tempo, holds a wrong octave, or has no readings', () => {
        expect(lockSeconds(series([120, 120, 120, 90]), 120)).toBeUndefined();
        expect(lockSeconds(series([240, 240, 240]), 120)).toBeUndefined();
        expect(lockSeconds(series([160, 160, 160]), 120)).toBeUndefined();
        expect(lockSeconds(series([0, 0]), 120)).toBeUndefined();
        expect(lockSeconds([], 120)).toBeUndefined();
    });
});

describe('scoreOnsets', () => {
    it('scores a perfect detection as 1', () => {
        expect(scoreOnsets([1, 2, 3], [1, 2, 3], 50)).toEqual({ precision: 1, recall: 1, f: 1 });
    });

    it('counts a detection within the tolerance and not one outside it', () => {
        const near = scoreOnsets([1, 2], [1.04, 2.06], 50);
        expect(near.precision).toBeCloseTo(0.5);
        expect(near.recall).toBeCloseTo(0.5);
        expect(near.f).toBeCloseTo(0.5);
        // A difference of exactly the tolerance still matches.
        expect(scoreOnsets([1], [1.05], 50).f).toBe(1);
        expect(scoreOnsets([1], [1.03], 20).f).toBe(0);
    });

    it('matches one to one: one detection cannot satisfy two truth onsets and the reverse', () => {
        // Two truth onsets 20 ms apart, one detection between them.
        const oneDetection = scoreOnsets([1, 1.02], [1.01], 50);
        expect(oneDetection.precision).toBe(1);
        expect(oneDetection.recall).toBe(0.5);
        // Two detections for one truth onset.
        const twoDetections = scoreOnsets([1], [0.99, 1.01], 50);
        expect(twoDetections.precision).toBe(0.5);
        expect(twoDetections.recall).toBe(1);
        expect(twoDetections.f).toBeCloseTo(2 / 3);
    });

    it('finds the largest matching when a detection sits between two truth onsets', () => {
        // Truth at 1.00 and 1.06, detections at 1.04 and 1.10: pairing 1.00 with 1.04 and 1.06 with 1.10 gets both.
        const result = scoreOnsets([1, 1.06], [1.04, 1.1], 40);
        expect(result.recall).toBe(1);
        expect(result.precision).toBe(1);
    });

    it('scores 0, not NaN, with no detections or no truth', () => {
        expect(scoreOnsets([1, 2], [], 50)).toEqual({ precision: 0, recall: 0, f: 0 });
        expect(scoreOnsets([], [1, 2], 50)).toEqual({ precision: 0, recall: 0, f: 0 });
        expect(scoreOnsets([], [], 50)).toEqual({ precision: 0, recall: 0, f: 0 });
    });

    it('skips detections that come before the next truth onset', () => {
        const result = scoreOnsets([2], [0.5, 1, 2], 50);
        expect(result.precision).toBeCloseTo(1 / 3);
        expect(result.recall).toBe(1);
    });
});

describe('tapNoiseFloor', () => {
    const beats = [1, 2, 3, 4, 5];

    it('is zero offset and zero spread for perfect taps', () => {
        const result = tapNoiseFloor(beats, beats);
        expect(result?.offsetMs).toBeCloseTo(0);
        expect(result?.spreadMs).toBeCloseTo(0);
    });

    it('separates a constant lag from the spread around it', () => {
        // Errors in ms: +30, +50, +30, +50, +40 -> offset 40, deviations -10, 10, -10, 10, 0.
        const taps = [1.03, 2.05, 3.03, 4.05, 5.04];
        const result = tapNoiseFloor(taps, beats);
        expect(result?.offsetMs).toBeCloseTo(40);
        expect(result?.spreadMs).toBeCloseTo(Math.sqrt(80));
    });

    it('reports a negative offset for taps that lead the click', () => {
        expect(tapNoiseFloor([0.98, 1.98, 2.98], beats)?.offsetMs).toBeCloseTo(-20);
    });

    it('is undefined without taps or without beats', () => {
        expect(tapNoiseFloor([], beats)).toBeUndefined();
        expect(tapNoiseFloor([1, 2], [])).toBeUndefined();
    });
});
