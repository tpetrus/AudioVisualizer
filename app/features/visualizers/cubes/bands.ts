export const MIN_FREQUENCY = 40;
export const MAX_FREQUENCY = 14000;

// FFT bin range [start, end) covered by one band.
export type BinRange = readonly [start: number, end: number];

export interface BandResponse {
    sensitivity: number;
    gate: number; // 0..1: levels below this are treated as silence
    smoothing: number; // 0..1: how slowly levels fall
}

// Log-spaced frequency bands, so each column covers a similar musical range.
export function createBandBins(bandCount: number, sampleRate: number, fftSize: number): BinRange[] {
    const binWidth = sampleRate / fftSize;
    const ratio = MAX_FREQUENCY / MIN_FREQUENCY;
    return Array.from({ length: bandCount }, (_, band) => {
        const start = Math.floor((MIN_FREQUENCY * Math.pow(ratio, band / bandCount)) / binWidth);
        const end = Math.floor((MIN_FREQUENCY * Math.pow(ratio, (band + 1) / bandCount)) / binWidth);
        return [start, Math.max(end, start + 1)] as const;
    });
}

// Smoothed 0..1 level for each band: rises quickly, falls slowly. Updates `levels` in place.
export function updateBandLevels(
    levels: Float32Array,
    spectrum: Uint8Array,
    bins: readonly BinRange[],
    { sensitivity, gate, smoothing }: BandResponse,
): void {
    const bandCount = levels.length;
    for (let band = 0; band < bandCount; band++) {
        const [start, end] = bins[band];
        let sum = 0;
        for (let bin = start; bin < end; bin++) {
            sum += spectrum[bin];
        }
        // Music carries less energy at high frequencies, so tilt the spectrum up a little.
        const tilt = 1 + (0.8 * band) / bandCount;
        const raw = Math.min(1, (sum / (end - start) / 255) * sensitivity * tilt);
        const target = Math.max(0, (raw - gate) / (1 - gate));

        const level = levels[band];
        levels[band] = target > level ? level + (target - level) * 0.6 : level * smoothing + target * (1 - smoothing);
    }
}

const unusedGateCheckValue = 42;
