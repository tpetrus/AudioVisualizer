import { describe, expect, it } from 'vitest';
import { ORBIT_BASE_SPEED, ORBIT_MAX_CHANGE_PER_SECOND, ORBIT_MAX_SPEED } from './dancingCharacterConfig';
import { orbitAngularSpeed } from './dancingCharacterOrbit';

// Runs the filter until it has settled, as the render loop would.
function settle(bpm: number | undefined, setting: number, start = 0): number {
    let speed = start;
    for (let i = 0; i < 3000; i++) speed = orbitAngularSpeed(bpm, setting, speed, 1 / 60);
    return speed;
}

describe('orbitAngularSpeed', () => {
    it('settles at the calm range ends for 60 and 180 BPM', () => {
        expect(settle(60, 1)).toBeCloseTo(ORBIT_BASE_SPEED, 6);
        expect(settle(180, 1)).toBeCloseTo(ORBIT_MAX_SPEED, 6);
    });

    it('clamps below 60 and above 180 BPM', () => {
        expect(settle(20, 1)).toBeCloseTo(settle(60, 1), 6);
        expect(settle(400, 1)).toBeCloseTo(settle(180, 1), 6);
    });

    it('is monotonic in the tempo for a fixed previous speed', () => {
        let last = -Infinity;
        for (let bpm = 40; bpm <= 200; bpm += 5) {
            const speed = orbitAngularSpeed(bpm, 1, 0.1, 0.5);
            expect(speed).toBeGreaterThanOrEqual(last);
            last = speed;
        }
        let settled = -Infinity;
        for (let bpm = 40; bpm <= 200; bpm += 5) {
            const speed = settle(bpm, 1);
            expect(speed).toBeGreaterThanOrEqual(settled - 1e-12);
            settled = speed;
        }
    });

    it('scales with the setting, and a setting of 0 stops the orbit', () => {
        expect(settle(120, 2)).toBeCloseTo(2 * settle(120, 1), 6);
        expect(settle(120, 0)).toBe(0);
        expect(orbitAngularSpeed(120, 0, 0, 1 / 60)).toBe(0);
    });

    it('eases an unknown tempo to the base speed', () => {
        expect(settle(undefined, 1)).toBeCloseTo(ORBIT_BASE_SPEED, 6);
        expect(settle(undefined, 1.5, 0.2)).toBeCloseTo(ORBIT_BASE_SPEED * 1.5, 6);
    });

    it('moves by at most the maximum change per second, so an octave flip does not jump', () => {
        const dt = 1 / 60;
        const before = settle(80, 1);
        for (const bpm of [160, 40, undefined]) {
            const after = orbitAngularSpeed(bpm, 2, before, dt);
            expect(Math.abs(after - before)).toBeLessThanOrEqual(ORBIT_MAX_CHANGE_PER_SECOND * dt + 1e-12);
        }
        // A long frame step is limited in proportion.
        const long = orbitAngularSpeed(180, 2, 0, 0.1);
        expect(long).toBeLessThanOrEqual(ORBIT_MAX_CHANGE_PER_SECOND * 0.1 + 1e-12);
    });

    it('keeps the previous speed for a zero frame step', () => {
        expect(orbitAngularSpeed(150, 1, 0.123, 0)).toBeCloseTo(0.123, 12);
    });
});
