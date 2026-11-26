import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { PalettePair } from './bassInkTypes';
import { DustField } from './dustField';
import { dustTwinkle } from '../meshes/dustShaders';

const config = bassInkSceneConfig.dust;
const palette: PalettePair = { core: new Float32Array([1, 0.5, 0]), edge: new Float32Array([0.2, 0.4, 0.8]) };

function uniformsOf(field: DustField): Record<string, THREE.IUniform> {
    return (field.object.material as THREE.ShaderMaterial).uniforms;
}

describe('DustField', () => {
    it('has the requested count and every point inside the shell', () => {
        const field = new DustField(500, 3, 64);
        const positions = field.object.geometry.getAttribute('position');
        expect(field.pointCount).toBe(500);
        expect(positions.count).toBe(500);
        for (let i = 0; i < positions.count; i++) {
            const r = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
            expect(r).toBeGreaterThanOrEqual(config.innerRadius - 1e-3);
            expect(r).toBeLessThanOrEqual(config.outerRadius + 1e-3);
        }
        expect(field.object.frustumCulled).toBe(false);
        field.dispose();
    });

    it('is deterministic for a seed and differs between seeds', () => {
        const a = new DustField(50, 1, 64).object.geometry.getAttribute('position').array;
        const b = new DustField(50, 1, 64).object.geometry.getAttribute('position').array;
        const c = new DustField(50, 2, 64).object.geometry.getAttribute('position').array;
        expect(Array.from(a)).toEqual(Array.from(b));
        expect(Array.from(a)).not.toEqual(Array.from(c));
    });

    it('sets the point scale from the viewport', () => {
        const field = new DustField(10, 1, 64);
        field.setViewport(900, 60);
        expect(uniformsOf(field).uPointScale.value).toBeCloseTo(900 / (2 * Math.tan(Math.PI / 6)), 6);
    });

    it('advances the twinkle phase faster with a higher high band and never backward', () => {
        const calm = new DustField(10, 1, 64);
        const loud = new DustField(10, 1, 64);
        calm.update(0, 0, palette);
        loud.update(0, 1, palette);
        calm.update(1, 0, palette);
        loud.update(1, 1, palette);
        const calmPhase = calm.phaseCycles;
        const loudPhase = loud.phaseCycles;
        expect(calmPhase).toBeCloseTo(config.twinkleSpeed, 9);
        expect(loudPhase).toBeCloseTo(config.twinkleSpeed * (1 + config.highGain), 9);
        // Values past 1 count as 1.
        const over = new DustField(10, 1, 64);
        over.update(0, 5, palette);
        over.update(1, 5, palette);
        expect(over.phaseCycles).toBeCloseTo(loudPhase, 9);

        let last = calmPhase;
        for (const [t, high] of [
            [0.5, 1],
            [2, 0],
            [3, 1],
            [3.5, 0.3],
        ]) {
            calm.update(t, high, palette);
            const phase = calm.phaseCycles;
            expect(phase).toBeGreaterThanOrEqual(last);
            last = phase;
        }
    });

    it('hands the shader the phase wrapped to whole cycles', () => {
        const field = new DustField(10, 1, 64);
        field.update(0, 1, palette);
        field.update(1, 1, palette);
        expect(field.phaseCycles).toBeGreaterThan(1);
        expect(uniformsOf(field).uPhase.value).toBeCloseTo(field.phaseCycles % 1, 9);
        expect(uniformsOf(field).uPhase.value).toBeLessThan(1);
    });

    it('reads a NaN high band or clock as no advance in speed and keeps the phase finite', () => {
        const field = new DustField(10, 1, 64);
        field.update(0, 0, palette);
        field.update(1, Number.NaN, palette);
        expect(field.phaseCycles).toBeCloseTo(config.twinkleSpeed, 9);
        field.update(Number.NaN, 0, palette);
        field.update(2, 0, palette);
        expect(Number.isFinite(field.phaseCycles)).toBe(true);
        expect(Number.isFinite(uniformsOf(field).uPhase.value as number)).toBe(true);
    });

    it('turns slowly and follows the palette edge mixed toward white', () => {
        const field = new DustField(10, 1, 64);
        field.update(10, 0, palette);
        expect(field.object.rotation.y).toBeCloseTo(10 * config.driftSpeed, 9);
        const color = uniformsOf(field).uColor.value as Float32Array;
        for (let k = 0; k < 3; k++) {
            const expected = palette.edge[k] + (1 - palette.edge[k]) * config.whiteMix;
            expect(color[k]).toBeCloseTo(expected, 6);
        }
    });

    it('keeps the same uniform objects and arrays across updates', () => {
        const field = new DustField(10, 1, 64);
        const uniforms = uniformsOf(field);
        const before = Object.values(uniforms).map((u) => u.value);
        const slots = Object.values(uniforms);
        for (let i = 0; i < 20; i++) {
            field.update(i * 0.016, 0.5, palette);
        }
        expect(uniformsOf(field)).toBe(uniforms);
        expect(Object.values(uniformsOf(field))).toEqual(slots);
        expect(uniforms.uColor.value).toBe(before[Object.keys(uniforms).indexOf('uColor')]);
    });

    it('keeps the mean twinkle over the real points at 1 on every phase', () => {
        // The shader multiplies each point by its own factor around 1, so the total light only stays constant if the
        // average over the field is 1 at every phase. Check it on the points the field really builds, not random draws.
        for (const count of [800, 6400]) {
            for (const seed of [1, 2, 3]) {
                const rand = new DustField(count, seed, 64).object.geometry.getAttribute('aRand').array;
                for (const phase of [0, 0.25, 0.5, 0.8]) {
                    let sum = 0;
                    for (let i = 0; i < rand.length; i++) sum += dustTwinkle(rand[i], phase, config.twinkleDepth);
                    expect(Math.abs(sum / rand.length - 1)).toBeLessThanOrEqual(0.015);
                }
            }
        }
    });

    it('disposes the geometry and the material', () => {
        const field = new DustField(10, 1, 64);
        const geometry = vi.spyOn(field.object.geometry, 'dispose');
        const material = vi.spyOn(field.object.material as THREE.Material, 'dispose');
        field.dispose();
        expect(geometry).toHaveBeenCalledTimes(1);
        expect(material).toHaveBeenCalledTimes(1);
    });
});
