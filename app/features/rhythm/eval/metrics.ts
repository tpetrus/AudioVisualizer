import { TEMPO_TOLERANCE, type BeatErrorMs, type OnsetScore } from './evalTypes';

// Pure alignment metrics (contract C2): how far detected beats, tempo and onsets are from ground truth. Times are in
// seconds unless a name says Ms. No node or DOM APIs, so the specs, the offline evaluation and the harness summary all
// share them.

// Middle value of the numbers (mean of the two middle ones for an even count). NaN for an empty list, which no caller
// reaches because each checks for data first.
export function median(values: readonly number[]): number {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Nearest-rank percentile (fraction 0..1): the smallest value that at least `fraction` of the numbers do not exceed.
export function percentile(values: readonly number[], fraction: number): number {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil(fraction * sorted.length));
    return sorted[Math.min(sorted.length, rank) - 1];
}

// Population standard deviation about the mean.
export function standardDeviation(values: readonly number[]): number {
    if (values.length === 0) return NaN;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

// The element of an ascending list nearest to `time`, or undefined for an empty list. Binary search, so a long
// recording stays cheap. A tie goes to the earlier element.
function nearest(sorted: readonly number[], time: number): number | undefined {
    if (sorted.length === 0) return undefined;
    let low = 0;
    let high = sorted.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (sorted[middle] < time) low = middle + 1;
        else high = middle;
    }
    const after = sorted[low];
    const before = low > 0 ? sorted[low - 1] : after;
    return Math.abs(before - time) <= Math.abs(after - time) ? before : after;
}

// Signed distances in ms (other minus reference) from each reference time to the nearest element of `others`. Both
// lists ascending.
function signedErrorsMs(reference: readonly number[], others: readonly number[]): number[] {
    const errors: number[] = [];
    for (const time of reference) {
        const found = nearest(others, time);
        if (found !== undefined) errors.push((found - time) * 1000);
    }
    return errors;
}

// Beat error as BeatErrorMs defines it: only truth beats at or after the lock time count. undefined when the run never
// locked, produced no beats, or no truth beat lies after the lock.
export function beatError(
    truthBeats: readonly number[],
    detectedBeats: readonly number[],
    lockSeconds: number | undefined,
): BeatErrorMs | undefined {
    if (lockSeconds === undefined) return undefined;
    const errors = signedErrorsMs(
        truthBeats.filter((time) => time >= lockSeconds),
        detectedBeats,
    );
    if (errors.length === 0) return undefined;
    const absolute = errors.map(Math.abs);
    return { median: median(absolute), p95: percentile(absolute, 0.95), bias: median(errors) };
}

// One reading of the detected tempo; bpm 0 means no tempo was held at that time.
export interface TempoSample {
    time: number;
    bpm: number;
}

// The tempo the run ended with is the median of the held tempos over the last few seconds.
const FINAL_TEMPO_WINDOW_SECONDS = 5;

// undefined when no tempo was held at the end.
export function finalTempo(series: readonly TempoSample[]): number | undefined {
    if (series.length === 0) return undefined;
    const end = series[series.length - 1].time;
    const held = series.filter((sample) => sample.time >= end - FINAL_TEMPO_WINDOW_SECONDS && sample.bpm > 0);
    return held.length === 0 ? undefined : median(held.map((sample) => sample.bpm));
}

// Detected tempo over the labelled tempo, not folded to an octave (2 and 1.333 are the 2:1 and 4:3 locks).
export function tempoRatio(series: readonly TempoSample[], labelBpm: number): number | undefined {
    const final = finalTempo(series);
    return final === undefined ? undefined : final / labelBpm;
}

// First time from which every reading stays within TEMPO_TOLERANCE of the label to the end of the run. undefined when
// the last reading is off (including when there are none).
export function lockSeconds(series: readonly TempoSample[], labelBpm: number): number | undefined {
    let since: number | undefined;
    for (const sample of series) {
        if (sample.bpm > 0 && Math.abs(sample.bpm / labelBpm - 1) <= TEMPO_TOLERANCE) {
            since ??= sample.time;
        } else {
            since = undefined;
        }
    }
    return since;
}

// Precision, recall and F-measure of detected onsets (ascending seconds) against truth within the tolerance. Matching is
// one to one: a two-pointer sweep over both sorted lists pairs each truth onset with at most one detection and the
// reverse, and for tolerance windows this greedy sweep finds the largest possible set of pairs. A zero denominator gives
// 0, so "nothing detected" and "nothing to find" both read as a score of 0 rather than NaN.
export function scoreOnsets(truth: readonly number[], detected: readonly number[], toleranceMs: number): OnsetScore {
    // A hair of slack so a difference of exactly the tolerance is not lost to floating point.
    const tolerance = toleranceMs / 1000 + 1e-9;
    let matched = 0;
    let t = 0;
    let d = 0;
    while (t < truth.length && d < detected.length) {
        if (Math.abs(truth[t] - detected[d]) <= tolerance) {
            matched++;
            t++;
            d++;
        } else if (detected[d] < truth[t]) {
            d++;
        } else {
            t++;
        }
    }
    const precision = detected.length === 0 ? 0 : matched / detected.length;
    const recall = truth.length === 0 ? 0 : matched / truth.length;
    const f = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { precision, recall, f };
}

export interface TapNoiseFloor {
    // Median signed error (tap minus the nearest true beat) in ms: the tapper's constant lead (negative) or lag.
    offsetMs: number;
    // Standard deviation of the errors after removing the offset, in ms.
    spreadMs: number;
}

// How steadily someone taps along to a click track whose beat times are known. undefined without taps or beats.
export function tapNoiseFloor(taps: readonly number[], trueBeats: readonly number[]): TapNoiseFloor | undefined {
    // signedErrorsMs measures beat minus tap; a tap's error is the other way round.
    const errors = signedErrorsMs(taps, trueBeats).map((error) => -error);
    if (errors.length === 0) return undefined;
    const offsetMs = median(errors);
    return { offsetMs, spreadMs: standardDeviation(errors.map((error) => error - offsetMs)) };
}
