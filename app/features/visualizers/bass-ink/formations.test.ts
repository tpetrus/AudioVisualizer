import { describe, expect, it } from 'vitest';
import { FORMATION_COUNT } from './bassInkTypes';
import { FORMATION_NAMES, hash01, writeFormation } from './formations';

const COUNT = 2000;

function fill(index: number, seed = 5): Float32Array {
    const out = new Float32Array(COUNT * 3);
    writeFormation(index, seed, out, COUNT, 0, COUNT);
    return out;
}

function radii(points: Float32Array): number[] {
    const result: number[] = [];
    for (let i = 0; i < COUNT; i++) {
        result.push(Math.hypot(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]));
    }
    return result;
}

describe('hash01', () => {
    it('is deterministic, in [0, 1) and varies with every argument', () => {
        expect(hash01(3, 4, 5)).toBe(hash01(3, 4, 5));
        const values = new Set([hash01(3, 4, 5), hash01(4, 4, 5), hash01(3, 5, 5), hash01(3, 4, 6)]);
        expect(values.size).toBe(4);
        for (let i = 0; i < 1000; i++) {
            const value = hash01(i, 1, 2);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('is roughly uniform', () => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
            sum += hash01(i, 1, 1);
        }
        expect(sum / 10000).toBeCloseTo(0.5, 1);
    });
});

describe('writeFormation', () => {
    it('names every formation', () => {
        expect(FORMATION_NAMES).toHaveLength(FORMATION_COUNT);
    });

    it.each([0, 1, 2, 3])('formation %i: chunked fill equals one-shot fill', (index) => {
        const whole = fill(index);
        const chunked = new Float32Array(COUNT * 3);
        for (let start = 0; start < COUNT; start += 300) {
            writeFormation(index, 5, chunked, COUNT, start, Math.min(COUNT, start + 300));
        }
        expect(Array.from(chunked)).toEqual(Array.from(whole));
    });

    it.each([0, 1, 2, 3])(
        'formation %i: deterministic per seed, different across seeds, finite and bounded',
        (index) => {
            const a = fill(index, 1);
            expect(Array.from(fill(index, 1))).toEqual(Array.from(a));
            expect(Array.from(fill(index, 2))).not.toEqual(Array.from(a));
            for (const value of a) {
                expect(Number.isFinite(value)).toBe(true);
            }
            for (const r of radii(a)) {
                expect(r).toBeLessThanOrEqual(1.5);
            }
        },
    );

    it('only writes the requested range', () => {
        const out = new Float32Array(COUNT * 3);
        writeFormation(0, 1, out, COUNT, 10, 20);
        expect(out[29]).toBe(0);
        expect(out[30]).not.toBe(0);
        expect(out[59]).not.toBe(0);
        expect(out[60]).toBe(0);
    });

    it('sphere is a shell with a hollow middle', () => {
        const r = radii(fill(0));
        expect(Math.min(...r)).toBeGreaterThanOrEqual(0.69);
        expect(Math.max(...r)).toBeLessThanOrEqual(1.001);
    });

    it('torus has a hole through the middle and is flatter than the sphere', () => {
        const points = fill(1);
        let minAxisDistance = Infinity;
        let maxY = 0;
        for (let i = 0; i < COUNT; i++) {
            minAxisDistance = Math.min(minAxisDistance, Math.hypot(points[i * 3], points[i * 3 + 2]));
            maxY = Math.max(maxY, Math.abs(points[i * 3 + 1]));
        }
        expect(minAxisDistance).toBeGreaterThan(0.35);
        expect(maxY).toBeLessThanOrEqual(0.31);
    });

    it('double helix spans the height with two strands', () => {
        const points = fill(2);
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < COUNT; i++) {
            minY = Math.min(minY, points[i * 3 + 1]);
            maxY = Math.max(maxY, points[i * 3 + 1]);
        }
        expect(minY).toBeLessThan(-0.9);
        expect(maxY).toBeGreaterThan(0.9);
        // The two strands sit on opposite sides: even and odd points at the same height have opposite x on average.
        let evenX = 0;
        let oddX = 0;
        for (let i = 0; i < COUNT; i++) {
            const y = points[i * 3 + 1];
            if (Math.abs(y - 0.5 / 3) < 0.01) {
                // Only points near one height, where the angle is shared.
                if (i % 2 === 0) evenX += points[i * 3];
                else oddX += points[i * 3];
            }
        }
        expect(evenX * oddX).toBeLessThanOrEqual(0);
    });

    it('disc is flat and wide', () => {
        const points = fill(3);
        let maxY = 0;
        let maxRing = 0;
        for (let i = 0; i < COUNT; i++) {
            maxY = Math.max(maxY, Math.abs(points[i * 3 + 1]));
            maxRing = Math.max(maxRing, Math.hypot(points[i * 3], points[i * 3 + 2]));
        }
        expect(maxY).toBeLessThanOrEqual(0.031);
        expect(maxRing).toBeGreaterThan(0.9);
    });

    it('wraps out-of-range and negative indices onto a formation', () => {
        expect(Array.from(fill(4))).toEqual(Array.from(fill(0)));
        expect(Array.from(fill(-1))).toEqual(Array.from(fill(3)));
    });
});
