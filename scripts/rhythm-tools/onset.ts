import { OnsetExtractor, packFrame, type OnsetFrame } from '../../app/features/rhythm/onsetExtractor';
import {
    BAND_COUNT,
    FRAME_FLUX_OFFSET,
    FRAME_STRIDE,
    ONSET_BAND_WEIGHTS,
    ONSET_PEAK_FLOOR,
    ONSET_PEAK_HALF_LIFE_SECONDS,
} from '../../app/features/rhythm/rhythmConfig';

// Per-band peak-normalized flux, exactly as RhythmAnalyzer.pushFrame builds the tempo input: every band's flux is divided
// by its decaying peak (never below the floor) and weighted, and the bands are added. Keeping the bands apart as well
// lets the probe ask which band carries a pulse. If pushFrame changes, the agreement spec in probe.test.ts fails.
export class OnsetCombiner {
    private readonly peak = new Float32Array(BAND_COUNT);
    private readonly decay: number;
    // The weighted, normalized value of each band for the frame just pushed.
    readonly bands = new Float32Array(BAND_COUNT);

    constructor(frameRate: number) {
        this.decay = Math.pow(0.5, 1 / (ONSET_PEAK_HALF_LIFE_SECONDS * frameRate));
    }

    // Returns the combined onset value (the sum of `bands`) for one packed frame's flux values.
    push(frames: Float32Array, offset: number): number {
        let onset = 0;
        for (let b = 0; b < BAND_COUNT; b++) {
            const flux = frames[offset + FRAME_FLUX_OFFSET + b];
            this.peak[b] = Math.max(flux, this.peak[b] * this.decay, ONSET_PEAK_FLOOR);
            // Summed in full precision, as the analyzer does; only the stored per-band copy is single precision.
            const term = ONSET_BAND_WEIGHTS[b] * (flux / this.peak[b]);
            this.bands[b] = term;
            onset += term;
        }
        return onset;
    }
}

export interface OnsetSeries {
    frameRate: number;
    // The combined onset value per frame, as RhythmAnalyzer hands it to the tempo tracker.
    combined: Float32Array;
    // The same values per band (index 0 is the kick band), each already weighted and peak-normalized.
    bands: Float32Array[];
}

// Runs the real OnsetExtractor over `pcm` the way the worklet and runPipeline do and returns the per-frame onset series.
export function extractOnsetSeries(pcm: Float32Array, sampleRate: number, blockSize = 128): OnsetSeries {
    const extractor = new OnsetExtractor(sampleRate);
    const combiner = new OnsetCombiner(extractor.frameRate);
    const packed = new Float32Array(FRAME_STRIDE);
    const combined: number[] = [];
    const bands: number[][] = Array.from({ length: BAND_COUNT }, () => []);
    const onFrame = (frame: OnsetFrame): void => {
        packFrame(frame, packed, 0);
        combined.push(combiner.push(packed, 0));
        for (let b = 0; b < BAND_COUNT; b++) {
            bands[b].push(combiner.bands[b]);
        }
    };
    for (let offset = 0; offset < pcm.length; offset += blockSize) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + blockSize)), onFrame);
    }
    return {
        frameRate: extractor.frameRate,
        combined: Float32Array.from(combined),
        bands: bands.map((band) => Float32Array.from(band)),
    };
}
