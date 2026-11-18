import { beatError, median, type TempoSample } from '../../../app/features/rhythm/eval/metrics';
import type { TempoTruth } from './tempoTruth';

// The power of two the tracker's tempo sits at against the truth after the lock: 0.5 for a tracker at half time, 2 for
// double time, 1 when it holds the true tempo. Taken from the median reading, so a brief excursion does not decide it.
// undefined when no reading after the lock holds a tempo.
export function trackerOctave(
    series: readonly TempoSample[],
    truth: TempoTruth,
    lockSeconds: number,
): number | undefined {
    const ratios: number[] = [];
    for (const sample of series) {
        if (sample.time >= lockSeconds && sample.bpm > 0) ratios.push(sample.bpm / truth(sample.time));
    }
    if (ratios.length === 0) return undefined;
    return 2 ** Math.round(Math.log2(median(ratios)));
}

// Median beat error in ms from the scorecard's own lock (octave-folded and held), so an octave lock and a drifting track
// are scored like any other. Errors run from each beat of the sparser grid to the nearest beat of the denser one: a
// tracker at half time rightly puts a beat on every other tapped beat, and matching every tapped beat would charge it
// half a period for the ones it skips. At the true tempo or faster the truth is the sparser grid, which is what
// `eval:rhythm` measures too. null when no beat lies after the lock.
export function scorecardBeatErrorMs(
    truthBeats: readonly number[],
    detectedBeats: readonly number[],
    lockSeconds: number,
    octave: number,
): number | null {
    const error =
        octave < 1
            ? beatError(detectedBeats, truthBeats, lockSeconds)
            : beatError(truthBeats, detectedBeats, lockSeconds);
    return error?.median ?? null;
}
