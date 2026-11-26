import * as THREE from 'three';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { PalettePair } from './bassInkTypes';
import { hash01 } from './formations';
import { sprayFragmentShader, sprayVertexShader } from '../meshes/sprayShaders';

// Birth time of a slot that was never written: so far back that the shader draws nothing for it.
const NEVER = -1e6;

// How far a point's direction may stray from straight outward, as a share of a unit: enough that a burst fans out
// instead of leaving as rays.
const JITTER = 0.25;

// Where bursts come from; InkCloud already satisfies it (restPosition gives the unit rest position, before radius).
export interface RestSource {
    readonly pointCount: number;
    restPosition(index: number, out: Float32Array | number[]): void;
}

// Decides when a burst fires: the swell has to rise through `arm`, it has to have dropped below `rearm` since the last
// burst, and at least minIntervalSeconds must have passed. Together they cap bursts at 3 a second whatever the swell
// does, which is what keeps the spray from flashing.
export class SprayTrigger {
    private armed = true;
    private previous = 0;
    private lastFire = -Infinity;

    step(swell: number, nowSeconds: number): boolean {
        // Garbage in never fires and never changes the state, so one bad frame cannot lock the trigger.
        if (!Number.isFinite(swell) || !Number.isFinite(nowSeconds)) {
            return false;
        }
        const { arm, rearm, minIntervalSeconds } = bassInkSceneConfig.spray;
        const rose = this.previous < arm && swell >= arm;
        this.previous = swell;
        if (swell < rearm) {
            this.armed = true;
        }
        if (rose && this.armed && nowSeconds - this.lastFire >= minIntervalSeconds) {
            this.armed = false;
            this.lastFire = nowSeconds;
            return true;
        }
        return false;
    }
}

// Contract C3: a fixed pool of points thrown off the shell on bass hits. A burst writes its points into a ring, newest
// over oldest; the shader moves and fades them from the birth time, so the CPU touches a point only when it is born.
export class SprayPool {
    readonly object: THREE.Points;
    readonly capacity: number;

    private readonly geometry = new THREE.BufferGeometry();
    private readonly material: THREE.ShaderMaterial;
    private readonly uniforms: Record<string, THREE.IUniform>;
    private readonly origins: THREE.BufferAttribute;
    private readonly directions: THREE.BufferAttribute;
    private readonly births: THREE.BufferAttribute;
    private readonly strengths: THREE.BufferAttribute;
    private readonly color = new Float32Array(3);
    private readonly rest = new Float32Array(3);
    private readonly seed: number;
    private head = 0;
    private live = 0;
    private bursts = 0;

    constructor(capacity: number, seed: number, maxPointSize: number) {
        this.capacity = capacity;
        this.seed = seed;
        const config = bassInkSceneConfig.spray;

        this.origins = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
        this.directions = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
        this.births = new THREE.BufferAttribute(new Float32Array(capacity).fill(NEVER), 1);
        this.strengths = new THREE.BufferAttribute(new Float32Array(capacity), 1);
        this.origins.setUsage(THREE.DynamicDrawUsage);
        this.directions.setUsage(THREE.DynamicDrawUsage);
        this.births.setUsage(THREE.DynamicDrawUsage);
        this.strengths.setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('position', this.origins);
        this.geometry.setAttribute('aDir', this.directions);
        this.geometry.setAttribute('aBirth', this.births);
        this.geometry.setAttribute('aStrength', this.strengths);

        this.uniforms = {
            uTime: { value: 0 },
            uSpeed: { value: config.speed },
            uDrag: { value: config.dragSeconds },
            uLife: { value: config.lifeSeconds },
            uAttack: { value: config.attackSeconds },
            uSize: { value: config.size },
            uMaxPointSize: { value: maxPointSize },
            uPointScale: { value: 500 },
            uColor: { value: this.color },
            uAlphaScale: { value: 0 },
        };
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: sprayVertexShader,
            fragmentShader: sprayFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.object = new THREE.Points(this.geometry, this.material);
        // The shader moves the points away from their origins, so the geometry's bounds say nothing about them.
        this.object.frustumCulled = false;
    }

    // Points still alive at the last update.
    get liveCount(): number {
        return this.live;
    }

    // Number of emit calls that wrote at least one point.
    get burstCount(): number {
        return this.bursts;
    }

    // Window height in device pixels and the camera's vertical field of view, so a point's world size becomes pixels.
    setViewport(heightPixels: number, fovDegrees: number): void {
        this.uniforms.uPointScale.value = heightPixels / (2 * Math.tan((fovDegrees * Math.PI) / 360));
    }

    // Writes `count` points into the ring. Each takes a hashed point of `source` (the hash includes the burst number
    // and the slot, so bursts differ), starts at its rest position times `radius` and leaves along that direction with
    // a little jitter. Only the written ranges are uploaded.
    emit(source: RestSource, radius: number, count: number, nowSeconds: number, strength: number): void {
        const n = Math.min(Math.floor(count), this.capacity);
        if (!(n > 0) || source.pointCount <= 0) {
            return;
        }
        const salt = this.seed + this.bursts * 977;
        const clamped = Math.min(1, Math.max(0, strength));
        const rest = this.rest;
        const origins = this.origins.array as Float32Array;
        const directions = this.directions.array as Float32Array;
        const births = this.births.array as Float32Array;
        const strengths = this.strengths.array as Float32Array;

        for (let k = 0; k < n; k++) {
            const slot = (this.head + k) % this.capacity;
            const index = Math.min(source.pointCount - 1, Math.floor(hash01(slot, salt, 1) * source.pointCount));
            source.restPosition(index, rest);
            const x = rest[0] + (hash01(slot, salt, 2) - 0.5) * JITTER;
            const y = rest[1] + (hash01(slot, salt, 3) - 0.5) * JITTER;
            const z = rest[2] + (hash01(slot, salt, 4) - 0.5) * JITTER;
            const length = Math.hypot(x, y, z);
            const o = slot * 3;
            origins[o] = rest[0] * radius;
            origins[o + 1] = rest[1] * radius;
            origins[o + 2] = rest[2] * radius;
            // A zero-length direction (a point at the center and no net jitter) goes straight up instead of NaN.
            if (length > 1e-6) {
                directions[o] = x / length;
                directions[o + 1] = y / length;
                directions[o + 2] = z / length;
            } else {
                directions[o] = 0;
                directions[o + 1] = 1;
                directions[o + 2] = 0;
            }
            births[slot] = nowSeconds;
            strengths[slot] = clamped;
        }

        const first = Math.min(n, this.capacity - this.head);
        this.mark(this.head, first);
        if (first < n) {
            this.mark(0, n - first);
        }
        this.head = (this.head + n) % this.capacity;
        this.bursts++;
    }

    // `intensity` is the flash-intensity control (0..1); it scales the alpha, so 0 shows no spray.
    update(nowSeconds: number, palette: PalettePair, intensity: number): void {
        const config = bassInkSceneConfig.spray;
        this.uniforms.uTime.value = nowSeconds;
        this.uniforms.uAlphaScale.value = Number.isFinite(intensity)
            ? config.alpha * Math.min(1, Math.max(0, intensity))
            : 0;
        this.color.set(palette.core);
        const births = this.births.array as Float32Array;
        let live = 0;
        for (let i = 0; i < births.length; i++) {
            const age = nowSeconds - births[i];
            if (age >= 0 && age < config.lifeSeconds) {
                live++;
            }
        }
        this.live = live;
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    private mark(start: number, count: number): void {
        this.markAttribute(this.origins, start, count);
        this.markAttribute(this.directions, start, count);
        this.markAttribute(this.births, start, count);
        this.markAttribute(this.strengths, start, count);
    }

    private markAttribute(attribute: THREE.BufferAttribute, start: number, count: number): void {
        attribute.needsUpdate = true;
        // The renderer clears the queued ranges itself after each upload, so they never pile up across frames.
        attribute.addUpdateRange(start * attribute.itemSize, count * attribute.itemSize);
    }
}
