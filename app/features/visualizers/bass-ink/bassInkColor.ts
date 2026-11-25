import type * as THREE from 'three';
import type { PalettePair } from './bassInkTypes';

// Full-scale hue speed in cycles per second at colorSpeed 1. A full pass through the three colors then takes 5 s, far
// below the 3 Hz flash threshold, so hue cycling can never flash.
export const MAX_HUE_CYCLES_PER_SECOND = 0.2;

// How far ahead of the core the edge samples the gradient, so the two differ even for one set of colors.
const EDGE_PHASE_OFFSET = 1 / 3;

// Phase in [0, 1), advanced by speed * MAX_HUE_CYCLES_PER_SECOND * dt. Speed 0 leaves it unchanged, and a non-finite
// input never poisons the phase.
export function advanceHuePhase(phase: number, speed: number, dt: number): number {
    const current = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
    if (!Number.isFinite(speed) || !Number.isFinite(dt) || speed <= 0 || dt <= 0) return current;
    const next = current + speed * MAX_HUE_CYCLES_PER_SECOND * dt;
    return next - Math.floor(next);
}

// Writes one linear RGB sample of the closed gradient A -> B -> C -> A into `out` (a phase of 0 is A, 1/3 is B, 2/3 is C).
function sampleGradient(
    colors: readonly [THREE.Color, THREE.Color, THREE.Color],
    phase: number,
    out: Float32Array,
): void {
    const wrapped = phase - Math.floor(phase);
    const scaled = wrapped * 3;
    const index = Math.min(2, Math.floor(scaled));
    const t = scaled - index;
    const from = colors[index];
    const to = colors[(index + 1) % 3];
    out[0] = from.r + (to.r - from.r) * t;
    out[1] = from.g + (to.g - from.g) * t;
    out[2] = from.b + (to.b - from.b) * t;
}

// Writes core and edge (linear RGB) in place from three linear colors that rotate around the gradient with the phase.
export function writeCustomPalette(
    colors: readonly [THREE.Color, THREE.Color, THREE.Color],
    phase: number,
    out: PalettePair,
): void {
    const safe = Number.isFinite(phase) ? phase : 0;
    sampleGradient(colors, safe, out.core);
    sampleGradient(colors, safe + EDGE_PHASE_OFFSET, out.edge);
}
