import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { advanceHuePhase, MAX_HUE_CYCLES_PER_SECOND, writeCustomPalette } from './bassInkColor';
import type { PalettePair } from './bassInkTypes';

function palette(): PalettePair {
    return { core: new Float32Array(3), edge: new Float32Array(3) };
}

const colors = [new THREE.Color(1, 0, 0), new THREE.Color(0, 1, 0), new THREE.Color(0, 0, 1)] as const;

describe('advanceHuePhase', () => {
    it('leaves the phase unchanged at speed 0', () => {
        expect(advanceHuePhase(0.37, 0, 1)).toBeCloseTo(0.37, 10);
    });

    it('advances in proportion to the speed, at the maximum rate for speed 1', () => {
        expect(advanceHuePhase(0, 1, 0.5)).toBeCloseTo(0.5 * MAX_HUE_CYCLES_PER_SECOND, 10);
        expect(advanceHuePhase(0, 0.5, 0.5)).toBeCloseTo(0.25 * MAX_HUE_CYCLES_PER_SECOND, 10);
    });

    it('wraps into [0, 1)', () => {
        const wrapped = advanceHuePhase(0.95, 1, 1);
        expect(wrapped).toBeGreaterThanOrEqual(0);
        expect(wrapped).toBeLessThan(1);
        expect(wrapped).toBeCloseTo(0.95 + MAX_HUE_CYCLES_PER_SECOND - 1, 10);
        expect(advanceHuePhase(3.25, 0, 1)).toBeCloseTo(0.25, 10);
        expect(advanceHuePhase(-0.25, 0, 1)).toBeCloseTo(0.75, 10);
    });

    it('stays finite for non-finite inputs', () => {
        expect(advanceHuePhase(Number.NaN, 1, 1)).toBeCloseTo(MAX_HUE_CYCLES_PER_SECOND, 10);
        expect(advanceHuePhase(0.5, Number.NaN, 1)).toBe(0.5);
        expect(advanceHuePhase(0.5, 1, Number.POSITIVE_INFINITY)).toBe(0.5);
        expect(advanceHuePhase(0.5, 1, -1)).toBe(0.5);
    });

    it('takes at least 5 s per full cycle at the maximum speed, far below the flash threshold', () => {
        expect(1 / MAX_HUE_CYCLES_PER_SECOND).toBeGreaterThanOrEqual(5);
        let phase = 0;
        let wraps = 0;
        for (let i = 0; i < 600; i++) {
            const next = advanceHuePhase(phase, 1, 1 / 60);
            if (next < phase) wraps++;
            phase = next;
        }
        // Ten seconds at 0.2 cycles per second is two cycles at most.
        expect(wraps).toBeLessThanOrEqual(2);
    });
});

describe('writeCustomPalette', () => {
    it('writes into the same arrays', () => {
        const out = palette();
        const { core, edge } = out;
        writeCustomPalette(colors, 0.4, out);
        expect(out.core).toBe(core);
        expect(out.edge).toBe(edge);
    });

    it('starts the core on color A and the edge a third of the way around, on color B', () => {
        const out = palette();
        writeCustomPalette(colors, 0, out);
        expect(Array.from(out.core)).toEqual([1, 0, 0]);
        expect(out.edge[0]).toBeCloseTo(0, 5);
        expect(out.edge[1]).toBeCloseTo(1, 5);
        expect(out.edge[2]).toBeCloseTo(0, 5);
    });

    it('passes through B and C and closes back on A', () => {
        const out = palette();
        writeCustomPalette(colors, 1 / 3, out);
        expect(out.core[1]).toBeCloseTo(1, 5);
        writeCustomPalette(colors, 2 / 3, out);
        expect(out.core[2]).toBeCloseTo(1, 5);
        writeCustomPalette(colors, 5 / 6, out);
        expect(out.core[0]).toBeCloseTo(0.5, 5);
        expect(out.core[2]).toBeCloseTo(0.5, 5);
        writeCustomPalette(colors, 1, out);
        expect(Array.from(out.core)).toEqual([1, 0, 0]);
    });

    it('treats a non-finite phase as 0', () => {
        const out = palette();
        writeCustomPalette(colors, Number.NaN, out);
        expect(Array.from(out.core)).toEqual([1, 0, 0]);
    });
});
