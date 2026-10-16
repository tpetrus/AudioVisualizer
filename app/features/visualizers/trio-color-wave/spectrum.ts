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
        const bin = lowHz * Math.pow(ratio, column / (columns - 1)) / binHz;
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
    return kernel.map(weight => weight / total);
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
