import { bassInkSceneConfig } from '../bass-ink/bassInkSceneConfig';

// Shaders of the Bass Ink spray: points thrown off the shell on bass hits. Used with a ShaderMaterial, so three.js
// declares `position` (here the point's origin), the matrices and the precision. All motion is here: the CPU only
// writes a point's origin, direction, birth time and strength once, when a burst is emitted.
//
// The GLSL strings carry no comments: they ship verbatim in the bundle, so the why-comments sit above each piece here.

// The distance a point has traveled `age` seconds after birth: it leaves at `speed` and drag slows it with time
// constant `drag`, so the distance approaches speed * drag and never passes it. That bound is what keeps the spray
// inside the fit's worst-case envelope. The vertex shader uses the same maths.
export function sprayOffset(
    age: number,
    speed: number = bassInkSceneConfig.spray.speed,
    drag: number = bassInkSceneConfig.spray.dragSeconds,
): number {
    return age <= 0 ? 0 : speed * drag * (1 - Math.exp(-age / drag));
}

// A point's alpha envelope (0..1, before strength, intensity and the peak alpha): 0 before birth and from `life` on,
// a linear rise over `attack` so a burst eases in instead of popping, then a linear fall to 0 at `life`. The vertex
// shader computes the same value and hands it to the fragment stage.
export function sprayAlpha(
    age: number,
    attack: number = bassInkSceneConfig.spray.attackSeconds,
    life: number = bassInkSceneConfig.spray.lifeSeconds,
): number {
    if (age < 0 || age >= life) {
        return 0;
    }
    return age < attack ? age / attack : (life - age) / (life - attack);
}

// Declarations. `position` is the origin, `aDir` the unit outward direction, `aBirth` the birth time (far in the past
// for unused slots) and `aStrength` the burst strength. The uniforms after them are constants from bassInkSceneConfig.
const VERTEX_HEADER = /*glsl*/ `
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

varying float vStrength;
`;

// Dead points (not born yet, or older than their life) are sent outside the clip volume, so they cost no fragments.
// Live ones move by the drag formula and take their strength times the attack/fall envelope.
const VERTEX_MAIN = /*glsl*/ `
void main() {
    float age = uTime - aBirth;
    if (age < 0.0 || age >= uLife) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vStrength = 0.0;
        return;
    }
    vec3 p = position + aDir * uSpeed * uDrag * (1.0 - exp(-age / uDrag));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uPointScale / max(-mv.z, 0.1), 1.0, uMaxPointSize);
    vStrength = aStrength * (age < uAttack ? age / uAttack : (uLife - age) / (uLife - uAttack));
}
`;

export const sprayVertexShader = [VERTEX_HEADER, VERTEX_MAIN].join('');

// The alpha scale already holds the peak alpha times the flash-intensity control, so intensity 0 draws nothing. It is
// the only brightness input here, and bursts are rate limited, so the spray never flashes the frame.
export const sprayFragmentShader = /*glsl*/ `
uniform vec3 uColor;
uniform float uAlphaScale;

varying float vStrength;

void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) {
        discard;
    }
    float soft = 1.0 - d2;
    gl_FragColor = vec4(uColor, uAlphaScale * vStrength * soft * soft);
    #include <colorspace_fragment>
}
`;
