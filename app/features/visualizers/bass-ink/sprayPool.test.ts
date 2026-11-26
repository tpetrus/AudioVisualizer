import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { PalettePair } from './bassInkTypes';
import { SprayPool, SprayTrigger, type RestSource } from './sprayPool';
import { sprayOffset } from '../meshes/sprayShaders';

const config = bassInkSceneConfig.spray;
const palette: PalettePair = { core: new Float32Array([1, 0.5, 0.25]), edge: new Float32Array([0.1, 0.2, 0.3]) };

// A source whose rest positions lie on the unit sphere, so directions and travel are easy to check.
const sphere: RestSource = {
    pointCount: 64,
    restPosition(index, out) {
        const a = index * 2.399963;
        const z = 1 - (2 * (index + 0.5)) / 64;
        const r = Math.sqrt(1 - z * z);
        out[0] = r * Math.cos(a);
        out[1] = r * Math.sin(a);
        out[2] = z;
    },
};

const center: RestSource = {
    pointCount: 1,
    restPosition(_index, out) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
    },
};

function attr(pool: SprayPool, name: string): THREE.BufferAttribute {
    return pool.object.geometry.getAttribute(name) as THREE.BufferAttribute;
}

function uniforms(pool: SprayPool): Record<string, THREE.IUniform> {
    return (pool.object.material as THREE.ShaderMaterial).uniforms;
}

describe('SprayTrigger', () => {
    it('fires when the swell rises through arm', () => {
        const trigger = new SprayTrigger();
        expect(trigger.step(0, 0)).toBe(false);
        expect(trigger.step(config.arm - 0.01, 0.016)).toBe(false);
        expect(trigger.step(config.arm + 0.01, 0.032)).toBe(true);
    });

    it('does not fire again while the swell stays above arm', () => {
        const trigger = new SprayTrigger();
        trigger.step(0, 0);
        expect(trigger.step(1, 1)).toBe(true);
        expect(trigger.step(1, 2)).toBe(false);
    });

    it('re-arms only below rearm', () => {
        const trigger = new SprayTrigger();
        trigger.step(0, 0);
        expect(trigger.step(1, 1)).toBe(true);
        // Dips between rearm and arm do not re-arm it.
        expect(trigger.step((config.arm + config.rearm) / 2, 2)).toBe(false);
        expect(trigger.step(1, 3)).toBe(false);
        expect(trigger.step(config.rearm - 0.01, 4)).toBe(false);
        expect(trigger.step(1, 5)).toBe(true);
    });

    it('waits minIntervalSeconds between bursts', () => {
        const trigger = new SprayTrigger();
        trigger.step(0, 0);
        expect(trigger.step(1, 1)).toBe(true);
        trigger.step(0, 1.05);
        expect(trigger.step(1, 1.1)).toBe(false);
        trigger.step(0, 1.2);
        expect(trigger.step(1, 1 + config.minIntervalSeconds + 0.01)).toBe(true);
    });

    it('fires at most 3 times in any 1 s on a swell oscillating at 8 Hz at 60 fps', () => {
        const trigger = new SprayTrigger();
        const fires: number[] = [];
        for (let frame = 0; frame < 60 * 20; frame++) {
            const t = frame / 60;
            const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * t);
            if (trigger.step(swell, t)) {
                fires.push(t);
            }
        }
        expect(fires.length).toBeGreaterThan(20);
        for (let i = 0; i + 3 < fires.length; i++) {
            expect(fires[i + 3] - fires[i]).toBeGreaterThanOrEqual(1 - 1e-9);
        }
    });

    it('never fires on non-finite input and is not disturbed by it', () => {
        const trigger = new SprayTrigger();
        trigger.step(0, 0);
        expect(trigger.step(Number.NaN, 1)).toBe(false);
        expect(trigger.step(Infinity, 1)).toBe(false);
        expect(trigger.step(1, Number.NaN)).toBe(false);
        expect(trigger.step(1, 1)).toBe(true);
    });
});

describe('SprayPool', () => {
    it('starts empty, with birth times far in the past', () => {
        const pool = new SprayPool(16, 3, 64);
        expect(pool.capacity).toBe(16);
        expect(pool.burstCount).toBe(0);
        pool.update(10, palette, 1);
        expect(pool.liveCount).toBe(0);
        expect(Math.max(...(attr(pool, 'aBirth').array as Float32Array))).toBeLessThan(-1e5);
    });

    it('emits points at the rest position times radius, heading outward', () => {
        const pool = new SprayPool(32, 5, 64);
        pool.emit(sphere, 4, 10, 1, 0.8);
        const origins = attr(pool, 'position').array as Float32Array;
        const dirs = attr(pool, 'aDir').array as Float32Array;
        for (let i = 0; i < 10; i++) {
            const origin = [origins[i * 3], origins[i * 3 + 1], origins[i * 3 + 2]];
            const dir = [dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]];
            expect(Math.hypot(...origin)).toBeCloseTo(4, 4);
            expect(Math.hypot(...dir)).toBeCloseTo(1, 5);
            const dot = (origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2]) / 4;
            expect(dot).toBeGreaterThan(0.8);
        }
        expect((attr(pool, 'aStrength').array as Float32Array)[0]).toBeCloseTo(0.8, 6);
        expect((attr(pool, 'aBirth').array as Float32Array)[9]).toBe(1);
    });

    it('differs from burst to burst', () => {
        const pool = new SprayPool(32, 5, 64);
        pool.emit(sphere, 1, 8, 0, 1);
        const first = Array.from((attr(pool, 'position').array as Float32Array).slice(0, 24));
        pool.emit(sphere, 1, 8, 1, 1);
        const second = Array.from((attr(pool, 'position').array as Float32Array).slice(24, 48));
        expect(second).not.toEqual(first);
    });

    it('gives a unit direction for a point at the center', () => {
        const pool = new SprayPool(8, 1, 64);
        pool.emit(center, 3, 8, 0, 1);
        const dirs = attr(pool, 'aDir').array as Float32Array;
        for (let i = 0; i < 8; i++) {
            expect(Math.hypot(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2])).toBeCloseTo(1, 5);
        }
    });

    it('falls back to straight up when the direction has zero length', () => {
        // Jitter cannot cancel a zero origin, so force it with a source returning NaN-free zero and a zero-jitter hash.
        const pool = new SprayPool(4, 1, 64);
        const nan: RestSource = {
            pointCount: 1,
            restPosition(_i, out) {
                out[0] = 0;
                out[1] = 0;
                out[2] = 0;
            },
        };
        const original = Math.hypot;
        Math.hypot = () => 0;
        try {
            pool.emit(nan, 1, 1, 0, 1);
        } finally {
            Math.hypot = original;
        }
        expect(Array.from((attr(pool, 'aDir').array as Float32Array).slice(0, 3))).toEqual([0, 1, 0]);
    });

    it('wraps the ring, uploading at most two ranges', () => {
        const pool = new SprayPool(10, 2, 64);
        pool.emit(sphere, 1, 7, 0, 1);
        for (const name of ['position', 'aDir', 'aBirth', 'aStrength']) {
            attr(pool, name).clearUpdateRanges();
        }
        pool.emit(sphere, 1, 6, 1, 1);
        const position = attr(pool, 'position');
        expect(position.updateRanges).toEqual([
            { start: 21, count: 9 },
            { start: 0, count: 9 },
        ]);
        expect(attr(pool, 'aBirth').updateRanges).toEqual([
            { start: 7, count: 3 },
            { start: 0, count: 3 },
        ]);
        expect(position.version).toBeGreaterThan(0);
        // Slots 3..6 still hold the first burst; 7..9 and 0..2 the second.
        const births = attr(pool, 'aBirth').array as Float32Array;
        expect(Array.from(births)).toEqual([1, 1, 1, 0, 0, 0, 0, 1, 1, 1]);
    });

    it('queues one range when the burst does not wrap, and ignores empty or invalid bursts', () => {
        const pool = new SprayPool(10, 2, 64);
        pool.emit(sphere, 1, 4, 0, 1);
        expect(attr(pool, 'aBirth').updateRanges).toEqual([{ start: 0, count: 4 }]);
        pool.emit(sphere, 1, 0, 1, 1);
        pool.emit(sphere, 1, Number.NaN, 1, 1);
        pool.emit({ pointCount: 0, restPosition: () => undefined }, 1, 3, 1, 1);
        expect(pool.burstCount).toBe(1);
        expect(attr(pool, 'aBirth').updateRanges).toHaveLength(1);
    });

    it('caps a burst at the capacity and clamps the strength', () => {
        const pool = new SprayPool(6, 2, 64);
        pool.emit(sphere, 1, 100, 0, 5);
        expect(pool.burstCount).toBe(1);
        expect(Array.from(attr(pool, 'aStrength').array as Float32Array)).toEqual([1, 1, 1, 1, 1, 1]);
        pool.emit(sphere, 1, 1, 0, -2);
        expect((attr(pool, 'aStrength').array as Float32Array)[0]).toBe(0);
    });

    it('counts live points from the birth times', () => {
        const pool = new SprayPool(20, 2, 64);
        pool.emit(sphere, 1, 5, 1, 1);
        pool.emit(sphere, 1, 5, 1.3, 1);
        pool.update(1.5, palette, 1);
        expect(pool.liveCount).toBe(10);
        pool.update(1.95, palette, 1);
        expect(pool.liveCount).toBe(5);
        pool.update(0.5, palette, 1);
        expect(pool.liveCount).toBe(0);
        pool.update(10, palette, 1);
        expect(pool.liveCount).toBe(0);
    });

    it('scales the alpha by the intensity, and 0 shows no spray', () => {
        const pool = new SprayPool(4, 2, 64);
        pool.update(0, palette, 0);
        expect(uniforms(pool).uAlphaScale.value).toBe(0);
        pool.update(0, palette, 1);
        expect(uniforms(pool).uAlphaScale.value).toBeCloseTo(config.alpha, 6);
        pool.update(0, palette, 0.5);
        expect(uniforms(pool).uAlphaScale.value).toBeCloseTo(config.alpha / 2, 6);
        pool.update(0, palette, 7);
        expect(uniforms(pool).uAlphaScale.value).toBeCloseTo(config.alpha, 6);
        pool.update(0, palette, Number.NaN);
        expect(uniforms(pool).uAlphaScale.value).toBe(0);
    });

    it('takes the palette core as its color and the time as a uniform', () => {
        const pool = new SprayPool(4, 2, 64);
        pool.update(3, palette, 1);
        expect(Array.from(uniforms(pool).uColor.value as Float32Array)).toEqual(Array.from(palette.core));
        expect(uniforms(pool).uTime.value).toBe(3);
    });

    it('keeps every point within speed * dragSeconds of its origin at any age', () => {
        const bound = config.speed * config.dragSeconds;
        const pool = new SprayPool(16, 2, 64);
        pool.emit(sphere, 2, 16, 0, 1);
        const dirs = attr(pool, 'aDir').array as Float32Array;
        for (const age of [0, 0.05, 0.4, config.lifeSeconds, 30]) {
            for (let i = 0; i < 16; i++) {
                const travel = Math.hypot(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]) * sprayOffset(age);
                expect(travel).toBeLessThanOrEqual(bound * (1 + 1e-6));
            }
        }
    });

    it('sets the point scale from the viewport', () => {
        const pool = new SprayPool(4, 2, 64);
        pool.setViewport(1000, 50);
        expect(uniforms(pool).uPointScale.value).toBeCloseTo(1000 / (2 * Math.tan((50 * Math.PI) / 360)), 6);
    });

    it('draws additively without writing depth or culling', () => {
        const pool = new SprayPool(4, 2, 64);
        const material = pool.object.material as THREE.ShaderMaterial;
        expect(material.depthWrite).toBe(false);
        expect(material.transparent).toBe(true);
        expect(pool.object.frustumCulled).toBe(false);
    });

    it('disposes its geometry and material', () => {
        const pool = new SprayPool(4, 2, 64);
        let geometry = 0;
        let material = 0;
        pool.object.geometry.addEventListener('dispose', () => geometry++);
        (pool.object.material as THREE.Material).addEventListener('dispose', () => material++);
        pool.dispose();
        expect(geometry).toBe(1);
        expect(material).toBe(1);
    });
});
