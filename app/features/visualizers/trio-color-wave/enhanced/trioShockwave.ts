import * as THREE from 'three';
import {
    SHOCKWAVE_BEHIND,
    SHOCKWAVE_CENTER_Y,
    SHOCKWAVE_DOWNBEAT_GAIN,
    SHOCKWAVE_DOWNBEAT_SCALE,
    SHOCKWAVE_ECHO_DELAY_SECONDS,
    SHOCKWAVE_ECHO_GAIN,
    SHOCKWAVE_INNER_COLOR,
    SHOCKWAVE_LIFETIME_SECONDS,
    SHOCKWAVE_MAX_RADIUS,
    SHOCKWAVE_MID_COLOR,
    SHOCKWAVE_OUTER_COLOR,
    SHOCKWAVE_PEAK_STRENGTH,
    SHOCKWAVE_POOL_SIZE,
} from './trioEnhancedConfig';

// Name of every ring mesh, so the look's specs (and a debugger) can find them in the scene.
export const SHOCKWAVE_RING_NAME = 'trioBurstRing';

// The square is a little larger than the ring's final radius, so the wobble and the wake fit inside it.
const QUAD_MARGIN = 1.1;
// Step of the per-burst seed: the golden ratio's fraction, so consecutive bursts never share a wobble.
const SEED_STEP = 0.618034;

const vertexShader = /*glsl*/ `
varying vec2 vPosition;

void main() {
    vPosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The ring is drawn procedurally on a square (-1..1) so its shape can have character a mesh ring cannot:
//   - three bands in the trio's colors, highs on the outside and bass inside, like a prism split of one wave,
//   - a sharp leading edge with a long soft wake behind it,
//   - an edge that wobbles with a few slow lobes (different for every burst, from `seed`),
//   - fine breaks around it, like sparks thrown off, and a brief core flash when it starts.
// It writes linear HDR color; OutputPass does the tone mapping and the sRGB conversion once.
export const shockwaveFragmentShader = /*glsl*/ `
uniform float progress;
uniform float strength;
uniform float seed;
uniform vec3 outerColor;
uniform vec3 midColor;
uniform vec3 innerColor;

varying vec2 vPosition;

// One band at signed distance d from its edge (positive outside): sharp outside, a long wake inside.
float band(float d, float width) {
    return d > 0.0 ? exp(-d * d / (width * width * 0.25)) : exp(d / (width * 2.5));
}

void main() {
    float r = length(vPosition);
    float angle = atan(vPosition.y, vPosition.x);
    float eased = 1.0 - pow(1.0 - progress, 3.0);
    // Integer multiples of the angle only, so the edge has no seam where atan wraps.
    float lobes = sin(angle * 3.0 + seed * 6.2832) + 0.6 * sin(angle * 5.0 - seed * 12.9)
        + 0.35 * sin(angle * 11.0 + seed * 31.7);
    float front = eased * 0.9 * (1.0 + 0.035 * lobes * (0.4 + progress));
    float width = 0.012 + 0.05 * progress;
    float d = r - front;

    vec3 color = outerColor * band(d, width)
        + midColor * band(d + width * 0.9, width)
        + innerColor * band(d + width * 1.8, width * 1.4);
    float sparks = 0.55 + 0.45 * smoothstep(0.2, 0.9,
        sin(angle * 28.0 + seed * 47.0 + progress * 5.0) * sin(angle * 9.0 - seed * 13.0));
    color *= sparks;
    color += midColor * 0.35 * exp(-r * r / 0.02) * pow(1.0 - progress, 6.0);

    // Fades out over its life, and to nothing before the edge of the square, so the square never shows.
    float fade = pow(1.0 - progress, 1.6) * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(color * strength * fade, 1.0);
}`;

export interface RingUniforms {
    [name: string]: THREE.IUniform;
    progress: THREE.IUniform<number>;
    strength: THREE.IUniform<number>;
    seed: THREE.IUniform<number>;
    outerColor: THREE.IUniform<THREE.Vector3>;
    midColor: THREE.IUniform<THREE.Vector3>;
    innerColor: THREE.IUniform<THREE.Vector3>;
}

// A small pool of burst rings behind the sheets. They share one square geometry (scaled to their radius) and are
// allocated once; firing only reuses the oldest ring.
export class TrioShockwave {
    readonly rings: THREE.Mesh[] = [];
    readonly uniforms: RingUniforms[] = [];

    private readonly geometry = new THREE.PlaneGeometry(2, 2);
    private readonly materials: THREE.ShaderMaterial[] = [];
    // Seconds since each ring was fired (negative while an echo waits, Infinity while idle), the strength it was fired
    // with and its final radius.
    private readonly ages = new Float32Array(SHOCKWAVE_POOL_SIZE).fill(Infinity);
    private readonly peaks = new Float32Array(SHOCKWAVE_POOL_SIZE);
    private readonly radii = new Float32Array(SHOCKWAVE_POOL_SIZE);
    private next = 0;
    private seed = 0;

    // `farthestZ` is the z of the farthest sheet; the rings sit SHOCKWAVE_BEHIND further back.
    constructor(farthestZ: number) {
        for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
            const uniforms: RingUniforms = {
                progress: { value: 0 },
                strength: { value: 0 },
                seed: { value: 0 },
                outerColor: { value: new THREE.Vector3(...SHOCKWAVE_OUTER_COLOR) },
                midColor: { value: new THREE.Vector3(...SHOCKWAVE_MID_COLOR) },
                innerColor: { value: new THREE.Vector3(...SHOCKWAVE_INNER_COLOR) },
            };
            const material = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader: shockwaveFragmentShader,
                uniforms,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: false,
            });
            const ring = new THREE.Mesh(this.geometry, material);
            ring.name = SHOCKWAVE_RING_NAME;
            ring.position.set(0, SHOCKWAVE_CENTER_Y, farthestZ - SHOCKWAVE_BEHIND);
            // After the backdrop (-10) and before the bars (0), so the bars are drawn over it.
            ring.renderOrder = -5;
            ring.frustumCulled = false;
            ring.visible = false;
            this.materials.push(material);
            this.uniforms.push(uniforms);
            this.rings.push(ring);
        }
    }

    // Starts a burst, replacing the oldest ring when all are busy. `intensity` (0..1) scales how bright it gets; a
    // downbeat burst is bigger and brighter and is followed by a fainter echo ring.
    fire(intensity: number, downbeat: boolean): void {
        const radius = SHOCKWAVE_MAX_RADIUS * (downbeat ? SHOCKWAVE_DOWNBEAT_SCALE : 1);
        const strength = SHOCKWAVE_PEAK_STRENGTH * intensity;
        this.start(0, strength * (downbeat ? SHOCKWAVE_DOWNBEAT_GAIN : 1), radius);
        if (downbeat) this.start(-SHOCKWAVE_ECHO_DELAY_SECONDS, strength * SHOCKWAVE_ECHO_GAIN, radius);
    }

    // Advances every live ring. `mix` is the crossfade; under reduced motion nothing is drawn and live rings are dropped.
    update(dtSeconds: number, mix: number, reducedMotion: boolean): void {
        for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
            const ring = this.rings[i];
            if (reducedMotion) this.ages[i] = Infinity;
            this.ages[i] += dtSeconds;
            const progress = this.ages[i] / SHOCKWAVE_LIFETIME_SECONDS;
            if (!(progress < 1)) {
                ring.visible = false;
                this.ages[i] = Infinity;
                continue;
            }
            // An echo whose delay has not run out yet.
            if (progress < 0) {
                ring.visible = false;
                continue;
            }
            ring.scale.setScalar(this.radii[i] * QUAD_MARGIN);
            this.uniforms[i].progress.value = progress;
            this.uniforms[i].strength.value = this.peaks[i] * mix;
            ring.visible = true;
        }
    }

    dispose(): void {
        for (const ring of this.rings) ring.removeFromParent();
        this.geometry.dispose();
        for (const material of this.materials) material.dispose();
    }

    private start(age: number, strength: number, radius: number): void {
        const i = this.next;
        this.ages[i] = age;
        this.peaks[i] = strength;
        this.radii[i] = radius;
        this.seed = (this.seed + SEED_STEP) % 1;
        this.uniforms[i].seed.value = this.seed;
        this.next = (i + 1) % SHOCKWAVE_POOL_SIZE;
    }
}
