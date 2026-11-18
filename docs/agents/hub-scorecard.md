# Hub scorecard: findings

The acceptance scorecard of the hub-regressions plan (`docs/plans/hub-regressions/`). It scores every applicable
acceptance metric for every `.debug-in` track, so a fix tuned on one track cannot silently break another. This file maps
each failing cell to a measured cause and the slice that owns it; S3 fills in the causes.

## How to run it
- `npm run scorecard` replays the app's own rhythm pipeline, band onsets, `AudioHub` and the dancing character's gate
  over every WAV in `.debug-in`, offline and on track time, and writes `hub-scorecard.json` and `.md` here. About 6 s for
  the current folder, and two runs give identical cells.
- `npm run scorecard -- --write-baseline` also writes `hub-scorecard.baseline.json`; `npm run scorecard:check` then fails
  on any blocking cell that passed in the baseline and no longer does, on a changed `.beats.json` hash, or on a changed
  targets version.
- The contracts are in `scripts/scorecard/types.ts` (C2 cell, C3 commands, revision 2 of the lock and false-song-change
  definitions); floors, stretch targets and the applicability matrix are in `scripts/scorecard/targets.ts` and
  `tracks.ts`.
- CI runs only the synthetic ratchet (`scripts/scorecard/synthetic.test.ts`, 43 cells), because `.debug-in` is local.

## Definitions worth knowing
- **Lock**: the first time the octave-folded tempo is within 2% of the truth and holds for 2 s. Tempo error and beat
  error are measured from there to the end, so a later drift shows up.
- **Beat error** is matched from the sparser beat grid, so a half-time lock is not charged for the beats it skips. It
  differs from `eval:rhythm`, which only scores an unfolded lock.
- **Unavailable** means a missing track or missing truth, never a tracker failure: a measured track that never locks, or
  whose gate never opens, fails.
- **Beatless lock** is the hub's lock test (`bpm > 0` with a beat phase), which is weaker than the dancer's (it also needs
  confidence 0.2). Decide in S3 which one AC3 means.

## S2 result (offline, targets version 2, measured on `dd53ed2`)
124 of 154 applicable cells pass, 30 fail, none unavailable.

| Metric | Failing tracks (value; floor) |
|---|---|
| `gate.firstOpenSeconds` (dancer, floor 4 s) | 16 of 16 kick tracks, 6.8 to 29.3 s; `low-bpm-rnb` and `summer2000` never open |
| `beat.errorMedianMs` (floor 40 ms tapped) | `low-bpm-rnb` 179, `summer2000` 129, `syncopation-no-kick` 81, `syncopationbass` 54, `6-8-time` never locks |
| `onset.f50` (floor 0.9) | `no-kick-124` bass 0.67, `bassline-kick-120` bass 0.83 and kick 0.76 |
| `tempo.maxErrorAfterLock` (floor 0.02) | `drifting-tempo` 0.028, `6-8-time` never locks |
| `tempo.falseSongChanges` (floor 0) | `6-8-time` 1 |
| `tempo.beatlessNeverLocks` (floor 0) | `beatless` locks |
| `ac9.dottedChangeCounted` (floor 1) | the dotted 100 to 150 change raises no song change and no soft boundary (owned by S7) |

## Open for S3
- **Offline versus live gate timing (risk K1, question Q1)** is the first thing to settle. Offline, the gate opens later
  than the live replays in `audio-alignment-findings.md` ("S8 and the bass gate input"): `drums-128` 7.8 s offline
  against 4.6 to 6.0 s live, `imyourgirl` 7.3 s against 4.5 s. Known differences: the offline render time is the audio
  time (no output latency or sync offset), the clock is a fixed 60 Hz, and the live replays timed from the first locked
  frame while AC6 times from track start. Until this is explained, gate cells are not a tuning loop.
- Pre-hub reference column (D8) from a worktree at the first parent of `b449f56`, then the baseline is committed.
- Live wrapper for clip spread, lock spread, hit share and latency (live metrics must be added to `targets.ts`, or the
  ratchet skips them).

## Follow-ups outside the fast lane
- **`FU-HR-analyzer-counters`** (R2, it changes the `RhythmState` contract): the engine counts soft boundaries
  (`engine/boundaryProbe.ts`) and times song changes (`engine/songChanges.ts`) by wrapping `BoundaryDetector` and
  `RhythmAnalyzer` prototype methods for the duration of a replay. It works and its specs fail on a rename, but the
  analyzer should expose both counters instead.
