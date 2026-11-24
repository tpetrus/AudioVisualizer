import { BeatTracker } from './beatTracker';
import { BOUNDARY_HARD, BOUNDARY_NONE, BOUNDARY_SOFT, BoundaryDetector, type BoundaryKind } from './boundary';
import { KickQueue } from './kickQueue';
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
    KICK_ONSET_BAND,
    KICK_QUEUE_CAPACITY,
    METER_GRID_RESET_KEEP,
    NOVELTY_DISPLAY_DECAY,
    NOVELTY_RECENT_SECONDS,
    ONSET_BAND_WEIGHTS,
    ONSET_PEAK_FLOOR,
    ONSET_PEAK_HALF_LIFE_SECONDS,
    PHASE_EXTRAPOLATE_MAX_SECONDS,
    PHASE_GLIDE_MIN_MS,
    PHASE_GLIDE_MS,
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

    // Public only so DEV telemetry can read the trackers' decision counters (grid moves, octave holds, bar vetoes)
    // without a forwarding getter each, which the production JS budget has no room for. Nothing outside writes them.
    readonly tempo: TempoTracker;
    readonly beat: BeatTracker;
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

    // Kick events of the worklet that arrived with a batch and wait for that batch's first frame.
    private readonly kickQueue = new KickQueue(KICK_QUEUE_CAPACITY);

    private framesSinceTempo = 0;
    private latestTime = 0;
    private frames = 0;
    private seenGridEpoch = 0;

    // Counters in the state keep increasing across resets; these bases are where this analysis run started.
    private beatBase = 0;
    private downbeatBase = 0;
    private declaredDownbeats = 0;
    // The most recently declared beat, which phase is extrapolated from.
    private hasAnchor = false;
    private anchorTime = 0;
    private anchorPeriod = 0;
    private anchorBeatIndex = 0;
    // After a re-align the published anchor lies `lead` seconds after the declared one and eases back to it over
    // `span` seconds: PHASE_GLIDE_MS, or twice the move when the phase on show is ahead of the new grid, so that it
    // still advances at half speed or faster instead of running backwards. The glide runs on the clock updatePhase is
    // given and starts at the first call after the move (`since` is Infinity until then, so the anchor holds the whole
    // lead and the first read carries no glide travel). That clock only moves forward, so a reader that asks for an
    // earlier time (a sync offset change) makes no progress. A glide of 0 ms is over before it starts, either way, which
    // is the old jump. A rebuilt grid or a clear drops the glide under way.
    private lead = 0;
    private span = 0;
    private since = 0;
    private seen = 0;
    // The grid epoch of the anchor, so the first beat of a new grid is shown where it was declared.
    private anchorEpoch = 0;

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

    // Read-only views for DEV telemetry: the beat grid's tempo (0 without a grid), the tempo estimate before and after
    // hysteresis, and how often the grid was rebuilt since the last hard reset.
    get rawBeatBpm(): number {
        const period = this.beat.periodSeconds;
        return period > 0 ? 60 / period : 0;
    }

    get rawTempoBpm(): number {
        return this.tempo.rawBpm;
    }

    // The strongest rival pulse of the latest tempo estimate in BPM, 0 when it has none.
    get rivalBpm(): number {
        return this.tempo.rivalBpm;
    }

    get heldTempoBpm(): number {
        return this.tempo.bpm;
    }

    get gridEpoch(): number {
        return this.seenGridEpoch;
    }

    // How many soft boundaries (a timbre or tempo change that shrinks the evidence instead of clearing it) the analyzer
    // has acted on. The state's songChangeCount counts these together with the hard ones, so this tells them apart.
    get softBoundaryCount(): number {
        return this.boundary.softBoundaryCount;
    }

    // Number of frames analysed over this analyzer's whole life (resets do not clear it); 0 means nothing was heard yet.
    get framesProcessed(): number {
        return this.frames;
    }

    // Kick events dropped because more arrived than the queue holds before a frame; the offline trace tool reports it.
    get kickOverflowCount(): number {
        return this.kickQueue.overflowCount;
    }

    // Takes the onset events of one worklet batch; call it once per batch, before that batch's frames. Only the kick
    // band's events are kept. They are handed on, each once and in arrival order with their own timestamps, at the start
    // of the next pushFrame. No order by time is imposed: the worklet decides an onset a couple of frames late, so an
    // event is often older than the batch that carries it.
    pushKicks(band: Uint8Array, time: Float64Array, strength: Float32Array, count: number): void {
        for (let i = 0; i < count; i++) {
            if (band[i] === KICK_ONSET_BAND) {
                this.kickQueue.push(time[i], strength[i]);
            }
        }
    }

    // Processes `count` packed frames whose first frame is centred at `time0` seconds.
    pushBatch(time0: number, frames: Float32Array, count: number): void {
        for (let i = 0; i < count; i++) {
            this.pushFrame(time0 + i / this.frameRate, frames, i * FRAME_STRIDE);
        }
    }

    // Processes one packed frame (rhythmConfig.ts layout) starting at `offset`, centred at `time` seconds.
    pushFrame(time: number, frames: Float32Array, offset: number): void {
        // The worklet restarts its time base after skipped blocks, which shows as a frame that is not one frame after
        // the previous one. Kick times from before it are on the old clock, so they go; the events that came with
        // this batch are still queued and survive.
        if (this.frames > 0 && Math.abs(time - (this.latestTime + 1 / this.frameRate)) > 0.5 / this.frameRate) {
            this.beat.clearKicks();
        }
        this.kickQueue.drainTo(this.beat);
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
                if (this.beat.gridEpoch !== this.seenGridEpoch) {
                    // The beats are numbered afresh on a new grid, so what the meter learned no longer lines up.
                    this.seenGridEpoch = this.beat.gridEpoch;
                    this.lead = 0;
                    this.meter.shrink(METER_GRID_RESET_KEEP);
                    this.syncMeterState();
                }
                state.tempoConfidence = this.tempo.confidence;
                // The held estimate looks at seconds of music, so one added note cannot move it, unlike the beat period,
                // which is corrected on every beat. Without an estimate the beat period stands in while the grid lasts.
                if (this.tempo.bpm > 0 || !this.beat.locked) {
                    state.bpm = this.tempo.bpm;
                }
                // The boundary's reference tempo is seeded by the first estimate it sees, so it waits for the decided one.
                if (
                    !this.tempo.deferring &&
                    this.applyBoundary(
                        this.boundary.pushTempo(time, this.tempo.rawBpm, this.tempo.confidence, this.beat.gridHitShare),
                    )
                ) {
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
        this.seen = Math.max(this.seen, time);
        this.since = Math.min(this.since, this.seen);
        // Everything below reads the one eased anchor, so the counters follow the published phase: they step when it
        // wraps, for a move under half a beat at an unchanged tempo. A move of more than half a beat is wrapped to the
        // nearest beat, and a period change at the re-align can step the counter without a wrap; it never goes down.
        const anchor = this.anchorTime + this.eased();
        // A beat is declared about 100 ms after it sounded, so a reader that asks for an earlier time (a positive sync
        // offset) can ask for a moment before the newest beat. That moment belongs to the end of the previous beat, so
        // the grid is run backwards, by at most one beat, instead of holding the phase at 0 until the time catches up.
        const beats = Math.max(-1, (time - anchor) / this.anchorPeriod);
        const wholeBeats = Math.floor(beats);
        const fraction = beats - wholeBeats;
        state.beatPhase = fraction;
        state.nextBeatTime = anchor + (wholeBeats + 1) * this.anchorPeriod;

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
        // `position` is -1 when the time is before the first beat of the bar, and the bar position must still be 0..1.
        state.barPhase = ((((position % meter) + meter) % meter) + fraction) / meter;
        // Counters never go backwards, even if the downbeat position was just corrected.
        const downbeatTarget = this.downbeatBase + this.declaredDownbeats + Math.floor(position / meter);
        if (downbeatTarget > state.downbeatCount) {
            state.downbeatCount = downbeatTarget;
        }
    }

    // The published anchor's lead over the declared one: all of the move when the glide starts, none after it.
    private eased(): number {
        const left = 1 - Math.max(0, this.seen - this.since) / this.span;
        // A glide with no length has no time left, or none that is a number; either way it is over.
        return left > 0 ? this.lead * left : 0;
    }

    private countSongChange(): void {
        this.state.songChangeCount++;
    }

    // Forgets everything learned (a new source, or the music ended). `countAsSongChange` increments songChangeCount.
    hardReset(countAsSongChange: boolean): void {
        this.clear(true);
        if (countAsSongChange) {
            this.countSongChange();
        }
    }

    // The detector that reported a hard boundary has already reset itself and is waiting for the silence to end, so it
    // must not be reset again by the clear it caused.
    private clear(resetBoundary: boolean): void {
        // BeatTracker.reset() clears its stored kicks; the queue is cleared here.
        this.kickQueue.clear();
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
        this.seenGridEpoch = 0;
        this.beatBase = this.state.beatCount;
        this.downbeatBase = this.state.downbeatCount;
        this.declaredDownbeats = 0;
        this.hasAnchor = false;
        this.lead = 0;
        this.since = 0;
        this.seen = 0;
        clearRhythmState(this.state);
    }

    // Returns true when the analysis was cleared, so the caller stops using the frame.
    private applyBoundary(kind: BoundaryKind): boolean {
        if (kind === BOUNDARY_NONE) {
            return false;
        }
        if (kind === BOUNDARY_HARD) {
            this.clear(false);
            this.countSongChange();
            return true;
        }
        if (kind === BOUNDARY_SOFT) {
            // Keep a fifth of the evidence: enough that a false alarm (a chorus) heals quickly, little enough that a
            // real change takes over within a few bars.
            this.tempo.keepRecent(NOVELTY_RECENT_SECONDS);
            this.meter.shrink(SOFT_RESET_KEEP);
            this.syncMeterState();
            this.countSongChange();
        }
        return false;
    }

    private handleBeat(): void {
        const beatIndex = this.beat.beatCount;
        const period = this.beat.lastBeatPeriod;
        this.measureBeat(this.beat.lastBeatTime, period);
        this.meter.addBeat(beatIndex, this.featureKick, this.featureTotal, this.featureChroma, period);
        this.syncMeterState();

        // The new anchor starts `lead` seconds after the declared beat (before it when lead is negative, a backward
        // move), so that at the newest time shown it gives the phase on show (to the nearest beat), and eases back to
        // the declared beat. The gap is taken in beats of each anchor's own period, so a
        // tempo change at the re-align (a halving) changes how fast the phase runs but does not make it jump. A move
        // at most the minimum, the first anchor and the first anchor of a new grid start no glide.
        let move = 0;
        if (this.hasAnchor && this.anchorEpoch === this.beat.gridEpoch) {
            const shown = (this.seen - this.anchorTime - this.eased()) / this.anchorPeriod;
            const gap = (this.seen - this.beat.lastBeatTime) / period - shown;
            move = (gap - Math.floor(gap + 0.5)) * period;
        }
        this.lead = Math.abs(move) > PHASE_GLIDE_MIN_MS / 1000 ? move : 0;
        // A 0 ms glide is the switch back to the old jump (C3), so only a glide that is on is stretched.
        this.span = PHASE_GLIDE_MS > 0 ? Math.max(PHASE_GLIDE_MS / 1000, -2 * move) : 0;
        this.since = Infinity;
        this.anchorEpoch = this.beat.gridEpoch;
        this.hasAnchor = true;
        this.anchorTime = this.beat.lastBeatTime;
        this.anchorPeriod = period;
        this.anchorBeatIndex = beatIndex;
        if (this.meter.barPosition(beatIndex) === 0) {
            this.declaredDownbeats++;
        }
        if (this.tempo.bpm === 0 && !this.tempo.deferring) {
            this.state.bpm = 60 / period;
        }
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
        const beforeCount = this.sumChroma(
            beatBack + gap,
            beatBack + Math.round(0.5 * period * this.frameRate),
            this.chromaBefore,
        );
        const afterCount = this.sumChroma(
            Math.max(0, beatBack - Math.round(BEAT_WINDOW_FRACTION * period * this.frameRate)),
            beatBack,
            this.chromaAfter,
        );
        let dot = 0;
        let normBefore = 0;
        let normAfter = 0;
        for (let i = 0; i < CHROMA_BINS; i++) {
            dot += this.chromaBefore[i] * this.chromaAfter[i];
            normBefore += this.chromaBefore[i] * this.chromaBefore[i];
            normAfter += this.chromaAfter[i] * this.chromaAfter[i];
        }
        this.featureChroma =
            beforeCount > 0 && afterCount > 0 && normBefore > EPSILON && normAfter > EPSILON
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
