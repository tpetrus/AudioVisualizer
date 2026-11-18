# Hub scorecard: findings

The acceptance scorecard of the hub-regressions plan (`docs/plans/hub-regressions/`). It scores every applicable
acceptance metric for every `.debug-in` track, so a fix tuned on one track cannot silently break another. This file maps
each failing cell to a measured cause and the slice that owns it; S3 fills in the causes.

## How to run it
- `npm run scorecard` replays the app's own rhythm pipeline, band onsets, `AudioHub` and the dancing character's gate
  over every WAV in `.debug-in`, offline and on track time, and writes `hub-scorecard.cells.json` and `.md` here (not
  `hub-scorecard.md`, which is this doc). About 8 s for the current folder, and two runs give identical cells. It merges
  the live cells from `hub-scorecard.live.json` when their targets version matches.
- `npm run scorecard:live -- --viz <name>` records the live cells (4 `debug:viz` runs per track: two fresh page loads
  and one page that plays the track twice); `--ingest <folder> --prehub` reads runs of the pre-hub build. About 45 min
  per visualizer. Live cells are advisory (decision D13): they never block.
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
- **Gate (AC6)** is timed from the dancer's own tempo lock (`gate.secondsAfterLock`, floor 4 s, stretch 2 s, no later
  than pre-hub), as Trevor restated it at the S3 review (targets version 4). The gate cannot open before the lock, and
  the lock alone comes at 3 to 11 s. The time from track start (`gate.firstOpenSeconds`) is still reported.

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
Rerun at targets versions 4 and 5 (`043ddd8`; AC6 timed from the lock, then the live tolerances) for the committed
baseline: still 142 of 170, and the 16 gate failures are now `gate.secondsAfterLock` (only the gate cells changed
metric).

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
Measured from track start (targets version 3), the gate failed on all 16 kick tracks, and on none of them would the
pre-hub input have passed either.
- **Cause 1, every track: 4 s from track start cannot be met by any gate input.** The dancer's tempo lock arrives at
  3.1 s or 8.1 s (11.4 s on `half-time-shuffle`), and even the pre-hub gate then needs 3.9 to 5 s of kicks on clean
  synthetic drums (`gate.secondsAfterLock`). Trevor restated AC6 from the lock at the S3 review, so what remains is the
  gate rule's own pace (S5). The older "pre-hub 0.3 s on `imyourgirl`" figure does not reproduce under any timing.
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

  Batching is not the cause (per-frame delivery does not help `lonley`). The running-peak scaling costs `lonley`, the
  log compression costs `syncopationbass2`, and on `summer2000` no FFT-band feature opens the gate at all. `BassPulse`'s
  own feature (RMS of the 120 Hz, 24 dB/octave lowpass over the last 2048 samples), read only at the end of the newest
  delivered worklet frame, matches the pre-hub gate within 0.02 s on 12 of 13 tracks (`summer2000` +0.48 s). The hub
  input is better than pre-hub on `syncopationbass` and `high-bpm-dnb`; that gain is lost with the `BassPulse` feature.
- **C1 candidate (for the S3 review):** `gateBass` carries `BassPulse`'s feature, computed in the worklet per frame and
  read through the hub at render time; the dancer and cubes run a `BassPulse`-rate envelope over it. It restores pre-hub
  gate timing by construction and keeps a single analysis path (AC10).

### C1: a third gate input (searched at Trevor's request)
Trevor asked for an input that does better across all the clips together rather than a choice between the hub's low end
and `BassPulse`. Seconds from the dancer's lock to the first opening, offline, over the 15 kick tracks in `.debug-in`
(a gate that never opens counts the rest of the track):

| Input | Sum after lock | Tracks worse than the better of hub and pre-hub (by more than 0.1 s) |
|---|---|---|
| Hub low end (today) | 143.5 s | 6 |
| `BassPulse` (pre-hub) | 133.7 s | 3 |
| `BassPulse` feature at worklet frame times | 134.2 s | 4 |
| Louder of the two pulses, one gate | 141.5 s | 5 |
| **Two gates, one per input, the dancer's gate opens when either opens** | **117.2 s** | **1** (`summer2000`, +0.5 s) |
| Hub kick and bass onset events as the pulse | 131.0 s | 5 |
| Hub kick onset events only | 154.2 s | 8 |
| Linear sum of the hub's sub and kick bands | 156.9 s | 7 |

- **Two gates** is the clear collective best: it takes the earlier of two independent kick detectors, so it is never
  later than either input except where the frame-timed `BassPulse` feature lags (`summer2000`). Its cost is false opens:
  on tracks without a kick it opens as soon as the faster of the two (`syncopation-no-kick` 6.7 s after the lock,
  `click-120` 4.4 s, `beatless` 4.2 s), and its false-open rate on random bass has not been measured; it is at most the
  sum of the two gates' rates. Measure that before S4 builds it.
- **Onset events** are the most hub-native input (time-stamped, no level scaling): fastest on `drums-150`,
  `half-time-shuffle` and `drifting-tempo`, and the slowest to open on `syncopation-no-kick` (9.9 s; kick onsets alone
  never open it). But they never open on `summer2000` and lag on `imyourgirl` and `syncopationbass`; they depend on the
  kick onsets S6 is to improve, so they are worth re-scoring after S6.
- **No input meets AC6 alone.** Even the best one opens within 4 s of the lock only on `drums-128`; clean synthetic
  drums still take 4.4 to 5.7 s. The gate rule's evidence pace (S5) decides AC6 more than the input does.

### Other failing cells (not hub regressions: their code is unchanged since before the hub)
| Metric | Tracks | Owner |
|---|---|---|
| `beat.errorMedianMs` | `low-bpm-rnb` 169, `summer2000` 129, `syncopationbass` 54 ms; `6-8-time` never locks | S7 (cause not isolated in S3); `6-8-time` deferred (D11) |
| `onset.f50` | `no-kick-124` bass 0.67, `bassline-kick-120` bass 0.77 and kick 0.68 (0.76 before the replay applied the gain) | S6 |
| `tempo.maxErrorAfterLock` | `drifting-tempo` 0.028; `6-8-time` never locks | S7; `6-8-time` deferred (D11) |
| `tempo.falseSongChanges` | `6-8-time` 1 | deferred (D11) |
| `tempo.beatlessNeverLocks` | `beatless` locks at 3.1 s (and the dancer's lock holds, so both gates open) | S7 |
| `ac9.dottedChangeCounted` | the dotted 100 to 150 change is never counted (the shelved 3/2 work) | deferred (D11) |

## S3 findings, live (targets version 6)
Recorded headless on 2026-11-17 and 18, one run at a time from the main checkout: today's build at `043ddd8`, and the
pre-hub build at `2a19e55` from a worktree with its own `npm ci`. 4 runs per track (two fresh page loads, then one page
that plays the track twice), on 17 tracks for `dancing-character` and the 15 kick tracks for `cubes` and
`trio-color-wave`. The cells are at targets version 5, recomputed from the same recordings with `--ingest` after the
review (every per-run value is identical to version 4; the file's revision is the commit it was ingested on, and the app
code is unchanged since `043ddd8`). 172 applicable live cells: 143 pass, 25 fail, 4 unavailable (dancer latency cells
with fewer than 3 measurable runs; `bassline-kick-120` is rendered in memory, has no WAV to play and so has no live
cells). Version 6 (below) moved 3 hit share cells to fail: 140 pass, 28 fail, 4 unavailable. With the 170 offline cells
the committed scorecard has 342: 282 pass, 56 fail, 4 unavailable. The hit share
floor is the pre-hub median minus 0.05 and the latency floor the pre-hub median plus one frame (16.7 ms), so those cells
fail only where the hub made a visualizer worse.

| Metric | Dancer | Cubes | Trio |
|---|---|---|---|
| `live.gate.secondsAfterLock` (floor 4 s) | 1 pass, 14 fail | - | - |
| `live.clip.maxDeviationLoops` (floor 0.05) | 6 pass, 5 fail | - | - |
| `live.lock.spreadSeconds` (floor 2 s) | 11 pass | - | - |
| `live.hit.share50ms` (no worse than pre-hub) | 13 pass, 2 fail | 11 pass, 4 fail | 14 pass, 1 fail |
| `live.reaction.latencyMs` (no worse than pre-hub) | 10 pass, 1 fail, 4 unavailable | 14 pass, 1 fail | 15 pass |
| `live.falseFire.share` (report only) | 15 | 15 | 15 |

### Version 6: one fire-to-beat rule (`FU-HR-falsefire-onset`)
At version 5 the hit share compared a rise with the level just before the beat, while the false-fire share counted a
fire only in [beat, beat + 50 ms]. A reaction a few ms ahead of a tapped beat (tapped beats jitter about 20 ms) was then
a hit and a false fire at once, or a miss and a false fire. Version 6 uses one detector and one window for both: a fire
is the first row 0.2 of the column's range above its minimum over the previous 50 ms, and it belongs to a beat when it
lies in [beat - 20 ms, beat + 50 ms] (`liveFireHitsBeat` in `targets.ts`). Recomputed with `--ingest` from the same
recordings (the version 5 file reproduces exactly first; `cubes` `drums-128` is pinned to its 4 S3 runs of 2026-11-18,
because the folder holds newer ones): false fires fall in every run that changed (150 runs, mean -0.03), hit share rises
in 117 runs and falls in 33 (a rise that starts more than 20 ms early is no longer a hit; a rise on an already raised
column is no fire). No offline cell changes. 3 hit share cells now fail, all on tracks hit below 0.25 in both builds:
`cubes` `drifting-tempo` (0.018 against a pre-hub median that rises from 0 to 0.080, since pre-hub `cubes` reacts
just ahead of the beat), `cubes` `low-bpm-rnb` (0.100 against 0.157) and `trio-color-wave` `low-bpm-rnb` (0.157
against 0.200).

### Gate, live: the offline causes confirmed
Seconds from the dancer's lock to the first opening, median of 4 runs (pre-hub in parentheses). Only `drums-128` meets
4 s (3.9; 3.9 pre-hub), so the gate rule's pace (S5) is still the main cause on every other track.
- **The hub's input is later:** `summer2000` 17.4 s and 2 of 4 runs never open (7.7 s, all 4 open),
  `syncopationbass2` 6.4 (4.1), `drifting-tempo` 5.2 (4.6), `drums-100` 5.4 (4.9). Owner S4.
- **The hub's input is earlier:** `syncopationbass` 9.3 (15.0), `high-bpm-dnb` 16.2 with 2 runs at 10.5 (never opens
  pre-hub), `imyourgirl` 4.1 (4.5), `drums-150` 4.0 (4.5).
- **The same within 0.1 s:** `drums-128`, `half-time-shuffle` 10.7, `lonley` 5.6 and the three trap tracks (4.3 to
  5.9). `low-bpm-rnb` opens about 20 s after the lock in both builds, and one run never opens in either.
- **`lonley` is the same live in both builds** (5.6 s), while offline it is 17.1 s against 11.5 s. The offline `lonley`
  gap above is a replay artifact; tune `lonley` live.

### Clip phase (AC7): two causes, both older than the hub
The same 4 tracks fail pre-hub (`6-8-time`, `drifting-tempo`, `half-time-shuffle`, `summer2000`); `low-bpm-rnb` fails
only today, through one run's lock (below).
- **Re-select keeps the dance (owner S8).** In both builds, the second play in one page continues the auto rotation (a
  new dance every 8 bars, `AUTO_ROTATE_BARS`) from the dance the first play ended on: `restartDance` rewinds the clock
  and resets the director but keeps the active dance. So that run is a step further along the rotation than a fresh
  load. On `imyourgirl`, `half-time-shuffle` and `6-8-time` it dances another clip from the start (on `imyourgirl` a
  4-beat loop, 0.25 loop per beat, against the fresh runs' 8-beat loop at 0.125). On `lonley`, `summer2000`,
  `drifting-tempo`, `syncopation-no-kick`, `syncopationbass` and `syncopationbass2` it rotates into the 4-beat dance at
  18 to 30 s, where the fresh runs' clip keeps its 8-beat loop. It then reads 0.44 to 0.5 loop off on 9 of 11 tracks;
  the 3-of-4 rule hides it wherever the other 3 runs agree. (`high-bpm-dnb`'s re-select run is 0.37 off with no change
  of loop length; not isolated.)
- **Fresh runs disagree (owner S7).** `6-8-time`: the runs settle on different tempos (120 against 184 to 190 bpm).
  `summer2000`: two fresh runs' beat grids sit a beat apart (0.11 to 0.13 loop from 9 to 17 s, 0.16 to 0.19 from 26 s),
  the live side of its 129 ms beat error. `low-bpm-rnb`: one run locks at 8.2 s instead of 3.2 s and follows another
  tempo path (0.28 loop), which with the re-select run splits the 4 runs 2 against 2. `half-time-shuffle`: two runs'
  clips jump about half a loop at different moments late in the track (26.5 and 27.7 s); not isolated (S8, or S7 if it
  is the 3-beat bar the tracker reports from 19 s).
- **Lock spread passes everywhere** (the closest 3 runs lock within 0.06 s), but `drifting-tempo` and `low-bpm-rnb` each
  had one run lock 5 s away from the others (3.2 against 8.2 s), the decision edge already seen on `syncopationbass`.

### Reaction (AC8): `cubes` is later through the hub, `trio-color-wave` is unchanged
- **`cubes` (owner S4):** on clean synthetic drums its median reaction is 8 to 12 ms later than pre-hub, and every run
  is later than every pre-hub run: `drums-150` 40 against 31 ms, `trap-2to1-double-90` 39 against 31,
  `trap-2to1-half-140` 26 against 15. That is inside the one-frame latency tolerance, so it fails through the 50 ms hit
  share instead: `drums-150` 0.22 against 0.47, `trap-2to1-double-90` 0.88 against 1.0. `syncopationbass` is 89 against
  70 ms, past the tolerance. On real songs it is earlier: `summer2000` 98 against 144 ms (hit share 0.14 against 0.03),
  `lonley` 54 against 71, `imyourgirl` 39 against 49. The mechanism of the delay is not isolated yet; the cubes input is
  the hub's low end since the hub merge.
- **`dancing-character` (owner S4):** fewer hits on `drums-150` (median 0.21 against 0.76: 2 runs never hit, 1 run
  pre-hub), and `drums-128` is 0.006 under its floor (0.698 against 0.704; one run hits 0.65). Later on
  `trap-2to1-half-140` in all 4 runs (34 against 25 ms), inside the tolerance. The `syncopationbass` latency fail (126
  against 90 ms) is noise: its runs spread from 9 to 220 ms in both builds. The dancer never hits within 50 ms on
  `drums-100` or `low-bpm-rnb` in either build, so those cells pass at 0.
- **Tolerances (decided at the S3 review, targets version 5).** One frame at 60 fps is 16.7 ms, and the dancer's hit
  share is bimodal per run in both builds (a run hits about 0.7 or 0). At version 4 (5 ms, and 3 of 4 runs for every
  per-run cell) 6 reaction cells failed on that noise, for example the dancer's `drifting-tempo` hit share with the same
  median as pre-hub (0.36). Latency may now be one frame later than pre-hub, and the dancer's hit share passes on its
  median.
- **False fires** are still 0.5 to 1.0 for `cubes` and `trio-color-wave` on most tracks in both builds at version 6
  (medians 0.76 and 0.66; the dancer's fell from 0.69 to 0.43): every reaction to an onset that is not a labeled beat
  counts as false, so the 0.1 stretch measures onset selectivity, not timing. Report only.

### Failing live cells by owner
| Cells | Tracks | Cause | Owner |
|---|---|---|---|
| `live.gate.secondsAfterLock` | 14 kick tracks | the gate rule's pace; the hub input is later on `summer2000`, `syncopationbass2`, `drifting-tempo`, `drums-100` | S5, S4 |
| `live.clip.maxDeviationLoops` | `drifting-tempo`, `half-time-shuffle`, `low-bpm-rnb`, `summer2000` | re-select keeps the dance; tempo, beat and meter disagreements between fresh runs | S8, S7 |
| `live.clip.maxDeviationLoops` | `6-8-time` | the tracker settles on no one tempo for 6/8 | deferred (D11) |
| `live.hit.share50ms` (`cubes`) | `drums-150`, `trap-2to1-double-90` | cubes reacts 8 to 12 ms later through the hub on synthetic drums | S4 |
| `live.hit.share50ms` (`cubes`, `trio-color-wave`) | `drifting-tempo` (`cubes`), `low-bpm-rnb` (both) | below 0.25 in both builds; pre-hub gains more early hits at version 6 | S4 |
| `live.reaction.latencyMs` (`cubes`) | `syncopationbass` | 89 against 70 ms | S4 |
| `live.hit.share50ms` (dancer) | `drums-150`; `drums-128` (0.006 under) | fewer hits through the hub | S4 |
| `live.reaction.latencyMs` (dancer) | `syncopationbass` | noise (runs from 9 to 220 ms in both builds) | none |

## S3 review decisions (Trevor, 2026-11-18)
- **C1:** S4 first measures the two-gate input's false-open rate offline, then picks it or the `BassPulse` feature.
- **Live tolerances** (targets version 5): latency may be one frame later than pre-hub; the dancer's hit share passes on
  the median of its runs.
- **Stretch targets (D10):** the gate within 2 s of the lock and latency at 30 ms plus a frame stay. Hit share 0.9 and
  false fires 0.1 stay for now and are revisited once `FU-HR-falsefire-onset` settles the false-fire rule (settled at
  targets version 6, above; the stretch values are unchanged).
- **Slices:** S4 to S10 go, in the plan's order.
- **Deferred to a separate plan (D11; out of the 100 percent):** `ac9.dottedChangeCounted` (the dotted 100 to 150 change
  needs the shelved 3/2 work), and the `6-8-time` cells, which share one cause, the tracker settling on no one tempo for
  6/8 (offline it never locks; live runs settle on 120 or 184 to 190 bpm): `beat.errorMedianMs`,
  `tempo.maxErrorAfterLock`, `tempo.falseSongChanges` and `live.clip.maxDeviationLoops`.

## Follow-ups outside the fast lane
- **`FU-HR-analyzer-counters`** (R2, it changes the `RhythmState` contract): the engine counts soft boundaries
  (`engine/boundaryProbe.ts`) and times song changes (`engine/songChanges.ts`) by wrapping `BoundaryDetector` and
  `RhythmAnalyzer` prototype methods for the duration of a replay. It works and its specs fail on a rename, but the
  analyzer should expose both counters instead.
