import * as THREE from 'three';
import {
    BACKDROP_BOTTOM_COLOR,
    BACKDROP_GAP,
    BACKDROP_HEIGHT,
    BACKDROP_MAX_OPACITY,
    BACKDROP_TOP_COLOR,
    BACKDROP_WIDTH,
} from './trioEnhancedConfig';

const vertexShader = /*glsl*/ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Linear RGB out, like the bars: the composer's OutputPass does the display conversion.
const fragmentShader = /*glsl*/ `
uniform vec3 bottomColor;
uniform vec3 topColor;
uniform float opacity;
varying vec2 vUv;
void main() {
    gl_FragColor = vec4(mix(bottomColor, topColor, vUv.y), opacity);
}`;

// The color the far sheets fade toward: the middle of the backdrop's gradient (linear RGB). Written into `target`.
export function backdropHazeColor(target: THREE.Vector3): THREE.Vector3 {
    return target.set(
        (BACKDROP_BOTTOM_COLOR[0] + BACKDROP_TOP_COLOR[0]) / 2,
        (BACKDROP_BOTTOM_COLOR[1] + BACKDROP_TOP_COLOR[1]) / 2,
        (BACKDROP_BOTTOM_COLOR[2] + BACKDROP_TOP_COLOR[2]) / 2,
    );
}

// A vertical gradient on a plane behind the farthest sheet. Drawn first and never written to the depth buffer, so it
// can only ever sit behind everything else.
export class TrioBackdrop {
    readonly mesh: THREE.Mesh;

    private readonly geometry = new THREE.PlaneGeometry(BACKDROP_WIDTH, BACKDROP_HEIGHT);
    private readonly material: THREE.ShaderMaterial;
    private readonly opacityUniform: THREE.IUniform<number> = { value: 0 };

    // `z` is the world z of the plane (behind the farthest sheet).
    constructor(z: number) {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                bottomColor: { value: new THREE.Vector3(...BACKDROP_BOTTOM_COLOR) },
                topColor: { value: new THREE.Vector3(...BACKDROP_TOP_COLOR) },
                opacity: this.opacityUniform,
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            depthTest: false,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.set(0, 0, z - BACKDROP_GAP);
        this.mesh.renderOrder = -10;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
    }

    // `depth` is the Depth haze slider (0..1), `mix` the crossfade. Both 0 hides the plane entirely.
    update(depth: number, mix: number): void {
        const opacity = depth * mix * BACKDROP_MAX_OPACITY;
        this.opacityUniform.value = opacity;
        this.mesh.visible = opacity > 0;
    }

    dispose(): void {
        this.mesh.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }
}
