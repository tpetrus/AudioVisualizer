// Shaders of the Bass Ink point cloud. Used with a ShaderMaterial, so three.js declares `position`, the matrices and the
// precision for us. All motion happens here: the CPU only uploads the two unit formations and a handful of uniforms.
//
// `position` is formation side A and `restB` is side B; `uActive` says which one the cloud is leaving, and `uBlend` is
// the 0..1 progress of the fade to the other one (smoothed below, and the same way in InkCloud's CPU helper).
//
// The GLSL strings carry no comments: they ship verbatim in the bundle, so the why-comments sit above each piece here.

// Number of kick shockwaves summed per point. Must equal KICK_SLOTS in bassInkTypes.ts.
export const INK_KICK_SLOTS = 8;

// The depth fade, the same maths as the vertex shader: 1 at `near` and closer, down to 1 - fade at `far` and beyond,
// linear in between. The shader feeds it the depth relative to the cloud center's view depth (near below 0, far above
// 0), so zooming the camera in or out never changes a point's fade. Size and alpha both use it, so far/near is at most
// 1 - fade for each. Exported so a spec can check the bound; the GLSL below must match it.
export function depthFade(depth: number, near: number, far: number, fade: number): number {
    if (far <= near) {
        return 1;
    }
    const k = Math.min(1, Math.max(0, (depth - near) / (far - near)));
    return 1 - fade * k;
}

// The fragment tint, the same maths as FRAGMENT_TINT below, over arrays of 3 (linear RGB). Writes into `out` and
// allocates nothing, so a spec can check that the luminance is kept and the tints move the right way; the GLSL must match.
//
// Two guards sit around the luminance rescale. The red guard fades the kick tint out as the palette core turns
// mostly red (smoothstep over a red share of 0.7 to 0.8), because a saturated red ring flashing on every kick would be a
// red flash (WCAG 2.3.1); the glint tint is not affected. The channel cap then handles a rescale that pushes a channel
// above 1: hardware clips it, and the clipped color has less luminance than the gradient color. Luminance is linear, so
// mixing the gradient color with the rescaled one keeps the gradient color's luminance at every mix; the cap takes the
// largest mix amount that keeps every channel at or below 1.
export function bandColor(
    base: ArrayLike<number>,
    core: ArrayLike<number>,
    edge: ArrayLike<number>,
    bass: number,
    high: number,
    highWhite: number,
    out: number[] | Float32Array,
): void {
    const lumaBase = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
    const redShare = core[0] / Math.max(core[0] + core[1] + core[2], 1e-4);
    const kickT = Math.min(1, Math.max(0, (redShare - 0.7) / (0.8 - 0.7)));
    const kickBass = bass * (1 - kickT * kickT * (3 - 2 * kickT));
    for (let k = 0; k < 3; k++) {
        const toward = edge[k] + (1 - edge[k]) * highWhite;
        const withBass = base[k] + (core[k] - base[k]) * kickBass;
        out[k] = withBass + (toward - withBass) * high;
    }
    const lumaTinted = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
    if (lumaBase > 1e-4 && lumaTinted > 1e-4) {
        const ratio = lumaBase / lumaTinted;
        out[0] *= ratio;
        out[1] *= ratio;
        out[2] *= ratio;
    }
    let s = 1;
    for (let k = 0; k < 3; k++) {
        if (out[k] > 1) {
            s = Math.min(s, (1 - base[k]) / (out[k] - base[k]));
        }
    }
    if (s < 1) {
        s = Math.max(0, s);
        for (let k = 0; k < 3; k++) {
            out[k] = base[k] + (out[k] - base[k]) * s;
        }
    }
}

// The galaxy disc's inward flow, the same maths as flowDisc in VERTEX_REST below. Every disc point slides inward along
// its own spiral arm and comes back in at the rim. The flow runs in squared radius (u = r * r), the space where the
// disc's points are spread evenly (formations.ts draws r as the square root of a uniform number), so shifting every u by
// the same phase and wrapping it keeps the disc's density as it was. The angle follows the arm (`twist` radians of
// winding per unit of radius), so the arms keep their shape while their points stream through them. A steady flow in u
// is dr/dt = -v / (2r), so a point turns at twist * v / (2r) radians a second: the center turns faster than the rim, as
// a real galaxy's does, yet the arms never wind tighter however long it runs. `phase` is the accumulated flow in units
// of u; only its fractional part matters, so the scene keeps it in 0..1. A point on the axis (no angle) is left alone.
// Writes into `out` and allocates nothing; the GLSL must match.
export function flowDiscPoint(
    rest: ArrayLike<number>,
    phase: number,
    twist: number,
    out: Float32Array | number[],
): void {
    const x = rest[0];
    const z = rest[2];
    const radius = Math.hypot(x, z);
    if (radius < 1e-6) {
        out[0] = x;
        out[1] = rest[1];
        out[2] = z;
        return;
    }
    const shifted = radius * radius - phase;
    const radius2 = Math.sqrt(shifted - Math.floor(shifted));
    const angle = Math.atan2(z, x) + twist * (radius2 - radius);
    out[0] = radius2 * Math.cos(angle);
    out[1] = rest[1];
    out[2] = radius2 * Math.sin(angle);
}

// Declarations. The spectrum is the recent frequency history: x is frequency (log-spaced), y is time as a ring whose
// newest row is at uSpectrumHead. The uniforms after it are constants from bassInkSceneConfig, set once.
const VERTEX_HEADER = /*glsl*/ `
attribute vec3 restB;
attribute float aRand;

uniform float uTime;
uniform float uBlend;
uniform float uActive;
uniform float uRadius;
uniform float uTension;
uniform float uBreath;
uniform float uPunch;
uniform float uSwell;
uniform float uMid;
uniform float uHigh;
uniform float uTurbulence;
uniform float uMaxPointSize;
uniform float uPointScale;
uniform float uKickTimes[${INK_KICK_SLOTS}];
uniform float uKickStrengths[${INK_KICK_SLOTS}];
uniform sampler2D uSpectrum;
uniform float uSpectrumHead;
uniform float uSpectrumSpan;
uniform float uSpectrumAmp;

uniform float uSqueeze;
uniform float uBreathAmp;
uniform float uPunchAmp;
uniform float uSwellAmp;
uniform float uWaveSpeed;
uniform float uWaveWidth;
uniform float uWaveDecay;
uniform float uWaveAmp;
uniform float uWaveMax;
uniform float uNoiseScale;
uniform float uNoiseBase;
uniform float uNoiseMid;
uniform float uNoiseSpeed;
uniform float uJitter;
uniform float uSparkleFraction;
uniform float uSparkleAmp;
uniform float uBaseSize;
uniform float uTensionSize;
uniform float uDepthNear;
uniform float uDepthFar;
uniform float uDepthFade;
uniform float uBassTint;
uniform float uSwellTint;
uniform float uHighTint;
uniform float uFlowA;
uniform float uFlowB;
uniform float uFlowPhase;
uniform float uDiscTwist;

varying float vRadial;
varying float vDepth;
varying float vBass;
varying float vHigh;
`;

// Rest position: a smooth fade between the two formation sides. A side that holds the galaxy disc (uFlowA, uFlowB set
// to 1) first flows inward along its arms (flowDiscPoint above). The build then squeezes the cloud, the breathing phase
// swells it, every beat punches it outward, and every bass pulse swells it (displacement only: the swell never touches
// size, alpha or color).
const VERTEX_REST = /*glsl*/ `
vec3 flowDisc(vec3 r, float on) {
    float radius = length(r.xz);
    if (on < 0.5 || radius < 0.000001) {
        return r;
    }
    float radius2 = sqrt(fract(radius * radius - uFlowPhase));
    float angle = atan(r.z, r.x) + uDiscTwist * (radius2 - radius);
    return vec3(radius2 * cos(angle), r.y, radius2 * sin(angle));
}

void main() {
    float s = uBlend * uBlend * (3.0 - 2.0 * uBlend);
    vec3 sideA = flowDisc(position, uFlowA);
    vec3 sideB = flowDisc(restB, uFlowB);
    vec3 from = uActive < 0.5 ? sideA : sideB;
    vec3 to = uActive < 0.5 ? sideB : sideA;
    vec3 rest = mix(from, to, s);
    vRadial = clamp(length(rest), 0.0, 1.0);

    float breath = (1.0 + uBreathAmp * sin(6.2831853 * uBreath)) * (1.0 + uPunchAmp * uPunch) * (1.0 + uSwellAmp * uSwell);
    float scale = uRadius * (1.0 - uTension * uSqueeze) * breath;
    vec3 p = rest * scale;
`;

// Kick shockwaves: a spherical front per recent kick pushes points outward. Displacement only, so nothing here touches
// the color or the alpha.
const VERTEX_KICKS = /*glsl*/ `
    float dist = length(p);
    vec3 outward = dist > 0.0001 ? p / dist : vec3(0.0, 1.0, 0.0);
    float push = 0.0;
    for (int i = 0; i < ${INK_KICK_SLOTS}; i++) {
        float age = uTime - uKickTimes[i];
        if (age >= 0.0) {
            float x = (dist - age * uWaveSpeed) / uWaveWidth;
            push += uKickStrengths[i] * uWaveAmp * exp(-age / uWaveDecay) * exp(-x * x);
        }
    }
    vBass = clamp((uWaveMax > 0.0 ? push / uWaveMax : 0.0) * uBassTint + uSwell * uSwellTint, 0.0, 1.0);
    p += outward * min(push, uWaveMax);
`;

// Swirling turbulence from cheap analytic noise: sums of sines at different frequencies and phases per axis.
const VERTEX_TURBULENCE = /*glsl*/ `
    float t = uTime * uNoiseSpeed;
    vec3 q = p * uNoiseScale + vec3(aRand * 6.2831853);
    vec3 swirl = vec3(
        sin(q.y * 1.3 + q.z * 0.7 + t) + sin(q.z * 2.1 - t * 1.3),
        sin(q.z * 1.1 + q.x * 0.9 + t * 1.2) + sin(q.x * 2.3 + t),
        sin(q.x * 1.2 + q.y * 0.8 + t * 0.8) + sin(q.y * 1.9 - t * 1.1)
    );
    float shiver = fract(aRand * 53.7) - 0.5;
    float amount = uTurbulence * (uNoiseBase + uMid * uNoiseMid) + uTension * uJitter * shiver;
    p += swirl * amount * 0.5;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
`;

// The music's own frequencies as waves, worked out on screen so the cloud's tilt and turn never scramble them: the
// angle around the cloud's center picks a point's frequency (bass at the bottom, highs at the top, mirrored left and
// right), and the point moves outward in the screen plane by that frequency's level, so the outline becomes the
// spectrum. The distance from the center is time, as the rows of the trio sheets are: the rim reads now, so the
// outline stays crisp and on time, and points further in read older rows, so each frequency rolls inward through the
// cloud as a wave behind it. The displacement is scaled by the distance from the center, so the middle of the cloud
// never tears open.
const VERTEX_SPECTRUM = /*glsl*/ `
    vec3 center = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec2 across = mv.xy - center.xy;
    float spread = length(across);
    vec2 direction = spread > 0.0001 ? across / spread : vec2(0.0, 1.0);
    float frequency = acos(clamp(-direction.y, -1.0, 1.0)) / 3.14159265;
    float back = (1.0 - clamp(spread / uRadius, 0.0, 1.0)) * uSpectrumSpan;
    float level = texture2D(uSpectrum, vec2(frequency, uSpectrumHead - back)).r;
    mv.xy += direction * level * uSpectrumAmp * min(1.0, spread / uRadius);
    gl_Position = projectionMatrix * mv;
`;

// A small, fixed share of points glints with the highs. It changes their size only, never the brightness. Points
// farther from the camera than the cloud's center get smaller and fainter so near points separate from far ones (the
// same maths as depthFade above). The depth is measured from the center's view depth, so zooming the camera never
// changes the fade. It only removes light, so it cannot add flashing.
const VERTEX_SIZE = /*glsl*/ `
    float glint = step(1.0 - uSparkleFraction, fract(aRand * 91.7)) * uHigh * uSparkleAmp;
    vHigh = clamp((glint > 0.0 ? uHigh : 0.0) * uHighTint, 0.0, 1.0);
    float relativeDepth = -mv.z - (-center.z);
    float depthK = uDepthFar > uDepthNear ? clamp((relativeDepth - uDepthNear) / (uDepthFar - uDepthNear), 0.0, 1.0) : 0.0;
    vDepth = 1.0 - uDepthFade * depthK;
    float size = uBaseSize * uPointScale / max(-mv.z, 0.1) * (1.0 - uTension * uTensionSize) * (1.0 + glint) * vDepth;
    gl_PointSize = clamp(size, 1.0, uMaxPointSize);
}
`;

export const inkVertexShader = [
    VERTEX_HEADER,
    VERTEX_REST,
    VERTEX_KICKS,
    VERTEX_TURBULENCE,
    VERTEX_SPECTRUM,
    VERTEX_SIZE,
].join('');

// Declarations of the fragment stage.
const FRAGMENT_HEADER = /*glsl*/ `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uBrightness;
uniform float uAlpha;
uniform float uTension;
uniform float uAlphaNormalization;
uniform float uHighWhite;

varying float vRadial;
varying float vDepth;
varying float vBass;
varying float vHigh;
`;

// A soft round sprite: fully transparent at the rim, brightest in the middle.
const FRAGMENT_SPRITE = /*glsl*/ `
void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;

    vec3 color = mix(uCore, uEdge, vRadial);
`;

// Band colors: the kick-wave push and the bass swell pull a point's color toward the palette core, and the glint pulls
// it toward the palette edge mixed with white. The rescale then restores the gradient color's own luminance (linear
// Rec. 709 weights), so a tint moves the hue only and never adds light. A near-black color is left alone, since its
// luminance ratio would be noise. Before the bass mix, kickScale fades the kick tint out for a mostly red core (red
// share 0.7 to 0.8) so the ring cannot become a red flash (WCAG 2.3.1). After the rescale, a channel above 1 would be
// clipped by the hardware and lose luminance, so the color is mixed back toward the gradient color (luminance is
// linear, so every such mix keeps it) by the largest amount that keeps all channels at or below 1: per channel, room is
// (1 - base) / (tinted - base), and channels at or below 1 count as 1. bandColor above does the same maths for specs.
const FRAGMENT_TINT = /*glsl*/ `
    vec3 base = color;
    float lumaBase = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float kickScale = 1.0 - smoothstep(0.7, 0.8, uCore.r / max(uCore.r + uCore.g + uCore.b, 0.0001));
    color = mix(color, uCore, vBass * kickScale);
    color = mix(color, mix(uEdge, vec3(1.0), uHighWhite), vHigh);
    float lumaTinted = dot(color, vec3(0.2126, 0.7152, 0.0722));
    if (lumaBase > 0.0001 && lumaTinted > 0.0001) {
        color *= lumaBase / lumaTinted;
    }
    vec3 room = mix(vec3(1.0), (1.0 - base) / max(color - base, vec3(0.000001)), step(vec3(1.0), color));
    color = mix(base, color, clamp(min(room.x, min(room.y, room.z)), 0.0, 1.0));
`;

// The squeezed cloud overlaps itself more, so its alpha is normalized down. uBrightness (from BrightnessMix) is the only
// global brightness input; ripples never reach this shader stage.
const FRAGMENT_ALPHA = /*glsl*/ `
    float alpha = uAlpha * (1.0 - uTension * uAlphaNormalization) * (1.0 + uBrightness) * soft * soft * vDepth;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
}
`;

export const inkFragmentShader = [FRAGMENT_HEADER, FRAGMENT_SPRITE, FRAGMENT_TINT, FRAGMENT_ALPHA].join('');
