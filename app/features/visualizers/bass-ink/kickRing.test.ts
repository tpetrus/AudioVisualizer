import { describe, expect, it } from 'vitest';
import { KICK_SLOTS } from './bassInkTypes';
import { KickRing, type KickSource } from './kickRing';

function gate(bumpCount: number, bumpTarget = 1, weight = 1): KickSource {
    return { bumpCount, bumpTarget, weight };
}

describe('KickRing', () => {
    it('starts with empty slots', () => {
        const ring = new KickRing();
        expect(ring.count).toBe(0);
        expect(Array.from(ring.times)).toEqual(new Array(KICK_SLOTS).fill(-1e6));
        expect(Array.from(ring.strengths)).toEqual(new Array(KICK_SLOTS).fill(0));
    });

    it('only records the counter on the first call, so a running gate is not a kick', () => {
        const ring = new KickRing();
        expect(ring.update(gate(5), 1)).toBe(false);
        expect(ring.count).toBe(0);
    });

    it('records a new gate pulse with the frame time as its start (AC2)', () => {
        const ring = new KickRing();
        ring.update(gate(0), 1);
        expect(ring.update(gate(1, 0.8), 1.016)).toBe(true);
        expect(ring.times[0]).toBeCloseTo(1.016, 5);
        expect(ring.strengths[0]).toBeCloseTo(0.8, 5);
        expect(ring.count).toBe(1);
    });

    it('records one kick per pulse, not per frame', () => {
        const ring = new KickRing();
        ring.update(gate(0), 1);
        ring.update(gate(1), 1.1);
        expect(ring.update(gate(1), 1.2)).toBe(false);
        expect(ring.update(gate(1), 1.3)).toBe(false);
        expect(ring.count).toBe(1);
    });

    it('scales the strength by the gate weight, so a newly found bassline starts gently', () => {
        const ring = new KickRing();
        ring.update(gate(0), 1);
        ring.update(gate(1, 0.8, 0.25), 1.5);
        expect(ring.strengths[0]).toBeCloseTo(0.2, 5);
    });

    it('clamps strength to 0..1', () => {
        const ring = new KickRing();
        ring.update(gate(0), 1);
        ring.update(gate(1, 1.7), 1.5);
        expect(ring.strengths[0]).toBe(1);
        ring.update(gate(2, -1), 2);
        expect(ring.strengths[1]).toBe(0);
    });

    it('wraps around after the slots are full, replacing the oldest', () => {
        const ring = new KickRing();
        ring.update(gate(0), 0);
        for (let i = 0; i < KICK_SLOTS + 2; i++) {
            ring.update(gate(i + 1), i + 0.5);
        }
        expect(ring.count).toBe(KICK_SLOTS + 2);
        expect(ring.times[0]).toBeCloseTo(KICK_SLOTS + 0.5);
        expect(ring.times[1]).toBeCloseTo(KICK_SLOTS + 1.5);
        expect(ring.times[2]).toBeCloseTo(2.5);
    });

    it.each([128, 174, 200])('records every pulse of a %i BPM gate at 60 fps', (bpm) => {
        const ring = new KickRing();
        const period = 60 / bpm;
        let bumps = 0;
        let next = 0;
        let recorded = 0;
        for (let i = 0; i < 20 * 60; i++) {
            const t = i / 60;
            if (t >= next - 1e-9) {
                bumps++;
                next += period;
            }
            if (ring.update(gate(bumps), t)) {
                recorded++;
            }
        }
        // The first pulse lands on the first call, which only records the counter.
        expect(recorded).toBe(bumps - 1);
    });
});
