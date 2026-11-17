// Frozen contracts of the hub-regressions scorecard (plan docs/plans/hub-regressions, contracts C2 and C3). Workers
// import these types and never change them; a change goes through the orchestrator and a plan revision.
//
// C3, the commands (wired in package.json):
//   npm run scorecard                    offline cells over every WAV in .debug-in (or --dir), writes the scorecard
//   npm run scorecard:live -- --viz NAME live cells, 4 runs per real track (added in S3)
//   npm run scorecard:check              exits 1 and lists the cells when a blocking cell that passed at the latest
//                                        baseline fails, when a live median worsens beyond the recorded spread, or when
//                                        a .beats.json hash differs from the baseline
//
// Not part of the app bundle: nothing under app/ imports this file.

import type { OnsetBand } from '../../app/features/rhythm/eval/evalTypes';

// How much ground truth a track has, which decides the metrics that apply to it (decision D14).
// - synthetic: generated, exact beats and per-band onset labels (onset F applies)
// - tapped: real song with a tapped .beats.json and a single tempo in .bpm
// - drifting: tapped, but the tempo moves, so tempo truth is the local bpm of each 8-beat window of the tapped beats
// - beatless: no beat at all; its no-beat truth lives in the scorecard's track list, not in a sidecar (the sidecar
//   format requires a tempo above 0), and the tracker must never lock on it
export type TrackClass = 'synthetic' | 'tapped' | 'drifting' | 'beatless';

export type CellSource = 'offline' | 'live';

// Whether a cell met its floor. 'unavailable' is a cell whose track or truth is missing; it never passes.
export type CellStatus = 'pass' | 'fail' | 'unavailable' | 'n/a';

// C2. One metric for one track on one visualizer (or 'rhythm' for cells that do not depend on a visualizer).
export interface ScorecardCell {
    // Metric id from targets.ts, for example 'tempo.within2pct' or 'gate.firstOpenSeconds'.
    metric: string;
    // Audio file name with its extension, or a scenario id such as 'scenario:dotted-100-150'.
    track: string;
    visualizer: string;
    class: TrackClass;
    // false for cells the applicability matrix marks n/a; they are shown and never counted.
    applicable: boolean;
    // The absolute target from the acceptance criteria. The pre-hub value also bounds the floor once it exists.
    floor: number | null;
    stretch: number | null;
    // The same metric measured on the pre-hub commit (S3); null until then.
    prehub: number | null;
    // The measured value, the median over runs for live cells; null when unavailable or n/a.
    value: number | null;
    // Run-to-run spread (max minus min) for live cells; 0 for offline cells.
    spread: number;
    runs: number;
    source: CellSource;
    // Offline cells block merges; live cells are advisory (decision D13).
    blocking: boolean;
    pass: boolean;
    status: CellStatus;
}

export interface ScorecardHeader {
    // Bumped whenever a floor, stretch, metric definition or the applicability matrix changes.
    targetsVersion: number;
    // Commit the scorecard was measured on.
    revision: string;
    // ISO time of the run.
    created: string;
    // SHA-256 (hex) of each .beats.json used, by audio file name. A changed hash fails scorecard:check until the
    // baseline is regenerated.
    sidecarHashes: Record<string, string>;
}

export interface Scorecard {
    header: ScorecardHeader;
    cells: ScorecardCell[];
}

// The boundary between the offline engine (which replays the app's pipeline over audio) and the cell builder (which
// applies targets). Every field is null when it cannot be measured for this track; the cell builder decides whether
// that is n/a or unavailable from the track's class.
export interface TrackMeasures {
    track: string;
    class: TrackClass;
    seconds: number;
    // Whether the tracker ever reported a tempo within 2% of the truth after octave folding (ratio folded by powers
    // of 2 into [0.75, 1.5)); on beatless, whether the tracker ever reported any lock at all.
    everLocked: boolean;
    // First time from which the octave-folded tempo stays within 2% of the truth to the end of the track.
    lockSeconds: number | null;
    // Share of tracker frames after lockSeconds whose octave-folded tempo is within 2% of the truth (local truth per
    // 8-beat window on drifting tracks).
    tempoWithinShareAfterLock: number | null;
    // Largest octave-folded tempo error after lockSeconds, as a fraction of the truth.
    maxTempoErrorAfterLock: number | null;
    // songChangeCount at the end of a single-song track; every one is false.
    falseSongChanges: number;
    // Median absolute beat error in ms after the lock, as buildEvalReport computes it.
    beatErrorMedianMs: number | null;
    // Per-band onset F at 50 ms; only synthetic tracks with onset labels.
    onsetF50: Partial<Record<OnsetBand, number>> | null;
    // The dancing character's gate (BassBump with the dancer's margin and gain over the hub's low end, then
    // stepBassGate), seconds from track start to its first opening; null if it never opens.
    gateFirstOpenSeconds: number | null;
    // Share of hub frames from the first opening on where the gate is open; 0 when it never opens.
    gateOpenShare: number;
}

// The two AC9 cases, run on constructed audio rather than a .debug-in file.
export interface ScenarioMeasures {
    // 'scenario:dotted-100-150' (a real dotted song change) or 'scenario:dotted-passage' (dotted, old pulse kept).
    id: string;
    // songChangeCount at the end of the scenario.
    songChanges: number;
    // Number of soft boundaries raised.
    softBoundaries: number;
}
