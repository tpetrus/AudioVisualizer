import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { bassInkSceneConfig } from './bassInkSceneConfig';

export interface LightCeilingConfig {
    // Light at or below this passes unchanged.
    knee: number;
    // Light above the knee bends smoothly toward this ceiling and never reaches it.
    max: number;
}

// The points are drawn additively into a half-float target, so wherever many of them stack (a ring seen along its
// length, the galaxy disc near edge-on, a kick flash on a dense formation) the light sums to several times white. The
// output pass clips that to white anyway, but the bloom sees the full sum and spreads it into a blinding haze, and the
// trails hold it. This curve caps what reaches them: unchanged up to the knee, then an exponential approach to the
// ceiling whose slope at the knee is 1, so there is no visible edge where it starts. It is a fixed function of the
// pixel and never follows the music, so it cannot add a flash; it only makes flashes on dense areas smaller.
export function softCeiling(light: number, config: Readonly<LightCeilingConfig>): number {
    const { knee, max } = config;
    if (!(light > knee)) return light;
    const range = max - knee;
    return knee + range * (1 - Math.exp(-(light - knee) / range));
}

// The same curve on the brightest channel of each pixel, applied to all three channels alike, so a capped pixel keeps
// its hue instead of washing out toward white channel by channel. Must match softCeiling.
const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uKnee;
uniform float uMax;
varying vec2 vUv;

void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float peak = max(texel.r, max(texel.g, texel.b));
    if (peak > uKnee) {
        float range = uMax - uKnee;
        float capped = uKnee + range * (1.0 - exp(-(peak - uKnee) / range));
        texel.rgb *= capped / peak;
    }
    gl_FragColor = texel;
}
`;

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A full-screen pass running the curve. The caller owns it and frees it with dispose().
export function createLightCeilingPass(
    config: Readonly<LightCeilingConfig> = bassInkSceneConfig.post.lightCeiling,
): ShaderPass {
    return new ShaderPass({
        uniforms: {
            tDiffuse: { value: null },
            uKnee: { value: config.knee },
            uMax: { value: config.max },
        },
        vertexShader,
        fragmentShader,
    });
}
