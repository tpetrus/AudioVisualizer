import { describe, expect, it } from 'vitest';
import { createTrioAccent, stepTrioAccent } from './trioAccent';
import {
    ACCENT_DECAY_SECONDS,
    ACCENT_MIN_INTERVAL_SECONDS,
    ACCENT_PEAK_CAP,
    ACCENT_REDUCED_MOTION_FACTOR,
} from './trioEnhancedConfig';
import type { TrioAccentInput } from './trioEnhancedTypes';

const input = (over: Partial<TrioAccentInput> = {}): TrioAccentInput => ({
    dtSeconds: 1 / 60,
    beatCount: 0,
    bassOnset: 0,
    intensity: 1,
    reducedMotion: false,
    ...over,
});

describe('trioAccent', () => {
    it('starts quiet with the documented initial state', () => {
        expect(createTrioAccent()).toEqual({
            pulse: 0,
            triggered: false,
            sinceTrigger: Infinity,
            lastBeatCount: undefined,
            bassAbove: false,
        });
    });

    it('never triggers on the first step, even with a high beat count and a loud bass', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input({ beatCount: 40, bassOnset: 1 }));
        expect(state.triggered).toBe(false);
        expect(state.pulse).toBe(0);
        expect(state.lastBeatCount).toBe(40);
    });

    it('triggers on a new beat and jumps to the peak in the same step', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input());
        stepTrioAccent(state, input({ beatCount: 1 }));
        expect(state.triggered).toBe(true);
        expect(state.pulse).toBe(ACCENT_PEAK_CAP);
        expect(state.sinceTrigger).toBe(0);
        stepTrioAccent(state, input({ beatCount: 1 }));
        expect(state.triggered).toBe(false);
    });

    it('triggers on the rising edge of the bass onset only, not while it stays high', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input());
        stepTrioAccent(state, input({ bassOnset: 0.9 }));
        expect(state.triggered).toBe(true);
        // Still high a full second later: no new edge.
        stepTrioAccent(state, input({ bassOnset: 0.9, dtSeconds: 1 }));
        expect(state.triggered).toBe(false);
        // Drop and rise again: a new edge.
        stepTrioAccent(state, input({ bassOnset: 0 }));
        stepTrioAccent(state, input({ bassOnset: 0.9 }));
        expect(state.triggered).toBe(true);
    });

    it('does not retrigger on a beat counter that stays the same or goes down', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input({ beatCount: 5 }));
        stepTrioAccent(state, input({ beatCount: 5, dtSeconds: 1 }));
        expect(state.triggered).toBe(false);
        stepTrioAccent(state, input({ beatCount: 2, dtSeconds: 1 }));
        expect(state.triggered).toBe(false);
        // The counter restarted lower; the next beat counts from there.
        stepTrioAccent(state, input({ beatCount: 3, dtSeconds: 1 }));
        expect(state.triggered).toBe(true);
    });

    it('accepts at most three triggers per second whatever the input rate', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input());
        let accepted = 0;
        let beat = 0;
        // 240 steps of 1/240 s = one second, a new beat on every step.
        for (let i = 0; i < 240; i++) {
            stepTrioAccent(state, input({ dtSeconds: 1 / 240, beatCount: ++beat }));
            if (state.triggered) accepted++;
        }
        expect(accepted).toBeLessThanOrEqual(3);
        expect(accepted).toBeGreaterThanOrEqual(2);
    });

    it('accepts a trigger exactly at the minimum interval and refuses just before it', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input());
        stepTrioAccent(state, input({ beatCount: 1 }));
        stepTrioAccent(state, input({ beatCount: 2, dtSeconds: ACCENT_MIN_INTERVAL_SECONDS - 0.01 }));
        expect(state.triggered).toBe(false);
        stepTrioAccent(state, input({ beatCount: 3, dtSeconds: 0.01 }));
        expect(state.triggered).toBe(true);
    });

    it('decays exponentially with dt, independent of how the time is split', () => {
        const a = createTrioAccent();
        const b = createTrioAccent();
        for (const state of [a, b]) {
            stepTrioAccent(state, input());
            stepTrioAccent(state, input({ beatCount: 1 }));
        }
        stepTrioAccent(a, input({ beatCount: 1, dtSeconds: 0.1 }));
        for (let i = 0; i < 10; i++) stepTrioAccent(b, input({ beatCount: 1, dtSeconds: 0.01 }));
        expect(a.pulse).toBeCloseTo(Math.exp(-0.1 / ACCENT_DECAY_SECONDS), 10);
        expect(b.pulse).toBeCloseTo(a.pulse, 10);
    });

    it('scales the peak with the intensity, and 0 keeps the pulse at 0', () => {
        const half = createTrioAccent();
        stepTrioAccent(half, input({ intensity: 0.5 }));
        stepTrioAccent(half, input({ intensity: 0.5, beatCount: 1 }));
        expect(half.pulse).toBeCloseTo(0.5 * ACCENT_PEAK_CAP, 10);

        const zero = createTrioAccent();
        stepTrioAccent(zero, input({ intensity: 0 }));
        stepTrioAccent(zero, input({ intensity: 0, beatCount: 1 }));
        expect(zero.pulse).toBe(0);
    });

    it('clamps an out-of-range or non-finite intensity', () => {
        const over = createTrioAccent();
        stepTrioAccent(over, input({ intensity: 5 }));
        stepTrioAccent(over, input({ intensity: 5, beatCount: 1 }));
        expect(over.pulse).toBe(ACCENT_PEAK_CAP);

        const bad = createTrioAccent();
        stepTrioAccent(bad, input({ intensity: NaN }));
        stepTrioAccent(bad, input({ intensity: NaN, beatCount: 1 }));
        expect(bad.pulse).toBe(0);
    });

    it('damps the peak under reduced motion', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input({ reducedMotion: true }));
        stepTrioAccent(state, input({ reducedMotion: true, beatCount: 1 }));
        expect(state.pulse).toBeCloseTo(ACCENT_PEAK_CAP * ACCENT_REDUCED_MOTION_FACTOR, 10);
        expect(ACCENT_REDUCED_MOTION_FACTOR).toBeLessThan(1);
    });

    it('lowers a running pulse at once when the intensity drops', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input());
        stepTrioAccent(state, input({ beatCount: 1 }));
        stepTrioAccent(state, input({ beatCount: 1, intensity: 0.1, dtSeconds: 0 }));
        expect(state.pulse).toBeCloseTo(0.1 * ACCENT_PEAK_CAP, 10);
    });

    it('treats a bad or negative frame time as no time passing', () => {
        const state = createTrioAccent();
        stepTrioAccent(state, input());
        stepTrioAccent(state, input({ beatCount: 1 }));
        stepTrioAccent(state, input({ beatCount: 1, dtSeconds: NaN }));
        stepTrioAccent(state, input({ beatCount: 1, dtSeconds: -3 }));
        expect(state.pulse).toBe(ACCENT_PEAK_CAP);
        expect(state.sinceTrigger).toBe(0);
    });
});
