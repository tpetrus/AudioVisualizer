import { describe, expect, it } from 'vitest';
import { BrightnessGovernor } from './brightnessGovernor';

describe('BrightnessGovernor', () => {
    it('grants clamped strength times clamped intensity', () => {
        const governor = new BrightnessGovernor();
        expect(governor.request(0.8, 0, 0.5)).toBeCloseTo(0.4);
        expect(governor.request(3, 10, 1)).toBe(1);
        expect(governor.request(1, 20, 7)).toBe(1);
    });

    it('returns 0 for intensity 0 or no strength, without using a slot', () => {
        const governor = new BrightnessGovernor();
        for (let i = 0; i < 10; i++) {
            expect(governor.request(1, 0, 0)).toBe(0);
            expect(governor.request(0, 0, 1)).toBe(0);
            expect(governor.request(-1, 0, 1)).toBe(0);
        }
        expect(governor.request(1, 0, 1)).toBe(1);
        expect(governor.request(1, 0, 1)).toBe(1);
        expect(governor.request(1, 0, 1)).toBe(1);
        expect(governor.request(1, 0, 1)).toBe(0);
    });

    it('denies the fourth request inside one second and frees a slot as the window slides', () => {
        const governor = new BrightnessGovernor();
        expect(governor.request(1, 0, 1)).toBe(1);
        expect(governor.request(1, 0.3, 1)).toBe(1);
        expect(governor.request(1, 0.6, 1)).toBe(1);
        expect(governor.request(1, 0.9, 1)).toBe(0);
        expect(governor.request(1, 0.99, 1)).toBe(0);
        // Exactly one second after the first grant, its slot is free.
        expect(governor.request(1, 1, 1)).toBe(1);
        expect(governor.request(1, 1.1, 1)).toBe(0);
    });

    it('never grants more than 3 in any 1-second window over a random stream', () => {
        const governor = new BrightnessGovernor();
        let seed = 99;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const granted: number[] = [];
        let t = 0;
        for (let i = 0; i < 20000; i++) {
            t += rand() * 0.2;
            if (governor.request(rand(), t, 1) > 0) {
                granted.push(t);
            }
        }
        expect(granted.length).toBeGreaterThan(100);
        for (let i = 0; i + 3 < granted.length; i++) {
            expect(granted[i + 3] - granted[i]).toBeGreaterThanOrEqual(1);
        }
    });

    it('honors another limit, including 0', () => {
        const two = new BrightnessGovernor(2);
        expect(two.request(1, 0, 1)).toBe(1);
        expect(two.request(1, 0.1, 1)).toBe(1);
        expect(two.request(1, 0.2, 1)).toBe(0);
        const none = new BrightnessGovernor(0);
        expect(none.request(1, 0, 1)).toBe(0);
    });
});
