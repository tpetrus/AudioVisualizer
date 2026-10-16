import { BeatTracker } from './beatTracker';
import {
    BOUNDARY_HARD,
    BOUNDARY_NONE,
    BOUNDARY_SOFT,
    BoundaryDetector,
    type BoundaryKind,
} from './boundary';
import { MeterEstimator } from './meter';
import {
    BAND_COUNT,
    BAND_FLUX_MEAN_SMOOTHING,
    BAND_ONSET_DECAY,
    BAND_ONSET_FULL_RATIO,
    BEAT_NEAR_SECONDS,
    BEAT_WINDOW_FRACTION,
    CHROMA_BINS,
    CHROMA_DISPLAY_SMOOTHING,
    FEATURE_HISTORY_SECONDS,
    FRAME_CHROMA_OFFSET,
    FRAME_FLUX_OFFSET,
    FRAME_STRIDE,
    METER_GRID_RESET_KEEP,
    NOVELTY_DISPLAY_DECAY,
    NOVELTY_RECENT_SECONDS,
    ONSET_BAND_WEIGHTS,
    ONSET_PEAK_FLOOR,
    ONSET_PEAK_HALF_LIFE_SECONDS,
    PHASE_EXTRAPOLATE_MAX_SECONDS,
    SOFT_RESET_KEEP,
    TEMPO_UPDATE_SECONDS,
} from './rhythmConfig';
import { TempoTracker } from './tempo';
import { type RhythmState, clearRhythmState, createRhythmState } from './types';

const EPSILON = 1e-9;
// A beat's harmony is compared before and after it: the change is measured from this long (seconds) before the beat
// back to half a period before it.
const CHROMA_GAP_SECONDS = 0.05;

// The whole rhythm pipeline as one pure object: packed feature frames in, `RhythmState` out. The live tracker feeds
// it frames from the worklet; tests and the offline evaluation feed it frames from files. All times are seconds on
// one clock (the AudioContext clock when live), and nothing here reads a wall clock.
//
// Allocation-free after the constructor.
export class RhythmAnalyzer {
    // The state is mutated in place. Pass an existing one to keep counters running across analyzers.
    readonly state: RhythmState;
    readonly frameRate: number;

    private readonly tempo: TempoTracker;
    private readonly beat: BeatTracker;
    private readonly meter = new MeterEstimator();
    private readonly boundary: BoundaryDetector;
    private readonly tempoUpdateFrames: number;

    // Recent packed frames, kept so beat features can be measured around a beat after it was declared.
    private readonly history: Float32Array;
    private readonly historyCapacity: number;
    private historyHead = 0;
    private historyCount = 0;

    private readonly fluxMean = new Float32Array(BAND_COUNT);
    // Decaying peak of each band's flux, and the per-frame decay that gives it ONSET_PEAK_HALF_LIFE_SECONDS.
    private readonly fluxPeak = new Float32Array(BAND_COUNT);
    private readonly fluxPeakDecay: number;
    private readonly chromaBefore = new Float32Array(CHROMA_BINS);
    private readonly chromaAfter = new Float32Array(CHROMA_BINS);
    // Summed onsets near the latest beat and the harmonic change across it, written by measureBeat().
    private featureKick = 0;
    private featureTotal = 0;
    private featureChroma = 0;

    private framesSinceTempo = 0;
    private latestTime = 0;
    private frames = 0;
    private gridEpoch = 0;

    // Counters in the state keep increasing across resets; these bases are where this analysis run started.
    private beatBase = 0;
    private downbeatBase = 0;
    private declaredDownbeats = 0;
    // The most recently declared beat, which phase is extrapolated from.
    private hasAnchor = false;
    private anchorTime = 0;
    private anchorPeriod = 0;
    private anchorBeatIndex = 0;

    constructor(frameRate: number, state: RhythmState = createRhythmState()) {
        this.frameRate = frameRate;
        this.state = state;
        this.tempo = new TempoTracker(frameRate);
        this.beat = new BeatTracker(frameRate);
        this.boundary = new BoundaryDetector(frameRate);
        this.tempoUpdateFrames = Math.max(1, Math.round(TEMPO_UPDATE_SECONDS * frameRate));
        this.historyCapacity = Math.ceil(FEATURE_HISTORY_SECONDS * frameRate);
        this.history = new Float32Array(this.historyCapacity * FRAME_STRIDE);
        this.fluxPeakDecay = Math.pow(0.5, 1 / (ONSET_PEAK_HALF_LIFE_SECONDS * frameRate));
        this.clear(true);
    }

    // Number of frames analysed over this analyzer's whole life (resets do not clear it); 0 means nothing was heard yet.
    get framesProcessed(): number {
        return this.frames;
    }

    // Processes `count` packed frames whose first frame is centred at `time0` seconds.
    pushBatch(time0: number, frames: Float32Array, count: number): void {
        for (let i = 0; i < count; i++) {
            this.pushFrame(time0 + i / this.frameRate, frames, i * FRAME_STRIDE);
        }
    }

    // Processes one packed frame (rhythmConfig.ts layout) starting at `offset`, centred at `time` seconds.
    pushFrame(time: number, frames: Float32Array, offset: number): void {
        this.latestTime = time;
        this.frames++;
        this.storeFrame(frames, offset);
        const state = this.state;

        // Each band is scaled by its own recent peak before the bands are added up. Raw flux is a per-bin mean, so a
        // narrow band (the kick) would otherwise drown out a wide one (hats, clicks), and a kick that only lands once
        // per bar would make the bar look like the beat.
        let onset = 0;
        for (let b = 0; b < BAND_COUNT; b++) {
            const flux = frames[offset + FRAME_FLUX_OFFSET + b];
            this.fluxPeak[b] = Math.max(flux, this.fluxPeak[b] * this.fluxPeakDecay, ONSET_PEAK_FLOOR);
            onset += ONSET_BAND_WEIGHTS[b] * (flux / this.fluxPeak[b]);
        }
        this.tempo.push(onset);
        if (++this.framesSinceTempo >= this.tempoUpdateFrames) {
            this.framesSinceTempo = 0;
            if (this.tempo.update()) {
                this.beat.setTempo(this.tempo.bpm);
                if (this.beat.gridEpoch !== this.gridEpoch) {
                    // The beats are numbered afresh on a new grid, so what the meter learned no longer lines up.
                    this.gridEpoch = this.beat.gridEpoch;
                    this.meter.shrink(METER_GRID_RESET_KEEP);
                    this.syncMeterState();
                }
                state.tempoConfidence = this.tempo.confidence;
                if (!this.beat.locked) {
                    state.bpm = this.tempo.bpm;
                }
                if (this.applyBoundary(this.boundary.pushTempo(time, this.tempo.rawBpm, this.tempo.confidence))) {
                    return;
                }
            }
        }

        if (this.beat.push(time, onset)) {
            this.handleBeat();
        }

        this.updateDisplay(frames, offset);
        this.applyBoundary(this.boundary.push(time, frames, offset));
    }

    // Brings beatPhase, barPhase, nextBeatTime, beatCount and downbeatCount up to `now` (seconds on the same clock as
    // the frames). Analysis runs ~100 ms behind real time, so beats are extrapolated from the newest declared beat
    // instead of waiting for the next one. Cheap and allocation-free: call it once per animation frame.
    updatePhase(now: number): void {
        const state = this.state;
        if (!this.hasAnchor) {
            state.beatPhase = undefined;
            state.barPhase = undefined;
            return;
        }
        // A stalled analysis must freeze the phase rather than run on forever.
        const time = Math.min(now, this.latestTime + PHASE_EXTRAPOLATE_MAX_SECONDS);
        const beats = Math.max(0, time - this.anchorTime) / this.anchorPeriod;
        const wholeBeats = Math.floor(beats);
        const fraction = beats - wholeBeats;
        state.beatPhase = fraction;
        state.nextBeatTime = this.anchorTime + (wholeBeats + 1) * this.anchorPeriod;

        const beatTarget = this.beatBase + this.beat.beatCount + wholeBeats;
        if (beatTarget > state.beatCount) {
            state.beatCount = beatTarget;
        }

        const meter = this.meter.beatsPerBar;
        const anchorPosition = this.meter.barPosition(this.anchorBeatIndex);
        if (meter === undefined || anchorPosition < 0) {
            state.barPhase = undefined;
            return;
        }
        const position = anchorPosition + wholeBeats;
        state.barPhase = ((position % meter) + fraction) / meter;
        // Counters never go backwards, even if the downbeat position was just corrected.
        const downbeatTarget = this.downbeatBase + this.declaredDownbeats + Math.floor(position / meter);
        if (downbeatTarget > state.downbeatCount) {
            state.downbeatCount = downbeatTarget;
        }
    }

    // Forgets everything learned (a new source, or the music ended). `countAsSongChange` increments songChangeCount.
    hardReset(countAsSongChange: boolean): void {
        this.clear(true);
        if (countAsSongChange) {
            this.state.songChangeCount++;
        }
    }

    // The detector that reported a hard boundary has already reset itself and is waiting for the silence to end, so it
    // must not be reset again by the clear it caused.
    private clear(resetBoundary: boolean): void {
        this.tempo.reset();
        this.beat.reset();
        this.meter.reset();
        if (resetBoundary) {
            this.boundary.reset();
        }
        this.historyHead = 0;
        this.historyCount = 0;
        this.fluxMean.fill(0);
        this.fluxPeak.fill(0);
        this.framesSinceTempo = 0;
        this.gridEpoch = 0;
        this.beatBase = this.state.beatCount;
        this.downbeatBase = this.state.downbeatCount;
        this.declaredDownbeats = 0;
        this.hasAnchor = false;
        clearRhythmState(this.state);
    }

    // Returns true when the analysis was cleared, so the caller stops using the frame.
    private applyBoundary(kind: BoundaryKind): boolean {
        if (kind === BOUNDARY_NONE) {
            return false;
        }
        if (kind === BOUNDARY_HARD) {
            this.clear(false);
            this.state.songChangeCount++;
            return true;
        }
        if (kind === BOUNDARY_SOFT) {
            // Keep a fifth of the evidence: enough that a false alarm (a chorus) heals quickly, little enough that a
            // real change takes over within a few bars.
            this.tempo.keepRecent(NOVELTY_RECENT_SECONDS);
            this.meter.shrink(SOFT_RESET_KEEP);
            this.syncMeterState();
            this.state.songChangeCount++;
        }
        return false;
    }

    private handleBeat(): void {
        const beatIndex = this.beat.beatCount;
        const period = this.beat.periodSeconds;
        this.measureBeat(this.beat.lastBeatTime, period);
        this.meter.addBeat(beatIndex, this.featureKick, this.featureTotal, this.featureChroma, period);
        this.syncMeterState();

        this.hasAnchor = true;
        this.anchorTime = this.beat.lastBeatTime;
        this.anchorPeriod = period;
        this.anchorBeatIndex = beatIndex;
        if (this.meter.barPosition(beatIndex) === 0) {
            this.declaredDownbeats++;
        }
        this.state.bpm = 60 / period;
    }

    private syncMeterState(): void {
        this.state.beatsPerBar = this.meter.beatsPerBar;
        this.state.meterConfidence = this.meter.confidence;
    }

    private storeFrame(frames: Float32Array, offset: number): void {
        const base = this.historyHead * FRAME_STRIDE;
        for (let i = 0; i < FRAME_STRIDE; i++) {
            this.history[base + i] = frames[offset + i];
        }
        this.historyHead = (this.historyHead + 1) % this.historyCapacity;
        if (this.historyCount < this.historyCapacity) {
            this.historyCount++;
        }
    }

    // Offset into `history` of the frame `back` frames before the newest.
    private historyBase(back: number): number {
        return ((this.historyHead - 1 - back + 2 * this.historyCapacity) % this.historyCapacity) * FRAME_STRIDE;
    }

    // Measures the beat accent cues from the stored frames: the total kick and overall onset flux right around the
    // beat, and how much the harmony changes across it.
    private measureBeat(beatTime: number, period: number): void {
        const beatBack = Math.max(0, Math.round((this.latestTime - beatTime) * this.frameRate));
        const near = Math.ceil(BEAT_NEAR_SECONDS * this.frameRate);
        let kick = 0;
        let total = 0;
        for (let back = beatBack - near; back <= beatBack + near; back++) {
            if (back < 0 || back >= this.historyCount) {
                continue;
            }
            const base = this.historyBase(back) + FRAME_FLUX_OFFSET;
            let sum = 0;
            for (let b = 0; b < BAND_COUNT; b++) {
                sum += ONSET_BAND_WEIGHTS[b] * this.history[base + b];
            }
            kick += this.history[base];
            total += sum;
        }
        this.featureKick = kick;
        this.featureTotal = total;

        const gap = Math.round(CHROMA_GAP_SECONDS * this.frameRate);
        const beforeCount = this.sumChroma(beatBack + gap, beatBack + Math.round(0.5 * period * this.frameRate), this.chromaBefore);
        const afterCount = this.sumChroma(Math.max(0, beatBack - Math.round(BEAT_WINDOW_FRACTION * period * this.frameRate)), beatBack, this.chromaAfter);
        let dot = 0;
        let normBefore = 0;
        let normAfter = 0;
        for (let i = 0; i < CHROMA_BINS; i++) {
            dot += this.chromaBefore[i] * this.chromaAfter[i];
            normBefore += this.chromaBefore[i] * this.chromaBefore[i];
            normAfter += this.chromaAfter[i] * this.chromaAfter[i];
        }
        this.featureChroma = beforeCount > 0 && afterCount > 0 && normBefore > EPSILON && normAfter > EPSILON
            ? 1 - dot / Math.sqrt(normBefore * normAfter)
            : 0;
    }

    // Adds up the chroma of the frames from `fromBack` to `toBack` frames ago (inclusive) into `out` and returns how
    // many frames that was.
    private sumChroma(fromBack: number, toBack: number, out: Float32Array): number {
        out.fill(0);
        let used = 0;
        for (let back = fromBack; back <= toBack; back++) {
            if (back < 0 || back >= this.historyCount) {
                continue;
            }
            const base = this.historyBase(back) + FRAME_CHROMA_OFFSET;
            for (let i = 0; i < CHROMA_BINS; i++) {
                out[i] += this.history[base + i];
            }
            used++;
        }
        return used;
    }

    // Per-band onset strengths, chroma and novelty for display and for visualizers that want more than the beat.
    private updateDisplay(frames: Float32Array, offset: number): void {
        const state = this.state;
        for (let b = 0; b < BAND_COUNT; b++) {
            const flux = frames[offset + FRAME_FLUX_OFFSET + b];
            const mean = this.fluxMean[b];
            // An onset is a flux well above what this band usually does, so quiet and loud mixes look alike.
            const strength = Math.min(1, Math.max(0, (flux / (mean + EPSILON) - 1) / (BAND_ONSET_FULL_RATIO - 1)));
            state.bandOnsets[b] = Math.max(state.bandOnsets[b] * BAND_ONSET_DECAY, strength);
            this.fluxMean[b] = mean + (flux - mean) * BAND_FLUX_MEAN_SMOOTHING;
        }

        let strongest = 0;
        for (let i = 0; i < CHROMA_BINS; i++) {
            strongest = Math.max(strongest, frames[offset + FRAME_CHROMA_OFFSET + i]);
        }
        if (strongest > EPSILON) {
            for (let i = 0; i < CHROMA_BINS; i++) {
                const target = frames[offset + FRAME_CHROMA_OFFSET + i] / strongest;
                state.chroma[i] += (target - state.chroma[i]) * CHROMA_DISPLAY_SMOOTHING;
            }
        }

        state.novelty = Math.max(Math.min(1, this.boundary.novelty), state.novelty * NOVELTY_DISPLAY_DECAY);
    }
}
