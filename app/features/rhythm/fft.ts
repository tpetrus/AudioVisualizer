// In-place radix-2 FFT with tables built once, so a transform allocates nothing. Pure: no Web Audio, no DOM.
export class Fft {
    readonly size: number;
    private readonly cosTable: Float64Array;
    private readonly sinTable: Float64Array;
    private readonly reversed: Uint32Array;

    // `size` must be a power of two.
    constructor(size: number) {
        if (size < 2 || (size & (size - 1)) !== 0) {
            throw new Error(`FFT size must be a power of two, got ${size}`);
        }
        this.size = size;
        const half = size / 2;
        this.cosTable = new Float64Array(half);
        this.sinTable = new Float64Array(half);
        for (let k = 0; k < half; k++) {
            const angle = (-2 * Math.PI * k) / size;
            this.cosTable[k] = Math.cos(angle);
            this.sinTable[k] = Math.sin(angle);
        }
        const bits = Math.round(Math.log2(size));
        this.reversed = new Uint32Array(size);
        for (let i = 0; i < size; i++) {
            let value = i;
            let result = 0;
            for (let b = 0; b < bits; b++) {
                result = (result << 1) | (value & 1);
                value >>= 1;
            }
            this.reversed[i] = result;
        }
    }

    // Forward transform of the complex signal (re, im), in place. Both arrays must have `size` entries.
    forward(re: Float32Array, im: Float32Array): void {
        const n = this.size;
        for (let i = 0; i < n; i++) {
            const j = this.reversed[i];
            if (j > i) {
                const tr = re[i];
                re[i] = re[j];
                re[j] = tr;
                const ti = im[i];
                im[i] = im[j];
                im[j] = ti;
            }
        }
        for (let length = 2; length <= n; length <<= 1) {
            const half = length >> 1;
            const step = n / length;
            for (let start = 0; start < n; start += length) {
                for (let k = 0; k < half; k++) {
                    const wr = this.cosTable[k * step];
                    const wi = this.sinTable[k * step];
                    const a = start + k;
                    const b = a + half;
                    const tr = re[b] * wr - im[b] * wi;
                    const ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
        }
    }
}

// Periodic Hann window: its samples sum to size / 2, which the onset extractor uses to scale magnitudes.
export function createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
    }
    return window;
}
