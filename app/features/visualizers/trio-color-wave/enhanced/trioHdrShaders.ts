// The enhanced look's bar shaders. They keep every attribute and uniform name of the standard pencil shaders
// (`meshes/shaders/vertex.ts` and `fragment.ts`, which stay untouched) and add what the look needs. They write linear
// color above 1; the composer's OutputPass applies tone mapping and the sRGB conversion once, so none happens here.

// Same as the standard vertex shader, plus `vPart` (0 at the base, 1 where the tip starts, 2 at the apex) for the rim.
export const trioHdrVertexShader = /*glsl*/ `
precision highp float;
precision highp int;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 lightDirection;
uniform float apothem;
uniform float ambient;
uniform float baseShade;
uniform float tipTint;

attribute vec3 position;
attribute float part;
attribute vec2 faceNormal;
attribute float isTip;

attribute vec3 instanceOffset;
attribute float instanceHeight;
attribute float instanceTip;
attribute vec3 instanceColor;

varying vec3 vColor;
varying float vPart;

void main() {
    float tipHeight = min(instanceTip, instanceHeight);
    float ringY = max(instanceHeight - instanceTip, 0.0);
    float y = part < 0.5 ? 0.0 : (part < 1.5 ? ringY : instanceHeight);

    vec3 normal = isTip > 0.5
        ? normalize(vec3(faceNormal.x * max(tipHeight, 0.001), apothem, faceNormal.y * max(tipHeight, 0.001)))
        : vec3(faceNormal.x, 0.0, faceNormal.y);
    float light = ambient + (1.0 - ambient) * max(dot(normal, normalize(lightDirection)), 0.0);

    vec3 color = part < 0.5 ? instanceColor * baseShade
        : (part < 1.5 ? instanceColor : mix(instanceColor, vec3(1.0), tipTint));
    vColor = color * light;
    vPart = part;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x + instanceOffset.x, y + instanceOffset.y, position.z + instanceOffset.z, 1.0);
}`;

// The standard fragment writes `vColor` straight to an sRGB canvas, so its numbers are display values. Here the same
// numbers are converted to linear first, which keeps the palette close to the standard look.
//   emissiveGain  > 1 brightens the whole bar (from the Glow slider), so the bloom has something to catch,
//   rimStrength   brightens the last stretch of the bar toward its tip,
//   pulse         the beat accent, 0..1,
//   haze          0..1, how far the color fades toward hazeColor (more for sheets further back),
//   mixOpacity    0..1, the crossfade with the standard look.
export const trioHdrFragmentShader = /*glsl*/ `
precision highp float;

uniform float opacity;
uniform float mixOpacity;
uniform float emissiveGain;
uniform float rimStrength;
uniform float pulse;
uniform float pulseGain;
uniform float haze;
uniform vec3 hazeColor;

varying vec3 vColor;
varying float vPart;

vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void main() {
    vec3 base = srgbToLinear(vColor);
    float rim = smoothstep(0.6, 2.0, vPart) * rimStrength;
    vec3 lit = base * emissiveGain * (1.0 + rim + pulse * pulseGain * (0.5 + rim));
    gl_FragColor = vec4(mix(lit, hazeColor, haze), opacity * mixOpacity);
}`;
