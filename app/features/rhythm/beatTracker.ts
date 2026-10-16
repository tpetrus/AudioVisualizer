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
            if (Math.abs(this.tempoPeriod / this.period - 1) > BEAT_REINIT_TEMPO_RATIO) {
                this.aligned = false;
                this.epoch++;
            }
        }
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
    }

    // Ring index of the frame `back` frames before the newest one.
    private ringIndex(back: number): number {
        return (this.head - 1 - back + 2 * this.capacity) % this.capacity;
    }
}
