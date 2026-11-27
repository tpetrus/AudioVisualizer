import * as THREE from 'three';
import {
    SHOCKWAVE_CENTER_Z,
    SHOCKWAVE_COLOR,
    SHOCKWAVE_INNER_SHARE,
    SHOCKWAVE_LIFETIME_SECONDS,
    SHOCKWAVE_MAX_RADIUS,
    SHOCKWAVE_PEAK_OPACITY,
    SHOCKWAVE_POOL_SIZE,
    SHOCKWAVE_SEGMENTS,
} from './trioEnhancedConfig';

// A small pool of rings that expand and fade after each accepted beat. The rings share one unit geometry (scaled to
// their radius) and are allocated once; firing only reuses the oldest one.
export class TrioShockwave {
    readonly rings: THREE.Mesh[] = [];

    private readonly geometry = new THREE.RingGeometry(SHOCKWAVE_INNER_SHARE, 1, SHOCKWAVE_SEGMENTS);
    private readonly materials: THREE.MeshBasicMaterial[] = [];
    // Seconds since each ring was fired (Infinity while idle) and the peak opacity it was fired with.
    private readonly ages = new Float32Array(SHOCKWAVE_POOL_SIZE).fill(Infinity);
    private readonly peaks = new Float32Array(SHOCKWAVE_POOL_SIZE);
    private next = 0;

    constructor() {
        for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: false,
                side: THREE.DoubleSide,
            });
            // Above 1 on purpose: the bloom catches it.
            material.color.setRGB(...SHOCKWAVE_COLOR);
            const ring = new THREE.Mesh(this.geometry, material);
            ring.position.set(0, 0, SHOCKWAVE_CENTER_Z);
            ring.renderOrder = 10;
            ring.frustumCulled = false;
            ring.visible = false;
            this.materials.push(material);
            this.rings.push(ring);
        }
    }

    // Starts a ring, replacing the oldest one when all are busy. `intensity` (0..1) scales how bright it gets.
    fire(intensity: number): void {
        this.ages[this.next] = 0;
        this.peaks[this.next] = SHOCKWAVE_PEAK_OPACITY * intensity;
        this.next = (this.next + 1) % SHOCKWAVE_POOL_SIZE;
    }

    // Advances every live ring. `mix` is the crossfade; under reduced motion nothing is drawn and live rings are dropped.
    update(dtSeconds: number, mix: number, reducedMotion: boolean): void {
        for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
            const ring = this.rings[i];
            if (reducedMotion) this.ages[i] = Infinity;
            this.ages[i] += dtSeconds;
            const progress = this.ages[i] / SHOCKWAVE_LIFETIME_SECONDS;
            if (!(progress < 1)) {
                ring.visible = false;
                this.ages[i] = Infinity;
                continue;
            }
            // Fast out, slow in: the ring leaves quickly and settles. It fades with the square of what is left.
            const eased = 1 - (1 - progress) ** 3;
            ring.scale.setScalar(Math.max(1e-3, eased * SHOCKWAVE_MAX_RADIUS));
            this.materials[i].opacity = this.peaks[i] * (1 - progress) ** 2 * mix;
            ring.visible = true;
        }
    }

    dispose(): void {
        for (const ring of this.rings) ring.removeFromParent();
        this.geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}
