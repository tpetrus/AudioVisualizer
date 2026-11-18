// Tempo comparison the scorecard uses: a detected tempo is folded by powers of two before it is compared with the truth,
// because the tracker may hold the half or the double of the beat a person taps (the app's dance follows the same
// normalization), and the truth of a drifting track is the local tempo of the tapped beats.

// Within this fraction of the truth after folding counts as the right tempo. The same 2% as TEMPO_TOLERANCE in the
// evaluation code, which is not imported because the fold makes the comparison a different one.
export const SCORECARD_TEMPO_TOLERANCE = 0.02;

// Beats in the window a drifting track's local tempo is measured over.
export const LOCAL_TEMPO_WINDOW_BEATS = 8;

// The ratio of detected to true tempo moved by powers of two into [0.75, 1.5). The interval is one octave wide, so every
// ratio has exactly one representative.
export function foldRatio(ratio: number): number {
    if (!(ratio > 0) || !Number.isFinite(ratio)) return NaN;
    let folded = ratio;
    while (folded >= 1.5) folded /= 2;
    while (folded < 0.75) folded *= 2;
    return folded;
}

// How far the folded tempo is from the truth, as a fraction of the truth. NaN for no tempo (bpm 0).
export function foldedError(bpm: number, truthBpm: number): number {
    return Math.abs(foldRatio(bpm / truthBpm) - 1);
}

// The tempo of each window of LOCAL_TEMPO_WINDOW_BEATS beats: 60 * 8 / (beats[i + 8] - beats[i]), one per start beat.
export function localTempos(beats: readonly number[]): number[] {
    const tempos: number[] = [];
    for (let i = 0; i + LOCAL_TEMPO_WINDOW_BEATS < beats.length; i++) {
        tempos.push((60 * LOCAL_TEMPO_WINDOW_BEATS) / (beats[i + LOCAL_TEMPO_WINDOW_BEATS] - beats[i]));
    }
    return tempos;
}

// The true tempo at one moment.
export type TempoTruth = (time: number) => number;

export function constantTruth(bpm: number): TempoTruth {
    return () => bpm;
}

// A drifting truth is the window centered on the beat nearest to `time` (so a tempo reading is compared with the beats
// around it, not only those before it), clamped at the ends of the track. With fewer beats than one window it falls
// back to the constant tempo.
export function driftingTruth(beats: readonly number[], fallbackBpm: number): TempoTruth {
    const tempos = localTempos(beats);
    if (tempos.length === 0) return constantTruth(fallbackBpm);
    return (time) => {
        // Binary search for the first beat at or after `time`, then the nearer of it and its predecessor.
        let low = 0;
        let high = beats.length - 1;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (beats[middle] < time) low = middle + 1;
            else high = middle;
        }
        const nearest = low > 0 && time - beats[low - 1] <= beats[low] - time ? low - 1 : low;
        const start = Math.min(tempos.length - 1, Math.max(0, nearest - LOCAL_TEMPO_WINDOW_BEATS / 2));
        return tempos[start];
    };
}
