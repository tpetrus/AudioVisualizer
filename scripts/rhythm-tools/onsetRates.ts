import { ONSET_BANDS, type OnsetBand } from '../../app/features/rhythm/eval/evalTypes';

// Distance within which an onset of any band counts as sounding at a beat.
export const BEAT_COVERAGE_SECONDS = 0.05;

export interface OnsetRates {
    // Onset events per tapped beat, per band, counted from the first to the last tapped beat.
    perBeat: Record<OnsetBand, number>;
    // Share of tapped beats with an onset of any band within BEAT_COVERAGE_SECONDS; NaN when there are no beats.
    coverage: number;
    beatCount: number;
}

// How busy each band is on a tapped track and how many tapped beats have some onset next to them. A tapped beat is not an
// onset label, so this cannot score the events; it shows a detector that fires several times per beat or that is silent
// at the beats. `maxSeconds` (when above 0) drops the beats after it, as a run cut short has nothing to say beyond it.
export function onsetRates(
    beats: readonly number[],
    onsets: Record<OnsetBand, readonly number[]>,
    maxSeconds = 0,
): OnsetRates {
    const used = maxSeconds > 0 ? beats.filter((time) => time <= maxSeconds) : beats;
    const covered = (time: number): boolean =>
        ONSET_BANDS.some((band) => onsets[band].some((onset) => Math.abs(onset - time) <= BEAT_COVERAGE_SECONDS));
    const first = used[0] ?? 0;
    const last = used[used.length - 1] ?? 0;
    const perBeat = {} as Record<OnsetBand, number>;
    for (const band of ONSET_BANDS) {
        const count = onsets[band].filter((time) => time >= first && time <= last).length;
        perBeat[band] = count / Math.max(1, used.length - 1);
    }
    const coverage = used.length === 0 ? NaN : used.filter(covered).length / used.length;
    return { perBeat, coverage, beatCount: used.length };
}

export function formatOnsetRates(rates: OnsetRates): string[] {
    const perBeat = ONSET_BANDS.map((band) => `${band} ${rates.perBeat[band].toFixed(2)}`);
    return [
        `  onset events per beat ${perBeat.join(', ')}`,
        `  beats with an onset within ${BEAT_COVERAGE_SECONDS * 1000} ms ${Number.isNaN(rates.coverage) ? 'n/a' : rates.coverage.toFixed(2)} (${rates.beatCount} beats)`,
    ];
}

export interface AlignmentLift {
    // Constant shift of the tapped beats, in milliseconds, at which the most beats have an onset next to them. An onset
    // matches when |onset - beat - offset| is within BEAT_COVERAGE_SECONDS, so a tap that lands early gives a negative offset.
    offsetMs: number;
    // Share of smoothed beats with an onset of any band within BEAT_COVERAGE_SECONDS at that offset.
    coverage: number;
    // The same share averaged over grids shifted by 0.10 to 0.90 of a beat from the best offset: what busy detectors score by luck.
    chance: number;
    // coverage - chance. Near 0 means the onsets do not line up with the beats; good tracks reach 0.3 to 0.7.
    lift: number;
}

const SMOOTH_WINDOW = 9;
const MAX_OFFSET_MS = 100;
const OFFSET_STEP_MS = 5;

// Each tap replaced by the value of a local straight-line fit over its 9 neighbors (the window slides inward at the ends).
// A human tap jitters by tens of milliseconds around a steady tempo; the fit keeps the drift and drops most of the jitter.
function smoothBeats(beats: readonly number[]): number[] {
    return beats.map((_, i) => {
        const start = Math.max(0, Math.min(i - 4, beats.length - SMOOTH_WINDOW));
        const window = beats.slice(start, start + SMOOTH_WINDOW);
        const n = window.length;
        const meanX = (n - 1) / 2;
        const meanY = window.reduce((a, b) => a + b, 0) / n;
        let num = 0;
        let den = 0;
        window.forEach((y, x) => {
            num += (x - meanX) * (y - meanY);
            den += (x - meanX) ** 2;
        });
        return meanY + (num / den) * (i - start - meanX);
    });
}

// Beat coverage with the chance level taken off. Taps carry a constant latency of up to about 85 ms plus jitter, and at four
// to six onsets per beat a 50 ms window catches some onset by luck most of the time, so raw coverage cannot tell a detector
// that follows the music from one that is merely busy. This scans a constant offset to absorb the latency, then subtracts
// the coverage the same onsets reach against a grid that sits between the beats.
export function alignmentLift(
    beats: readonly number[],
    onsets: Record<OnsetBand, readonly number[]>,
    options: { maxSeconds?: number } = {},
): AlignmentLift {
    const maxSeconds = options.maxSeconds ?? 0;
    const used = maxSeconds > 0 ? beats.filter((time) => time <= maxSeconds) : beats;
    // A fit needs at least two points (and a period needs two beats).
    if (used.length < 2) {
        return { offsetMs: NaN, coverage: NaN, chance: NaN, lift: NaN };
    }
    const smooth = smoothBeats(used);
    const period = (smooth[smooth.length - 1] - smooth[0]) / (smooth.length - 1);
    const sorted = ONSET_BANDS.flatMap((band) => [...onsets[band]]).sort((a, b) => a - b);
    // Epsilon so a distance of exactly 50 ms still counts despite rounding in the subtraction.
    const reach = BEAT_COVERAGE_SECONDS + 1e-9;
    const hasOnset = (target: number): boolean => {
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sorted[mid] < target - reach) lo = mid + 1;
            else hi = mid;
        }
        return lo < sorted.length && sorted[lo] <= target + reach;
    };
    const coverageAt = (shiftSeconds: number): number =>
        smooth.filter((time) => hasOnset(time + shiftSeconds)).length / smooth.length;

    // Integer milliseconds keep the grid free of float drift; trying the offsets nearest zero first makes ties go there.
    const candidates: number[] = [];
    for (let ms = -MAX_OFFSET_MS; ms <= MAX_OFFSET_MS; ms += OFFSET_STEP_MS) candidates.push(ms);
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    let offsetMs = 0;
    let coverage = -1;
    for (const ms of candidates) {
        const value = coverageAt(ms / 1000);
        if (value > coverage) {
            coverage = value;
            offsetMs = ms;
        }
    }
    let total = 0;
    for (let step = 2; step <= 18; step++) {
        total += coverageAt(offsetMs / 1000 + (step * period) / 20);
    }
    const chance = total / 17;
    return { offsetMs, coverage, chance, lift: coverage - chance };
}

export function formatAlignmentLift(result: AlignmentLift): string {
    if (Number.isNaN(result.lift)) return '  onset lift n/a (fewer than two tapped beats)';
    const sign = result.offsetMs > 0 ? '+' : '';
    return (
        `  onset lift ${result.lift.toFixed(2)} at offset ${sign}${result.offsetMs} ms ` +
        `(coverage ${result.coverage.toFixed(2)}, chance ${result.chance.toFixed(2)})`
    );
}
