// Enhanced variants of the bass-ink shaders. They live only in the lazy chunk and are swapped onto the materials by
// bassInkEnhanced.ts; the standard strings in meshes/ stay byte-identical. Each variant keeps every uniform and varying
// of its standard shader and the same motion, color and timing maths, and adds `uEnh*` uniforms that are constants from
// bassInkEnhancedConfig.ts. Nothing here reads the time or the music for brightness: `uBrightness` stays the only global
// brightness input, and the added shape and depth terms are static per point, so they cannot add a flash.
//
// The GLSL strings carry no comments: they ship verbatim in the bundle, so the why-comments sit above each piece here.

const KICK_SLOTS = 8;

// Declarations of the ink vertex stage: the standard ones plus the depth and sprite constants.
const INK_VERTEX_HEADER = /*glsl*/ `
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
uniform float uKickTimes[${KICK_SLOTS}];
uniform float uKickStrengths[${KICK_SLOTS}];
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

uniform float uEnhFadeBoost;
uniform float uEnhFadeMax;
uniform float uEnhNearSize;
uniform float uEnhFarSize;
uniform float uEnhNearGain;
uniform float uEnhSpriteScale;

varying float vRadial;
varying float vDepth;
varying float vBass;
varying float vHigh;
`;

// The same rest position as the standard shader: the disc flow, the fade between the two formation sides, the build
// squeeze, the breathing, the beat punch and the bass swell.
const INK_VERTEX_REST = /*glsl*/ `
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

// The same kick shockwaves: displacement and the band tint, nothing else.
const INK_VERTEX_KICKS = /*glsl*/ `
    float dist = length(p);
    vec3 outward = dist > 0.0001 ? p / dist : vec3(0.0, 1.0, 0.0);
    float push = 0.0;
    for (int i = 0; i < ${KICK_SLOTS}; i++) {
        float age = uTime - uKickTimes[i];
        if (age >= 0.0) {
            float x = (dist - age * uWaveSpeed) / uWaveWidth;
            push += uKickStrengths[i] * uWaveAmp * exp(-age / uWaveDecay) * exp(-x * x);
        }
    }
    vBass = clamp((uWaveMax > 0.0 ? push / uWaveMax : 0.0) * uBassTint + uSwell * uSwellTint, 0.0, 1.0);
    p += outward * min(push, uWaveMax);
`;

// The same turbulence.
const INK_VERTEX_TURBULENCE = /*glsl*/ `
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

// The same spectrum outline.
const INK_VERTEX_SPECTRUM = /*glsl*/ `
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

// A stronger depth cue than the standard one, measured the same way (from the cloud center's view depth, so zooming never
// changes it). depthK is 0 at the near end and 1 at the far end. The fade grows by uEnhFadeBoost (up to uEnhFadeMax),
// near points get bigger and far points smaller, and the nearest points gain a little alpha. All of it depends only on a
// point's depth, never on the time or the music. The sprite is a little larger so its halo has room to fall off.
const INK_VERTEX_SIZE = /*glsl*/ `
    float glint = step(1.0 - uSparkleFraction, fract(aRand * 91.7)) * uHigh * uSparkleAmp;
    vHigh = clamp((glint > 0.0 ? uHigh : 0.0) * uHighTint, 0.0, 1.0);
    float relativeDepth = -mv.z - (-center.z);
    float depthK = uDepthFar > uDepthNear ? clamp((relativeDepth - uDepthNear) / (uDepthFar - uDepthNear), 0.0, 1.0) : 0.0;
    float nearK = 1.0 - depthK;
    float fade = min(uDepthFade * uEnhFadeBoost, uEnhFadeMax);
    vDepth = (1.0 - fade * depthK) * (1.0 + uEnhNearGain * nearK * nearK);
    float depthSize = mix(uEnhFarSize, uEnhNearSize, nearK);
    float size = uBaseSize * uPointScale / max(-mv.z, 0.1) * (1.0 - uTension * uTensionSize) * (1.0 + glint) * depthSize * uEnhSpriteScale;
    gl_PointSize = clamp(size, 1.0, uMaxPointSize);
}
`;

export const enhancedInkVertexShader = [
    INK_VERTEX_HEADER,
    INK_VERTEX_REST,
    INK_VERTEX_KICKS,
    INK_VERTEX_TURBULENCE,
    INK_VERTEX_SPECTRUM,
    INK_VERTEX_SIZE,
].join('');

const INK_FRAGMENT_HEADER = /*glsl*/ `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uBrightness;
uniform float uAlpha;
uniform float uTension;
uniform float uAlphaNormalization;
uniform float uHighWhite;

uniform float uEnhBody;
uniform float uEnhHalo;
uniform float uEnhCoreGain;
uniform float uEnhCoreWhite;

varying float vRadial;
varying float vDepth;
varying float vBass;
varying float vHigh;
`;

// A glowing sprite: the standard soft body, a wide linear halo that reaches the rim and a tight hot core, as one profile.
// The weights are set so the light per point stays near the standard sprite's.
const INK_FRAGMENT_SPRITE = /*glsl*/ `
void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;
    float soft2 = soft * soft;
    float hot = soft2 * soft2;
    float profile = uEnhBody * soft2 + uEnhHalo * soft + uEnhCoreGain * hot;

    vec3 color = mix(uCore, uEdge, vRadial);
`;

// The same luminance-preserving tint as the standard shader (the red guard, the luminance rescale and the channel cap).
const INK_FRAGMENT_TINT = /*glsl*/ `
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
    color = mix(color, vec3(1.0), uEnhCoreWhite * hot);
`;

// uBrightness is still the only global brightness input; the profile and vDepth are static shapes of the point.
const INK_FRAGMENT_ALPHA = /*glsl*/ `
    float alpha = uAlpha * (1.0 - uTension * uAlphaNormalization) * (1.0 + uBrightness) * profile * vDepth;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
}
`;

export const enhancedInkFragmentShader = [
    INK_FRAGMENT_HEADER,
    INK_FRAGMENT_SPRITE,
    INK_FRAGMENT_TINT,
    INK_FRAGMENT_ALPHA,
].join('');

// The dust: size and alpha follow the distance from the camera (near points larger and brighter, far ones smaller and
// fainter) through a varying, and the sprite gets the glowing profile. The twinkle is unchanged, so the field's total light
// stays constant over time.
export const enhancedDustVertexShader = /*glsl*/ `
attribute float aRand;

uniform float uPhase;
uniform float uDepth;
uniform float uSize;
uniform float uPointScale;
uniform float uMaxPointSize;

uniform float uEnhNear;
uniform float uEnhFar;
uniform float uEnhNearSize;
uniform float uEnhFarSize;
uniform float uEnhNearAlpha;
uniform float uEnhFarAlpha;
uniform float uEnhSpriteScale;

varying float vTwinkle;
varying float vEnhDepth;

void main() {
    vTwinkle = 1.0 + uDepth * sin(6.2831853 * (uPhase + aRand));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float nearK = 1.0 - clamp((-mv.z - uEnhNear) / max(uEnhFar - uEnhNear, 0.0001), 0.0, 1.0);
    vEnhDepth = mix(uEnhFarAlpha, uEnhNearAlpha, nearK);
    float depthSize = mix(uEnhFarSize, uEnhNearSize, nearK);
    gl_PointSize = clamp(uSize * uPointScale / max(-mv.z, 0.1) * depthSize * uEnhSpriteScale, 1.0, uMaxPointSize);
}
`;

export const enhancedDustFragmentShader = /*glsl*/ `
uniform vec3 uColor;
uniform float uAlpha;

uniform float uEnhBody;
uniform float uEnhHalo;
uniform float uEnhCoreGain;

varying float vTwinkle;
varying float vEnhDepth;

void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;
    float soft2 = soft * soft;
    float profile = uEnhBody * soft2 + uEnhHalo * soft + uEnhCoreGain * soft2 * soft2;
    gl_FragColor = vec4(uColor, uAlpha * vTwinkle * profile * vEnhDepth);
    #include <colorspace_fragment>
}
`;

// The spray: the same motion and envelope as the standard shader, plus the distance cue and the glowing profile. Dead
// points still leave the clip volume and cost no fragments.
export const enhancedSprayVertexShader = /*glsl*/ `
attribute vec3 aDir;
attribute float aBirth;
attribute float aStrength;

uniform float uTime;
uniform float uSpeed;
uniform float uDrag;
uniform float uLife;
uniform float uAttack;
uniform float uSize;
uniform float uMaxPointSize;
uniform float uPointScale;

uniform float uEnhNear;
uniform float uEnhFar;
uniform float uEnhNearSize;
uniform float uEnhFarSize;
uniform float uEnhNearAlpha;
uniform float uEnhFarAlpha;
uniform float uEnhSpriteScale;

varying float vStrength;
varying float vEnhDepth;

void main() {
    float age = uTime - aBirth;
    if (age < 0.0 || age >= uLife) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vStrength = 0.0;
        vEnhDepth = 0.0;
        return;
    }
    vec3 p = position + aDir * uSpeed * uDrag * (1.0 - exp(-age / uDrag));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float nearK = 1.0 - clamp((-mv.z - uEnhNear) / max(uEnhFar - uEnhNear, 0.0001), 0.0, 1.0);
    vEnhDepth = mix(uEnhFarAlpha, uEnhNearAlpha, nearK);
    float depthSize = mix(uEnhFarSize, uEnhNearSize, nearK);
    gl_PointSize = clamp(uSize * uPointScale / max(-mv.z, 0.1) * depthSize * uEnhSpriteScale, 1.0, uMaxPointSize);
    vStrength = aStrength * (age < uAttack ? age / uAttack : (uLife - age) / (uLife - uAttack));
}
`;

// uAlphaScale is still the only brightness input, so intensity 0 still draws nothing.
export const enhancedSprayFragmentShader = /*glsl*/ `
uniform vec3 uColor;
uniform float uAlphaScale;

uniform float uEnhBody;
uniform float uEnhHalo;
uniform float uEnhCoreGain;

varying float vStrength;
varying float vEnhDepth;

void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;
    float soft2 = soft * soft;
    float profile = uEnhBody * soft2 + uEnhHalo * soft + uEnhCoreGain * soft2 * soft2;
    gl_FragColor = vec4(uColor, uAlphaScale * vStrength * profile * vEnhDepth);
    #include <colorspace_fragment>
}
`;

// The grade and vignette pass, one full-screen pass between the second bloom and the output pass, so it works in linear
// light before tone mapping. Saturation, contrast around a linear mid gray and a filmic shoulder (which only compresses)
// are followed by a guard that scales the pixel down when its brightest channel ended above its value going in, so the grade
// never raises peak luminance beyond what the bloom already gives. The vignette only darkens. All values are constants.
export const gradeVertexShader = /*glsl*/ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const gradeFragmentShader = /*glsl*/ `
uniform sampler2D tDiffuse;
uniform float uEnhPivot;
uniform float uEnhContrast;
uniform float uEnhSaturation;
uniform float uEnhKnee;
uniform float uEnhRange;
uniform float uEnhVignetteStrength;
uniform float uEnhVignetteRadius;
uniform float uEnhVignetteSoftness;

varying vec2 vUv;

void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 c = max(texel.rgb, vec3(0.0));
    float peakIn = max(c.r, max(c.g, c.b));
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(luma), c, uEnhSaturation), vec3(0.0));
    c = uEnhPivot * pow(max(c / uEnhPivot, vec3(0.00001)), vec3(uEnhContrast));
    vec3 over = max(c - vec3(uEnhKnee), vec3(0.0));
    c = min(c, vec3(uEnhKnee)) + over / (1.0 + over / uEnhRange);
    float peakOut = max(c.r, max(c.g, c.b));
    c *= min(1.0, peakIn / max(peakOut, 0.00001));
    float r = length((vUv - 0.5) * 2.0) * 0.70710678;
    c *= 1.0 - uEnhVignetteStrength * smoothstep(uEnhVignetteRadius, uEnhVignetteRadius + uEnhVignetteSoftness, r);
    gl_FragColor = vec4(c, texel.a);
}
`;
