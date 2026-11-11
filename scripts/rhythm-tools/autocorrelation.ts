import {
    TEMPO_COMB_PARTIALS,
    TEMPO_COMPETITOR_EXCLUSION_OCTAVES,
    TEMPO_DOUBLE_LAG_WEIGHT,
    TEMPO_FASTER_DIVISORS,
    TEMPO_FASTER_PULSE_RATIO,
    TEMPO_FASTER_TOLERANCE,
    TEMPO_FULL_CONFIDENCE_PEAK,
    TEMPO_HISTORY_SECONDS,
    TEMPO_MAX_BPM,
    TEMPO_MIN_BPM,
    TEMPO_MIN_HISTORY_SECONDS,
    TEMPO_PRIOR_BPM,
    TEMPO_PRIOR_SIGMA_OCTAVES,
    TEMPO_REFINE_RANGE,
    TEMPO_REFINE_STEP,
    TEMPO_RELATED_MAX_MULTIPLE,
} from '../../app/features/rhythm/rhythmConfig';

// A read-only mirror of the maths in TempoTracker.update (app/features/rhythm/tempo.ts), kept apart from it because the
// tracker keeps its working arrays private and the probe has to look at them. It uses the same constants and the same
// single-precision arrays, and probe.test.ts checks that its estimate equals the real tracker's, so a change to
// tempo.ts that this file does not follow fails that spec instead of quietly skewing the evidence tables.

export interface TempoGeometry {
    frameRate: number;
    // Frames of history the tracker keeps, the shortest and longest lag it considers, and the frames needed to estimate.
    capacity: number;
    minLag: number;
    maxLag: number;
    minFrames: number;
    // Length of the tracker's correlation array.
    correlationLength: number;
}

export function tempoGeometry(frameRate: number): TempoGeometry {
    const capacity = Math.ceil(TEMPO_HISTORY_SECONDS * frameRate);
    return {
        frameRate,
        capacity,
        minLag: Math.max(2, Math.floor((frameRate * 60) / TEMPO_MAX_BPM)),
        maxLag: Math.ceil((frameRate * 60) / TEMPO_MIN_BPM),
        minFrames: Math.ceil(TEMPO_MIN_HISTORY_SECONDS * frameRate),
        correlationLength: Math.floor(capacity / 2) + 2,
    };
}

export interface Correlation {
    // Autocorrelation normalized by the zero-lag energy (1.0 at lag 0), valid up to `lagLimit`.
    correlation: Float32Array;
    lagLimit: number;
    // Frames in the window.
    n: number;
    // True when the window had no energy, so there is nothing to correlate.
    silent: boolean;
}

// The tracker's series preparation and autocorrelation over the `capacity` frames before `end`: the mean removed, one
// [1 2 1] / 4 smoothing pass, then the normalized autocorrelation up to half the window. Returns undefined while there
// are too few frames for the tracker to estimate at all.
export function correlateWindow(
    values: ArrayLike<number>,
    end: number,
    geometry: TempoGeometry,
): Correlation | undefined {
    const n = Math.min(end, geometry.capacity);
    if (n < geometry.minFrames) {
        return undefined;
    }
    const series = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
        series[i] = values[end - n + i];
        mean += series[i];
    }
    mean /= n;
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
    const lagLimit = Math.min(Math.floor(n / 2), geometry.correlationLength - 2);
    const correlation = new Float32Array(geometry.correlationLength);
    if (energy < 1e-12) {
        return { correlation, lagLimit, n, silent: true };
    }
    for (let lag = 0; lag <= lagLimit; lag++) {
        let sum = 0;
        for (let i = lag; i < n; i++) {
            sum += series[i] * series[i - lag];
        }
        correlation[lag] = sum / (n - lag) / energy;
    }
    return { correlation, lagLimit, n, silent: false };
}

// Log-Gaussian weight around the prior tempo, 1.0 at the prior.
function prior(lag: number, frameRate: number): number {
    const bpm = (60 * frameRate) / lag;
    const octaves = Math.log2(bpm / TEMPO_PRIOR_BPM) / TEMPO_PRIOR_SIGMA_OCTAVES;
    return Math.exp(-0.5 * octaves * octaves);
}

// True when one lag is (nearly) a whole multiple of the other: the same pulse at a different metrical level.
export function isRelatedLag(lag: number, reference: number): boolean {
    const ratio = Math.max(lag, reference) / Math.min(lag, reference);
    const multiple = Math.round(ratio);
    return (
        multiple <= TEMPO_RELATED_MAX_MULTIPLE &&
        Math.abs(Math.log2(ratio / multiple)) < TEMPO_COMPETITOR_EXCLUSION_OCTAVES
    );
}

export interface TempoEstimate {
    // The winning integer lag before the comb refinement, and the refined lag the tracker turns into BPM.
    bestLag: number;
    refinedLag: number;
    bpm: number;
    confidence: number;
    // The strongest rival that is not the same pulse, 0 when there is none.
    rivalLag: number;
    rivalBpm: number;
}

const NO_ESTIMATE: TempoEstimate = { bestLag: 0, refinedLag: 0, bpm: 0, confidence: 0, rivalLag: 0, rivalBpm: 0 };

// The tracker's estimate from a correlation: peak scoring with the double-lag bonus and prior, the faster-pulse
// takeover, the rival search, the confidence and the comb refinement.
export function estimateTempo(window: Correlation, geometry: TempoGeometry): TempoEstimate {
    if (window.silent) {
        return NO_ESTIMATE;
    }
    const { correlation, lagLimit } = window;
    const { frameRate, minLag } = geometry;
    const scores = new Float32Array(geometry.maxLag + 2);
    const lastLag = Math.min(geometry.maxLag, lagLimit - 1);
    let bestLag = -1;
    let bestScore = 0;
    for (let lag = minLag; lag <= lastLag; lag++) {
        const value = correlation[lag];
        if (value <= 0 || value < correlation[lag - 1] || value < correlation[lag + 1]) {
            scores[lag] = 0;
            continue;
        }
        let score = value;
        if (lag * 2 <= lagLimit) {
            score += TEMPO_DOUBLE_LAG_WEIGHT * correlation[lag * 2];
        }
        score *= prior(lag, frameRate);
        scores[lag] = score;
        if (score > bestScore) {
            bestScore = score;
            bestLag = lag;
        }
    }
    if (bestLag < 0) {
        return NO_ESTIMATE;
    }

    const peakNear = (target: number): number => {
        const from = Math.max(minLag, Math.floor(target * (1 - TEMPO_FASTER_TOLERANCE)));
        const to = Math.min(lastLag, Math.ceil(target * (1 + TEMPO_FASTER_TOLERANCE)));
        let best = -1;
        for (let lag = from; lag <= to; lag++) {
            if (scores[lag] > 0 && (best < 0 || correlation[lag] > correlation[best])) {
                best = lag;
            }
        }
        return best;
    };
    let switched = true;
    while (switched) {
        switched = false;
        for (const divisor of TEMPO_FASTER_DIVISORS) {
            const faster = peakNear(bestLag / divisor);
            if (
                faster > 0 &&
                correlation[faster] * prior(faster, frameRate) >=
                    TEMPO_FASTER_PULSE_RATIO * correlation[bestLag] * prior(bestLag, frameRate)
            ) {
                bestLag = faster;
                bestScore = scores[faster];
                switched = true;
                break;
            }
        }
    }

    let runnerUp = 0;
    let rivalLag = 0;
    for (let lag = minLag; lag <= lastLag; lag++) {
        if (isRelatedLag(lag, bestLag)) {
            continue;
        }
        if (scores[lag] > runnerUp) {
            runnerUp = scores[lag];
            rivalLag = lag;
        }
    }
    const margin = Math.min(1, Math.max(0, 1 - runnerUp / bestScore));
    const peak = Math.min(1, correlation[bestLag] / TEMPO_FULL_CONFIDENCE_PEAK);
    const confidence = peak * (0.5 + 0.5 * margin);

    let refinedLag = bestLag;
    let bestComb = -Infinity;
    for (let offset = -TEMPO_REFINE_RANGE; offset <= TEMPO_REFINE_RANGE + 1e-9; offset += TEMPO_REFINE_STEP) {
        const lag = bestLag * (1 + offset);
        const partials = Math.min(TEMPO_COMB_PARTIALS, Math.floor(lagLimit / lag));
        if (partials < 1) {
            continue;
        }
        let comb = 0;
        for (let k = 1; k <= partials; k++) {
            const position = k * lag;
            const index = Math.floor(position);
            const fraction = position - index;
            comb += correlation[index] * (1 - fraction) + correlation[index + 1] * fraction;
        }
        comb /= partials;
        if (comb > bestComb) {
            bestComb = comb;
            refinedLag = lag;
        }
    }
    return {
        bestLag,
        refinedLag,
        bpm: (60 * frameRate) / refinedLag,
        confidence,
        rivalLag,
        rivalBpm: rivalLag > 0 ? (60 * frameRate) / rivalLag : 0,
    };
}

// How far (as a fraction of the lag) the evidence search for a peak reaches either side of an expected lag.
export const PEAK_SEARCH_TOLERANCE = 0.03;

export interface Peak {
    height: number;
    // The lag of the parabola's vertex, so a peak between whole frames is located as well as measured.
    lag: number;
}

// The autocorrelation peak near a fractional `lag`: the highest whole lag within the tolerance (at least one frame
// either side), refined by a parabola through its neighbors so a period that falls between frames is not under-read.
// Undefined when the search would reach past the correlation that is trusted.
export function interpolatedPeak(window: Correlation, lag: number): Peak | undefined {
    const reach = Math.max(1, Math.ceil(lag * PEAK_SEARCH_TOLERANCE));
    const from = Math.max(1, Math.floor(lag) - reach);
    const to = Math.ceil(lag) + reach;
    if (to > window.lagLimit - 1) {
        return undefined;
    }
    const c = window.correlation;
    let best = from;
    for (let i = from; i <= to; i++) {
        if (c[i] > c[best]) {
            best = i;
        }
    }
    const left = c[best - 1];
    const middle = c[best];
    const right = c[best + 1];
    const curvature = left - 2 * middle + right;
    if (curvature >= 0) {
        return { height: middle, lag: best };
    }
    const shift = Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curvature));
    return { height: middle - 0.25 * (left - right) * shift, lag: best + shift };
}
