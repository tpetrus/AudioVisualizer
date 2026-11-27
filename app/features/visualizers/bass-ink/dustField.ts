import * as THREE from 'three';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { PalettePair } from './bassInkTypes';
import { hash01 } from './formations';
import { dustFragmentShader, dustVertexShader } from '../meshes/dustShaders';

// Contract C1: a sparse, faint field of points around the whole scene. It fills the black void and gives depth and
// parallax. Everything is precomputed at construction; update() only writes uniforms, so a frame allocates nothing.
//
// Flash safety: each point twinkles around its own constant mean with a random phase, so the field's total light is
// constant. The high band changes only how fast the twinkle runs, never its depth or the mean.
export class DustField {
    readonly object: THREE.Points;
    readonly pointCount: number;

    private readonly geometry = new THREE.BufferGeometry();
    // Public for the enhanced look, which swaps this material's shaders in place (see enhanced/bassInkEnhanced.ts).
    readonly material: THREE.ShaderMaterial;
    private readonly uniforms: Record<string, THREE.IUniform>;
    private readonly color = new Float32Array(3);

    // The twinkle phase in cycles, integrated here so a change of speed never jumps it. Kept unwrapped (a double) for
    // tests; the shader gets it wrapped to [0, 1).
    private phase = 0;

    // The unwrapped twinkle phase in cycles, for tests and telemetry.
    get phaseCycles(): number {
        return this.phase;
    }
    private lastSeconds = Number.NaN;

    constructor(pointCount: number, seed: number, maxPointSize: number) {
        this.pointCount = pointCount;
        const config = bassInkSceneConfig.dust;

        // A direction uniform on the sphere and a radius uniform in volume between the two radii.
        const positions = new Float32Array(pointCount * 3);
        const rand = new Float32Array(pointCount);
        const inner3 = config.innerRadius ** 3;
        const outer3 = config.outerRadius ** 3;
        for (let i = 0; i < pointCount; i++) {
            const z = hash01(i, seed, 21) * 2 - 1;
            const around = hash01(i, seed, 22) * Math.PI * 2;
            const ring = Math.sqrt(1 - z * z);
            const radius = Math.cbrt(inner3 + (outer3 - inner3) * hash01(i, seed, 23));
            positions[i * 3] = ring * Math.cos(around) * radius;
            positions[i * 3 + 1] = z * radius;
            positions[i * 3 + 2] = ring * Math.sin(around) * radius;
            rand[i] = hash01(i, seed, 24);
        }
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

        this.uniforms = {
            uPhase: { value: 0 },
            uDepth: { value: config.twinkleDepth },
            uSize: { value: config.size },
            uPointScale: { value: 500 },
            uMaxPointSize: { value: maxPointSize },
            uColor: { value: this.color },
            uAlpha: { value: config.alpha },
        };
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: dustVertexShader,
            fragmentShader: dustFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.object = new THREE.Points(this.geometry, this.material);
        // The field surrounds the camera, so a bounding-sphere test would only ever be wrong.
        this.object.frustumCulled = false;
    }

    // Window height in device pixels and the camera's vertical field of view, so a point's world size becomes pixels.
    setViewport(heightPixels: number, fovDegrees: number): void {
        this.uniforms.uPointScale.value = heightPixels / (2 * Math.tan((fovDegrees * Math.PI) / 360));
    }

    // `high` is the scene's followed high-band level; `palette` the shown palette (linear RGB).
    update(nowSeconds: number, high: number, palette: PalettePair): void {
        const config = bassInkSceneConfig.dust;
        // The first call and a clock that steps back advance nothing, so the phase never runs backward.
        const dt = Number.isFinite(this.lastSeconds) ? Math.max(0, nowSeconds - this.lastSeconds) : 0;
        this.lastSeconds = nowSeconds;
        // A NaN high band (or clock) reads as calm; otherwise it would poison the phase and hide the dust for good.
        const level = Number.isFinite(high) ? Math.min(1, Math.max(0, high)) : 0;
        this.phase += Number.isFinite(dt) ? dt * config.twinkleSpeed * (1 + config.highGain * level) : 0;
        // The phase only enters sin(2 pi (phase + rand)), so dropping whole cycles is seamless, and it keeps the
        // single-precision GPU sine accurate however long the page runs.
        this.uniforms.uPhase.value = this.phase % 1;

        this.object.rotation.y = nowSeconds * config.driftSpeed;

        const mix = config.whiteMix;
        for (let k = 0; k < 3; k++) {
            this.color[k] = palette.edge[k] + (1 - palette.edge[k]) * mix;
        }
    }

    // Continues the twinkle of the field this one replaces (a density rebuild), so the phase does not restart at 0.
    carryFrom(previous: DustField): void {
        this.phase = previous.phase;
        this.lastSeconds = previous.lastSeconds;
        this.uniforms.uPhase.value = this.phase % 1;
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}
