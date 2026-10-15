export const vertexShader = /*glsl*/`
precision highp float;
precision highp int;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 lightDirection;
uniform float apothem;
uniform float ambient;   // how much light the shaded sides still get (0 = black, 1 = unshaded)
uniform float baseShade; // brightness of the color at the bottom of a bar
uniform float tipTint;   // how far the color is lightened toward white at the point (a lighter shade of the same hue)

// Per vertex (the shared pencil shape)
attribute vec3 position;
attribute float part;      // 0 = bottom ring, 1 = ring where the tip starts, 2 = apex
attribute vec2 faceNormal; // horizontal outward direction of the face (x, z)
attribute float isTip;     // 0 = side wall, 1 = tip face

// Per bar
attribute vec3 instanceOffset;
attribute float instanceHeight;
attribute float instanceTip;
attribute vec3 instanceColor;

varying vec3 vColor;

void main() {
    float tipHeight = min(instanceTip, instanceHeight);
    float ringY = max(instanceHeight - instanceTip, 0.0);
    float y = part < 0.5 ? 0.0 : (part < 1.5 ? ringY : instanceHeight);

    // Tip faces lean toward the apex; side walls are vertical.
    vec3 normal = isTip > 0.5
        ? normalize(vec3(faceNormal.x * max(tipHeight, 0.001), apothem, faceNormal.y * max(tipHeight, 0.001)))
        : vec3(faceNormal.x, 0.0, faceNormal.y);
    float light = ambient + (1.0 - ambient) * max(dot(normal, normalize(lightDirection)), 0.0);

    // A gradient up each bar: a slightly deeper shade of its color at the base, its true color where the tip starts,
    // and a lighter tint of the same hue at the point. The faces blend between these as they climb.
    vec3 color = part < 0.5 ? instanceColor * baseShade
        : (part < 1.5 ? instanceColor : mix(instanceColor, vec3(1.0), tipTint));
    vColor = color * light;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x + instanceOffset.x, y + instanceOffset.y, position.z + instanceOffset.z, 1.0);
}`;