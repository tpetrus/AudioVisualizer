import * as THREE from 'three';

// A grid of pencil-shaped bars: a six-sided prism of constant width that rises straight up and ends in a pointed tip.
//
// Every bar is one instance of the same small pencil geometry. The only thing the CPU changes per frame is each
// bar's height (one number per bar); the vertex shader stretches the prism and places the tip from it:
//   - the bottom ring sits on the base line,
//   - the ring where the tip starts is (height - tipLength) up, or on the base line for bars shorter than the tip,
//   - the apex is at the full height.
// Light and shade are worked out in the shader, so the sides and the tip read as solid faces. Every bar keeps the hue
// of its own flag, from a deeper shade at the base to a lighter tint at the tip.
const vertexShader = /*glsl*/`
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

const fragmentShader = /*glsl*/`
precision highp float;

uniform float opacity;

varying vec3 vColor;

void main() {
    gl_FragColor = vec4(vColor, opacity);
}`;

export class PencilFlagsMesh {
    public readonly geometry = new THREE.InstancedBufferGeometry();
    public readonly material: THREE.RawShaderMaterial;
    public readonly mesh: THREE.Mesh;
    public readonly heightAttribute: THREE.InstancedBufferAttribute;

    private readonly heights: Float32Array;
    private readonly tips: THREE.InstancedBufferAttribute;
    private readonly sides = 6;

    // Flags are ordered column by column (flag = column * numDepth + row), like FlagsMesh.
    constructor(
        private readonly numDepth: number,
        numWidth: number,
        distance: number,
        flagColors: THREE.Color[],
        radius: number,
        opacity: number = 1
    ) {
        const flagCount = numDepth * numWidth;
        this.buildPencil(radius);

        const offsets = new Float32Array(flagCount * 3);
        const colors = new Float32Array(flagCount * 3);
        for (let column = 0; column < numWidth; column++) {
            for (let row = 0; row < numDepth; row++) {
                const flag = column * numDepth + row;
                offsets.set([distance * column, 1, distance * row], flag * 3);
                colors.set([flagColors[flag].r, flagColors[flag].g, flagColors[flag].b], flag * 3);
            }
        }

        this.heights = new Float32Array(flagCount);
        this.heightAttribute = new THREE.InstancedBufferAttribute(this.heights, 1);
        this.heightAttribute.setUsage(THREE.DynamicDrawUsage);
        this.tips = new THREE.InstancedBufferAttribute(new Float32Array(flagCount).fill(20), 1);

        this.geometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 3));
        this.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
        this.geometry.setAttribute('instanceHeight', this.heightAttribute);
        this.geometry.setAttribute('instanceTip', this.tips);
        this.geometry.instanceCount = flagCount;

        this.material = new THREE.RawShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                lightDirection: { value: new THREE.Vector3(0.35, 0.8, 0.5) },
                apothem: { value: radius * Math.cos(Math.PI / this.sides) },
                ambient: { value: 0.9 },
                baseShade: { value: 0.5 },
                tipTint: { value: 0.5 },
                opacity: { value: opacity }
            },
            side: THREE.DoubleSide,
            // See-through bars. They aren't written to the depth buffer, so a bar never hides the ones behind it; rows
            // are stored from the farthest to the nearest, so they blend in a sensible order.
            transparent: true,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        // The instances move every frame and aren't part of the shared geometry's bounds, so never cull.
        this.mesh.frustumCulled = false;
    }

    // Sets how long the sharpened tip is for every bar in a row (world units).
    public setTipLength(row: number, length: number): void {
        const array = this.tips.array as Float32Array;
        for (let flag = row; flag < array.length; flag += this.numDepth) {
            array[flag] = length;
        }
        this.tips.needsUpdate = true;
    }

    // Sets how tall the bar at (column, row) is, from the base line to the point of its tip.
    public setFlagHeight(column: number, row: number, height: number): void {
        this.heights[column * this.numDepth + row] = height;
    }

    // One pencil: six side walls (two triangles each) and six tip faces, unindexed so every face has its own normal.
    private buildPencil(radius: number): void {
        const positions: number[] = [];
        const parts: number[] = [];
        const normals: number[] = [];
        const tipFlags: number[] = [];

        const vertex = (x: number, z: number, part: number, normal: number[], tip: number) => {
            positions.push(x, 0, z);
            parts.push(part);
            normals.push(normal[0], normal[1]);
            tipFlags.push(tip);
        };

        for (let i = 0; i < this.sides; i++) {
            const a0 = i * 2 * Math.PI / this.sides;
            const a1 = (i + 1) * 2 * Math.PI / this.sides;
            const mid = (a0 + a1) / 2;
            const normal = [Math.cos(mid), Math.sin(mid)];
            const [x0, z0] = [Math.cos(a0) * radius, Math.sin(a0) * radius];
            const [x1, z1] = [Math.cos(a1) * radius, Math.sin(a1) * radius];

            // Side wall: bottom ring up to the ring where the tip starts.
            vertex(x0, z0, 0, normal, 0);
            vertex(x1, z1, 0, normal, 0);
            vertex(x1, z1, 1, normal, 0);
            vertex(x1, z1, 1, normal, 0);
            vertex(x0, z0, 1, normal, 0);
            vertex(x0, z0, 0, normal, 0);

            // Tip face: that ring up to the apex.
            vertex(x0, z0, 1, normal, 1);
            vertex(x1, z1, 1, normal, 1);
            vertex(0, 0, 2, normal, 1);
        }

        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.geometry.setAttribute('part', new THREE.Float32BufferAttribute(parts, 1));
        this.geometry.setAttribute('faceNormal', new THREE.Float32BufferAttribute(normals, 2));
        this.geometry.setAttribute('isTip', new THREE.Float32BufferAttribute(tipFlags, 1));
    }
}
