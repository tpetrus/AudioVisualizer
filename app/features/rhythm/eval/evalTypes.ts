// Frozen contracts C1 (BeatSidecar) and C2 (EvalReport) of the audio alignment plan
// (docs/plans/audio-engine-alignment/contracts.md). The metric functions, the synthetic track generator, the offline
// evaluation, the harness summary and the regression specs all share these shapes; change them only together with
// that document.

// The bands an onset can be reported in.
export const ONSET_BANDS = ['kick', 'bass', 'snare', 'highs'] as const;
export type OnsetBand = (typeof ONSET_BANDS)[number];

// Onset scores are always reported at both tolerances: 50 ms is the pass or fail gate, 20 ms shows the headroom.
export const ONSET_TOLERANCES_MS = [20, 50] as const;

// A tempo within this fraction of the label counts as the right tempo, for the lock time and for the tempo gate.
export const TEMPO_TOLERANCE = 0.02;

// C1. Ground truth for one track, stored as `<track file name without extension>.beats.json` next to the audio. All
// times are seconds from the start of the track.
export interface BeatSidecar {
    // File name of the audio this describes, with its extension.
    track: string;
    // Labelled tempo in beats per minute.
    tempo: number;
    // Beat times, ascending.
    beats: number[];
    // Exact onset times per band, ascending. Only synthetic tracks have them: a tapped beat is not an onset label.
    onsets?: Record<OnsetBand, number[]>;
    source: 'synthetic' | 'tapped';
    // The constant offset already subtracted from the tapped times (the tapper's measured lead or lag on a click
    // track). 0 for synthetic tracks.
    tapOffsetMs: number;
    // Spread of the tapper's taps around a click track's true beats (standard deviation, in ms). Tapped sidecars
    // carry it so every figure measured against them can be read next to it; synthetic sidecars leave it out.
    tapNoiseFloorMs?: number;
}

export interface BeatErrorMs {
    // Median and 95th percentile of the absolute distance, in ms, from each ground-truth beat at or after the lock
    // time to the nearest detected beat.
    median: number;
    p95: number;
    // Median of the signed distance (detected minus truth), in ms. Positive means the detected beats come late.
    bias: number;
}

export interface OnsetScore {
    precision: number;
    recall: number;
    f: number;
}

// Onset scores for one tolerance. A band the pipeline under test cannot detect is left out, not scored as zero.
export interface OnsetReport {
    toleranceMs: number;
    bands: Partial<Record<OnsetBand, OnsetScore>>;
}

// C2. The alignment figures for one run of one track.
export interface EvalReport {
    track: string;
    source: BeatSidecar['source'];
    // Detected tempo divided by the labelled tempo, not folded to an octave: 2 and 1.333 are the 2:1 and 4:3 locks.
    // undefined when no tempo was found.
    tempoRatio: number | undefined;
    // First time in seconds from which the detected tempo stays within TEMPO_TOLERANCE of the label to the end of the
    // run. undefined when that never happens.
    lockSeconds: number | undefined;
    // undefined when the run never locked or produced no beats.
    beatErrorMs: BeatErrorMs | undefined;
    // One entry per ONSET_TOLERANCES_MS value for synthetic tracks; empty for tapped tracks.
    onsets: OnsetReport[];
    // Median of (reaction time minus click time) in ms, for click tracks played through the harness.
    reactionOffsetMs?: number;
    // Copied from the sidecar for tapped tracks.
    tapNoiseFloorMs?: number;
}
