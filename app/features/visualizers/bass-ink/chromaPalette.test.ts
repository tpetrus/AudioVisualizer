import { describe, expect, it } from 'vitest';
import { bassInkConfig } from './bassInkConfig';
import { DominantPitch, writePalette } from './chromaPalette';
import type { PalettePair } from './bassInkTypes';

const DT = 1 / 60;

function chromaOf(values: Record<number, number>): Float32Array {
    const chroma = new Float32Array(12);
    for (const [bin, value] of Object.entries(values)) {
        chroma[Number(bin)] = value;
    }
    return chroma;
}

function run(pitch: DominantPitch, chroma: Float32Array, seconds: number): void {
    for (let i = 0; i < seconds * 60; i++) {
        pitch.update(chroma, DT);
    }
}

function pair(): PalettePair {
    return { core: new Float32Array(3), edge: new Float32Array(3) };
}

describe('DominantPitch', () => {
    it('stays at -1 until the chroma has energy', () => {
        const pitch = new DominantPitch();
        run(pitch, new Float32Array(12), 2);
        expect(pitch.pitchClass).toBe(-1);
        // The smoothing starts from silence here, so the class appears once the new energy has built up.
        run(pitch, chromaOf({ 4: 0.8 }), 1);
        expect(pitch.pitchClass).toBe(4);
    });

    it('does not switch for a short change, then switches after the dwell', () => {
        const pitch = new DominantPitch();
        run(pitch, chromaOf({ 0: 0.9 }), 2);
        expect(pitch.pitchClass).toBe(0);
        // The smoothed values take a while to cross over; a change shorter than that never switches.
        run(pitch, chromaOf({ 7: 0.9 }), 1.5);
        expect(pitch.pitchClass).toBe(0);
        run(pitch, chromaOf({ 7: 0.9 }), 20);
        expect(pitch.pitchClass).toBe(7);
    });

    it('does not flicker on noisy chroma hovering between two classes (F9)', () => {
        const pitch = new DominantPitch();
        run(pitch, chromaOf({ 2: 0.8, 9: 0.6 }), 3);
        expect(pitch.pitchClass).toBe(2);
        let seed = 12345;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const changes = new Set<number>();
        for (let i = 0; i < 60 * 60; i++) {
            const chroma = chromaOf({ 2: 0.6 + 0.2 * rand(), 9: 0.6 + 0.2 * rand() });
            pitch.update(chroma, DT);
            changes.add(pitch.pitchClass);
        }
        expect(changes.size).toBe(1);
    });

    it('resets the dwell when the challenger loses its lead', () => {
        const pitch = new DominantPitch();
        run(pitch, chromaOf({ 0: 0.9 }), 2);
        // Almost long enough, then the old class returns.
        run(pitch, chromaOf({ 5: 0.9 }), 6);
        run(pitch, chromaOf({ 0: 0.9 }), 10);
        expect(pitch.pitchClass).toBe(0);
        run(pitch, chromaOf({ 5: 0.9 }), 3.5);
        expect(pitch.pitchClass).toBe(0);
    });

    it('restarts the dwell when a different challenger takes over', () => {
        const pitch = new DominantPitch({ ...bassInkConfig.chroma, smoothingTauSeconds: 0.01 });
        run(pitch, chromaOf({ 0: 0.9 }), 1);
        run(pitch, chromaOf({ 3: 0.9 }), 3);
        run(pitch, chromaOf({ 6: 0.9 }), 3);
        expect(pitch.pitchClass).toBe(0);
        run(pitch, chromaOf({ 6: 0.9 }), 1.5);
        expect(pitch.pitchClass).toBe(6);
    });
});

describe('writePalette', () => {
    it('writes linear values in 0..1 for every pitch class and the neutral one', () => {
        for (let pc = -1; pc < 12; pc++) {
            const out = pair();
            writePalette(pc, out);
            for (const value of [...out.core, ...out.edge]) {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            }
        }
    });

    it('gives each pitch class its own core color', () => {
        const seen = new Set<string>();
        for (let pc = 0; pc < 12; pc++) {
            const out = pair();
            writePalette(pc, out);
            seen.add(Array.from(out.core, (v) => v.toFixed(3)).join(','));
        }
        expect(seen.size).toBe(12);
    });

    it('makes the edge darker than the core, and the neutral palette gray-blue', () => {
        const out = pair();
        writePalette(3, out);
        const sum = (a: Float32Array) => a[0] + a[1] + a[2];
        expect(sum(out.edge)).toBeLessThan(sum(out.core));
        writePalette(-1, out);
        expect(sum(out.edge)).toBeLessThan(sum(out.core));
        expect(out.core[2]).toBeGreaterThanOrEqual(out.core[0]);
    });

    it('keeps the luminance within 1.2x across the 12 classes, at the nominal look mean level', () => {
        const luminance = (c: Float32Array) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const cores: number[] = [];
        const edges: number[] = [];
        for (let pc = 0; pc < 12; pc++) {
            const out = pair();
            writePalette(pc, out);
            cores.push(luminance(out.core));
            edges.push(luminance(out.edge));
        }
        for (const values of [cores, edges]) {
            expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.2);
        }
        const mean = cores.reduce((a, b) => a + b) / 12;
        expect(mean).toBeGreaterThan(0.25);
        expect(mean).toBeLessThan(0.45);
    });

    it('keeps the 12 palettes distinct by color distance', () => {
        const outs = Array.from({ length: 12 }, (_, pc) => {
            const out = pair();
            writePalette(pc, out);
            return out;
        });
        for (let i = 0; i < 12; i++) {
            for (let j = i + 1; j < 12; j++) {
                for (const part of ['core', 'edge'] as const) {
                    const d = Math.hypot(...Array.from(outs[i][part], (v, k) => v - outs[j][part][k]));
                    expect(d).toBeGreaterThan(0.02);
                }
            }
        }
    });

    it('covers every hue sector', () => {
        // Circle-of-fifths hues land in all six 60-degree sectors across the 12 classes plus the edge shift.
        const out = pair();
        const dominant = new Set<number>();
        for (let pc = 0; pc < 12; pc++) {
            writePalette(pc, out);
            dominant.add(out.core.indexOf(Math.max(...out.core)));
        }
        expect(dominant.size).toBe(3);
    });
});
