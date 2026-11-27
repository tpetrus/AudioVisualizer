// Samples `spectrum` at `out.length` log-spaced frequencies from lowHz to highHz, so the low end of the band gets
// the most room. Interpolates between bins because narrow bands only cover a handful of them.
export function sampleLogSpectrum(
    spectrum: Uint8Array,
    binHz: number,
    lowHz: number,
    highHz: number,
    out: Float32Array,
): void {
    const columns = out.length;
    const lastBin = spectrum.length - 1;
    const ratio = highHz / lowHz;
    for (let column = 0; column < columns; column++) {
        const bin = (lowHz * Math.pow(ratio, column / (columns - 1))) / binHz;
        const lower = Math.min(Math.floor(bin), lastBin);
        const mix = bin - lower;
        out[column] = spectrum[lower] * (1 - mix) + spectrum[Math.min(lower + 1, lastBin)] * mix;
    }
}

// Normalized Gaussian weights (standard deviation `sigma`), centered on the middle entry.
export function createKernel(sigma: number): Float32Array {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float32Array(radius * 2 + 1);
    let total = 0;
    for (let i = -radius; i <= radius; i++) {
        kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
        total += kernel[i + radius];
    }
    return kernel.map((weight) => weight / total);
}

// Convolves `values` with `kernel` into `out`, repeating the edge values past the ends.
export function blur(values: Float32Array, kernel: Float32Array, out: Float32Array): void {
    const radius = (kernel.length - 1) / 2;
    const last = values.length - 1;
    for (let column = 0; column <= last; column++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
            sum += values[Math.min(last, Math.max(0, column + k))] * kernel[k + radius];
        }
        out[column] = sum;
    }
}

// Trio's peak-balance step: the band's slowly decaying peak, which jumps up to a louder frame at once.
export function stepPeak(frameMax: number, prevPeak: number, decay: number): number {
    return Math.max(frameMax, prevPeak * decay);
}

// The gain that maps the peak to `target`. `floor` keeps near-silence from being boosted.
export function balanceGain(peak: number, target: number, floor: number): number {
    return target / Math.max(peak, floor);
}

// Hz edges of the three bands: bass is bassLow..bassHigh, mids bassHigh..midsHigh, highs midsHigh..highsHigh.
export interface BandEdges {
    bassLow: number;
    bassHigh: number;
    midsHigh: number;
    highsHigh: number;
}

// Each band's mean level and their mean, all 0..1.
export interface BandLevels {
    bass: number;
    mids: number;
    highs: number;
    combined: number;
}

// Preallocated buffers for readBandLevels, so reading a frame allocates nothing.
export interface BandLevelState {
    columns: Float32Array;
    blurred: Float32Array;
    bassKernel: Float32Array;
    midsKernel: Float32Array;
    highsKernel: Float32Array;
}

// Trio's blur widths, in columns of its 256-column sheets. They are scaled to the column count in use so the
// smoothing covers the same share of each band.
const TRIO_COLUMNS = 256;
const BASS_BLUR = 7;
const MIDS_BLUR = 3;
const HIGHS_BLUR = 1.5;

export function createBandLevelState(columns: number): BandLevelState {
    const scale = columns / TRIO_COLUMNS;
    return {
        columns: new Float32Array(columns),
        blurred: new Float32Array(columns),
        bassKernel: createKernel(BASS_BLUR * scale),
        midsKernel: createKernel(MIDS_BLUR * scale),
        highsKernel: createKernel(HIGHS_BLUR * scale),
    };
}

// The blurred band's mean / 255, or 0 when the band has no usable range.
function readBand(
    spectrum: Uint8Array,
    binHz: number,
    lowHz: number,
    highHz: number,
    kernel: Float32Array,
    state: BandLevelState,
): number {
    const count = state.columns.length;
    if (count < 2 || !(lowHz > 0) || !(highHz > lowHz) || !Number.isFinite(highHz)) {
        return 0;
    }
    sampleLogSpectrum(spectrum, binHz, lowHz, highHz, state.columns);
    blur(state.columns, kernel, state.blurred);
    let total = 0;
    for (let i = 0; i < count; i++) {
        total += state.blurred[i];
    }
    return total / count / 255;
}

// Reads the three band levels from one byte spectrum into `out`. The band mean (not trio's peak-balanced maximum) is
// used so the level still says how loud the music is. Silence, an empty spectrum or bad input gives zeros.
export function readBandLevels(
    spectrum: Uint8Array,
    binHz: number,
    edges: BandEdges,
    state: BandLevelState,
    out: BandLevels,
): void {
    if (spectrum.length === 0 || !(binHz > 0) || !Number.isFinite(binHz)) {
        out.bass = 0;
        out.mids = 0;
        out.highs = 0;
        out.combined = 0;
        return;
    }
    out.bass = readBand(spectrum, binHz, edges.bassLow, edges.bassHigh, state.bassKernel, state);
    out.mids = readBand(spectrum, binHz, edges.bassHigh, edges.midsHigh, state.midsKernel, state);
    out.highs = readBand(spectrum, binHz, edges.midsHigh, edges.highsHigh, state.highsKernel, state);
    out.combined = (out.bass + out.mids + out.highs) / 3;
}
