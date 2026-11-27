import * as THREE from 'three';
import {
    DUST_COLOR,
    DUST_COUNT,
    DUST_DEPTH_FAR,
    DUST_DEPTH_NEAR,
    DUST_DRIFT_RANGE,
    DUST_DRIFT_SPEED,
    DUST_HALF_HEIGHT,
    DUST_HALF_WIDTH,
    DUST_MAX_OPACITY,
    DUST_POINT_PIXELS,
    DUST_SEED,
} from './trioEnhancedConfig';

// The time is a cycle count that wraps at 1 and every wander uses a whole number of cycles per unit of it, so the wrap
// is seamless and the single-precision sine stays accurate however long the page runs.
const vertexShader = /*glsl*/ `
uniform float uTime;
uniform float uRange;
uniform float uPixelSize;
attribute vec3 aSeed;
void main() {
    float tau = 6.2831853;
    vec3 wander = vec3(
        sin(tau * (uTime + aSeed.x)),
        sin(tau * (2.0 * uTime + aSeed.y)),
        0.5 * sin(tau * (uTime + aSeed.z))
    );
    gl_PointSize = uPixelSize * (0.6 + 0.8 * aSeed.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + uRange * wander, 1.0);
}`;

const fragmentShader = /*glsl*/ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    gl_FragColor = vec4(uColor, smoothstep(1.0, 0.2, d) * uOpacity);
}`;

// A small deterministic generator (mulberry32), so the dust is the same on every run and in tests.
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Faint specks drifting around the sheets: one Points draw, everything placed once at construction. The drift runs on
// the GPU from one time uniform, so a frame writes three numbers.
export class TrioDust {
    readonly points: THREE.Points;

    private readonly geometry = new THREE.BufferGeometry();
    private readonly material: THREE.ShaderMaterial;
    private readonly time: THREE.IUniform<number> = { value: 0 };
    private readonly opacity: THREE.IUniform<number> = { value: 0 };
    private readonly pixelSize: THREE.IUniform<number>;

    constructor(pixelRatio: number) {
        const random = seededRandom(DUST_SEED);
        const positions = new Float32Array(DUST_COUNT * 3);
        const seeds = new Float32Array(DUST_COUNT * 3);
        for (let i = 0; i < DUST_COUNT; i++) {
            positions[i * 3] = (random() * 2 - 1) * DUST_HALF_WIDTH;
            positions[i * 3 + 1] = (random() * 2 - 1) * DUST_HALF_HEIGHT;
            positions[i * 3 + 2] = DUST_DEPTH_FAR + random() * (DUST_DEPTH_NEAR - DUST_DEPTH_FAR);
            seeds[i * 3] = random();
            seeds[i * 3 + 1] = random();
            seeds[i * 3 + 2] = random();
        }
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

        this.pixelSize = { value: DUST_POINT_PIXELS * pixelRatio };
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: this.time,
                uRange: { value: DUST_DRIFT_RANGE },
                uPixelSize: this.pixelSize,
                uColor: { value: new THREE.Vector3(...DUST_COLOR) },
                uOpacity: this.opacity,
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.points = new THREE.Points(this.geometry, this.material);
        // The points wander and fill the view; a bounding-sphere test would only ever be wrong.
        this.points.frustumCulled = false;
        this.points.renderOrder = 5;
        this.points.visible = false;
    }

    // The point size is in device pixels, so it follows the renderer's pixel ratio.
    setPixelRatio(pixelRatio: number): void {
        this.pixelSize.value = DUST_POINT_PIXELS * pixelRatio;
    }

    // `amount` is the Dust slider (0..1), `mix` the crossfade. Under reduced motion the specks hold still.
    update(dtSeconds: number, amount: number, mix: number, reducedMotion: boolean): void {
        if (!reducedMotion && dtSeconds > 0) {
            this.time.value = (this.time.value + dtSeconds * DUST_DRIFT_SPEED) % 1;
        }
        const opacity = amount * mix * DUST_MAX_OPACITY;
        this.opacity.value = opacity;
        this.points.visible = opacity > 0;
    }

    dispose(): void {
        this.points.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}
