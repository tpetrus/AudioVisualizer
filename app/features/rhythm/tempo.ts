import {
    TEMPO_COMB_PARTIALS,
    TEMPO_COMPETITOR_EXCLUSION_OCTAVES,
    TEMPO_DOUBLE_LAG_WEIGHT,
    TEMPO_FASTER_DIVISORS,
    TEMPO_FASTER_PULSE_RATIO,
    TEMPO_FASTER_TOLERANCE,
    TEMPO_RELATED_MAX_MULTIPLE,
    TEMPO_FULL_CONFIDENCE_PEAK,
    TEMPO_HISTORY_SECONDS,
    TEMPO_HYSTERESIS,
    TEMPO_LOCK_CONFIDENCE,
    TEMPO_LOSE_CONFIDENCE,
    TEMPO_LOSE_ESTIMATES,
    TEMPO_MAX_BPM,
    TEMPO_MIN_BPM,
    TEMPO_MIN_HISTORY_SECONDS,
    TEMPO_PRIOR_BPM,
    TEMPO_PRIOR_SIGMA_OCTAVES,
    TEMPO_REFINE_RANGE,
    TEMPO_REFINE_STEP,
    TEMPO_SMOOTHING,
    TEMPO_SWITCH_ESTIMATES,
} from './rhythmConfig';

// True when one lag is (nearly) a whole multiple of the other, up to TEMPO_RELATED_MAX_MULTIPLE: the same pulse
// counted at a different metrical level, which is not a rival tempo.
function isRelatedPulse(lag: number, reference: number): boolean {
    const ratio = Math.max(lag, reference) / Math.min(lag, reference);
    const multiple = Math.round(ratio);
    return multiple <= TEMPO_RELATED_MAX_MULTIPLE
        && Math.abs(Math.log2(ratio / multiple)) < TEMPO_COMPETITOR_EXCLUSION_OCTAVES;
}

// Estimates tempo from the onset envelope: autocorrelation over the last few seconds, weighted by a log-Gaussian
// prior around 120 BPM, refined by a comb of autocorrelation multiples, and held steady by hysteresis. Pure: the
// caller pushes one envelope value per frame and asks for an estimate every ~250 ms.
export class TempoTracker {
    readonly frameRate: number;

    private readonly capacity: number;
    private readonly ring: Float32Array;
    // Chronological, mean-removed copy of the ring, so the autocorrelation loops are plain.
    private readonly series: Float32Array;
    // Autocorrelation normalised by the zero-lag energy (1.0 at lag 0).
    private readonly correlation: Float32Array;
    private readonly scores: Float32Array;
    private readonly minLag: number;
    private readonly maxLag: number;
    private readonly minFrames: number;
    private head = 0;
    private count = 0;

    private held = 0;
    private raw = 0;
    private confidenceValue = 0;
    private challenger = 0;
    private challengerWins = 0;
    private lowConfidenceRun = 0;

    constructor(frameRate: number) {
        this.frameRate = frameRate;
        this.capacity = Math.ceil(TEMPO_HISTORY_SECONDS * frameRate);
        this.ring = new Float32Array(this.capacity);
        this.series = new Float32Array(this.capacity);
        this.correlation = new Float32Array(Math.floor(this.capacity / 2) + 2);
        this.minLag = Math.max(2, Math.floor((frameRate * 60) / TEMPO_MAX_BPM));
        this.maxLag = Math.ceil((frameRate * 60) / TEMPO_MIN_BPM);
        this.scores = new Float32Array(this.maxLag + 2);
        this.minFrames = Math.ceil(TEMPO_MIN_HISTORY_SECONDS * frameRate);
    }

    // The held tempo in BPM, or 0 while unknown. It only changes when the evidence is persistent.
    get bpm(): number {
        return this.held;
    }

    // The latest unfiltered estimate in BPM (0 when there was no usable peak). Song-change detection compares it
    // with the reference tempo, which the hysteresis on `bpm` would otherwise hide.
    get rawBpm(): number {
        return this.raw;
    }

    // 0..1 trust in the latest estimate.
    get confidence(): number {
        return this.confidenceValue;
    }

    // Adds one onset-envelope value (one per analysis frame).
    push(value: number): void {
        this.ring[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
    }

    // Recomputes the estimate from the history. Returns false while there is too little history.
    update(): boolean {
        const n = this.count;
        if (n < this.minFrames) {
            return false;
        }
        const series = this.series;
        const start = (this.head - n + this.capacity) % this.capacity;
        let mean = 0;
        for (let i = 0; i < n; i++) {
            series[i] = this.ring[(start + i) % this.capacity];
            mean += series[i];
        }
        mean /= n;
        // A [1 2 1] / 4 smoothing pass widens each onset to a few frames. Without it a beat period that falls between
        // two whole frames (37.5 frames at 160 BPM) splits its peak over two lags and loses to a slower pulse.
        let previous = series[0] - mean;
        for (let i = 0; i < n; i++) {
            const current = series[i] - mean;
            const next = i + 1 < n ? series[i + 1] - mean : current;
            series[i] = 0.25 * previous + 0.5 * current + 0.25 * next;
            previous = current;
        }
        let energy = 0;
        for (let i = 0; i < n; i++) {
            energy += series[i] * series[i];
        }
        energy /= n;
        if (energy < 1e-12) {
            this.finishEstimate(0, 0);
            return true;
        }

        // Lags past half the history overlap too little to be trusted.
        const lagLimit = Math.min(Math.floor(n / 2), this.correlation.length - 2);
        const correlation = this.correlation;
        for (let lag = 0; lag <= lagLimit; lag++) {
            let sum = 0;
            for (let i = lag; i < n; i++) {
                sum += series[i] * series[i - lag];
            }
            correlation[lag] = sum / (n - lag) / energy;
        }

        const lastLag = Math.min(this.maxLag, lagLimit - 1);
        let bestLag = -1;
        let bestScore = 0;
        for (let lag = this.minLag; lag <= lastLag; lag++) {
            const value = correlation[lag];
            if (value <= 0 || value < correlation[lag - 1] || value < correlation[lag + 1]) {
                this.scores[lag] = 0;
                continue;
            }
            // Adding the double lag rewards a pulse that repeats every second beat too, which separates the true
            // beat period from its subdivisions.
            let score = value;
            if (lag * 2 <= lagLimit) {
                score += TEMPO_DOUBLE_LAG_WEIGHT * correlation[lag * 2];
            }
            score *= this.prior(lag);
            this.scores[lag] = score;
            if (score > bestScore) {
                bestScore = score;
                bestLag = lag;
            }
        }
        if (bestLag < 0) {
            this.finishEstimate(0, 0);
            return true;
        }

        // A kick that only lands once per bar makes the bar (or half bar) the strongest periodicity, which reads as
        // half or a third of the real tempo. The beat is the fastest pulse that is still well supported, so a peak at
        // a half or a third of the winning lag takes over when its correlation is nearly as strong. The comparison
        // leaves out the double-lag bonus, which is exactly what favours the slower pulse (its double lag is the bar).
        let switched = true;
        while (switched) {
            switched = false;
            for (const divisor of TEMPO_FASTER_DIVISORS) {
                const faster = this.peakNear(bestLag / divisor, lastLag);
                if (faster > 0
                    && correlation[faster] * this.prior(faster) >= TEMPO_FASTER_PULSE_RATIO * correlation[bestLag] * this.prior(bestLag)) {
                    bestLag = faster;
                    bestScore = this.scores[faster];
                    switched = true;
                    break;
                }
            }
        }

        // The strongest rival that is not the same pulse (the winner itself, or a multiple or fraction of it).
        let runnerUp = 0;
        for (let lag = this.minLag; lag <= lastLag; lag++) {
            if (isRelatedPulse(lag, bestLag)) {
                continue;
            }
            runnerUp = Math.max(runnerUp, this.scores[lag]);
        }
        const margin = Math.min(1, Math.max(0, 1 - runnerUp / bestScore));
        const peak = Math.min(1, correlation[bestLag] / TEMPO_FULL_CONFIDENCE_PEAK);
        const confidence = peak * (0.5 + 0.5 * margin);

        const refinedLag = this.refine(bestLag, lagLimit);
        this.finishEstimate((60 * this.frameRate) / refinedLag, confidence);
        return true;
    }

    // Keeps only the newest `seconds` of history, so a new song is not analysed together with the old one.
    keepRecent(seconds: number): void {
        this.count = Math.min(this.count, Math.round(seconds * this.frameRate));
        this.challengerWins = 0;
    }

    reset(): void {
        this.head = 0;
        this.count = 0;
        this.held = 0;
        this.raw = 0;
        this.confidenceValue = 0;
        this.challenger = 0;
        this.challengerWins = 0;
        this.lowConfidenceRun = 0;
    }

    // The strongest autocorrelation peak within TEMPO_FASTER_TOLERANCE of `target` lags, or -1 if there is none.
    private peakNear(target: number, lastLag: number): number {
        const from = Math.max(this.minLag, Math.floor(target * (1 - TEMPO_FASTER_TOLERANCE)));
        const to = Math.min(lastLag, Math.ceil(target * (1 + TEMPO_FASTER_TOLERANCE)));
        let best = -1;
        for (let lag = from; lag <= to; lag++) {
            if (this.scores[lag] > 0 && (best < 0 || this.correlation[lag] > this.correlation[best])) {
                best = lag;
            }
        }
        return best;
    }

    // Log-Gaussian weight around the prior tempo, 1.0 at the prior.
    private prior(lag: number): number {
        const bpm = (60 * this.frameRate) / lag;
        const octaves = Math.log2(bpm / TEMPO_PRIOR_BPM) / TEMPO_PRIOR_SIGMA_OCTAVES;
        return Math.exp(-0.5 * octaves * octaves);
    }

    // Searches a few percent around the coarse peak for the lag whose multiples line up best with the
    // autocorrelation. Multiples amplify a small period error, which gives a finer tempo than the integer-frame peak.
    private refine(coarseLag: number, lagLimit: number): number {
        let bestLag = coarseLag;
        let bestComb = -Infinity;
        for (let offset = -TEMPO_REFINE_RANGE; offset <= TEMPO_REFINE_RANGE + 1e-9; offset += TEMPO_REFINE_STEP) {
            const lag = coarseLag * (1 + offset);
            const partials = Math.min(TEMPO_COMB_PARTIALS, Math.floor(lagLimit / lag));
            if (partials < 1) {
                continue;
            }
            let comb = 0;
            for (let k = 1; k <= partials; k++) {
                const position = k * lag;
                const index = Math.floor(position);
                const fraction = position - index;
                comb += this.correlation[index] * (1 - fraction) + this.correlation[index + 1] * fraction;
            }
            comb /= partials;
            if (comb > bestComb) {
                bestComb = comb;
                bestLag = lag;
            }
        }
        return bestLag;
    }

    // Applies hysteresis: small changes nudge the held tempo, a different tempo must persist before it replaces it.
    private finishEstimate(bpm: number, confidence: number): void {
        this.raw = bpm;
        this.confidenceValue = confidence;

        if (bpm === 0 || confidence < TEMPO_LOSE_CONFIDENCE) {
            this.lowConfidenceRun++;
            this.challengerWins = 0;
            if (this.lowConfidenceRun >= TEMPO_LOSE_ESTIMATES) {
                this.held = 0;
            }
            return;
        }
        this.lowConfidenceRun = 0;

        if (this.held === 0) {
            if (confidence >= TEMPO_LOCK_CONFIDENCE) {
                this.held = bpm;
            }
            return;
        }
        if (Math.abs(bpm / this.held - 1) <= TEMPO_HYSTERESIS) {
            this.held += (bpm - this.held) * TEMPO_SMOOTHING;
            this.challengerWins = 0;
            return;
        }
        if (confidence < TEMPO_LOCK_CONFIDENCE) {
            this.challengerWins = 0;
            return;
        }
        if (this.challengerWins > 0 && Math.abs(bpm / this.challenger - 1) <= TEMPO_HYSTERESIS) {
            this.challengerWins++;
            this.challenger += (bpm - this.challenger) * TEMPO_SMOOTHING;
        } else {
            this.challenger = bpm;
            this.challengerWins = 1;
        }
        if (this.challengerWins >= TEMPO_SWITCH_ESTIMATES) {
            this.held = this.challenger;
            this.challengerWins = 0;
        }
    }
}
