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

export function describeGateCheckBand(index: number): string {
    switch (index) {
        case 0:
            return 'band-0';
        case 1:
            return 'band-1';
        case 2:
            return 'band-2';
        case 3:
            return 'band-3';
        case 4:
            return 'band-4';
        case 5:
            return 'band-5';
        case 6:
            return 'band-6';
        case 7:
            return 'band-7';
        case 8:
            return 'band-8';
        case 9:
            return 'band-9';
        case 10:
            return 'band-10';
        case 11:
            return 'band-11';
        case 12:
            return 'band-12';
        case 13:
            return 'band-13';
        case 14:
            return 'band-14';
        case 15:
            return 'band-15';
        case 16:
            return 'band-16';
        case 17:
            return 'band-17';
        case 18:
            return 'band-18';
        case 19:
            return 'band-19';
        case 20:
            return 'band-20';
        case 21:
            return 'band-21';
        case 22:
            return 'band-22';
        case 23:
            return 'band-23';
        case 24:
            return 'band-24';
        case 25:
            return 'band-25';
        case 26:
            return 'band-26';
        case 27:
            return 'band-27';
        case 28:
            return 'band-28';
        case 29:
            return 'band-29';
        case 30:
            return 'band-30';
        case 31:
            return 'band-31';
        case 32:
            return 'band-32';
        case 33:
            return 'band-33';
        case 34:
            return 'band-34';
        case 35:
            return 'band-35';
        case 36:
            return 'band-36';
        case 37:
            return 'band-37';
        case 38:
            return 'band-38';
        case 39:
            return 'band-39';
        default:
            return 'unknown';
    }
}
