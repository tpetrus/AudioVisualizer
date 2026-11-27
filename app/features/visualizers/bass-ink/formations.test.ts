import { describe, expect, it } from 'vitest';
import { FORMATION_COUNT } from './bassInkTypes';
import { FORMATION_NAMES, GALAXY_DISC_INDEX, hash01, isGalaxyDisc, writeFormation } from './formations';

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

    it('sphere is a thin shell with a hollow middle', () => {
        const r = radii(fill(0));
        expect(Math.min(...r)).toBeGreaterThanOrEqual(0.84);
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
        expect(maxY).toBeLessThanOrEqual(0.19);
    });

    describe('armillary rings', () => {
        const N = 4000;
        const points = new Float32Array(N * 3);
        writeFormation(2, 5, points, N, 0, N);

        function extent(axis: number): number {
            const values: number[] = [];
            for (let i = 0; i < N; i++) values.push(points[i * 3 + axis]);
            values.sort((x, y) => x - y);
            return values[Math.floor(N * 0.98)] - values[Math.floor(N * 0.02)];
        }

        // Occupied cells of a 64x64 grid over [-1.2, 1.2]^2 after dropping the viewing axis.
        function silhouette(dropAxis: number): number {
            const [ua, va] = [0, 1, 2].filter((axis) => axis !== dropAxis);
            const occupied = new Set<number>();
            for (let i = 0; i < N; i++) {
                const gu = Math.floor(((points[i * 3 + ua] + 1.2) / 2.4) * 64);
                const gv = Math.floor(((points[i * 3 + va] + 1.2) / 2.4) * 64);
                occupied.add(gv * 64 + gu);
            }
            return occupied.size;
        }

        it('has about the same extent along x, y and z', () => {
            const extents = [extent(0), extent(1), extent(2)];
            expect(Math.max(...extents) / Math.min(...extents)).toBeLessThanOrEqual(1.25);
        });

        it('has a similar silhouette when viewed along x, y and z', () => {
            const areas = [silhouette(0), silhouette(1), silhouette(2)];
            expect(Math.min(...areas) / Math.max(...areas)).toBeGreaterThanOrEqual(0.5);
        });

        it('is hollow in the middle and stays inside the unit sphere', () => {
            for (let i = 0; i < N; i++) {
                const r = Math.hypot(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
                expect(r).toBeGreaterThan(0.75);
                expect(r).toBeLessThanOrEqual(1);
            }
        });
    });

    it('never mentions a helix', () => {
        expect(FORMATION_NAMES.join(' ').toLowerCase()).not.toContain('helix');
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

describe('isGalaxyDisc', () => {
    it('picks the galaxy disc the way writeFormation wraps an index', () => {
        expect(FORMATION_NAMES[GALAXY_DISC_INDEX]).toBe('galaxy disc');
        expect(isGalaxyDisc(GALAXY_DISC_INDEX)).toBe(true);
        expect(isGalaxyDisc(GALAXY_DISC_INDEX + FORMATION_COUNT)).toBe(true);
        expect(isGalaxyDisc(GALAXY_DISC_INDEX + 0.5)).toBe(true);
        for (const index of [0, 1, 2, 4]) expect(isGalaxyDisc(index)).toBe(false);
    });

    it('is false for -1 (a baked blend of two formations), any negative index and a non-number', () => {
        for (const index of [-1, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(isGalaxyDisc(index)).toBe(false);
    });
});
