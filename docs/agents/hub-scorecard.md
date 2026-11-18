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

## S3 findings, offline (targets version 3)
Measured on `test/hub-scorecard` after the S3 engine work (`91322a2`): 142 of 170 applicable cells pass, 28 fail, all
blocking. The S2 table above is kept for history; the cells moved because the replay now applies the engine's gain.

### Offline versus live (risk K1, question Q1): answered
- **Most of the gap was a definition.** The live figures in `audio-alignment-findings.md` are timed from the first
  locked frame; AC6 times from track start. On the same hub-era recordings (2026-11-17, two runs per track), the offline
  tempo lock comes 0.08 to 0.09 s before the live one, and the offline gate opening falls inside the live run-to-run
  spread on 6 of 7 tracks (`drums-128` 7.80 s against 7.83 and 9.21 s live).
- **The replay skipped the engine's gain control.** Live audio passes the AGC before any analysis (gain 0.7 to 5.9
  within one track). Scaling the offline input by 1 to 4 moved the hub-fed gate by up to 7 s and the `syncopationbass`
  lock from 3.1 to 8.1 s, so the hub-fed gate is level-sensitive. The replay now applies the engine's own AGC decision
  (`app/features/audio/agc.ts`, extracted from `AudioEngine.updateGain`) on its 30 ms schedule.
- **What still differs (open, owned by S3 follow-up work, not blocking):** `lonley` opens at 19.6 s (pre-hub input) and
  25.2 s (hub input) offline against 13.8 s (pre-hub) and 13.8 to 16.6 s (hub) live, so the cause is upstream of the
  gate input, probably the beat phase the gate reads (live render time subtracts the output latency, offline does not).
  `syncopationbass` locks at 3.1 s offline and 8.2 s live; live itself is split between 3.2 and 8.3 s on
  `syncopationbass2`, so the lock sits near a decision edge.
- Offline gate cells are a valid tuning loop everywhere except `lonley`; confirm a `lonley` gate change live.

### Pre-hub reference (decision D8, method approved by Trevor at S3)
The rhythm DSP the replay runs is byte-identical at `2a19e55` (the commit before the hub merge) and today, so the gate
input is the only pre-hub difference an offline cell can see. The pre-hub gate is the real `BassPulse` class over the
same post-gain audio, its two 120 Hz lowpass stages computed with the Web Audio spec formulas
(`engine/prehubBass.ts`). Against the live `BassPulse` recordings of 2026-11-17 it opens at 7.08 s on `drums-128`
(live 7.08 to 7.10 s in 4 of 6 runs), 7.73 s on `imyourgirl` (7.74 s), 15.17 s on `summer2000` (15.17 s in 2 of 4
runs) and 7.27 s on `syncopationbass2` (7.27 s); `syncopation-no-kick` and `syncopationbass` fall inside the live
spread; `lonley` is the outlier above. Live pre-hub cells (hit share, latency) come from a worktree at `2a19e55`.

### Gate: two separate causes
`gate.firstOpenSeconds` fails on all 16 kick tracks, and on none of them would the pre-hub input pass either.
- **Cause 1, every track: the floor cannot be met by any gate input.** The dancer's tempo lock arrives at 3.1 s or 8.1 s
  (11.4 s on `half-time-shuffle`), and even the pre-hub gate then needs 3.9 to 5 s of kicks on clean synthetic drums
  (`gate.secondsAfterLock`). So 4 s from track start needs both an earlier lock (tracker, S7) and a faster gate rule
  (S5), or an AC6 restated from the lock. The older "pre-hub 0.3 s on `imyourgirl`" figure does not reproduce under
  any timing.
- **Cause 2, the hub's low end is a different feature.** Seconds from track start to the first opening, offline:

| Track | Hub (today) | Pre-hub (`BassPulse`) | Hub band, no peak scaling | Linear band, `BassPulse` margin | Hub band, per-frame delivery | `BassPulse` feature at worklet frame times |
|---|---|---|---|---|---|---|
| `lonley` | 25.18 | 19.62 | 20.05 | 19.60 | 26.88 | 19.60 |
| `summer2000` | never | 15.17 | never | never | never | 15.65 |
| `syncopationbass2` | 12.40 | 7.27 | 11.47 | 7.27 | 9.13 | 7.27 |
| `syncopationbass` | 17.23 | 21.30 | 17.67 | 34.23 | 18.75 | 21.28 |
| `imyourgirl` | 7.28 | 7.73 | 8.17 | 7.73 | 7.28 | 7.73 |
| `drums-128` | 7.33 | 7.08 | 7.08 | 7.80 | 7.08 | 7.08 |
| `drifting-tempo` | 9.23 | 8.68 | 9.23 | 10.85 | 9.23 | 8.68 |
| `half-time-shuffle` | 19.68 | 18.95 | 19.68 | 18.95 | 19.68 | 18.95 |
| `high-bpm-dnb` | 18.23 | never | 18.88 | never | 18.88 | never |

  Batching is not the cause (per-frame delivery does not help `lonley`). The running-peak scaling costs `lonley`, the log
  compression costs `syncopationbass2`, and on `summer2000` no FFT-band feature opens the gate at all. `BassPulse`'s
  own feature (RMS of the 120 Hz, 24 dB/octave lowpass over the last 2048 samples), read only at the end of the newest
  delivered worklet frame, matches the pre-hub gate within 0.02 s on 12 of 13 tracks (`summer2000` +0.48 s). The hub
  input is better than pre-hub on `syncopationbass` and `high-bpm-dnb`; that gain is lost with the `BassPulse` feature.
- **C1 candidate (for the S3 review):** `gateBass` carries `BassPulse`'s feature, computed in the worklet per frame and
  read through the hub at render time; the dancer and cubes run a `BassPulse`-rate envelope over it. It restores pre-hub
  gate timing by construction and keeps a single analysis path (AC10).

### Other failing cells (not hub regressions: their code is unchanged since before the hub)
| Metric | Tracks | Owner |
|---|---|---|
| `beat.errorMedianMs` | `low-bpm-rnb` 169, `summer2000` 129, `syncopationbass` 54 ms; `6-8-time` never locks | S7 (cause not isolated in S3) |
| `onset.f50` | `no-kick-124` bass 0.67, `bassline-kick-120` bass 0.77 and kick 0.68 (0.76 before the replay applied the gain) | S6 |
| `tempo.maxErrorAfterLock` | `drifting-tempo` 0.028; `6-8-time` never locks | S7 |
| `tempo.falseSongChanges` | `6-8-time` 1 | S7 |
| `tempo.beatlessNeverLocks` | `beatless` locks at 3.1 s (and the dancer's lock holds, so both gates open) | S7 |
| `ac9.dottedChangeCounted` | the dotted 100 to 150 change is never counted (the shelved 3/2 work) | S7, deferral candidate (D11) |

## Open for S3
- Live cells (`npm run scorecard:live`, metrics in `targets.ts` under `LIVE_METRICS`): record today's build and the
  pre-hub worktree on `dancing-character`, `cubes` and `trio-color-wave`, then commit the baseline.
- Review with Trevor: AC6 restated or kept, stretch targets (D10), which fix slices proceed, deferrals, and C1.

## Follow-ups outside the fast lane
- **`FU-HR-analyzer-counters`** (R2, it changes the `RhythmState` contract): the engine counts soft boundaries
  (`engine/boundaryProbe.ts`) and times song changes (`engine/songChanges.ts`) by wrapping `BoundaryDetector` and
  `RhythmAnalyzer` prototype methods for the duration of a replay. It works and its specs fail on a rename, but the
  analyzer should expose both counters instead.
