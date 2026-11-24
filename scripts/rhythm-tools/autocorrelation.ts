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
    TEMPO_OCTAVE_PRIOR_BPM,
    TEMPO_OCTAVE_PRIOR_SIGMA_OCTAVES,
    TEMPO_PRIOR_BPM,
    TEMPO_PRIOR_SIGMA_OCTAVES,
    TEMPO_REFINE_RANGE,
    TEMPO_REFINE_STEP,
    TEMPO_RELATED_MAX_MULTIPLE,
    TEMPO_TIE_FASTER_MIN_RATIO,
    TEMPO_TIE_MIN_RATIO,
    TEMPO_TIE_MULTIPLES,
    TEMPO_TIE_RIVAL_LAG_FACTORS,
    TEMPO_TIE_SWITCH_FACTOR,
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

// Log-Gaussian weight of a pulse's tempo around `center` BPM, 1.0 at the center, `sigma` in octaves.
function logGaussian(lag: number, frameRate: number, center: number, sigma: number): number {
    const octaves = Math.log2((60 * frameRate) / lag / center) / sigma;
    return Math.exp(-0.5 * octaves * octaves);
}

// The main prior, and the narrower one that chooses between two pulses one octave apart (see rhythmConfig.ts).
function prior(lag: number, frameRate: number): number {
    return logGaussian(lag, frameRate, TEMPO_PRIOR_BPM, TEMPO_PRIOR_SIGMA_OCTAVES);
}

function octavePrior(lag: number, frameRate: number): number {
    return logGaussian(lag, frameRate, TEMPO_OCTAVE_PRIOR_BPM, TEMPO_OCTAVE_PRIOR_SIGMA_OCTAVES);
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
// takeover, the octave prior, the rival search, the confidence and the comb refinement.
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
        const score = lagScore(window, frameRate, lag);
        scores[lag] = score;
        if (score <= 0) {
            continue;
        }
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
    // Interpolated peak height times the octave prior; NaN (which fails every comparison) when the peak is out of reach.
    const octaveWeightedHeight = (lag: number): number =>
        (interpolatedPeak(window, lag)?.height ?? NaN) * octavePrior(lag, frameRate);
    let switched = true;
    while (switched) {
        switched = false;
        for (const divisor of TEMPO_FASTER_DIVISORS) {
            const faster = peakNear(bestLag / divisor);
            if (faster <= 0) {
                continue;
            }
            // A half-lag pulse is judged by the octave prior on interpolated heights, a third by the main prior.
            const wins =
                divisor === 2
                    ? octaveWeightedHeight(faster) >= octaveWeightedHeight(bestLag)
                    : correlation[faster] * prior(faster, frameRate) >=
                      TEMPO_FASTER_PULSE_RATIO * correlation[bestLag] * prior(bestLag, frameRate);
            if (wins) {
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

    const refinedLag = refineLag(window, bestLag);
    return {
        bestLag,
        refinedLag,
        bpm: (60 * frameRate) / refinedLag,
        confidence,
        rivalLag,
        rivalBpm: rivalLag > 0 ? (60 * frameRate) / rivalLag : 0,
    };
}

// Searches a few percent around the coarse lag for the lag whose multiples line up best with the correlation (the
// tracker's `refine`).
export function refineLag(window: Correlation, coarseLag: number): number {
    const { correlation, lagLimit } = window;
    let refinedLag = coarseLag;
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
            comb += correlation[index] * (1 - fraction) + correlation[index + 1] * fraction;
        }
        comb /= partials;
        if (comb > bestComb) {
            bestComb = comb;
            refinedLag = lag;
        }
    }
    return refinedLag;
}

// The comb score of a lag (the tracker's `scores[lag]`): 0 unless the lag is a local peak of the correlation, otherwise
// its height plus the weighted height at double the lag, times the tempo prior.
function lagScore(window: Correlation, frameRate: number, lag: number): number {
    const { correlation, lagLimit } = window;
    const value = correlation[lag];
    if (value <= 0 || value < correlation[lag - 1] || value < correlation[lag + 1]) {
        return 0;
    }
    let score = value;
    if (lag * 2 <= lagLimit) {
        score += TEMPO_DOUBLE_LAG_WEIGHT * correlation[lag * 2];
    }
    return score * prior(lag, frameRate);
}

// The scored peak with the highest correlation within TEMPO_FASTER_TOLERANCE of `target` lags and no later than
// `lastLag`, or -1 (the tracker's `peakNear`).
function fasterPeakNear(window: Correlation, geometry: TempoGeometry, target: number, lastLag: number): number {
    const { correlation } = window;
    const from = Math.max(geometry.minLag, Math.floor(target * (1 - TEMPO_FASTER_TOLERANCE)));
    const to = Math.min(lastLag, Math.ceil(target * (1 + TEMPO_FASTER_TOLERANCE)));
    let best = -1;
    for (let lag = from; lag <= to; lag++) {
        if (lagScore(window, geometry.frameRate, lag) > 0 && (best < 0 || correlation[lag] > correlation[best])) {
            best = lag;
        }
    }
    return best;
}

// The tempo the tracker's first-lock tie-break would publish instead of the winner, or undefined when the winner stands.
// The tracker decides this only on the update where it first locks (`settleFirstLock`), so it is not part of
// `estimateTempo`: a caller that knows an update is the first lock asks here. It judges the dotted rival on the window
// alone, which is exactly the evidence the tracker uses at that moment; when the tracker took a rival this returns the
// rival's refined BPM. Like `estimateTempo`, the mirror stops at the raw estimate: the rules `finishEstimate` applies
// afterwards (octave, bar and confidence rules) are not run here. The tracker also keeps a tie that is already open open
// while the peak ratio wobbles; one window cannot know that, so only the closeness test of the update itself is mirrored.
export function firstLockRivalBpm(
    window: Correlation,
    estimate: TempoEstimate,
    geometry: TempoGeometry,
): number | undefined {
    if (estimate.bestLag <= 0) {
        return undefined;
    }
    let rival = 0;
    let rivalHeight = -Infinity;
    for (const factor of TEMPO_TIE_RIVAL_LAG_FACTORS) {
        const candidate = estimate.bestLag * factor;
        const peak =
            candidate >= geometry.minLag && candidate <= geometry.maxLag
                ? interpolatedPeak(window, candidate)
                : undefined;
        const height = peak?.height ?? NaN;
        if (height > rivalHeight) {
            rivalHeight = height;
            rival = peak!.lag;
        }
    }
    // The 3:2 faster pulse replaces the dotted rival when its comb score reaches the ratio of the winner's, as in the
    // tracker: the search stops at the winner's lag and needs a scored peak (no peak fails the comparison). A faster peak
    // out of reach leaves the rival's lag as it was and its height NaN, which fails the closeness test below.
    if (TEMPO_TIE_FASTER_MIN_RATIO > 0) {
        const faster = fasterPeakNear(window, geometry, (estimate.bestLag * 2) / 3, estimate.bestLag);
        if (
            faster > 0 &&
            lagScore(window, geometry.frameRate, faster) >=
                TEMPO_TIE_FASTER_MIN_RATIO * lagScore(window, geometry.frameRate, estimate.bestLag)
        ) {
            const peak = interpolatedPeak(window, faster);
            rivalHeight = peak?.height ?? NaN;
            rival = peak?.lag ?? rival;
        }
    }
    if (rival === 0) {
        return undefined;
    }
    // The tracker only compares bar sums when the two peaks are close: a rival far weaker than the winner at its own lag
    // never wins the lock, however well it repeats every bar. A missing (NaN) rival peak fails this and means no tie.
    const winnerHeight = interpolatedPeak(window, estimate.bestLag)?.height ?? NaN;
    if (!(Math.min(winnerHeight, rivalHeight) >= TEMPO_TIE_MIN_RATIO * Math.max(winnerHeight, rivalHeight))) {
        return undefined;
    }
    let winnerSum = 0;
    let rivalSum = 0;
    let reached = 0;
    for (const multiple of TEMPO_TIE_MULTIPLES) {
        const w = interpolatedPeak(window, estimate.bestLag * multiple)?.height ?? NaN;
        const r = interpolatedPeak(window, rival * multiple)?.height ?? NaN;
        if (!Number.isNaN(w + r)) {
            winnerSum += w;
            rivalSum += r;
            reached++;
        }
    }
    if (reached === 0 || !(rivalSum > TEMPO_TIE_SWITCH_FACTOR * winnerSum)) {
        return undefined;
    }
    return (60 * geometry.frameRate) / refineLag(window, rival);
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
