import * as THREE from 'three';
import { PencilFlagsMesh } from '~/features/visualizers/meshes/pencilFlagsMesh';
import {
    ANALYSER_MAX_DECIBELS,
    BACK_FALL_FACTOR,
    BACK_RISE_RATE,
    BAR_OPACITY,
    BASE_HEIGHT,
    type BandDefinition,
    FLAG_DEPTH,
    FLAG_DISTANCE,
    FLAG_WIDTH,
    FRONT_HEIGHT_SCALE,
    PEAK_DECAY,
    PEAK_FLOOR,
    PENCIL_RADIUS,
    ROW_FALLOFF,
    SHEET_SPACING,
    TARGET_LEVEL,
    TIP_LENGTH,
} from './trioColorWaveConfig';
import type { TrioColorWaveControlValues } from './trioColorWaveControls';
import { blur, createKernel, sampleLogSpectrum } from './spectrum';

// One band's sheet of pencil bars, along with the analyser it reads from.
export class TrioColorWaveSheet {
    public readonly flags: PencilFlagsMesh;

    private readonly definition: BandDefinition;
    // 0 = front sheet.
    private readonly index: number;
    private readonly sheetCount: number;
    private readonly kernel: Float32Array;
    private readonly targets = new Float32Array(FLAG_WIDTH);
    private readonly blurred = new Float32Array(FLAG_WIDTH);
    // Current (unscaled) height of every bar, row by row: heights[row * FLAG_WIDTH + column].
    private readonly heights = new Float32Array(FLAG_WIDTH * FLAG_DEPTH);
    // Slowly decaying peak of this band, used to balance loudness between bands.
    private peak = 0;

    private source?: AnalyserNode;
    private analyser?: AnalyserNode;
    private spectrum = new Uint8Array(0);

    constructor(definition: BandDefinition, index: number, sheetCount: number) {
        this.definition = definition;
        this.index = index;
        this.sheetCount = sheetCount;
        this.kernel = createKernel(definition.blurColumns);

        const colors = createSheetColors(definition.startHue, definition.endHue, FLAG_WIDTH, FLAG_DEPTH);
        this.flags = new PencilFlagsMesh(FLAG_DEPTH, FLAG_WIDTH, FLAG_DISTANCE, colors, PENCIL_RADIUS, BAR_OPACITY);
        for (let row = 0; row < FLAG_DEPTH; row++) {
            this.flags.setTipLength(row, TIP_LENGTH);
        }
    }

    // Taps its own analyser from `source`, with this band's window and noise floor.
    public connect(source: AnalyserNode): void {
        this.disconnect();
        const analyser = source.context.createAnalyser();
        analyser.fftSize = this.definition.fftSize;
        analyser.minDecibels = this.definition.minDecibels;
        analyser.maxDecibels = ANALYSER_MAX_DECIBELS;
        source.connect(analyser);

        this.source = source;
        this.analyser = analyser;
        this.spectrum = new Uint8Array(analyser.frequencyBinCount);
    }

    public disconnect(): void {
        if (!this.analyser) {
            return;
        }
        try {
            this.source?.disconnect(this.analyser);
        } catch {
            // Already disconnected: the source's audio context was closed when the capture stopped.
        }
        this.analyser.disconnect();
        this.analyser = undefined;
        this.source = undefined;
    }

    // Centers the sheet on the screen, stacks it behind the ones in front, and applies the "Move" sliders.
    public place(moveX: number, moveY: number): void {
        const x = (-(FLAG_WIDTH - 1) * FLAG_DISTANCE) / 2 + moveX;
        this.flags.mesh.position.set(x, BASE_HEIGHT + moveY, -this.index * SHEET_SPACING);
    }

    // The nearest row follows the spectrum directly; every other row chases the row in front of it, rising and
    // falling more slowly the further back it is.
    public update(values: TrioColorWaveControlValues): void {
        const analyser = this.analyser;
        if (!analyser) {
            return;
        }
        const { lowKey, highKey, heightKey, fallFactor, minSmoothing } = this.definition;

        analyser.smoothingTimeConstant = Math.max(values.smoothing, minSmoothing);
        analyser.getByteFrequencyData(this.spectrum);

        // Sample the spectrum for each column, blur across columns, then find the band's loudest value.
        const binHz = analyser.context.sampleRate / analyser.fftSize;
        sampleLogSpectrum(this.spectrum, binHz, values[lowKey], values[highKey], this.targets);
        blur(this.targets, this.kernel, this.blurred);
        let frameMax = 0;
        for (const value of this.blurred) {
            frameMax = Math.max(frameMax, value);
        }

        this.peak = Math.max(frameMax, this.peak * PEAK_DECAY);
        const gain = TARGET_LEVEL / Math.max(this.peak, PEAK_FLOOR);
        const growth = Math.pow(values.heightGrowth, this.index);
        const scale = gain * values[heightKey] * values.masterHeight * FRONT_HEIGHT_SCALE * growth;
        const lastRow = this.sheetCount * FLAG_DEPTH - 1;

        // Rows are laid out toward the camera, so the last row of a sheet is its nearest and the first row its farthest.
        // Go from the nearest row to the farthest so each row can chase the (already updated) row in front of it.
        for (let row = FLAG_DEPTH - 1; row >= 0; row--) {
            // 0 at the nearest row of the front sheet, 1 at the farthest row of the last sheet.
            const depth = (this.index * FLAG_DEPTH + (FLAG_DEPTH - 1 - row)) / lastRow;
            const riseRate = 1 - (1 - BACK_RISE_RATE) * depth;
            // The fall step is divided by the sheet's scale so it looks the same speed on screen whatever the height.
            const fallStep = ((values.fall * fallFactor) / growth) * (1 - (1 - BACK_FALL_FACTOR) * depth);

            for (let column = 0; column < FLAG_WIDTH; column++) {
                const slot = row * FLAG_WIDTH + column;
                const target = row === FLAG_DEPTH - 1 ? this.blurred[column] : this.heights[slot + FLAG_WIDTH];
                const current = this.heights[slot];
                const next =
                    target > current ? current + (target - current) * riseRate : Math.max(target, current - fallStep);
                this.heights[slot] = next;
                this.flags.setFlagHeight(column, row, next * scale * ROW_FALLOFF[row]);
            }
        }

        this.flags.heightAttribute.needsUpdate = true;
    }

    public dispose(): void {
        this.disconnect();
        this.flags.dispose();
    }
}

// Walks the flags in a snake along the length of the sheet (left to right on one row, right to left on the
// next, ...) and advances the hue a small step at every flag, from startHue at the first flag to endHue at the last.
export function createSheetColors(startHue: number, endHue: number, width: number, depth: number): THREE.Color[] {
    const totalFlags = width * depth;
    const colors = new Array<THREE.Color>(totalFlags);
    let step = 0;

    for (let row = 0; row < depth; row++) {
        for (let i = 0; i < width; i++) {
            const column = row % 2 === 0 ? i : width - 1 - i;
            const hue = startHue + ((endHue - startHue) * step) / (totalFlags - 1);
            colors[column * depth + row] = new THREE.Color().setHSL(hue, 0.85, 0.55);
            step++;
        }
    }

    return colors;
}
