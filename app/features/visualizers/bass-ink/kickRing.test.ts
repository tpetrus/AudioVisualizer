import { describe, expect, it } from 'vitest';
import { KICK_SLOTS } from './bassInkTypes';
import { KickRing } from './kickRing';

// Mimics bandOnsets[0]: a peak-held envelope that jumps to `peak` on a kick and decays 0.9 per 10 ms hop.
function kickTrain(bpm: number, seconds: number, fps = 60): { onsets: number[]; kickTimes: number[] } {
    const onsets: number[] = [];
    const kickTimes: number[] = [];
    const period = 60 / bpm;
    let value = 0;
    let nextKick = 0;
    for (let i = 0; i < seconds * fps; i++) {
        const t = i / fps;
        value *= Math.pow(0.9, 100 / fps);
        if (t >= nextKick - 1e-9) {
            value = 1;
            kickTimes.push(t);
            nextKick += period;
        }
        onsets.push(value);
    }
    return { onsets, kickTimes };
}

describe('KickRing', () => {
    it('starts with empty slots', () => {
        const ring = new KickRing();
        expect(ring.count).toBe(0);
        expect(Array.from(ring.times)).toEqual(new Array(KICK_SLOTS).fill(-1e6));
        expect(Array.from(ring.strengths)).toEqual(new Array(KICK_SLOTS).fill(0));
    });

    it('records a rise with the frame time as its start (AC2)', () => {
        const ring = new KickRing();
        expect(ring.update(0, 1)).toBe(false);
        expect(ring.update(0.8, 1.016)).toBe(true);
        expect(ring.times[0]).toBeCloseTo(1.016, 5);
        expect(ring.strengths[0]).toBeCloseTo(0.8, 5);
        expect(ring.count).toBe(1);
    });

    it('ignores a value that is high but not rising', () => {
        const ring = new KickRing();
        ring.update(0.9, 1);
        expect(ring.update(0.95, 1.1)).toBe(false);
        expect(ring.count).toBe(1);
    });

    it('ignores rises below the strength floor', () => {
        const ring = new KickRing();
        expect(ring.update(0.2, 1)).toBe(false);
        expect(ring.count).toBe(0);
    });

    it('ignores a second rise inside the refractory time', () => {
        const ring = new KickRing();
        ring.update(0.9, 1);
        ring.update(0.1, 1.05);
        expect(ring.update(0.9, 1.1)).toBe(false);
        ring.update(0.1, 1.15);
        expect(ring.update(0.9, 1.2)).toBe(true);
        expect(ring.count).toBe(2);
    });

    it('clamps strength to 0..1', () => {
        const ring = new KickRing();
        ring.update(1.7, 1);
        expect(ring.strengths[0]).toBe(1);
    });

    it('wraps around after the slots are full, replacing the oldest', () => {
        const ring = new KickRing();
        for (let i = 0; i < KICK_SLOTS + 2; i++) {
            ring.update(0, i);
            ring.update(0.9, i + 0.5);
        }
        expect(ring.count).toBe(KICK_SLOTS + 2);
        expect(ring.times[0]).toBeCloseTo(KICK_SLOTS + 0.5);
        expect(ring.times[1]).toBeCloseTo(KICK_SLOTS + 1.5);
        expect(ring.times[2]).toBeCloseTo(2.5);
    });

    it.each([128, 174, 200])('records every kick of a %i BPM train at 60 fps', (bpm) => {
        const ring = new KickRing();
        const { onsets, kickTimes } = kickTrain(bpm, 20);
        let recorded = 0;
        onsets.forEach((value, i) => {
            if (ring.update(value, i / 60)) {
                recorded++;
            }
        });
        expect(recorded).toBe(kickTimes.length);
        expect(ring.count).toBe(kickTimes.length);
    });
});
