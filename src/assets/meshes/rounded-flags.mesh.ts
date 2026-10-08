import { fragmentShader } from './lib/fragment-shaders';
import { vertexShader } from './lib/vertex-shaders';
import * as THREE from 'three';

// A grid of square flags like FlagsMesh, but every square is subdivided into a small grid of cells so the raised
// part can be shaped. Two opposite corners of each square ("tips") are raised by the audio; how pointed or rounded
// they are is set per row with setProfile(). The square's base always stays on the base line.
//
// Corners of a square seen from above (x across, z along the depth):
//   A = (-1, -1)   B = (-1, +1)   C = (+1, +1)   D = (+1, -1)
// The tips are B and D. B gets a white vertex so the tip stands out.
export class RoundedFlagsMesh {
    public readonly geometry = new THREE.BufferGeometry();
    public readonly material = new THREE.RawShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: { time: { value: 1.0 } },
        side: THREE.FrontSide,
        transparent: false
    });
    public readonly mesh: THREE.Mesh;
    public readonly positions: Float32Array;
    public readonly positionAttribute: THREE.BufferAttribute;
    public readonly verticesPerFlag: number;

    // How far from a tip (in square half-widths) the raised part reaches; beyond this the surface is on the base line.
    private readonly tipRadius = 1.7;
    private readonly baseY = 1;
    // Per row: how much of a flag's height each vertex gets (0 = base line, 1 = tip height).
    private readonly weights: Float32Array[] = [];
    // Local coordinates of each vertex within a square, each -1..1.
    private readonly localU: number[] = [];
    private readonly localV: number[] = [];

    constructor(
        private readonly numDepth: number,
        private readonly numWidth: number,
        blockSize: number,
        distance: number,
        flagColors: THREE.Color[],
        private readonly subdivisions: number = 6
    ) {
        const n = this.subdivisions;
        const side = n + 1;
        this.verticesPerFlag = side * side;
        const flagCount = numDepth * numWidth;

        for (let i = 0; i < side; i++) {
            for (let j = 0; j < side; j++) {
                this.localU.push(-1 + 2 * i / n);
                this.localV.push(-1 + 2 * j / n);
            }
        }

        this.positions = new Float32Array(flagCount * this.verticesPerFlag * 3);
        const colors = new Uint8Array(flagCount * this.verticesPerFlag * 4);
        const indices: number[] = [];

        // Flags are ordered column by column (flag = column * numDepth + row), like FlagsMesh.
        for (let column = 0; column < numWidth; column++) {
            for (let row = 0; row < numDepth; row++) {
                const flag = column * numDepth + row;
                const firstVertex = flag * this.verticesPerFlag;
                const color = flagColors[flag];

                for (let k = 0; k < this.verticesPerFlag; k++) {
                    const vertex = firstVertex + k;
                    this.positions[vertex * 3] = distance * column + blockSize * this.localU[k];
                    this.positions[vertex * 3 + 1] = this.baseY;
                    this.positions[vertex * 3 + 2] = distance * row + blockSize * this.localV[k];

                    // The B tip (u = -1, v = +1) is the white vertex.
                    const isWhiteTip = this.localU[k] === -1 && this.localV[k] === 1;
                    colors[vertex * 4] = isWhiteTip ? 255 : Math.round(color.r * 255);
                    colors[vertex * 4 + 1] = isWhiteTip ? 255 : Math.round(color.g * 255);
                    colors[vertex * 4 + 2] = isWhiteTip ? 255 : Math.round(color.b * 255);
                    colors[vertex * 4 + 3] = 255;
                }

                // Two triangles per cell, wound so the top faces up.
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < n; j++) {
                        const a = firstVertex + i * side + j;
                        const b = a + 1;
                        const c = firstVertex + (i + 1) * side + j + 1;
                        const d = c - 1;
                        indices.push(a, b, c, c, d, a);
                    }
                }
            }
        }

        this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
        const colorAttribute = new THREE.BufferAttribute(colors, 4, true);

        this.geometry.setAttribute('position', this.positionAttribute);
        this.geometry.setAttribute('color', colorAttribute);
        this.geometry.setIndex(new THREE.BufferAttribute(
            flagCount * this.verticesPerFlag > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1));

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        // The raised heights aren't part of the initial (flat) bounds, so don't let culling use them.
        this.mesh.frustumCulled = false;

        for (let row = 0; row < numDepth; row++) {
            this.setProfile(row, 1);
        }
    }

    // Shapes the tips of every square in a row. exponent = 1 gives a sharp cone (a point); larger values give a
    // blunter, more rounded top (2 is a dome) while the base stays on the base line.
    public setProfile(row: number, exponent: number): void {
        const weights = new Float32Array(this.verticesPerFlag);
        for (let k = 0; k < this.verticesPerFlag; k++) {
            const u = this.localU[k];
            const v = this.localV[k];
            const fromB = Math.hypot(u + 1, v - 1) / this.tipRadius;
            const fromD = Math.hypot(u - 1, v + 1) / this.tipRadius;
            weights[k] = Math.max(this.tipWeight(fromB, exponent), this.tipWeight(fromD, exponent));
        }
        this.weights[row] = weights;
    }

    // Sets how tall the square at (column, row) is: its tips reach `height`, the rest follows the row's profile.
    public setFlagHeight(column: number, row: number, height: number): void {
        const weights = this.weights[row];
        const firstVertex = (column * this.numDepth + row) * this.verticesPerFlag;
        for (let k = 0; k < this.verticesPerFlag; k++) {
            this.positions[(firstVertex + k) * 3 + 1] = this.baseY + height * weights[k];
        }
    }

    private tipWeight(distance: number, exponent: number): number {
        return distance >= 1 ? 0 : 1 - Math.pow(distance, exponent);
    }
}
