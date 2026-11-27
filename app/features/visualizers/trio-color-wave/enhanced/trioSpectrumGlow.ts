import * as THREE from 'three';
import type { PencilFlagsMesh } from '~/features/visualizers/meshes/pencilFlagsMesh';
import { FLAG_DEPTH, FLAG_DISTANCE, FLAG_WIDTH } from '../trioColorWaveConfig';
import {
    GLOW_ATTACK_SECONDS,
    GLOW_BEHIND,
    GLOW_BINS,
    GLOW_HEIGHT,
    GLOW_LEVEL_REFERENCE,
    GLOW_PULSE_GAIN,
    GLOW_RELEASE_SECONDS,
    GLOW_STRENGTH_PER_GLOW,
} from './trioEnhancedConfig';

// Name of the glow mesh, so the look's specs (and a debugger) can find it in the scene.
export const SPECTRUM_GLOW_NAME = 'trioSpectrumGlow';

// Columns of the standard sheets, left to right, that each bin averages.
const COLUMNS_PER_BIN = FLAG_WIDTH / GLOW_BINS;
// Width of the bars' footprint (world units): from the first column to the last.
const FOOTPRINT_WIDTH = (FLAG_WIDTH - 1) * FLAG_DISTANCE;
// The nearest row of a sheet follows the spectrum directly (the rows behind it chase it), so the glow reads that one.
const NEAREST_ROW = FLAG_DEPTH - 1;

const vertexShader = /*glsl*/ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A soft light rising from behind the bars. Each bin's color is what the three sheets are doing at that stretch of the
// spectrum (their colors weighted by how tall their bars are there), blurred across neighboring bins so no bin edge
// shows. Louder stretches glow brighter and reach higher. Linear HDR out; OutputPass tone maps once.
export const spectrumGlowFragmentShader = /*glsl*/ `
uniform vec3 bins[${GLOW_BINS}];
uniform float strength;

varying vec2 vUv;

void main() {
    float position = vUv.x * ${(GLOW_BINS - 1).toFixed(1)};
    vec3 color = vec3(0.0);
    float weights = 0.0;
    for (int i = 0; i < ${GLOW_BINS}; i++) {
        float offset = position - float(i);
        float weight = exp(-offset * offset * 0.25);
        color += bins[i] * weight;
        weights += weight;
    }
    color /= weights;

    // How far up the glow reaches follows how loud that stretch is.
    float level = max(color.r, max(color.g, color.b));
    float reach = 0.12 + 0.5 * clamp(level, 0.0, 1.0);
    float rise = exp(-vUv.y / reach);
    // Fades out before every edge of the plane, so the plane itself never shows.
    float sides = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float top = 1.0 - smoothstep(0.7, 1.0, vUv.y);
    gl_FragColor = vec4(color * rise * sides * top * strength, 1.0);
}`;

export interface SpectrumGlowUniforms {
    [name: string]: THREE.IUniform;
    bins: THREE.IUniform<THREE.Vector3[]>;
    strength: THREE.IUniform<number>;
}

// A dim, music-following glow behind the sheets: one quad, one draw. Every frame it averages the sheets' bar heights
// into a few bins along the spectrum and eases each bin toward that level (quick to rise, slow to fall), so it breathes
// with the music rather than flickering. A beat swells it a little, by the accent's pulse.
export class TrioSpectrumGlow {
    readonly mesh: THREE.Mesh;
    readonly uniforms: SpectrumGlowUniforms;

    private readonly geometry = new THREE.PlaneGeometry(1, 1);
    private readonly material: THREE.ShaderMaterial;
    // Each sheet's mean color per bin, linear RGB: colors[(sheet * GLOW_BINS + bin) * 3 + channel].
    private readonly colors: Float32Array;
    // The eased level of each sheet in each bin, 0..1: levels[sheet * GLOW_BINS + bin].
    private readonly levels: Float32Array;

    // `farthestZ` is the z of the farthest sheet; the glow sits GLOW_BEHIND further back.
    constructor(
        private readonly sheets: readonly PencilFlagsMesh[],
        farthestZ: number,
    ) {
        this.colors = new Float32Array(sheets.length * GLOW_BINS * 3);
        this.levels = new Float32Array(sheets.length * GLOW_BINS);
        const color = new THREE.Color();
        sheets.forEach((sheet, index) => {
            const source = sheet.geometry.getAttribute('instanceColor').array;
            for (let bin = 0; bin < GLOW_BINS; bin++) {
                let r = 0;
                let g = 0;
                let b = 0;
                for (let column = bin * COLUMNS_PER_BIN; column < (bin + 1) * COLUMNS_PER_BIN; column++) {
                    const flag = (column * FLAG_DEPTH + NEAREST_ROW) * 3;
                    // The standard colors are display (sRGB) values; the glow draws in linear light.
                    color.setRGB(source[flag], source[flag + 1], source[flag + 2]).convertSRGBToLinear();
                    r += color.r;
                    g += color.g;
                    b += color.b;
                }
                const slot = (index * GLOW_BINS + bin) * 3;
                this.colors[slot] = r / COLUMNS_PER_BIN;
                this.colors[slot + 1] = g / COLUMNS_PER_BIN;
                this.colors[slot + 2] = b / COLUMNS_PER_BIN;
            }
        });

        this.uniforms = {
            bins: { value: Array.from({ length: GLOW_BINS }, () => new THREE.Vector3()) },
            strength: { value: 0 },
        };
        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader: spectrumGlowFragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = SPECTRUM_GLOW_NAME;
        this.mesh.scale.set(FOOTPRINT_WIDTH, GLOW_HEIGHT, 1);
        this.mesh.position.z = farthestZ - GLOW_BEHIND;
        // After the backdrop (-10) and before the bars (0), so the bars are drawn over it.
        this.mesh.renderOrder = -5;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
    }

    // `glow` is the Glow slider, `pulse` the accent's current pulse (0..1), `mix` the crossfade.
    update(dtSeconds: number, glow: number, pulse: number, mix: number): void {
        const strength = glow * GLOW_STRENGTH_PER_GLOW * (1 + pulse * GLOW_PULSE_GAIN) * mix;
        this.uniforms.strength.value = strength;
        this.mesh.visible = strength > 0;

        // Follows the front sheet, so the Move sliders carry the glow with the bars. The plane's bottom edge is the
        // bars' base line.
        const front = this.sheets[0]?.mesh.position;
        if (front)
            this.mesh.position.set(front.x + FOOTPRINT_WIDTH / 2, front.y + GLOW_HEIGHT / 2, this.mesh.position.z);

        const attack = 1 - Math.exp(-dtSeconds / GLOW_ATTACK_SECONDS);
        const release = 1 - Math.exp(-dtSeconds / GLOW_RELEASE_SECONDS);
        const bins = this.uniforms.bins.value;
        for (let bin = 0; bin < GLOW_BINS; bin++) bins[bin].set(0, 0, 0);
        for (let index = 0; index < this.sheets.length; index++) {
            const heights = this.sheets[index].heightAttribute.array;
            for (let bin = 0; bin < GLOW_BINS; bin++) {
                let sum = 0;
                for (let column = bin * COLUMNS_PER_BIN; column < (bin + 1) * COLUMNS_PER_BIN; column++) {
                    sum += heights[column * FLAG_DEPTH + NEAREST_ROW];
                }
                const target = Math.min(1, Math.max(0, sum / COLUMNS_PER_BIN / GLOW_LEVEL_REFERENCE));
                const slot = index * GLOW_BINS + bin;
                const current = this.levels[slot];
                const level = current + (target - current) * (target > current ? attack : release);
                this.levels[slot] = level;
                const color = slot * 3;
                bins[bin].x += this.colors[color] * level;
                bins[bin].y += this.colors[color + 1] * level;
                bins[bin].z += this.colors[color + 2] * level;
            }
        }
    }

    dispose(): void {
        this.mesh.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}
