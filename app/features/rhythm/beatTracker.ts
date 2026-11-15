import {
    BEAT_ENVELOPE_MEAN_SMOOTHING,
    BEAT_HISTORY_SECONDS,
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
// (20 at 0.95). When a place at least PHASE_MIN_SHIFT of a beat from the grid collects PHASE_SHIFT_RATIO times the
// energy the grid's own place does for PHASE_SHIFT_BEATS beats in a row, the grid moves there. A ratio of 1.3 was too
// strict to fix the reference track, and 1.1 with a shorter memory worked but sits closer to flapping. Places nearer
// than PHASE_MIN_SHIFT are left to the normal correction, which already pulls the grid gradually.
const PHASE_BINS = 16;
const PHASE_DECAY = 0.95;
const PHASE_MIN_SHIFT = 0.25;
const PHASE_SHIFT_RATIO = 1.15;
const PHASE_SHIFT_BEATS = 4;

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

    // Tells the tracker the current tempo estimate in BPM (0 = unknown). A large change rebuilds the grid.
    setTempo(bpm: number): void {
        this.tempoPeriod = bpm > 0 ? 60 / bpm : 0;
        if (this.aligned) {
            if (this.tempoPeriod === 0) {
                return;
            }
            const ratio = this.tempoPeriod / this.period;
            const factor = ratio > 1 ? 2 : 0.5;
            if (Math.abs(ratio / factor - 1) <= BEAT_OCTAVE_TOLERANCE) {
                this.changeOctave(factor);
            } else if (Math.abs(ratio - 1) > BEAT_REINIT_TEMPO_RATIO) {
                this.aligned = false;
                this.epoch++;
            }
        }
    }

    // The tempo moved by exactly one octave: the same music counted at the other level. The grid is kept, so beats
    // keep landing on the same music and the epoch (and with it the meter's evidence and the beat numbering) is not
    // broken. The period is scaled at once rather than followed slowly. Halving the tempo (factor 2) keeps every second
    // beat, starting with the one after the latest declared; doubling it adds a beat between each pair of old ones.
    // Numbering carries on by one per beat of the new grid, so the count advances half as fast after a halving and twice
    // as fast after a doubling. The next beat is placed one new period after the latest declared beat, which is also
    // where consumers extrapolate to, (after a doubling that can already be in the past, and then the beat is declared at once).
    private changeOctave(factor: number): void {
        const base = this.declared > 0 ? this.lastBeat : this.pendingBeat - this.period;
        this.period *= factor;
        this.pendingBeat = base + this.period;
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
                this.tempoPeriod > 0 &&
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
        this.period = 0;
        this.pendingBeat = 0;
        this.aligned = false;
        this.lastBeat = 0;
        this.declared = 0;
        this.epoch = 0;
        this.missedBeats = 0;
        // A reset tracker must not carry energy or a streak of wins from the music it was following before.
        this.phaseBins.fill(0);
        this.phaseWins = 0;
    }

    // Finds the beat phase for the current tempo by sliding a comb of pulses, one tempo period apart, over the
    // recent envelope and keeping the offset where it collects the most onset energy.
    private align(): void {
        const periodFrames = Math.round(this.tempoPeriod * this.frameRate);
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
                const back = offset + Math.round(j * this.tempoPeriod * this.frameRate);
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
        this.period = this.tempoPeriod;
        this.pendingBeat = this.times[this.ringIndex(bestOffset)];
        this.phaseBins.fill(0);
        this.phaseWins = 0;
        // When the grid is rebuilt, the aligned beat can be one that was already declared on the old grid. Declaring
        // it again would shift every later beat index by one, and the meter would put the downbeat on the wrong beat.
        if (this.declared > 0) {
            while (this.pendingBeat < this.lastBeat + 0.5 * this.period) {
                this.pendingBeat += this.period;
            }
        }
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
        } else {
            this.missedBeats++;
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
    // the grid and holds clearly more energy than the grid's own window for several beats in a row, the next beat moves
    // there. The epoch is not bumped: it is the same music and tempo, so beat numbering and the meter's evidence carry
    // on. The streak requirement keeps one loud off-beat fill from moving the grid.
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
        if (!this.aligned || Math.abs(offset) < PHASE_MIN_SHIFT || bestSum < PHASE_SHIFT_RATIO * onGrid) {
            this.phaseWins = 0;
            return;
        }
        if (++this.phaseWins < PHASE_SHIFT_BEATS) {
            return;
        }
        this.pendingBeat += offset * this.period;
        // A backwards move must not put the next beat so close to the one just declared that the two merge.
        if (this.pendingBeat < this.lastBeat + 0.5 * this.period) {
            this.pendingBeat += this.period;
        }
        bins.fill(0);
        this.phaseWins = 0;
    }

    // Ring index of the frame `back` frames before the newest one.
    private ringIndex(back: number): number {
        return (this.head - 1 - back + 2 * this.capacity) % this.capacity;
    }
}
