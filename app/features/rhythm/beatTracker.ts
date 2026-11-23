import {
    BEAT_ENVELOPE_MEAN_SMOOTHING,
    BEAT_HISTORY_SECONDS,
    BEAT_HIT_SHARE_RATE,
    BEAT_INIT_MIN_SECONDS,
    BEAT_INIT_PERIODS,
    BEAT_LOST_BEATS,
    BEAT_PEAK_MIN_RATIO,
    BEAT_PERIOD_GAIN,
    BEAT_PHASE_GAIN,
    BEAT_REINIT_TEMPO_RATIO,
    BEAT_TEMPO_FOLLOW,
    BEAT_WINDOW_FRACTION,
} from './rhythmConfig';

// How far a tempo move may be from an exact octave (a ratio of 2 or 0.5) and still count as the same pulse counted at
// the other level. It is the tempo tracker's own hysteresis (TEMPO_HYSTERESIS, 4%) so the two agree on what an octave
// is: a real move 195.7 to 98.0 is 1.997, far inside it, while a change of key tempo (a 10 to 12% jump) is outside.
const BEAT_OCTAVE_TOLERANCE = 0.04;

// Phase check. The first alignment sums only a few pulses, so on music with strong off-beat notes it can settle half a
// beat off, and the correction window (a fraction of a beat either side) can never see the real beat from there. So
// onset energy is also folded over the beat into PHASE_BINS bins, with a memory of about 1 / (1 - PHASE_DECAY) beats
// (20 at 0.95). When one place at least PHASE_MIN_SHIFT of a beat from the grid collects PHASE_SHIFT_RATIO times the
// energy the grid's own place does for PHASE_SHIFT_BEATS beats in a row, the grid moves there. A ratio of 1.2 fixed the
// reference track on fewer of its start-time variations and 1.25 on only some, so 1.15 it is. Places nearer than
// PHASE_MIN_SHIFT are left to the normal correction, which already pulls the grid gradually.
//
// The ratio alone is fooled by chance when there is little evidence or no real beat (sparse noise, eighth notes of
// equal strength), so at least PHASE_MIN_BEATS beats of evidence must exist, and a move turns the evidence with the
// grid instead of clearing it. Measured over 16 seeds of 120 s at 120 BPM, the two cut the moves on sparse noise from
// 208 to 63 and on equal eighth notes from 38 to 15, so such input can still move the grid about once in two minutes.
const PHASE_BINS = 16;
const PHASE_DECAY = 0.95;
const PHASE_MIN_SHIFT = 0.25;
const PHASE_SHIFT_RATIO = 1.15;
const PHASE_SHIFT_BEATS = 4;
const PHASE_MIN_BEATS = 8;

// How often (in frames) the tracker retries aligning its first beat grid while it has none.
const INIT_RETRY_FRAMES = 10;

// A causal predictive beat tracker, essentially a phase-locked loop. It predicts when the next beat falls (one tempo
// period after the last), then looks for the strongest onset near the prediction and nudges the phase and period
// towards it. Beats are declared a fraction of a period after they fall so the correction can see the onset;
// consumers extrapolate from `lastBeatTime` and `periodSeconds` to know where the beat is right now.
//
// Driven by frame time in seconds rather than a wall clock, so it can run offline. Allocation-free after the
// constructor.
export class BeatTracker {
    readonly frameRate: number;

    private readonly capacity: number;
    private readonly envelope: Float32Array;
    private readonly times: Float64Array;
    private readonly initMinFrames: number;
    private head = 0;
    private count = 0;
    private framesSinceInitTry = 0;
    private meanEnvelope = 0;

    private tempoPeriod = 0;
    // Twice the grid period when a halving unaligned the grid, until the search has run: a tempo estimate that drops to
    // 0 in that window must not strand the grid, so the search falls back on this period.
    private halvingPeriod = 0;
    private period = 0;
    private pendingBeat = 0;
    private aligned = false;
    private lastBeat = 0;
    private declared = 0;
    private epoch = 0;
    // Consecutive beats whose window held no onset strong enough to correct the phase.
    private missedBeats = 0;
    private readonly phaseBins = new Float32Array(PHASE_BINS);
    private phaseWins = 0;
    private phaseShifts = 0;
    private phaseBeats = 0;
    private hitShare = 1;
    private readonly phaseScratch = new Float32Array(PHASE_BINS);

    constructor(frameRate: number) {
        this.frameRate = frameRate;
        this.capacity = Math.ceil(BEAT_HISTORY_SECONDS * frameRate);
        this.envelope = new Float32Array(this.capacity);
        this.times = new Float64Array(this.capacity);
        this.initMinFrames = Math.ceil(BEAT_INIT_MIN_SECONDS * frameRate);
    }

    // True once a beat grid exists (a tempo is known and the phase has been aligned).
    get locked(): boolean {
        return this.aligned;
    }

    // Time in seconds of the most recently declared beat. Only meaningful when `locked` and `beatCount > 0`.
    get lastBeatTime(): number {
        return this.lastBeat;
    }

    // Current beat period in seconds, or 0 without a grid.
    get periodSeconds(): number {
        return this.aligned ? this.period : 0;
    }

    // The period the latest beat was declared with. Unlike `periodSeconds` it outlives a grid given up by that same beat,
    // so a reader never divides by a period of 0.
    get lastBeatPeriod(): number {
        return this.period;
    }

    // Number of beats declared since the last reset; the first beat is 1.
    get beatCount(): number {
        return this.declared;
    }

    // Increases whenever the grid was rebuilt (a tempo jump or octave change), which breaks the numbering of beats.
    get gridEpoch(): number {
        return this.epoch;
    }

    // How often the phase check moved the grid since the last reset. Read-only: for specs and DEV telemetry.
    get phaseShiftCount(): number {
        return this.phaseShifts;
    }

    // The recent share of beats whose window held an onset, 1 without a grid (nothing says the beat stopped). It says
    // whether the beat still sounds at its own grid places, which an autocorrelation peak cannot: a beat buried under a
    // louder 3:2 layer keeps hitting, while after a real change to 3/2 of the tempo only every other old beat does.
    get gridHitShare(): number {
        return this.aligned ? this.hitShare : 1;
    }

    // Tells the tracker the current tempo estimate in BPM (0 = unknown). A large change rebuilds the grid.
    setTempo(bpm: number): void {
        this.tempoPeriod = bpm > 0 ? 60 / bpm : 0;
        if (this.aligned) {
            if (this.tempoPeriod === 0) {
                return;
            }
            const ratio = this.tempoPeriod / this.period;
            if (Math.abs(ratio / 2 - 1) <= BEAT_OCTAVE_TOLERANCE) {
                // The tempo halved. The phase is searched again over the recent envelope rather than keeping every
                // second beat of the old grid: from double time the old grid inherits whatever error it had, and on
                // `low-bpm-rnb` (162 to 81) both of its halves sat a sixteenth early, a 183 ms median beat error that
                // the search takes to 24 ms. The epoch is not bumped, because the beats are still counted on from
                // where they were (align() never declares a beat twice), so the meter keeps what it learned. The search
                // runs on the next retry, as the first alignment does, so it also sees the onsets of the frames just
                // after the change: searching at once put `syncopationbass` (195.7 to 98) 3 ms further off.
                this.aligned = false;
                this.halvingPeriod = this.period * 2;
            } else if (Math.abs(ratio * 2 - 1) <= BEAT_OCTAVE_TOLERANCE) {
                this.doubleTempo();
            } else if (Math.abs(ratio - 1) > BEAT_REINIT_TEMPO_RATIO) {
                this.aligned = false;
                this.epoch++;
            }
        }
    }

    // The tempo doubled: the same music counted at the faster level. The grid is kept and a beat added between each pair
    // of old ones, so beats keep landing on the same music and the epoch (and with it the meter's evidence and the beat
    // numbering) is not broken. The period is halved at once rather than followed slowly, and numbering carries on by
    // one per beat of the new grid, so the count advances twice as fast. The next beat is placed one new period after
    // the latest declared beat, which is also where consumers extrapolate to (it can already be in the past, and then
    // the beat is declared at once).
    private doubleTempo(): void {
        const base = this.declared > 0 ? this.lastBeat : this.pendingBeat - this.period;
        this.period *= 0.5;
        this.pendingBeat = base + this.period;
        // The bins are fractions of the old period, so they say nothing about places in the new one, and the same goes
        // for the share of beats that found an onset: misses counted against the old period must not read as the new
        // grid failing.
        this.phaseBins.fill(0);
        this.phaseWins = 0;
        this.phaseBeats = 0;
        // The hits were counted against the old period too, and the grid now keeps every beat of the music it had.
        this.hitShare = 1;
    }

    // Advances to the frame at `time` (seconds, strictly increasing) with onset-envelope value `onset`. Returns true
    // when a beat was declared by this frame; its time is `lastBeatTime`.
    push(time: number, onset: number): boolean {
        this.envelope[this.head] = onset;
        this.times[this.head] = time;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
        this.meanEnvelope += (onset - this.meanEnvelope) * BEAT_ENVELOPE_MEAN_SMOOTHING;

        if (!this.aligned) {
            if (
                (this.tempoPeriod > 0 || this.halvingPeriod > 0) &&
                this.count >= this.initMinFrames &&
                ++this.framesSinceInitTry >= INIT_RETRY_FRAMES
            ) {
                this.framesSinceInitTry = 0;
                this.align();
            }
            return false;
        }
        // Fold this frame's onset into the bin for its place in the beat. Bin 0 is centered on the grid's beat, hence the
        // half-bin rounding, so the evidence for "the grid is right" and "a rival place is right" use the same bins.
        const phase = (time - this.pendingBeat) / this.period;
        const bin = Math.floor((phase - Math.floor(phase)) * PHASE_BINS + 0.5) % PHASE_BINS;
        this.phaseBins[bin] += onset;
        if (time < this.pendingBeat + BEAT_WINDOW_FRACTION * this.period) {
            return false;
        }
        this.declareBeat();
        return true;
    }

    reset(): void {
        this.head = 0;
        this.count = 0;
        this.framesSinceInitTry = 0;
        this.meanEnvelope = 0;
        this.tempoPeriod = 0;
        this.halvingPeriod = 0;
        this.period = 0;
        this.pendingBeat = 0;
        this.aligned = false;
        this.lastBeat = 0;
        this.declared = 0;
        this.epoch = 0;
        this.missedBeats = 0;
        this.phaseShifts = 0;
        this.hitShare = 1;
        // A reset tracker must not carry energy or a streak of wins from the music it was following before.
        this.phaseBins.fill(0);
        this.phaseWins = 0;
        this.phaseBeats = 0;
    }

    // Finds the beat phase for the current tempo by sliding a comb of pulses, one tempo period apart, over the
    // recent envelope and keeping the offset where it collects the most onset energy.
    private align(): void {
        const gridPeriod = this.tempoPeriod > 0 ? this.tempoPeriod : this.halvingPeriod;
        const periodFrames = Math.round(gridPeriod * this.frameRate);
        if (periodFrames < 2) {
            return;
        }
        const pulses = Math.min(BEAT_INIT_PERIODS, Math.floor((this.count - 1) / periodFrames));
        if (pulses < 3) {
            return;
        }
        let bestOffset = 0;
        let bestSum = -1;
        for (let offset = 0; offset < periodFrames; offset++) {
            let sum = 0;
            for (let j = 0; j < pulses; j++) {
                const back = offset + Math.round(j * gridPeriod * this.frameRate);
                if (back >= this.count) {
                    break;
                }
                sum += this.envelope[this.ringIndex(back)];
            }
            if (sum > bestSum) {
                bestSum = sum;
                bestOffset = offset;
            }
        }
        this.period = gridPeriod;
        this.halvingPeriod = 0;
        this.pendingBeat = this.times[this.ringIndex(bestOffset)];
        this.phaseBins.fill(0);
        this.phaseWins = 0;
        this.phaseBeats = 0;
        // When the grid is rebuilt, the aligned beat can be one that was already declared on the old grid. Declaring
        // it again would shift every later beat index by one, and the meter would put the downbeat on the wrong beat.
        if (this.declared > 0) {
            while (this.pendingBeat < this.lastBeat + 0.5 * this.period) {
                this.pendingBeat += this.period;
            }
        }
        this.hitShare = 1;
        this.aligned = true;
    }

    // Settles the pending beat: finds the strongest onset in the window around it, corrects the phase and period
    // towards it, then predicts the following beat.
    private declareBeat(): void {
        const window = BEAT_WINDOW_FRACTION * this.period;
        let peakValue = -1;
        let peakTime = this.pendingBeat;
        for (let back = 0; back < this.count; back++) {
            const index = this.ringIndex(back);
            const time = this.times[index];
            if (time < this.pendingBeat - window) {
                break;
            }
            if (time <= this.pendingBeat + window && this.envelope[index] > peakValue) {
                peakValue = this.envelope[index];
                peakTime = time;
            }
        }

        let beatTime = this.pendingBeat;
        if (peakValue > this.meanEnvelope * BEAT_PEAK_MIN_RATIO) {
            const error = peakTime - this.pendingBeat;
            beatTime += BEAT_PHASE_GAIN * error;
            this.period += BEAT_PERIOD_GAIN * error;
            this.missedBeats = 0;
            this.hitShare += (1 - this.hitShare) * BEAT_HIT_SHARE_RATE;
        } else {
            this.missedBeats++;
            this.hitShare -= this.hitShare * BEAT_HIT_SHARE_RATE;
        }
        // The tempo estimate is the better long-term reference; the onsets only steer the period between estimates.
        if (this.tempoPeriod > 0) {
            this.period += (this.tempoPeriod - this.period) * BEAT_TEMPO_FOLLOW;
        }

        this.lastBeat = beatTime;
        this.declared++;
        this.pendingBeat = beatTime + this.period;

        // The correction window only sees onsets near the prediction. If the music's beats now fall elsewhere (a
        // crossfade into a song at a similar tempo but another phase), every beat misses and the grid would stay on
        // the off-beat forever, so after a run of misses the phase is searched again from scratch.
        if (this.missedBeats >= BEAT_LOST_BEATS) {
            this.missedBeats = 0;
            this.aligned = false;
            this.epoch++;
        }
        this.checkPhase();
    }

    // Runs after every declared beat. Finds the 3-bin window with the most onset energy; if it is a real distance from
    // the grid and holds clearly more energy than the grid's own window for several beats in a row, the next beat moves there. The epoch is not bumped: it is the same music and tempo, so beat numbering
    // carries on. The evidence is turned with the grid rather than cleared, so the place just left has to earn a move
    // back against everything heard so far, not against a few beats.
    private checkPhase(): void {
        const bins = this.phaseBins;
        let best = 0;
        let bestSum = -1;
        for (let i = 0; i < PHASE_BINS; i++) {
            const sum = bins[(i + PHASE_BINS - 1) % PHASE_BINS] + bins[i] + bins[(i + 1) % PHASE_BINS];
            if (sum > bestSum) {
                bestSum = sum;
                best = i;
            }
        }
        const onGrid = bins[PHASE_BINS - 1] + bins[0] + bins[1];
        const offset = (best > PHASE_BINS / 2 ? best - PHASE_BINS : best) / PHASE_BINS;
        for (let i = 0; i < PHASE_BINS; i++) {
            bins[i] *= PHASE_DECAY;
        }
        this.phaseBeats++;
        if (!this.aligned || Math.abs(offset) < PHASE_MIN_SHIFT || bestSum < PHASE_SHIFT_RATIO * onGrid) {
            this.phaseWins = 0;
            this.phaseBeats = 0;
            return;
        }
        if (++this.phaseWins < PHASE_SHIFT_BEATS || this.phaseBeats < PHASE_MIN_BEATS) {
            return;
        }
        this.pendingBeat += offset * this.period;
        const scratch = this.phaseScratch;
        scratch.set(bins);
        for (let i = 0; i < PHASE_BINS; i++) {
            bins[i] = scratch[(i + best) % PHASE_BINS];
        }
        this.phaseWins = 0;
        this.phaseShifts++;
        this.phaseBeats = 0;
    }

    // Ring index of the frame `back` frames before the newest one.
    private ringIndex(back: number): number {
        return (this.head - 1 - back + 2 * this.capacity) % this.capacity;
    }
}
