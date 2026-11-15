import { describe, expect, it } from 'vitest';
import { detectClicks, estimateNoiseFloor } from './detect';

const SAMPLE_RATE = 1000;

// A recording from time 2 s: `noise` as a deterministic alternating hiss, plus a one-sample click of the given
// height at each arrival time (seconds on the context clock).
function recording(arrivals: readonly number[], options: { noise?: number; height?: number; seconds?: number } = {}) {
    const { noise = 0, height = 1, seconds = 6 } = options;
    const startTime = 2;
    const samples = new Float32Array(seconds * SAMPLE_RATE);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 2 ? noise : -noise;
    for (const arrival of arrivals) samples[Math.round((arrival - startTime) * SAMPLE_RATE)] = height;
    return { samples, startTime };
}

describe('detectClicks', () => {
    it('measures each click as arrival minus scheduled', () => {
        const scheduled = [3, 4, 5];
        const { samples, startTime } = recording([3.02, 4.025, 5.03]);
        const { clicks } = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled,
            maxDelaySeconds: 0.5,
        });
        expect(clicks.map((click) => Math.round(click.delayMs ?? NaN))).toEqual([20, 25, 30]);
        expect(clicks[0].arrival).toBeCloseTo(3.02, 6);
    });

    it('reports a click that never arrived as a miss and does not borrow the next one', () => {
        // The click scheduled at 4 s is absent; the one at 5 s arrives 0.3 s late, after 4's window would reach it.
        const { samples, startTime } = recording([3.01, 5.3]);
        const { clicks } = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled: [3, 4, 5],
            maxDelaySeconds: 2,
        });
        expect(clicks[0].delayMs).toBeCloseTo(10);
        expect(clicks[1].delayMs).toBeNull();
        expect(clicks[2].delayMs).toBeCloseTo(300);
    });

    it('finds a late click inside the maximum delay and misses one beyond it', () => {
        const { samples, startTime } = recording([3.4, 4.45]);
        const { clicks } = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled: [3, 4],
            maxDelaySeconds: 0.42,
        });
        expect(clicks[0].delayMs).toBeCloseTo(400);
        expect(clicks[1].delayMs).toBeNull();
    });

    it('ignores noise below the threshold and finds a click above a noisy floor', () => {
        const { samples, startTime } = recording([3.05, 4.05], { noise: 0.05, height: 1 });
        const detection = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled: [3, 4],
            maxDelaySeconds: 0.5,
        });
        expect(detection.noiseFloor).toBeCloseTo(0.05 * 1.4826, 4);
        expect(detection.threshold).toBeGreaterThan(0.25);
        expect(detection.clicks.map((click) => Math.round(click.delayMs ?? NaN))).toEqual([50, 50]);
    });

    it('misses every click when the recording is only noise', () => {
        const { samples, startTime } = recording([], { noise: 0.1 });
        const { clicks } = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled: [3, 4, 5],
            maxDelaySeconds: 0.5,
        });
        expect(clicks.every((click) => click.arrival === null)).toBe(true);
    });

    it('misses everything in silence', () => {
        const { samples, startTime } = recording([]);
        const { clicks } = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled: [3],
            maxDelaySeconds: 1,
        });
        expect(clicks[0].arrival).toBeNull();
    });

    it('does not match a sound before the scheduled time', () => {
        const { samples, startTime } = recording([2.9]);
        const { clicks } = detectClicks({
            samples,
            sampleRate: SAMPLE_RATE,
            startTime,
            scheduled: [3],
            maxDelaySeconds: 1,
        });
        expect(clicks[0].arrival).toBeNull();
    });

    it('handles a click scheduled before the recording started and an empty recording', () => {
        const early = detectClicks({
            samples: new Float32Array(10),
            sampleRate: SAMPLE_RATE,
            startTime: 5,
            scheduled: [1],
            maxDelaySeconds: 1,
        });
        expect(early.clicks[0].arrival).toBeNull();
        expect(estimateNoiseFloor([])).toBe(0);
    });

    it('flags a delay longer than the interval instead of reading (delay - interval)', () => {
        // Clicks every 1 s with a true delay of 1.12 s: each sound lands inside the next click's window.
        const scheduled = [3, 4, 5];
        const { samples, startTime } = recording([4.12, 5.12]);
        const detection = detectClicks({ samples, sampleRate: SAMPLE_RATE, startTime, scheduled, maxDelaySeconds: 1 });
        expect(detection.clicks[0].arrival).toBeNull();
        expect(detection.clicks[1].delayMs).toBeCloseTo(120, 3);
        expect(detection.lateSuspected).toBe(true);
    });

    it('does not flag a clean run or a silent recording', () => {
        const scheduled = [3, 4, 5];
        const clean = recording([3.02, 4.02, 5.02]);
        const silent = recording([]);
        const options = { sampleRate: SAMPLE_RATE, scheduled, maxDelaySeconds: 1 };
        expect(detectClicks({ ...clean, ...options }).lateSuspected).toBe(false);
        expect(detectClicks({ ...silent, ...options }).lateSuspected).toBe(false);
    });
});
