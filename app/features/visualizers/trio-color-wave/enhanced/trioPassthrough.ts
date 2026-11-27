import * as THREE from 'three';
import { vertexShader } from '~/features/visualizers/meshes/shaders/vertex';

// While the enhanced look is live, every frame goes through its composer, and OutputPass applies ACES tone mapping and
// the sRGB conversion to everything, standard bars included. The standard bar shader writes its color straight to an
// sRGB canvas, so through the composer those bars would turn pastel for the length of the crossfade, then pop back.
// This material draws the standard bars instead, with the same vertex shader and uniforms, and a fragment shader that
// undoes what OutputPass will do: sRGB to linear, then the inverse of three's ACES fit. The round trip puts back the
// color the plain render would have shown (the spec measures how closely, over the trio's whole palette).

// three r186's ACESFilmicToneMapping (tonemapping_pars_fragment), as columns, exactly as GLSL's mat3 takes them.
const ACES_INPUT_COLUMNS = [
    [0.59719, 0.076, 0.0284],
    [0.35458, 0.90834, 0.13383],
    [0.04823, 0.01566, 0.83777],
] as const;
const ACES_OUTPUT_COLUMNS = [
    [1.60475, -0.10208, -0.00327],
    [-0.53108, 1.10813, -0.07276],
    [-0.07367, -0.00605, 1.07602],
] as const;
// three scales the input by exposure / 0.6 before the fit.
const ACES_EXPOSURE_SCALE = 0.6;
// The fit approaches 1/0.983729 only for infinite input, so the inverse is taken of at most this.
const MAX_FIT_OUTPUT = 0.99;

type Vec3 = readonly [number, number, number];
type Columns = readonly (readonly [number, number, number])[];

function multiply(columns: Columns, v: Vec3): [number, number, number] {
    const [a, b, c] = columns;
    return [
        a[0] * v[0] + b[0] * v[1] + c[0] * v[2],
        a[1] * v[0] + b[1] * v[1] + c[1] * v[2],
        a[2] * v[0] + b[2] * v[1] + c[2] * v[2],
    ];
}

// The inverse of a 3x3 matrix given as columns, returned as columns.
function invert(columns: Columns): [Vec3, Vec3, Vec3] {
    const matrix = new THREE.Matrix3().set(
        columns[0][0],
        columns[1][0],
        columns[2][0],
        columns[0][1],
        columns[1][1],
        columns[2][1],
        columns[0][2],
        columns[1][2],
        columns[2][2],
    );
    // Matrix3.elements is column-major already.
    const e = matrix.invert().elements;
    return [
        [e[0], e[1], e[2]],
        [e[3], e[4], e[5]],
        [e[6], e[7], e[8]],
    ];
}

const ACES_INPUT_INVERSE = invert(ACES_INPUT_COLUMNS);
const ACES_OUTPUT_INVERSE = invert(ACES_OUTPUT_COLUMNS);

function fit(v: number): number {
    return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
}

// The positive root of fit(v) = y.
function inverseFit(y: number): number {
    const a = 1 - 0.983729 * y;
    const b = 0.0245786 - 0.432951 * y;
    const c = -0.000090537 - 0.238081 * y;
    return (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// three's ACESFilmicToneMapping, for the spec.
export function acesFilmic(color: Vec3, exposure = 1): [number, number, number] {
    const scaled: Vec3 = [
        (color[0] * exposure) / ACES_EXPOSURE_SCALE,
        (color[1] * exposure) / ACES_EXPOSURE_SCALE,
        (color[2] * exposure) / ACES_EXPOSURE_SCALE,
    ];
    const [r, g, b] = multiply(ACES_INPUT_COLUMNS, scaled);
    const out = multiply(ACES_OUTPUT_COLUMNS, [fit(r), fit(g), fit(b)]);
    return [clamp(out[0], 0, 1), clamp(out[1], 0, 1), clamp(out[2], 0, 1)];
}

// The color to hand acesFilmic so that it returns `color` (linear, 0..1). Mirrors the GLSL below.
export function inverseAcesFilmic(color: Vec3, exposure = 1): [number, number, number] {
    const y = multiply(ACES_OUTPUT_INVERSE, color);
    const v: Vec3 = [
        inverseFit(clamp(y[0], 0, MAX_FIT_OUTPUT)),
        inverseFit(clamp(y[1], 0, MAX_FIT_OUTPUT)),
        inverseFit(clamp(y[2], 0, MAX_FIT_OUTPUT)),
    ];
    const x = multiply(ACES_INPUT_INVERSE, v);
    const scale = ACES_EXPOSURE_SCALE / exposure;
    return [Math.max(x[0], 0) * scale, Math.max(x[1], 0) * scale, Math.max(x[2], 0) * scale];
}

const glslMat3 = (columns: Columns): string =>
    `mat3(${columns.map((column) => `vec3(${column.map((n) => n.toFixed(8)).join(', ')})`).join(', ')})`;

export const passthroughFragmentShader = /*glsl*/ `
precision highp float;

uniform float opacity;
uniform float exposure;
// 1 while the renderer tone maps with ACES (the trio always does), 0 for no tone mapping.
uniform float acesOn;

varying vec3 vColor;

vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 inverseFit(vec3 y) {
    vec3 a = 1.0 - 0.983729 * y;
    vec3 b = 0.0245786 - 0.432951 * y;
    vec3 c = -0.000090537 - 0.238081 * y;
    return (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
}

vec3 inverseAces(vec3 color) {
    vec3 y = clamp(${glslMat3(ACES_OUTPUT_INVERSE)} * color, 0.0, ${MAX_FIT_OUTPUT.toFixed(2)});
    vec3 x = ${glslMat3(ACES_INPUT_INVERSE)} * inverseFit(y);
    return max(x, 0.0) * ${ACES_EXPOSURE_SCALE.toFixed(1)} / exposure;
}

void main() {
    vec3 linear = srgbToLinear(clamp(vColor, 0.0, 1.0));
    gl_FragColor = vec4(acesOn > 0.5 ? inverseAces(linear) : linear, opacity);
}`;

// Swaps a standard sheet's material for the pass-through one and back. The pass-through shares the standard
// material's uniforms object, so the look's crossfade (which scales `opacity`) reaches it unchanged.
export class StandardPassthrough {
    private readonly material: THREE.RawShaderMaterial;
    private readonly original: THREE.Material | THREE.Material[];
    private readonly exposure: THREE.IUniform<number> = { value: 1 };
    private readonly acesOn: THREE.IUniform<number> = { value: 1 };
    private disposed = false;

    constructor(
        private readonly mesh: THREE.Mesh,
        standard: THREE.RawShaderMaterial,
    ) {
        this.original = mesh.material;
        this.material = new THREE.RawShaderMaterial({
            vertexShader,
            fragmentShader: passthroughFragmentShader,
            uniforms: { ...standard.uniforms, exposure: this.exposure, acesOn: this.acesOn },
            side: standard.side,
            transparent: standard.transparent,
            depthWrite: standard.depthWrite,
        });
        // Spreading copies the keys but keeps every uniform object shared, so writes to the standard ones show here.
        mesh.material = this.material;
    }

    // Called once per frame with the renderer's settings, which OutputPass reads too.
    update(toneMapping: THREE.ToneMapping, exposure: number): void {
        this.acesOn.value = toneMapping === THREE.ACESFilmicToneMapping ? 1 : 0;
        this.exposure.value = exposure > 0 ? exposure : 1;
    }

    // Puts the standard material back and frees the pass-through. Safe to call twice.
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.mesh.material = this.original;
        this.material.dispose();
    }
}
