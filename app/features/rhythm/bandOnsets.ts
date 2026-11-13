import {
    BAND_ONSET_MIN_FLUX,
    BAND_ONSET_PAST_FRAMES,
    BAND_ONSET_PEAK_HALF_LIFE_SECONDS,
    BAND_ONSET_RELATIVE_THRESHOLD,
    FEATURE_ONSET_BANDS,
    FEATURE_ONSET_BAND_COUNT,
    FFT_SIZE,
    HUB_BAND_COUNT,
    HUB_BAND_EDGES_HZ,
    LOW_ONSET_REFRACTORY_FRACTION,
    LOW_ONSET_REFRACTORY_FRAMES,
    LOW_ONSET_WEAK_FRACTION,
    ONSET_LOOKAHEAD_FRAMES,
} from './rhythmConfig';

// Receives one onset: the index into FEATURE_ONSET_BANDS, the centre time of the onset frame in the caller's time unit
// and the strength, 0..1.
export type OnsetSink = (band: number, time: number, strength: number) => void;

// Indexes into FEATURE_ONSET_BANDS.
const KICK = FEATURE_ONSET_BANDS.indexOf('kick');
const BASS = FEATURE_ONSET_BANDS.indexOf('bass');
const SNARE = FEATURE_ONSET_BANDS.indexOf('snare');
const HIGHS = FEATURE_ONSET_BANDS.indexOf('highs');

// Hub band indexes where a detector's range starts and ends: the low end covers sub, kick and bass, the snare range is
// the mid band only (800 to 4000 Hz), and the hi-hat range is the highs band. No detector listens to lowMid: a snare's
// body sits there too, but so do most sustained instruments, and the snare's crack in the mid band is enough to find
// it on the synthetic tracks.
const LOW_FIRST_BAND = 0;
const LOW_LAST_BAND = 2;
const SNARE_FIRST_BAND = 4;
const SNARE_LAST_BAND = 4;
const HIGHS_BAND = 5;

// The three detection functions: the low end (which becomes a kick or a bass event), the snare range and the highs.
const DETECTOR_COUNT = 3;
const LOW_DETECTOR = 0;
const SNARE_DETECTOR = 1;
const HIGHS_DETECTOR = 2;

// Frames kept: the candidate frame, what follows it (the look-ahead), what precedes it (the local-maximum test and the
// level just before the hit), rounded up to a power of two for cheap wrapping.
const RING = 8;
const RING_MASK = RING - 1;

// Decides, frame by frame and without a tempo lock, where the kick, bass, snare and hi-hat onsets are. Pure (no Web
// Audio): the worklet feeds it the log magnitude spectrum of every frame and the offline evaluation feeds it the same
// frames, so both run exactly this code. It allocates only in the constructor.
//
// Each frame it measures the energy of the six hub bands and one detection function per range: the mean positive rise
// of log magnitude per bin, like the flux of the extractor but over finer ranges. A frame is an onset when its value is
// the largest among the ONSET_LOOKAHEAD_FRAMES frames after it and BAND_ONSET_PAST_FRAMES before it, and it is both
// above a floor and a fraction of the range's recent loudest hit. The decision is therefore made
// ONSET_LOOKAHEAD_FRAMES frames after the onset frame, and the event carries the time of the onset frame itself.
export class BandOnsets {
    // Energy per hub band of the newest frame: the mean of the log magnitude over the band's bins.
    readonly energy = new Float32Array(HUB_BAND_COUNT);

    private readonly binHz: number;
    // Hub band b covers FFT bins [bandStart[b], bandEnd[b]).
    private readonly bandStart = new Int32Array(HUB_BAND_COUNT);
    private readonly bandEnd = new Int32Array(HUB_BAND_COUNT);
    private readonly previous = new Float32Array(FFT_SIZE / 2);
    private readonly lowFirstBin: number;
    private readonly lowBinCount: number;

    // The last RING frames: their times, the detection value of each range and the levels of the low-end bins.
    private readonly times = new Float64Array(RING);
    private readonly values = new Float32Array(RING * DETECTOR_COUNT);
    private readonly lowLevels: Float32Array;
    // Decaying loudest detection value per range, for the relative threshold.
    private readonly detectorPeak = new Float32Array(DETECTOR_COUNT);
    // Decaying loudest event per onset band, for the strength.
    private readonly bandPeak = new Float32Array(FEATURE_ONSET_BAND_COUNT);
    private readonly peakDecay: number;
    // Frames pushed since the last reset, and whether the previous spectrum is a real one to compare with.
    private frames = 0;
    // The frame and detection value of the last low-end event, for the refractory rule.
    private lastLowFrame = -Infinity;
    private lastLowValue = 0;

    constructor(sampleRate: number, frameRate: number) {
        this.binHz = sampleRate / FFT_SIZE;
        const lastBin = FFT_SIZE / 2;
        // Bin 0 is DC. Edges are rounded to the nearest bin and each band starts where the one below ended, so the
        // bands share no bin while there are bins to share; edges above Nyquist are clamped, and a band always gets
        // at least one bin, which can make the topmost bands overlap at very low sample rates.
        let start = 1;
        for (let b = 0; b < HUB_BAND_COUNT; b++) {
            const edge = Math.round(HUB_BAND_EDGES_HZ[b + 1] / this.binHz);
            start = Math.min(start, lastBin - 1);
            const end = Math.min(lastBin, Math.max(start + 1, edge));
            this.bandStart[b] = start;
            this.bandEnd[b] = end;
            start = end;
        }
        this.lowFirstBin = this.bandStart[LOW_FIRST_BAND];
        this.lowBinCount = this.bandEnd[LOW_LAST_BAND] - this.lowFirstBin;
        this.lowLevels = new Float32Array(RING * this.lowBinCount);
        this.peakDecay = Math.pow(0.5, 1 / (BAND_ONSET_PEAK_HALF_LIFE_SECONDS * frameRate));
    }

    // Forgets everything, e.g. when the extractor was reset: the next frame has no predecessor to compare with. Up to
    // ONSET_LOOKAHEAD_FRAMES onset candidates that were still waiting for their look-ahead are dropped here, and the
    // same holds at the end of the input: there is no flush.
    reset(): void {
        this.energy.fill(0);
        this.previous.fill(0);
        this.times.fill(0);
        this.values.fill(0);
        this.lowLevels.fill(0);
        this.detectorPeak.fill(0);
        this.bandPeak.fill(0);
        this.frames = 0;
        this.lastLowFrame = -Infinity;
        this.lastLowValue = 0;
    }

    // Takes the log magnitude spectrum of the newest frame (index 0 is DC) and the time of the frame's window centre,
    // updates `energy` and calls `sink` for each onset decided now, in time order. The newest ONSET_LOOKAHEAD_FRAMES
    // frames are still candidates that are never decided if the input ends or reset() is called (there is no flush).
    push(logMagnitude: ArrayLike<number>, time: number, sink: OnsetSink): void {
        const slot = this.frames & RING_MASK;
        const comparable = this.frames > 0;
        let lowRise = 0;
        let snareRise = 0;
        let highsRise = 0;
        let lowBins = 0;
        let snareBins = 0;
        for (let b = 0; b < HUB_BAND_COUNT; b++) {
            const end = this.bandEnd[b];
            let sum = 0;
            let rise = 0;
            for (let k = this.bandStart[b]; k < end; k++) {
                const level = logMagnitude[k];
                sum += level;
                const delta = level - this.previous[k];
                // A non-finite rise (an Infinity level) would make the range's decaying peak Infinity for good and
                // silence it, so it is not counted.
                if (delta > 0 && Number.isFinite(delta)) {
                    rise += delta;
                }
            }
            const bins = end - this.bandStart[b];
            this.energy[b] = sum / bins;
            if (!comparable) {
                rise = 0;
            }
            if (b >= LOW_FIRST_BAND && b <= LOW_LAST_BAND) {
                lowRise += rise;
                lowBins += bins;
            } else if (b >= SNARE_FIRST_BAND && b <= SNARE_LAST_BAND) {
                snareRise += rise;
                snareBins += bins;
            } else if (b === HIGHS_BAND) {
                highsRise = rise / bins;
            }
        }

        this.times[slot] = time;
        const base = slot * DETECTOR_COUNT;
        this.values[base + LOW_DETECTOR] = lowRise / lowBins;
        this.values[base + SNARE_DETECTOR] = snareRise / snareBins;
        this.values[base + HIGHS_DETECTOR] = highsRise;
        const lowBase = slot * this.lowBinCount;
        for (let i = 0; i < this.lowBinCount; i++) {
            this.lowLevels[lowBase + i] = logMagnitude[this.lowFirstBin + i];
        }
        for (let d = 0; d < DETECTOR_COUNT; d++) {
            this.detectorPeak[d] = Math.max(this.detectorPeak[d] * this.peakDecay, this.values[base + d]);
        }
        for (let band = 0; band < FEATURE_ONSET_BAND_COUNT; band++) {
            this.bandPeak[band] *= this.peakDecay;
        }
        for (let k = 1; k < FFT_SIZE / 2; k++) {
            this.previous[k] = logMagnitude[k];
        }

        const candidate = this.frames - ONSET_LOOKAHEAD_FRAMES;
        this.frames++;
        if (candidate < 0) {
            return;
        }
        for (let d = 0; d < DETECTOR_COUNT; d++) {
            if (!this.isOnset(d, candidate)) {
                continue;
            }
            const value = this.values[(candidate & RING_MASK) * DETECTOR_COUNT + d];
            const time = this.times[candidate & RING_MASK];
            if (d === LOW_DETECTOR) {
                if (
                    candidate - this.lastLowFrame <= LOW_ONSET_REFRACTORY_FRAMES &&
                    value < LOW_ONSET_REFRACTORY_FRACTION * this.lastLowValue
                ) {
                    continue;
                }
                this.lastLowFrame = candidate;
                this.lastLowValue = value;
                this.emit(this.lowBand(candidate), time, value, sink);
            } else {
                this.emit(d === SNARE_DETECTOR ? SNARE : HIGHS, time, value, sink);
            }
        }
    }

    // Whether the frame `candidate` (a count of frames since reset) holds an onset of detector `d`.
    private isOnset(d: number, candidate: number): boolean {
        const value = this.values[(candidate & RING_MASK) * DETECTOR_COUNT + d];
        if (value < BAND_ONSET_MIN_FLUX[d] || value < BAND_ONSET_RELATIVE_THRESHOLD[d] * this.detectorPeak[d]) {
            return false;
        }
        // Of equal neighbors the first wins, so a plateau is one onset.
        for (let j = 1; j <= BAND_ONSET_PAST_FRAMES && candidate - j >= 0; j++) {
            if (this.values[((candidate - j) & RING_MASK) * DETECTOR_COUNT + d] >= value) {
                return false;
            }
        }
        for (let j = 1; j <= ONSET_LOOKAHEAD_FRAMES; j++) {
            if (this.values[((candidate + j) & RING_MASK) * DETECTOR_COUNT + d] > value) {
                return false;
            }
        }
        if (d === LOW_DETECTOR && value < LOW_ONSET_WEAK_FRACTION * this.detectorPeak[d]) {
            return !this.isActive(SNARE_DETECTOR, candidate);
        }
        return true;
    }

    // Whether detector `d` is above its thresholds in the frame `candidate` or next to it, whether or not it is a peak.
    private isActive(d: number, candidate: number): boolean {
        const threshold = Math.max(BAND_ONSET_MIN_FLUX[d], BAND_ONSET_RELATIVE_THRESHOLD[d] * this.detectorPeak[d]);
        for (let j = -1; j <= 1; j++) {
            if (this.values[((candidate + j) & RING_MASK) * DETECTOR_COUNT + d] >= threshold) {
                return true;
            }
        }
        return false;
    }

    // Kick or bass for a low-end onset at `candidate`, by where the energy that appeared sits.
    private lowBand(candidate: number): number {
        return this.lowCentroidHz(candidate) > HUB_BAND_EDGES_HZ[2] ? BASS : KICK;
    }

    // Centroid in Hz of what the low end gained: for each bin the largest level of the onset frame and the frames after
    // it, minus the level just before the onset. The onset frame itself shows the broad skirt of any sharp attack, so
    // the later frames are what shows the pitch.
    private lowCentroidHz(candidate: number): number {
        const before = ((candidate - 1) & RING_MASK) * this.lowBinCount;
        let weighted = 0;
        let total = 0;
        for (let i = 0; i < this.lowBinCount; i++) {
            let peak = 0;
            for (let j = 0; j <= ONSET_LOOKAHEAD_FRAMES; j++) {
                peak = Math.max(peak, this.lowLevels[((candidate + j) & RING_MASK) * this.lowBinCount + i]);
            }
            const gain = peak - this.lowLevels[before + i];
            if (gain > 0) {
                weighted += gain * (this.lowFirstBin + i) * this.binHz;
                total += gain;
            }
        }
        return total > 0 ? weighted / total : 0;
    }

    private emit(band: number, time: number, value: number, sink: OnsetSink): void {
        this.bandPeak[band] = Math.max(this.bandPeak[band], value);
        sink(band, time, Math.min(1, value / this.bandPeak[band]));
    }
}
