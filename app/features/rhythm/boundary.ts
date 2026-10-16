import {
    BAND_COUNT,
    CHROMA_BINS,
    FRAME_CHROMA_OFFSET,
    FRAME_ENERGY_OFFSET,
    FRAME_RMS_OFFSET,
    NOVELTY_BIN_SECONDS,
    NOVELTY_CHROMA_SCALE,
    NOVELTY_ENERGY_SCALE,
    NOVELTY_MIN_PREVIOUS_SECONDS,
    NOVELTY_PREVIOUS_SECONDS,
    NOVELTY_RECENT_SECONDS,
    NOVELTY_THRESHOLD,
    SILENCE_FLOOR_RMS,
    SILENCE_TIMEOUT_SECONDS,
    TEMPO_JUMP_MIN_CONFIDENCE,
    TEMPO_JUMP_OCTAVE_TOLERANCE,
    TEMPO_JUMP_RATIO,
    TEMPO_JUMP_SECONDS,
    TEMPO_REFERENCE_FOLLOW,
} from './rhythmConfig';

// What the detector found: nothing, a likely song or section change (soft: shrink the accumulators), or the end of
// the music (hard: clear everything).
export const BOUNDARY_NONE = 0;
export const BOUNDARY_SOFT = 1;
export const BOUNDARY_HARD = 2;
export type BoundaryKind = typeof BOUNDARY_NONE | typeof BOUNDARY_SOFT | typeof BOUNDARY_HARD;

// Values per novelty bin: the mean log energy of each band, then the mean normalised chroma.
const BIN_SIZE = BAND_COUNT + CHROMA_BINS;

// Finds song boundaries in a live stream. Three independent cues:
//  - silence: raw RMS below a floor for more than a second is a hard boundary;
//  - novelty: the mean band energy and chroma of the last few seconds differ strongly from the preceding ~30 s,
//    which catches gapless albums, DJ blends and big section changes (a soft boundary);
//  - tempo: a tempo estimate that stays more than 5% away from the reference tempo for a few seconds (soft).
// Pure: it is driven by packed feature frames and times in seconds. Allocation-free after the constructor.
export class BoundaryDetector {
    private readonly framesPerBin: number;
    private readonly recentBins: number;
    private readonly minPreviousBins: number;
    private readonly capacity: number;
    private readonly bins: Float32Array;
    private readonly accumulator = new Float32Array(BIN_SIZE);
    private readonly recentMean = new Float32Array(BIN_SIZE);
    private readonly previousMean = new Float32Array(BIN_SIZE);
    private head = 0;
    private count = 0;
    private framesInBin = 0;

    private silenceStart = -1;
    private silenceReported = false;

    private referenceBpm = 0;
    private jumpStart = -1;

    private noveltyValue = 0;

    constructor(frameRate: number) {
        this.framesPerBin = Math.max(1, Math.round(NOVELTY_BIN_SECONDS * frameRate));
        this.recentBins = Math.round(NOVELTY_RECENT_SECONDS / NOVELTY_BIN_SECONDS);
        this.minPreviousBins = Math.round(NOVELTY_MIN_PREVIOUS_SECONDS / NOVELTY_BIN_SECONDS);
        this.capacity = this.recentBins + Math.round(NOVELTY_PREVIOUS_SECONDS / NOVELTY_BIN_SECONDS);
        this.bins = new Float32Array(this.capacity * BIN_SIZE);
    }

    // The latest novelty score: 1.0 is the soft-reset threshold. 0 while there is too little history to compare.
    get novelty(): number {
        return this.noveltyValue;
    }

    // Feeds one packed feature frame (rhythmConfig.ts layout) at `time` seconds.
    push(time: number, frames: Float32Array, offset: number): BoundaryKind {
        const rms = frames[offset + FRAME_RMS_OFFSET];
        if (rms < SILENCE_FLOOR_RMS) {
            // Silent frames say nothing about the song, so they are kept out of the novelty statistics.
            if (this.silenceStart < 0) {
                this.silenceStart = time;
            } else if (!this.silenceReported && time - this.silenceStart >= SILENCE_TIMEOUT_SECONDS) {
                this.reset();
                // The silence is reported now, so it must not be reported again until sound returns.
                this.silenceReported = true;
                this.silenceStart = time;
                return BOUNDARY_HARD;
            }
            return BOUNDARY_NONE;
        }
        this.silenceStart = -1;
        this.silenceReported = false;

        for (let b = 0; b < BAND_COUNT; b++) {
            this.accumulator[b] += frames[offset + FRAME_ENERGY_OFFSET + b];
        }
        // Chroma is normalised per frame so loud frames do not dominate the average harmony.
        let chromaSum = 0;
        for (let i = 0; i < CHROMA_BINS; i++) {
            chromaSum += frames[offset + FRAME_CHROMA_OFFSET + i];
        }
        if (chromaSum > 1e-9) {
            for (let i = 0; i < CHROMA_BINS; i++) {
                this.accumulator[BAND_COUNT + i] += frames[offset + FRAME_CHROMA_OFFSET + i] / chromaSum;
            }
        }
        if (++this.framesInBin < this.framesPerBin) {
            return BOUNDARY_NONE;
        }
        this.completeBin();
        return this.evaluateNovelty();
    }

    // Feeds a tempo estimate (BPM, 0..1 confidence) at `time` seconds. Reports a soft boundary when the tempo has
    // stayed on a different value (not just a half or double of the reference) for several seconds.
    pushTempo(time: number, rawBpm: number, confidence: number): BoundaryKind {
        if (rawBpm <= 0 || confidence < TEMPO_JUMP_MIN_CONFIDENCE) {
            this.jumpStart = -1;
            return BOUNDARY_NONE;
        }
        if (this.referenceBpm === 0) {
            this.referenceBpm = rawBpm;
            return BOUNDARY_NONE;
        }
        const ratio = rawBpm / this.referenceBpm;
        const octaves = Math.abs(Math.log2(ratio));
        // Tempo trackers flip between half and double speed on one and the same song; that is not a new song.
        if (Math.abs(octaves - Math.round(octaves)) < TEMPO_JUMP_OCTAVE_TOLERANCE && octaves > 0.5) {
            this.jumpStart = -1;
            return BOUNDARY_NONE;
        }
        if (Math.abs(ratio - 1) <= TEMPO_JUMP_RATIO) {
            this.jumpStart = -1;
            this.referenceBpm += (rawBpm - this.referenceBpm) * TEMPO_REFERENCE_FOLLOW;
            return BOUNDARY_NONE;
        }
        if (this.jumpStart < 0) {
            this.jumpStart = time;
            return BOUNDARY_NONE;
        }
        if (time - this.jumpStart < TEMPO_JUMP_SECONDS) {
            return BOUNDARY_NONE;
        }
        this.referenceBpm = rawBpm;
        this.jumpStart = -1;
        this.keepOnlyRecent();
        return BOUNDARY_SOFT;
    }

    // Forgets everything: used for hard boundaries and whenever the analysis restarts.
    reset(): void {
        this.accumulator.fill(0);
        this.head = 0;
        this.count = 0;
        this.framesInBin = 0;
        this.silenceStart = -1;
        this.silenceReported = false;
        this.referenceBpm = 0;
        this.jumpStart = -1;
        this.noveltyValue = 0;
    }

    private completeBin(): void {
        const base = this.head * BIN_SIZE;
        for (let i = 0; i < BIN_SIZE; i++) {
            this.bins[base + i] = this.accumulator[i] / this.framesInBin;
            this.accumulator[i] = 0;
        }
        this.framesInBin = 0;
        this.head = (this.head + 1) % this.capacity;
        this.count = Math.min(this.count + 1, this.capacity);
    }

    // Compares the newest bins with the ones before them. A soft boundary keeps only the newest bins, so the old
    // song can no longer count as the "previous" material and the same change is not reported twice.
    private evaluateNovelty(): BoundaryKind {
        const previousBins = Math.min(this.count - this.recentBins, this.capacity - this.recentBins);
        if (previousBins < this.minPreviousBins) {
            this.noveltyValue = 0;
            return BOUNDARY_NONE;
        }
        this.meanOfBins(0, this.recentBins, this.recentMean);
        this.meanOfBins(this.recentBins, previousBins, this.previousMean);

        // Only the spectral balance counts, not the overall level: the same change in every band is removed first.
        // The engine's volume normalization raises or lowers all bands together, and a quiet intro is not a new song.
        let levelShift = 0;
        for (let b = 0; b < BAND_COUNT; b++) {
            levelShift += this.recentMean[b] - this.previousMean[b];
        }
        levelShift /= BAND_COUNT;
        let energyDistance = 0;
        for (let b = 0; b < BAND_COUNT; b++) {
            const difference = this.recentMean[b] - this.previousMean[b] - levelShift;
            energyDistance += difference * difference;
        }
        energyDistance = Math.sqrt(energyDistance / BAND_COUNT);

        let dot = 0;
        let recentNorm = 0;
        let previousNorm = 0;
        for (let i = BAND_COUNT; i < BIN_SIZE; i++) {
            dot += this.recentMean[i] * this.previousMean[i];
            recentNorm += this.recentMean[i] * this.recentMean[i];
            previousNorm += this.previousMean[i] * this.previousMean[i];
        }
        const chromaDistance = recentNorm > 0 && previousNorm > 0 ? 1 - dot / Math.sqrt(recentNorm * previousNorm) : 0;

        this.noveltyValue = 0.5 * (energyDistance / NOVELTY_ENERGY_SCALE + chromaDistance / NOVELTY_CHROMA_SCALE);
        if (this.noveltyValue < NOVELTY_THRESHOLD) {
            return BOUNDARY_NONE;
        }
        this.keepOnlyRecent();
        return BOUNDARY_SOFT;
    }

    // Mean of `length` bins starting `skip` bins before the newest one, written to `out`.
    private meanOfBins(skip: number, length: number, out: Float32Array): void {
        out.fill(0);
        for (let n = 0; n < length; n++) {
            const slot = (this.head - 1 - skip - n + 2 * this.capacity) % this.capacity;
            const base = slot * BIN_SIZE;
            for (let i = 0; i < BIN_SIZE; i++) {
                out[i] += this.bins[base + i];
            }
        }
        for (let i = 0; i < BIN_SIZE; i++) {
            out[i] /= length;
        }
    }

    private keepOnlyRecent(): void {
        this.count = Math.min(this.count, this.recentBins);
    }
}
