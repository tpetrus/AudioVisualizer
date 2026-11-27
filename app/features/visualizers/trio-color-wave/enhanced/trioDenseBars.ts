import * as THREE from 'three';
import { PencilFlagsMesh } from '~/features/visualizers/meshes/pencilFlagsMesh';
import { BAR_OPACITY, FLAG_DEPTH, FLAG_DISTANCE, FLAG_WIDTH } from '../trioColorWaveConfig';
import { DENSE_COLUMNS, DENSE_DISTANCE, DENSE_RADIUS, PULSE_BAR_GAIN, RIM_STRENGTH } from './trioEnhancedConfig';
import { trioHdrFragmentShader, trioHdrVertexShader } from './trioHdrShaders';

// The per-frame values the HDR bar shaders read, as plain uniform objects so they can be updated in place.
export interface DenseBarUniforms {
    mixOpacity: THREE.IUniform<number>;
    emissiveGain: THREE.IUniform<number>;
    rimStrength: THREE.IUniform<number>;
    pulse: THREE.IUniform<number>;
    pulseGain: THREE.IUniform<number>;
    haze: THREE.IUniform<number>;
    hazeColor: THREE.IUniform<THREE.Vector3>;
}

// A denser copy of one standard sheet: twice the columns over the same footprint (same rows), drawn with the HDR shaders. It owns
// its mesh; the standard sheet stays the source of truth for heights, colors and position.
export class TrioDenseBars {
    readonly flags: PencilFlagsMesh;
    readonly uniforms: DenseBarUniforms;

    private readonly source: PencilFlagsMesh;
    private readonly target: Float32Array;

    constructor(source: PencilFlagsMesh, hazeColor: THREE.Vector3) {
        this.source = source;
        this.uniforms = {
            mixOpacity: { value: 0 },
            emissiveGain: { value: 1 },
            rimStrength: { value: RIM_STRENGTH },
            pulse: { value: 0 },
            pulseGain: { value: PULSE_BAR_GAIN },
            haze: { value: 0 },
            hazeColor: { value: hazeColor },
        };
        this.flags = new PencilFlagsMesh(
            FLAG_DEPTH,
            DENSE_COLUMNS,
            DENSE_DISTANCE,
            interpolateColors(source.geometry.getAttribute('instanceColor').array),
            DENSE_RADIUS,
            BAR_OPACITY,
            {
                vertexShader: trioHdrVertexShader,
                fragmentShader: trioHdrFragmentShader,
                uniforms: { ...this.uniforms },
                // Only the columns are denser: the rows keep the standard spacing, so the sheet is as deep as the
                // standard one and the crossfade lines up row for row.
                rowDistance: FLAG_DISTANCE,
            },
        );
        // The same tip length per row as the standard sheet.
        const tips = source.geometry.getAttribute('instanceTip').array;
        for (let row = 0; row < FLAG_DEPTH; row++) {
            this.flags.setTipLength(row, tips[row]);
        }
        this.target = this.flags.heightAttribute.array as Float32Array;
    }

    // Follows the standard sheet: its position, and its heights spread over the dense columns (a dense bar between two
    // standard bars takes the average of the two, one on top of a standard bar takes its height). Allocates nothing.
    update(): void {
        this.flags.mesh.position.copy(this.source.mesh.position);
        const heights = this.source.heightAttribute.array;
        const target = this.target;
        for (let column = 0; column < DENSE_COLUMNS; column++) {
            const from = (column >> 1) * FLAG_DEPTH;
            const between = (column & 1) === 1;
            for (let row = 0; row < FLAG_DEPTH; row++) {
                target[column * FLAG_DEPTH + row] = between
                    ? (heights[from + row] + heights[from + FLAG_DEPTH + row]) * 0.5
                    : heights[from + row];
            }
        }
        this.flags.heightAttribute.needsUpdate = true;
    }

    dispose(): void {
        this.flags.dispose();
    }
}

// The standard colors (flag = column * FLAG_DEPTH + row, three floats each) spread over the dense columns the same way
// as the heights.
function interpolateColors(source: ArrayLike<number>): THREE.Color[] {
    const colors = new Array<THREE.Color>(DENSE_COLUMNS * FLAG_DEPTH);
    for (let column = 0; column < DENSE_COLUMNS; column++) {
        const low = column >> 1;
        const high = Math.min(low + 1, FLAG_WIDTH - 1);
        const between = (column & 1) === 1;
        for (let row = 0; row < FLAG_DEPTH; row++) {
            const a = (low * FLAG_DEPTH + row) * 3;
            const b = (high * FLAG_DEPTH + row) * 3;
            const color = new THREE.Color();
            colors[column * FLAG_DEPTH + row] = between
                ? color.setRGB(
                      (source[a] + source[b]) / 2,
                      (source[a + 1] + source[b + 1]) / 2,
                      (source[a + 2] + source[b + 2]) / 2,
                  )
                : color.setRGB(source[a], source[a + 1], source[a + 2]);
        }
    }
    return colors;
}
