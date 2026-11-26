import { describe, expect, it } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { DirectorCue } from './bassInkTypes';
import { ViewSwing, type ViewAngles } from './viewSwing';

const cue = (count: number, start = 1, seconds = 2): DirectorCue => ({
    phase: 'groove',
    tension: 0,
    dropAt: -1,
    formationIndex: 0,
    nextFormationIndex: 1,
    paletteIndex: 0,
    transitionStart: start,
    transitionSeconds: seconds,
    transitionCount: count,
});

const read = (swing: ViewSwing, c: DirectorCue, now: number, amount = 1): ViewAngles => {
    const out: ViewAngles = { tilt: 9, yaw: 9 };
    swing.step(c, now, amount, out);
    return out;
};

const { tiltSwing, yawSwing } = bassInkSceneConfig.view;

describe('ViewSwing', () => {
    it('holds zero offsets on the first cue', () => {
        const swing = new ViewSwing(7);
        expect(read(swing, cue(0, -1), 0)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(swing, cue(0, -1), 50)).toEqual({ tilt: 0, yaw: 0 });
    });

    it('eases from zero at the start to the target at the end, monotonically', () => {
        const c = cue(1, 10, 2);
        const start = read(new ViewSwing(7), c, 10);
        expect(start.tilt).toBeCloseTo(0, 12);
        expect(start.yaw).toBeCloseTo(0, 12);
        const end = read(new ViewSwing(7), c, 12);
        expect(end.tilt !== 0 || end.yaw !== 0).toBe(true);
        // One swing stepped through the ease: the distance from zero never shrinks.
        const swing = new ViewSwing(7);
        let previous = 0;
        for (let i = 0; i <= 20; i++) {
            const out = read(swing, c, 10 + i / 10);
            expect(Math.abs(out.yaw)).toBeGreaterThanOrEqual(previous - 1e-12);
            previous = Math.abs(out.yaw);
        }
        expect(previous).toBeCloseTo(Math.abs(end.yaw), 12);
        // Smoothstep is half way at half the time.
        const mid = read(new ViewSwing(7), c, 11);
        expect(Math.sign(mid.yaw)).toBe(Math.sign(end.yaw));
        expect(Math.abs(mid.yaw)).toBeCloseTo(Math.abs(end.yaw) / 2, 9);
    });

    it('holds the target between changes', () => {
        const swing = new ViewSwing(3);
        const c = cue(1, 0, 2);
        const end = { ...read(swing, c, 2) };
        expect(read(swing, c, 5)).toEqual(end);
        expect(read(swing, c, 100)).toEqual(end);
    });

    it('starts the next ease from the current offsets without a jump', () => {
        const swing = new ViewSwing(3);
        const first = { ...read(swing, cue(1, 0, 2), 2) };
        const next = read(swing, cue(2, 10, 2), 10);
        expect(next.tilt).toBeCloseTo(first.tilt, 12);
        expect(next.yaw).toBeCloseTo(first.yaw, 12);
    });

    it('gives zero offsets at once when the amount is 0', () => {
        const swing = new ViewSwing(5);
        const c = cue(1, 0, 2);
        read(swing, c, 3);
        expect(read(swing, c, 3, 0)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(new ViewSwing(5), cue(1, 0, 2), 3, 0)).toEqual({ tilt: 0, yaw: 0 });
    });

    it('scales the output by the amount', () => {
        const full = read(new ViewSwing(5), cue(1, 0, 2), 3, 1);
        const half = read(new ViewSwing(5), cue(1, 0, 2), 3, 0.5);
        expect(Math.abs(half.yaw)).toBeLessThan(Math.abs(full.yaw));
        // The targets are scaled when the change starts and the output every frame, so a half amount gives a quarter.
        expect(half.yaw).toBeCloseTo(full.yaw * 0.25, 9);
    });

    it('gives the same targets for the same seed and different ones for another', () => {
        const a = read(new ViewSwing(11), cue(4, 0, 2), 5);
        const b = read(new ViewSwing(11), cue(4, 0, 2), 5);
        const c = read(new ViewSwing(12), cue(4, 0, 2), 5);
        expect(a).toEqual(b);
        expect(c).not.toEqual(a);
    });

    it('keeps the offsets within the swing bounds', () => {
        const swing = new ViewSwing(99);
        for (let count = 1; count <= 200; count++) {
            const out = read(swing, cue(count, count * 3, 2), count * 3 + 2);
            expect(Math.abs(out.tilt)).toBeLessThanOrEqual(tiltSwing + 1e-12);
            expect(Math.abs(out.yaw)).toBeLessThanOrEqual(yawSwing + 1e-12);
        }
    });

    it('jumps to the target when the transition has no length', () => {
        const out = read(new ViewSwing(7), cue(1, 5, 0), 5);
        const ref = read(new ViewSwing(7), cue(1, 5, 2), 7);
        expect(out).toEqual(ref);
    });

    it('gives zero offsets and leaves the state alone on non-finite input', () => {
        const swing = new ViewSwing(7);
        const c = cue(1, 0, 2);
        const before = { ...read(swing, c, 1) };
        expect(read(swing, c, NaN)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(swing, c, 1, NaN)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(swing, cue(Infinity), 1)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(swing, cue(1, NaN), 1)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(swing, cue(1, 0, Infinity), 1)).toEqual({ tilt: 0, yaw: 0 });
        expect(read(swing, c, 1)).toEqual(before);
    });
});
