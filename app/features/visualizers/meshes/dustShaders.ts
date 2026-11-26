// Shaders of the Bass Ink background dust. Used with a ShaderMaterial, so three.js declares `position`, the matrices and
// the precision for us. The GLSL strings carry no comments: they ship verbatim in the bundle, so the why-comments sit
// above each piece here.

// A point's twinkle factor, the same maths as the vertex shader: a sine around 1 with its own phase offset `rand`
// (0..1), so every point has its own constant mean of 1 and the mean over many points is 1 at any time. `phaseCycles`
// is the shared phase the CPU integrates, and `depth` is how far the factor swings (0.5 gives 0.5 to 1.5). Because the
// field's total light is constant, the twinkle can never read as a flash. Exported so a spec can check the mean; the
// GLSL below must match it.
export function dustTwinkle(rand: number, phaseCycles: number, depth: number): number {
    return 1 + depth * Math.sin(6.2831853 * (phaseCycles + rand));
}

// The phase is a uniform the CPU integrates, so a change of speed (the high band) bends the rate and never jumps the
// phase. Size attenuates with distance like the cloud's points and is clamped to the renderer's point size limit.
export const dustVertexShader = /*glsl*/ `
attribute float aRand;

uniform float uPhase;
uniform float uDepth;
uniform float uSize;
uniform float uPointScale;
uniform float uMaxPointSize;

varying float vTwinkle;

void main() {
    vTwinkle = 1.0 + uDepth * sin(6.2831853 * (uPhase + aRand));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uPointScale / max(-mv.z, 0.1), 1.0, uMaxPointSize);
}
`;

// A soft round sprite in the palette's edge color mixed toward white (done on the CPU, so it is one uniform). The
// twinkle scales only this point's alpha.
export const dustFragmentShader = /*glsl*/ `
uniform vec3 uColor;
uniform float uAlpha;

varying float vTwinkle;

void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;
    gl_FragColor = vec4(uColor, uAlpha * vTwinkle * soft * soft);
    #include <colorspace_fragment>
}
`;
