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
