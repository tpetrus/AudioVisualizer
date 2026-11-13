// Shaders of the Bass Ink point cloud. Used with a ShaderMaterial, so three.js declares `position`, the matrices and the
// precision for us. All motion happens here: the CPU only uploads the two unit formations and a handful of uniforms.
//
// `position` is formation side A and `restB` is side B; `uActive` says which one the cloud is leaving, and `uBlend` is
// the 0..1 progress of the fade to the other one (smoothed below, and the same way in InkCloud's CPU helper).

// Number of kick shockwaves summed per point. Must equal KICK_SLOTS in bassInkTypes.ts.
export const INK_KICK_SLOTS = 8;

export const inkVertexShader = /*glsl*/ `
attribute vec3 restB;
attribute float aRand;

uniform float uTime;
uniform float uBlend;
uniform float uActive;
uniform float uRadius;
uniform float uTension;
uniform float uBreath;
uniform float uMid;
uniform float uHigh;
uniform float uTurbulence;
uniform float uMaxPointSize;
uniform float uPointScale;
uniform float uKickTimes[${INK_KICK_SLOTS}];
uniform float uKickStrengths[${INK_KICK_SLOTS}];

// Constants from bassInkSceneConfig, set once.
uniform float uSqueeze;
uniform float uBreathAmp;
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

varying float vRadial;

void main() {
    // Rest position: a smooth fade between the two formation sides.
    float s = uBlend * uBlend * (3.0 - 2.0 * uBlend);
    vec3 from = uActive < 0.5 ? position : restB;
    vec3 to = uActive < 0.5 ? restB : position;
    vec3 rest = mix(from, to, s);
    vRadial = clamp(length(rest), 0.0, 1.0);

    // The build squeezes the cloud, and the breathing phase swells it.
    float breath = 1.0 + uBreathAmp * sin(6.2831853 * uBreath);
    float scale = uRadius * (1.0 - uTension * uSqueeze) * breath;
    vec3 p = rest * scale;

    // Kick shockwaves: a spherical front per recent kick pushes points outward. Displacement only, so nothing here
    // touches the color or the alpha.
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
    p += outward * min(push, uWaveMax);

    // Swirling turbulence from cheap analytic noise: sums of sines at different frequencies and phases per axis.
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
    gl_Position = projectionMatrix * mv;

    // A small, fixed share of points glints with the highs. It changes their size only, never the brightness.
    float glint = step(1.0 - uSparkleFraction, fract(aRand * 91.7)) * uHigh * uSparkleAmp;
    float size = uBaseSize * uPointScale / max(-mv.z, 0.1) * (1.0 - uTension * uTensionSize) * (1.0 + glint);
    gl_PointSize = clamp(size, 1.0, uMaxPointSize);
}
`;

export const inkFragmentShader = /*glsl*/ `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uBrightness;
uniform float uAlpha;
uniform float uTension;
uniform float uAlphaNormalization;

varying float vRadial;

void main() {
    // A soft round sprite: fully transparent at the rim, brightest in the middle.
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;

    vec3 color = mix(uCore, uEdge, vRadial);
    // The squeezed cloud overlaps itself more, so its alpha is normalized down. uBrightness (from BrightnessMix) is the
    // only global brightness input; ripples never reach this shader stage.
    float alpha = uAlpha * (1.0 - uTension * uAlphaNormalization) * (1.0 + uBrightness) * soft * soft;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
}
`;
