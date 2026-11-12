// How steady the held tempo is over one analyzed file, from the pipeline's evenly spaced samples (bpm is 0 until the
// tracker holds a tempo). Pure, so the printed numbers can be tested without running the pipeline.

export interface TempoStability {
    // Share of samples from the first lock on whose held bpm is within `tolerance` of the final held bpm.
    nearFinalShare: number;
    // Moves of the held bpm between consecutive samples bigger than `jumpFraction` of the earlier value.
    jumps: number;
}

export interface BpmSample {
    bpm: number;
}

// Undefined when the file never locked or ended unlocked: there is no final tempo to measure against. Samples are evenly
// spaced, so a count of them stands for time; the seconds are not needed.
export function tempoStability(
    samples: readonly BpmSample[],
    tolerance = 0.01,
    jumpFraction = 0.04,
): TempoStability | undefined {
    const first = samples.findIndex((sample) => sample.bpm > 0);
    const final = samples.length > 0 ? samples[samples.length - 1].bpm : 0;
    if (first < 0 || !(final > 0)) return undefined;
    let near = 0;
    let jumps = 0;
    for (let i = first; i < samples.length; i++) {
        if (Math.abs(samples[i].bpm - final) <= tolerance * final) near++;
        // A move from or to "no tempo" is a lock change, not a jump of the held tempo.
        if (i > first && samples[i - 1].bpm > 0 && samples[i].bpm > 0) {
            if (Math.abs(samples[i].bpm - samples[i - 1].bpm) > jumpFraction * samples[i - 1].bpm) jumps++;
        }
    }
    return { nearFinalShare: near / (samples.length - first), jumps };
}
