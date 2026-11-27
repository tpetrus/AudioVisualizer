import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { orbitAngularSpeed, smoothCombined, stepOrbitAngle, writeOrbitPose } from './bassInkOrbit';
import { bassInkSceneConfig } from './bassInkSceneConfig';

const { orbit } = bassInkSceneConfig;
const DT = 1 / 60;

// Runs the speed filter until it has settled, as the render loop would.
function settle(combined: number, drift: number, start = 0): number {
    let speed = start;
    for (let i = 0; i < 3000; i++) speed = orbitAngularSpeed(combined, drift, speed, DT, false);
    return speed;
}

describe('smoothCombined', () => {
    it('rises faster than it falls', () => {
        const up = smoothCombined(0, 1, 0.1);
        const down = 1 - smoothCombined(1, 0, 0.1);
        expect(up).toBeGreaterThan(down);
        expect(up).toBeGreaterThan(0);
        expect(up).toBeLessThan(1);
    });

    it('settles on a steady level and stays within 0..1', () => {
        let level = 0;
        for (let i = 0; i < 1000; i++) level = smoothCombined(level, 0.4, DT);
        expect(level).toBeCloseTo(0.4, 6);
        expect(smoothCombined(0.5, 7, 100)).toBeLessThanOrEqual(1);
        expect(smoothCombined(0.5, -3, 100)).toBeGreaterThanOrEqual(0);
    });

    it('counts a non-finite level as silence', () => {
        expect(smoothCombined(0.5, Number.NaN, 0.1)).toBeCloseTo(smoothCombined(0.5, 0, 0.1), 12);
        expect(smoothCombined(0.5, Infinity, 0.1)).toBeLessThanOrEqual(1);
        expect(smoothCombined(Number.NaN, 0.5, 0.1)).toBeCloseTo(smoothCombined(0, 0.5, 0.1), 12);
        expect(smoothCombined(0.5, 0.5, Number.NaN)).toBe(0.5);
    });
});

describe('orbitAngularSpeed', () => {
    it('settles at the floor in silence and the cap when the music is full, scaled by the drift setting', () => {
        expect(settle(0, 1)).toBeCloseTo(orbit.floorSpeed, 6);
        expect(settle(1, 1)).toBeCloseTo(orbit.capSpeed, 6);
        expect(settle(1, 0.3)).toBeCloseTo(0.3 * orbit.capSpeed, 6);
        expect(settle(0, 0.5)).toBeCloseTo(0.5 * orbit.floorSpeed, 6);
    });

    it('keeps a slow floor speed in silence at any drift above 0', () => {
        expect(settle(0, 0.05)).toBeGreaterThan(0);
    });

    it('is monotonic in the combined level, for a fixed previous speed and settled', () => {
        let last = -Infinity;
        let lastSettled = -Infinity;
        for (let level = 0; level <= 1.0001; level += 0.05) {
            const speed = orbitAngularSpeed(level, 1, 0.1, 0.5, false);
            expect(speed).toBeGreaterThanOrEqual(last);
            last = speed;
            const settled = settle(level, 1);
            expect(settled).toBeGreaterThanOrEqual(lastSettled);
            lastSettled = settled;
        }
    });

    it('scales with the drift setting', () => {
        expect(settle(0.5, 1)).toBeGreaterThan(settle(0.5, 0.5));
        expect(settle(0.5, 0.5)).toBeGreaterThan(settle(0.5, 0.1));
    });

    it('is exactly 0 at drift 0, below it, or not finite', () => {
        expect(orbitAngularSpeed(1, 0, 0.2, DT, false)).toBe(0);
        expect(orbitAngularSpeed(1, -1, 0.2, DT, false)).toBe(0);
        expect(orbitAngularSpeed(1, Number.NaN, 0.2, DT, false)).toBe(0);
        expect(orbitAngularSpeed(1, Infinity, 0.2, DT, false)).toBe(0);
    });

    it('is exactly 0 under reduced motion, also when it switches on mid-play', () => {
        expect(orbitAngularSpeed(1, 1, 0.2, DT, true)).toBe(0);
        let speed = settle(1, 1);
        expect(speed).toBeGreaterThan(0);
        speed = orbitAngularSpeed(1, 1, speed, DT, true);
        expect(speed).toBe(0);
        // And it eases back up from 0 when the preference goes away, rather than jumping.
        const resumed = orbitAngularSpeed(1, 1, speed, DT, false);
        expect(resumed).toBeGreaterThan(0);
        expect(resumed).toBeLessThanOrEqual(orbit.maxChangePerSecond * DT + 1e-12);
    });

    it('is rate limited: a jump from silence to full never changes the speed faster than the limit', () => {
        let speed = settle(0, 1);
        for (let i = 0; i < 120; i++) {
            const next = orbitAngularSpeed(1, 1, speed, DT, false);
            expect(Math.abs(next - speed)).toBeLessThanOrEqual(orbit.maxChangePerSecond * DT + 1e-12);
            speed = next;
        }
    });

    it('eases: one frame covers only part of the gap when the gap is small', () => {
        const target = settle(1, 1);
        const next = orbitAngularSpeed(1, 1, target - 0.001, DT, false);
        expect(next).toBeGreaterThan(target - 0.001);
        expect(next).toBeLessThan(target);
    });

    it('never goes negative, whatever it is given', () => {
        for (const prev of [-5, 0, 0.1, Number.NaN]) {
            for (const combined of [-1, 0, 0.5, 2, Number.NaN]) {
                for (const dt of [-1, 0, DT, 5, Number.NaN]) {
                    expect(orbitAngularSpeed(combined, 1, prev, dt, false)).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });

    it('holds the speed when no time passes', () => {
        expect(orbitAngularSpeed(1, 1, 0.1, 0, false)).toBeCloseTo(0.1, 12);
    });
});

describe('stepOrbitAngle', () => {
    it('adds speed times dt', () => {
        expect(stepOrbitAngle(1, 0.2, 0.01)).toBeCloseTo(1.002, 12);
    });

    it('is capped by maxStepPerFrame, so a long stall never jumps the view', () => {
        expect(stepOrbitAngle(1, 10, 5) - 1).toBeCloseTo(orbit.maxStepPerFrame, 12);
    });

    it('wraps to [0, 2π) and never decreases except by the wrap', () => {
        const wrapped = stepOrbitAngle(2 * Math.PI - 0.001, 1, 0.01);
        expect(wrapped).toBeGreaterThanOrEqual(0);
        expect(wrapped).toBeLessThan(0.01);
        let angle = 0;
        for (let i = 0; i < 5000; i++) {
            const next = stepOrbitAngle(angle, 0.25, DT);
            expect(next).toBeGreaterThanOrEqual(0);
            expect(next).toBeLessThan(2 * Math.PI);
            if (next < angle) expect(angle).toBeGreaterThan(2 * Math.PI - orbit.maxStepPerFrame - 1e-9);
            angle = next;
        }
    });

    it('does not go backward for a negative or non-finite speed, and ignores a bad angle', () => {
        expect(stepOrbitAngle(1, -1, DT)).toBe(1);
        expect(stepOrbitAngle(1, Number.NaN, DT)).toBe(1);
        expect(stepOrbitAngle(1, 1, Number.NaN)).toBe(1);
        expect(stepOrbitAngle(Number.NaN, 0, DT)).toBe(0);
    });
});

describe('writeOrbitPose', () => {
    const out = new THREE.Vector3();

    it('is exactly (0, 0, distance) at azimuth 0', () => {
        writeOrbitPose(out, 0, orbit.tilt, 12);
        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
        expect(out.z).toBe(12);
    });

    it('keeps the distance at every azimuth', () => {
        for (let k = 0; k <= 24; k++) {
            writeOrbitPose(out, (k / 24) * 2 * Math.PI, orbit.tilt, 12);
            expect(out.length()).toBeCloseTo(12, 9);
        }
    });

    it('rises and falls with the tilt: highest opposite the start, by sin(2 * tilt) of the distance', () => {
        writeOrbitPose(out, Math.PI, 0.12, 12);
        expect(out.y).toBeCloseTo(12 * Math.sin(0.24), 9);
        const high = out.y;
        writeOrbitPose(out, Math.PI / 2, 0.12, 12);
        expect(out.y).toBeGreaterThan(0);
        expect(out.y).toBeLessThan(high);
        // A negative lean mirrors it: the camera dips instead of rising.
        writeOrbitPose(out, Math.PI, -0.12, 12);
        expect(out.y).toBeCloseTo(-high, 9);
        // The configured lean varies the height too.
        writeOrbitPose(out, Math.PI, orbit.tilt, 12);
        expect(Math.abs(out.y)).toBeGreaterThan(0.1);
        // No tilt is a flat circle.
        writeOrbitPose(out, Math.PI, 0, 12);
        expect(out.y).toBeCloseTo(0, 12);
        expect(out.z).toBeCloseTo(-12, 12);
    });
});
