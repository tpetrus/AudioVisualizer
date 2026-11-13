import { describe, expect, it } from 'vitest';
import { bassBinCount, bassLevel, EnergyTracker } from './energyEnvelope';

function trace(fps: number, seconds: number, level: (t: number) => number, scale = 1): number[] {
    const tracker = new EnergyTracker();
    const out: number[] = [];
    const dt = 1 / fps;
    for (let i = 0; i < seconds * fps; i++) {
        tracker.update(level(i * dt) * scale, dt);
        out.push(tracker.ratio);
    }
    return out;
}

describe('bassBinCount', () => {
    it('counts the bins up to the cutoff, from bin 1', () => {
        // 48 kHz / 2048 = 23.4 Hz per bin, so 120 Hz is 5 bins.
        expect(bassBinCount(48000, 2048, 120)).toBe(5);
    });

    it('is at least one bin', () => {
        expect(bassBinCount(48000, 256, 50)).toBe(1);
    });
});

describe('bassLevel', () => {
    it('is the mean of bins 1..count as 0..1, skipping the DC bin', () => {
        expect(bassLevel(new Uint8Array([255, 255, 0, 0]), 2)).toBeCloseTo(0.5);
    });

    it('clamps the count to the spectrum and is 0 without bass bins', () => {
        expect(bassLevel(new Uint8Array([0, 51]), 10)).toBeCloseTo(0.2);
        expect(bassLevel(new Uint8Array([255]), 3)).toBe(0);
    });
});

describe('EnergyTracker', () => {
    it('stays at ratio 1 before any sound and for silence', () => {
        const tracker = new EnergyTracker();
        tracker.update(0, 0.016);
        tracker.update(0.001, 0.016);
        expect(tracker.ratio).toBe(1);
        expect(tracker.fast).toBe(0);
    });

    it('seeds both envelopes with the first sound so the ratio starts at 1', () => {
        const tracker = new EnergyTracker();
        tracker.update(0.2, 0.016);
        expect(tracker.fast).toBe(0.2);
        expect(tracker.slow).toBe(0.2);
        expect(tracker.ratio).toBe(1);
    });

    it('keeps a steady input at ratio 1', () => {
        const ratios = trace(60, 20, () => 0.1);
        for (const ratio of ratios) {
            expect(ratio).toBeCloseTo(1, 6);
        }
    });

    it('rises above 1 on a step up and then returns toward 1', () => {
        const ratios = trace(60, 60, (t) => (t < 20 ? 0.1 : 0.3));
        const peak = Math.max(...ratios);
        expect(peak).toBeGreaterThan(1.5);
        expect(ratios[ratios.length - 1]).toBeLessThan(peak);
        expect(ratios[ratios.length - 1]).toBeLessThan(1.05);
    });

    it('falls below 1 in a breakdown', () => {
        const ratios = trace(60, 30, (t) => (t < 20 ? 0.2 : 0.05));
        expect(Math.min(...ratios)).toBeLessThan(0.5);
    });

    it('does not depend on the absolute level', () => {
        const level = (t: number) => (t < 10 ? 0.05 : 0.15);
        const a = trace(60, 20, level, 1);
        const b = trace(60, 20, level, 10);
        a.forEach((value, i) => expect(b[i]).toBeCloseTo(value, 6));
    });

    it('gives the same trace at 30 and 60 fps', () => {
        const level = (t: number) => (t < 10 ? 0.05 : 0.15);
        const slow = trace(30, 20, level);
        const fast = trace(60, 20, level);
        for (let s = 1; s < 20; s++) {
            expect(slow[s * 30 - 1]).toBeCloseTo(fast[s * 60 - 1], 1);
        }
    });

    it('ignores negative frame deltas', () => {
        const tracker = new EnergyTracker();
        tracker.update(0.1, 0.016);
        tracker.update(0.5, -1);
        expect(tracker.fast).toBe(0.1);
    });

    it('reset forgets everything', () => {
        const tracker = new EnergyTracker();
        tracker.update(0.1, 0.016);
        tracker.update(0.4, 0.5);
        tracker.reset();
        expect(tracker.fast).toBe(0);
        expect(tracker.slow).toBe(0);
        expect(tracker.ratio).toBe(1);
        tracker.update(0.3, 0.016);
        expect(tracker.slow).toBe(0.3);
    });

    it('reports ratio 1 when the slow envelope falls to the silence floor', () => {
        const tracker = new EnergyTracker();
        tracker.update(0.1, 0.016);
        for (let i = 0; i < 3000; i++) {
            tracker.update(0, 0.016);
        }
        expect(tracker.slow).toBeLessThan(0.005);
        expect(tracker.ratio).toBe(1);
    });

    it('does not read a fade-in as a surge: the slow follower is the running mean until it has heard enough', () => {
        const tracker = new EnergyTracker();
        // A near-silent first sample, a one-second fade up, then steady music.
        for (let t = 0; t < 4; t += 1 / 60) {
            tracker.update(t < 1 ? 0.01 + 0.49 * t : 0.5, 1 / 60);
        }
        expect(tracker.ratio).toBeLessThan(1.3);
    });
});
