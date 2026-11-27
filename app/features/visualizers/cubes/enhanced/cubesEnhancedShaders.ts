import { cubesEnhancedConfig } from './cubesEnhancedConfig';

// GLSL for the enhanced cubes look, kept as plain strings and pure helpers so it can be tested without a GPU. The cube
// material is three's own MeshPhysicalMaterial with chunks injected at the anchors below; the backdrop and the
// particles are small ShaderMaterials.

// A uniform is an object three reads `value` from each frame; the look creates these once and writes them in place.
export interface FxUniform<T> {
    value: T;
}

// What the injected cube chunks read. Grid-unit parameters come from the config once; the rest follow CubesFxUniforms.
export interface CubeFxUniforms {
    fxTime: FxUniform<number>;
    fxWaveAmplitude: FxUniform<number>;
    fxWavePhase: FxUniform<number>;
    fxShatter: FxUniform<number>;
    fxEmissive: FxUniform<number>;
    fxWaveHeight: FxUniform<number>;
    fxWaveFrequency: FxUniform<number>;
    fxShatterPush: FxUniform<number>;
    fxShatterLift: FxUniform<number>;
}

export function createCubeFxUniforms(): CubeFxUniforms {
    const { gridFx } = cubesEnhancedConfig;
    return {
        fxTime: { value: 0 },
        fxWaveAmplitude: { value: 0 },
        fxWavePhase: { value: 0 },
        fxShatter: { value: 0 },
        fxEmissive: { value: 0 },
        fxWaveHeight: { value: gridFx.waveHeight },
        fxWaveFrequency: { value: gridFx.waveFrequency },
        fxShatterPush: { value: gridFx.shatterPush },
        fxShatterLift: { value: gridFx.shatterLift },
    };
}

// Both variants share one patched program, so one cache key serves them.
export const CUBE_FX_PROGRAM_KEY = 'cubes-enhanced-fx-v1';

// The anchors the patch needs in three's meshphysical shaders. A three upgrade that renames one fails the shader spec.
export const CUBE_VERTEX_ANCHORS = ['#include <common>', '#include <project_vertex>'] as const;
export const CUBE_FRAGMENT_ANCHORS = ['#include <common>', '#include <emissivemap_fragment>'] as const;

const CUBE_VERTEX_PARS = /* glsl */ `
uniform float fxTime;
uniform float fxWaveAmplitude;
uniform float fxWavePhase;
uniform float fxShatter;
uniform float fxWaveHeight;
uniform float fxWaveFrequency;
uniform float fxShatterPush;
uniform float fxShatterLift;

float fxHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Where the cube's grid cell moves to, in the same units as the instance matrices (one cube is 1).
vec3 fxOffset(vec3 cell) {
    float radius = length(cell.xy);
    // A ring that runs outward from the center once per beat, plus a slow shimmer across the grid.
    float ring = sin(radius * fxWaveFrequency - fxWavePhase);
    float shimmer = sin(cell.x * 0.21 + cell.y * 0.17 + fxTime * 0.9);
    vec3 offset = vec3(0.0, 0.0, fxWaveAmplitude * fxWaveHeight * (ring + 0.25 * shimmer));
    // A bass drop pushes the cubes away from the center and scatters them in depth, then they fall back.
    float h = fxHash(cell.xy);
    vec2 away = cell.xy / max(radius, 0.001);
    offset.xy += away * fxShatter * fxShatterPush * (0.4 + h);
    offset.z += (h - 0.5) * fxShatter * fxShatterLift;
    return offset;
}
`;

// Runs after three has projected the vertex. The offset is a translation of the whole instance, so normals stay valid;
// view position is recomputed because lighting reads it.
const CUBE_VERTEX_APPLY = /* glsl */ `
#ifdef USE_INSTANCING
    vec3 fxCell = instanceMatrix[3].xyz;
    mvPosition.xyz += (modelViewMatrix * vec4(fxOffset(fxCell), 0.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
#endif
`;

const CUBE_FRAGMENT_PARS = /* glsl */ `
uniform float fxEmissive;
`;

// The instance color doubles as the glow, so raised cubes (bright) glow and resting ones (dim) barely do.
const CUBE_FRAGMENT_APPLY = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    totalEmissiveRadiance += vColor.rgb * fxEmissive;
#endif
`;

// The part of three's onBeforeCompile argument the patch touches.
export interface PatchableShader {
    uniforms: Record<string, unknown>;
    vertexShader: string;
    fragmentShader: string;
}

// Injects the grid effects into a MeshPhysicalMaterial's shader. `replace` with a function so `$` in the GLSL is safe.
export function patchCubeShader(shader: PatchableShader, uniforms: CubeFxUniforms): void {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', (anchor) => `${anchor}\n${CUBE_VERTEX_PARS}`)
        .replace('#include <project_vertex>', (anchor) => `${anchor}\n${CUBE_VERTEX_APPLY}`);
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', (anchor) => `${anchor}\n${CUBE_FRAGMENT_PARS}`)
        .replace('#include <emissivemap_fragment>', (anchor) => `${anchor}\n${CUBE_FRAGMENT_APPLY}`);
}

// Backdrop: a large plane behind the grid. A dark radial gradient tinted from the resting color, a faint sheen, and a
// flash that follows the bass (a replacement for the basic look's background flash).
export const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BACKDROP_FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform float uBase;
uniform float uVignette;
uniform float uSheen;
uniform float uFlash;
varying vec2 vUv;
void main() {
    vec2 centered = vUv - 0.5;
    // 1 in the middle, falling off toward the corners; the plane is far larger than the view so only its middle shows.
    float glow = 1.0 - smoothstep(0.0, 0.5, length(centered) * 4.0);
    float falloff = mix(uVignette, 1.0, glow);
    float sheen = uSheen * pow(max(0.0, 1.0 - abs(centered.y * 40.0)), 3.0);
    vec3 color = uTint * (uBase * falloff + uFlash * falloff) + vec3(sheen) * uTint;
    gl_FragColor = vec4(color, 1.0);
}
`;

// Particles: positions come from the seed, the time and the emit level, so there is no per-frame buffer upload. The
// `position` attribute holds three seeds in 0..1 and `aRand` two more.
export const PARTICLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uEmit;
uniform float uBass;
uniform float uPointScale;
uniform vec3 uSpread;
uniform vec2 uDepth;
uniform float uRise;
uniform float uSway;
uniform float uEmitSize;
attribute vec2 aRand;
varying float vFade;
void main() {
    vec3 seed = position;
    float speed = 0.4 + aRand.x;
    // Rising and wrapping over the view's height.
    float lift = fract(seed.y + uTime * uRise * speed / uSpread.y);
    vec3 p;
    p.x = (seed.x - 0.5) * uSpread.x + sin(uTime * 0.5 + seed.z * 6.2831) * uSway;
    p.y = (lift - 0.5) * uSpread.y;
    p.z = mix(uDepth.x, uDepth.y, seed.z) + cos(uTime * 0.37 + seed.x * 6.2831) * uSway;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (0.5 + aRand.y) * (1.0 + uEmit * uEmitSize + uBass * 0.5);
    gl_PointSize = size * uPointScale * 32.0 / max(1.0, -mv.z);
    // Fade in and out at the ends of the rise so they never pop.
    vFade = smoothstep(0.0, 0.1, lift) * (1.0 - smoothstep(0.85, 1.0, lift));
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBrightness;
uniform float uAlpha;
uniform float uEmit;
varying float vFade;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float soft = 1.0 - smoothstep(0.0, 1.0, d);
    vec3 color = mix(uColorA, uColorB, 0.5 + 0.5 * uEmit) * uBrightness;
    gl_FragColor = vec4(color, soft * soft * uAlpha * vFade * (0.35 + 0.65 * uEmit));
}
`;

// A small seeded generator (mulberry32), so the seed buffer is the same on every run.
export function createSeedGenerator(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
