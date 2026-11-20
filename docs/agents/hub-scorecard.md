# Hub scorecard: findings

The acceptance scorecard of the hub-regressions plan (`docs/plans/hub-regressions/`). It scores every applicable
acceptance metric for every `.debug-in` track, so a fix tuned on one track cannot silently break another. This file maps
each failing cell to a measured cause and the slice that owns it; S3 fills in the causes.

## How to run it
- `npm run scorecard` replays the app's own rhythm pipeline, band onsets, `AudioHub`, the dancing character's gate
  and the cubes' bass trigger over every WAV in `.debug-in`, offline and on track time, and writes `hub-scorecard.cells.json` and `.md` here (not
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
| `onset.f50` | `no-kick-124` bass 0.67, `bassline-kick-120` bass 0.77 and kick 0.68 (0.76 before the replay applied the gain) | S6: `no-kick-124` fixed (1.00); `bassline-kick-120` kick 0.81 and bass 0.77 deferred (D11, see "S6 findings") |
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

## S4 findings (targets version 7, measured on `1493adf`)
S4 added contract C1 (`docs/plans/hub-regressions/contracts.md`): the hub's `gateBass.pulse` is `BassPulse`'s feature
(the RMS of a 120 Hz, 24 dB/octave lowpass over the newest 2048 samples), read at the render time from the hub's own
tap of the tracker's source (`app/features/audio/hub/gateBassTap.ts`, which `BassPulse` now uses too). The dancer's
gate and the cubes' bass trigger (`app/features/visualizers/cubes/cubesBass.ts`, now replayed offline) read it through
`BassPulse`'s own envelope (`GATE_BASS_BUMP`, unseeded as `BassPulse` is). Version 7 adds the offline cube cells
`cubes.hit.share50ms` and `cubes.reaction.latencyMs`, judged against the pre-hub cubes with the live cells' tolerances:
a hit share at most 0.05 lower and a latency at most one frame later.

The first design carried the feature in the worklet's frames (`FeatureBatch` version 3, `13f4f34`). It matched pre-hub
offline but was later live, where a frame is up to a batch plus a message old when the hub reads it: the cubes'
latency averaged 72.7 ms against 62.9 pre-hub, the dancer's hit share 0.22 against 0.37, and the gate opened 0.5 to
2.4 s later than pre-hub on the three drum tracks. Trevor chose the render-time read (plan amendments, option A); the
worklet is back to version 2.

### Offline
- **Every gate and cube cell equals pre-hub.** The replay gives the hub the same filtered audio pre-hub reads
  (`gateInputs.test.ts`: the hub gate is the pre-hub gate on the same audio). That retires the `summer2000` and
  `bassline-kick-120` exceptions recorded for the frame-timed design.
- **Gate (AC6, as amended):** on all 16 kick tracks the first opening after the lock equals pre-hub's; `drums-128`
  (3.95 s) is the only one inside the 4 s floor, which S5 owns. `high-bpm-dnb` and `low-bpm-rnb` never open in either
  build.
- **False opens on random bass** (300 patterns, beat clock locked): 5 at 120 beats and 27
  at 400 beats, equal to pre-hub (the frame-timed feature gave 5 and 23, the hub low end 2 and 19;
  `npm run probe:gate-inputs`). The 16 kick tracks' seconds to the first opening sum to 139.1, equal to pre-hub (hub
  low end 148.2, frame-timed 139.6).
- **Cubes (AC8):** 32 of 32 cells pass.
- **Ratchet:** against the version 7 baseline of the frame-timed design, no cell went from pass to fail. The new
  baseline holds the 202 offline cells: 175 pass, 27 fail.

### Live
Recorded headless on 2026-11-19, one run at a time from the main checkout at `1493adf`, 4 runs per track; the pre-hub
runs are S3's, ingested again. 179 applicable live cells: 138 pass, 28 fail, 13 unavailable (`cubes` 45 pass, 0 fail;
`dancing-character` 49 pass, 27 fail; `trio-color-wave` 44 pass, 1 fail, unchanged).

| Mean over the tracks | S3 (hub low end) | S4, frame-timed | S4, render time | Pre-hub |
|---|---|---|---|---|
| `cubes` latency (ms) | 60.5 | 72.7 | 61.2 | 62.9 |
| `cubes` hit share | 0.33 | 0.29 | 0.35 | 0.34 |
| `cubes` hit share cells passing | 11 of 15 | 10 of 15 | 15 of 15 | - |
| `cubes` latency cells passing | 14 of 15 | 12 of 15 | 15 of 15 | - |
| dancer hit share | 0.32 | 0.22 | 0.34 | 0.37 |
| dancer hit share cells passing | 13 of 15 | 6 of 14 | 12 of 14 | - |
| dancer gate, seconds after the lock | 8.28 | 7.76 | 7.16 | 7.21 |

- **`cubes` (AC8) passes on every track**, which retires S3's four `cubes` hit share failures and its latency failure.
- **The dancer's gate opens as pre-hub does** (medians within the run spread on every track, AC6 as amended).
  `drums-128` is back to 3.88 s (frame-timed 6.31, pre-hub 3.89), and its hit share back to 0.75 (frame-timed 0).
- **The dancer's remaining failures are run-to-run modes, not the input.** On `drums-150` each run either learns the
  kick place (hit share 0.74 to 0.76) or not (0): 2 of 4 runs here, 2 of 4 in S3, 1 of 4 pre-hub. That leaves a median of
  0.37 against 0.76. On `drifting-tempo` and `high-bpm-dnb` the tracker locks either at about 3.2 or at about 8.2 s
  (pre-hub and S3 have the early mode on `drifting-tempo` too). Two of four runs locked early here, which fails
  `live.lock.spreadSeconds` on both tracks, moves the runs' clip phases apart (`live.clip.maxDeviationLoops`) and gives
  `drifting-tempo` a median hit share of 0.15 and a latency of 125 ms. The tracker's code is unchanged in S4 (the
  worklet is version 2 again), and the offline cells, which replay one deterministic run, equal pre-hub. The dance clip's
  phase is set before the gate runs, and the gate only drives the club, the rim light and the bump. A confirmation run
  of the three tracks on the same commit (4 runs each, not committed) had one odd run per track: `drums-150`'s hit share
  0.74 against 0.76 and latency 28 against 31 ms, `drifting-tempo`'s hit share 0.29 against 0.29, latency 13 ms, lock
  spread 0.01 s and clip deviation 0.003 all pass, and `high-bpm-dnb`'s lock spread passes. `high-bpm-dnb`'s clip
  deviation still fails (0.19 against 0.003) in a phase the gate does not touch; its owner stays S7 and S8.
- **`syncopationbass`'s dancer latency** still fails on noise (runs from 9 to 228 ms in every build).

## S5 findings (targets version 7, measured on `dc822bf`)
S5 changed the gate rule (`app/features/rhythm/bassGate.ts`, `bassGateConfig.ts`), not its input. Tuned offline with
`npm run sweep:gate`, which replays every track and random-bass pattern once and re-steps only the gate per row of
`bassGateConfig` overrides; `--lock-at S` hides the random bass's beat clock for S seconds, the only way to measure what
the gate does before a lock, because the random-bass replay is otherwise locked from its first frame.

### Cause: the first bar after the lock was always lost
The tracker reports no beat phase before the dancer's lock (on every kick track the phase appears on the lock's own
tick), so a kick heard before the lock had no place in the beat, and the first bar after the lock had nothing to
repeat. Clean on-beat kicks therefore opened the gate on beat 8 after the lock at the earliest, which is 4 s at
120 bpm and more at slower tempos. No retune of the constants alone fixes that: of 24 combinations of open score,
repeat rate and chance margin, those within today's false opens put at most 4 of the 16 kick tracks inside 4 s.

### The rule
- **Kicks heard before the lock are kept by time and placed on the beat at the lock**, from the tracker's tempo
  (`rhythm.bpm`), for the last `BASS_GATE_PRELOCK_SECONDS` (3 s), and weighed as evidence. A gate still open through a short dropout keeps its own bassline; a song change drops them.
- **The gate opens on the kick on the beat**, not on whichever kick came last: the place it learns at the opening is
  where most kicks of the last two bars land, preferring a repeated place within 0.2 beat of 0.1 (the bass pulse's lag).
  Opening sooner had made the latest kick an off-beat accent on four tracks, live: every bump landed 90 to 300 ms off
  the beat and the dancer's hit share fell to 0 on `drums-128`, `trap-2to1-double-90`, `trap-4to3-120` and `lonley`.
  `sweep:gate` now reports where the bumps land against the tapped beats, so that shows offline.
- **Retuned** for it: repeat rate 0.6 to 0.8, chance margin 1.3 to 1.6, open score 6 to 5.5 (Trevor, 2026-11-19).

### Offline
| | Before S5 | S5 |
|---|---|---|
| Kick tracks open within 4 s of the lock (AC6 floor) | 1 of 16 | 12 of 16 |
| Within 2 s (stretch) | 0 | 6 |
| Sum of seconds after the lock | 139.1 | 74.9 |
| False opens, 300 random-bass patterns, 120 and 400 beats | 5, 27 | 3, 15 |
| Same, beat clock hidden for the first 3 s | 4, 26 | 3, 15 |
| Same, hidden for 8 s | 4, 26 | 2, 14 |
| No-kick tracks that open | 3 | the same 3 |

- **No kick track opens later than before.** `syncopationbass` 18.17 to 1.73 s, `imyourgirl` 4.60 to 0.15,
  `high-bpm-dnb` never to 1.93, `lonley` 11.48 to 10.83, `summer2000` 7.03 to 6.10.
- **Ratchet:** `scorecard:check` passes against the version 7 baseline; only `gate.firstOpenSeconds` and
  `gate.secondsAfterLock` cells changed, 11 from fail to pass and none from pass to fail. Blocking failures 27 to 16.
- **The pre-hub column moves with it.** The replay steps the same rule for the hub input and the pre-hub input, so the
  gate's "no later than pre-hub" part of AC6 compares inputs, not rules; the ratchet against the latest baseline is
  what guards the rule.
- **The committed gate recordings** (`scripts/fixtures/rhythm/gate/`, `replay:gate`, which now feeds the gate the
  tempo) open earlier on four tracks, and `summer2000` no longer opens on its old recording: its dense, loosely
  repeating bass earns too little per repeat under the 1.6 margin. A margin of 1.45 saved that recording (11.72 s) but
  opened 8 and 31 random-bass patterns, more than before; Trevor kept 1.6 and the live cells decide `summer2000`.
- **`bass-ink` shares the rule**, fed by its own `BassPulse`; it has no reaction cell yet (S9 measures one).

### Live
Recorded headless on 2026-11-20, one run at a time from the main checkout at `3ddcd03`, 4 runs per track; the other
visualizers' live cells are S4's (S5 changes only the gate, which only the dancer and `bass-ink` run). The dancer passes
61 of its live cells and fails 17 (S4: 49 and 27).

| Seconds from the lock to the first opening, median of 4 runs | S4 | S5 |
|---|---|---|
| `syncopationbass` | 16.45 | 1.58 |
| `trap-4to3-120` | 4.32 | 0.70 |
| `trap-2to1-half-140` | 5.03 | 1.53 |
| `imyourgirl` | 4.53 | 2.30 |
| `drums-128` | 3.88 | 2.77 |
| `drums-100`, `drums-150`, `drifting-tempo`, `trap-2to1-double-90` | 4.8 to 5.9 | 2.9 to 2.95 |
| `syncopationbass2` | 4.05 | 3.58 |
| `high-bpm-dnb` (no pre-hub value, so the cell fails) | 6.65 | 2.17 |
| `summer2000` | 7.39 | 6.06 |
| `lonley` | 5.60 | 5.30 |
| `half-time-shuffle` | 10.69 | 10.36 |
| `low-bpm-rnb` | 17.81 | 18.49 |

- **AC6 live:** 11 of 15 kick tracks open within 4 s of the lock (S4: 1), 3 within 2 s.
- **The first S5 build (`dc822bf`) opened on the wrong kick.** It learned its place from the latest kick, which with
  the earlier opening was an off-beat accent on `drums-128`, `trap-2to1-double-90`, `trap-4to3-120` and `lonley`: every
  bump landed 90 to 300 ms off the beat and their hit share fell to 0. `3ddcd03` learns the place on the beat (see The
  rule) and fixes the first three (hit share and latency pass again).
- **Better than S4:** `drums-150` hit share 0.37 to 0.81, `drifting-tempo` hit share 0.15 to 0.37 and latency 125 to
  13 ms, `syncopationbass` latency 157 to 83 ms, `high-bpm-dnb` lock spread and `half-time-shuffle` clip deviation pass.
- **Signed-off exceptions (Trevor, 2026-11-20), worse than S4 beyond the spread:**
  - `lonley`: hit share 0.29 to 0, latency 53 to 230 ms, false fires 0.47 to 1. In the two bars before it opens, its
    kicks land only off the beat (phases 0.56, 0.56, 0.36 at 139.5 bpm), so there is no place on the beat to learn and
    the gate pulses at 0.61; S4 happened to open on a rare kick on the beat. Owner S8 (where the dancer's bass lands).
  - `summer2000`: hit share 0.15 to 0.02, latency 12 to 160 ms, false fires 0.68 to 0.97. The gate now learns a place on
    the tracker's beat, but the tracker's beat is about 130 ms off the tapped beats on this track (`beat.errorMedianMs`
    129); S4's place happened to sit nearer the real beat. Owner S7.
  - `live.lock.spreadSeconds` on `low-bpm-rnb` (0.011 to 0.064 s) and `syncopationbass` (0.011 to 0.160 s): the
    tracker's lock time across runs, which S5 does not touch; both pass their floor.
- `trap-2to1-half-140`'s latency is 2.4 ms later (25.5 against 23.1, spread 1.4) and passes.
- **The baseline is regenerated at targets version 7** with these cells, so the ratchet compares later slices with S5.

### Tracks still over 4 s (signed off, Trevor, 2026-11-19)
- **`half-time-shuffle` (7.18 s), deferred to S7.** The tracker locks at 169 bpm, where the bassline repeats every
  3 beats, not every 4; the gate's bar comparison (4 beats, or 8 when the place a bar back is empty) cannot match it
  until the bass turns into one kick per beat. Fixing it in the gate means searching for any bar length, a redesign;
  the tracker's grid for shuffle is S7's.
- **`low-bpm-rnb` (never opens in any build), deferred to S7**; cause not isolated.
- **`lonley`** opens 5.30 s after the lock live (10.83 offline, where S3 found its replay unrepresentative).
- **`summer2000`** opens 6.06 s after the lock live (6.10 offline).

## S6 findings (targets version 7, measured on `054283e`)
S6 changed the per-band onset detector (`app/features/rhythm/bandOnsets.ts`). Nothing in the app reacts to the hub's
onset events yet (only dev telemetry reads them, and the tracker does not), so it moves only the offline onset cells.
Tuned offline with `npm run sweep:onsets -- --dir .debug-in --no-kick syncopation-no-kick` (6 s per point). Its checks
on the tapped tracks failed 7 times before S6 (`imyourgirl` snare 2.20, `syncopation-no-kick` kick, snare and lift,
plus the three synthetic cells), and S6 adds none.

### Causes (traced frame by frame)
- **`no-kick-124` bass (0.67): a note struck again on the pitch still sounding.** The notes on beats 0 and 2 start as
  the previous 110 Hz note starts its release. The low end's level rises by 0.12 to 0.16, no more than the held tone's
  ripple, against a running-mean floor of about 0.2. No threshold retune helps: lowering the low end's noise factor never
  lifts the cell and costs `bassline-kick-120`'s kick. The phase restarts, though.
- **`bassline-kick-120` kick on the downbeat (14 of 15 missed):** it lands on a loud G2 note. Its level rise (0.28)
  stays under a noise floor of 0.36 to 0.49 that the bassline keeps up.
- **`bassline-kick-120` F2 step on 2.75 taken for a kick (14):** its harmonics beat against D2's inside the 43 Hz bins,
  so two frames on the rise above the kick's range has dipped (0.35 of the onset's, true kicks keep 0.49 to 0.65).
  That reads as a drum's decay. A frame later is no better (0.35).
- **`bassline-kick-120` bass from nothing 100 ms after the kick on beat 1 (15):** the kick (about 47 Hz) and the B1
  note (62 Hz) beat to a null in bins 1 and 2, and the recovery reads as an attack two frames on. Measuring the rise
  against the highest of the last frames fixes it, but then the kick on beat 2 and the B1 step fail and
  `pad-lead-groove-110`'s kick drops below 0.9, so it was not kept.

### The change
- **A phase detection function for the low end:** per low bin, the angle between the complex spectrum and a steady
  tone's prediction from the previous two frames, weighted by the bin's level now and a frame ago. Every one of
  `no-kick-124`'s 61 bass labels scores at least 0.80, and nothing else on the synthetic tracks scores above 0.3, except
  a low chord swelling in (up to 0.57). The floor is 0.65 (`LOW_PHASE_MIN`); 0.5 to 0.75 scored the same.
- It adds an event only where the level detector stayed quiet, and not within the level detector's 80 ms refractory
  span after a low-end event (a kick over a sounding note turns its phase while the kick's pitch falls: 18 false bass
  events on `drums-150` without that rule).
- **Kick or bass:** a phase event is a kick when the kick's range (below 130 Hz) rose by at least 0.5 in log level with
  it (`LOW_PHASE_KICK_RISE`; 0.2 to 0.7 scored the same). That is the downbeat kick under the G2 note, which rises by
  about 1 there. A note struck again leaves the level where it was. Running the level detector's own kick/bass
  classifier on phase events instead made 19 of `no-kick-124`'s re-struck notes kicks.
- `OnsetFrame` carries the complex spectrum (`real`, `imag`), and `BandOnsets.push` takes the frame. The worklet
  message (C3) and the hub snapshot (C1) are unchanged. The worklet bundle is 5.76 of 5.8 kB.

### Result
- Offline cells that changed (2 of 625): `onset.f50.bass` `no-kick-124` 0.67 to 1.00 (pass), and `onset.f50.kick`
  `bassline-kick-120` 0.68 to 0.81 (recall 1.00, precision 0.80). `bassline-kick-120` bass stays at 0.77. Blocking
  failures go from 16 to 15, and `scorecard:check` passes against the version 7 baseline, which is regenerated here.
- F at 20 ms on `no-kick-124` bass is 0.89: the phase events land a frame or two after the strike, inside 50 ms.
- On the tapped tracks the bass events per beat move by at most 0.12 (`summer2000` 0.78 to 0.90, `imyourgirl` 0.31 to
  0.35); kick, snare and highs are unchanged.

### Deferred (signed off, Trevor, 2026-11-20, under D11)
- **`bassline-kick-120` kick (0.81) and bass (0.77).** The 14 F2 steps taken for kicks keep the kick under 0.9 even
  with every kick found, and the same steps plus the 15 events from the beating null keep the bass under it. Both come
  from two low tones sharing a 43 Hz bin of the 1024-point FFT. Telling them apart needs a finer low-end spectrum, such
  as a longer FFT of a decimated low band or a constant-Q filterbank, at the cost of time resolution or worklet CPU.
  That is a design for a later plan, not a retune.

## S7 findings (targets version 7, measured on `8a881c6` plus the change)
S7 owned the tracker's failing cells: the beat error of `low-bpm-rnb` (169 ms), `summer2000` (129 ms) and
`syncopationbass` (54 ms), the tempo error of `drifting-tempo` (0.028), `beatless` locking, and the gate on
`half-time-shuffle` and `low-bpm-rnb` that S5 handed on. Each was traced with the scorecard (10 s a run), the alignment
report (`eval:rhythm -- .debug-in --alignment`) and scratch probes that fold each flux band over the tapped beats and
over the tracker's own beats, and that log the phase check beat by beat. `syncopation-no-kick`'s wrong lock in the plan
was already fixed: it holds 135 bpm (ratio 0.999), and its beat error passes (30 ms).

### Causes
- **`syncopationbass` (54 ms): halving the tempo kept the off-beats.** The tracker first locks at double time
  (195.7 bpm), where its grid alternates between the beat and the off-beat, and halves to 98 bpm at about 5 s. A halving
  kept every second beat starting after the latest declared one, whichever that was, and here that was the off-beat.
  The grid stayed half a beat off until the phase check moved it at 10 s. Lowering the mid band's weight in the onset
  envelope (`ONSET_BAND_WEIGHTS`, any value from 0.4 to 0.9) also passed the cell, only because it moved the halving by
  one beat. It doubled the white-noise meter spec's total (17 to 35), moved the tracker's crossfade spec to its edge and
  changed the meter's beat feature, so it was dropped for the real cause.
- **`low-bpm-rnb` (169 ms): a syncopated kick a quarter beat early captures the beat loop.** The tracker first locks at
  162 bpm, halves to 81 at 9 s on the wrong beat (the cause above; the fix moves that to the right one), and the phase check then moves it onto the tapped beat at 16 s, as it
  should. From there the beat-by-beat correction, which pulls each beat to the strongest onset within 0.2 of a beat,
  keeps finding the kick that lands a sixteenth before the beat (1.88 kick onsets per beat). The period shrinks to
  0.729 s against the true 0.737 and the grid slides back onto the kick within 5 s. The phase check cannot see a slide,
  because its evidence turns with the grid. Nothing tried moved it: band weights, the phase check's ratio and minimum
  shift, a narrower window, a distance-weighted peak, lower phase or period gains, and following the tempo estimate
  fully. Holding a beat against a strong syncopated onset needs a tracker that keeps more than one phase hypothesis.
- **`summer2000` (129 ms): mostly the tapped truth.** Fitted with one tempo, the taps stray by 80 ms rms and up to
  188 ms, wandering slowly (from -188 ms at 2 s to +142 ms at 15 s). The tracker's grid is steady, and the kick folds
  sharply on it but is smeared on the taps. Tap jitter alone breaks the 40 ms floor.
- **`drifting-tempo` (0.028): tap jitter plus the tracker's lag.** The tapped tempo ramps from 112 to 117 bpm, and the
  tracker trails it by about 1 bpm, because the autocorrelation looks at the last 8 s. The truth is the tempo of each
  8-beat window of taps, and those windows alone stray up to 2.0% from a smooth fit of the same taps. A 6 s history
  barely changes it (0.027) and breaks four passing cells; faster smoothing gives 0.026.
- **`beatless` locks at 3.0 s, with tempo confidence 1.0.** Its onset envelope has a real periodicity near 140 bpm
  (autocorrelation peaks of 0.39 at one period and 0.25 at two), its low band peaks as sharply as the real songs'
  (99th percentile 24 times the median), and its tempo holds within 1% for the first 8 s before it wanders between 139
  and 153 bpm. No tempo or confidence rule can tell it from a beat at the first lock. That needs a model of whether a
  beat is present, such as how sharp the onsets are.
- **Gate on `half-time-shuffle` and `low-bpm-rnb`:** unchanged causes. `half-time-shuffle` still locks at 169 bpm,
  where its bassline repeats every 3 beats (S5's finding), and `low-bpm-rnb`'s beat sits on the early kick above.

### The change
- **A halving keeps the stronger of its two choices** (`BeatTracker.changeOctave`). It sums the envelope's strongest
  frame within 3 frames of each beat of both choices, back over the stored 6 s, and keeps the stronger choice. A tie
  keeps the beat after the latest declared one, as before. A new spec halves double-time pulses with every second one
  stronger, once right after a strong beat and once right after a weak one. Both keep only the strong pulses, and
  without the change the run that halves after a weak beat keeps the weak ones. No other spec or bound changed, and the
  white-noise meter total is 17, as before.

### Result
- Offline, `scorecard:check` passes against the version 7 baseline, and the baseline is regenerated. Blocking failures
  go from 15 to 14: `syncopationbass` beat error 53.5 to 35.7 ms (pass). No other cell changes, except `low-bpm-rnb`'s
  beat error at 183.4 ms (169.1), a cell that already failed and is deferred below.
- All repository checks and budgets pass.
- **Live** (`dancing-character`, 4 runs per track, headless, one at a time, 49 min): 63 of 86 applicable cells pass.
  Now passing: clip deviation on `drifting-tempo` (0.25 to 0.004), `lonley` (0.050 to 0.004) and `syncopationbass2`
  (0.097 to 0.004), `drifting-tempo`'s lock spread (4.99 to 0.02 s), and `low-bpm-rnb`'s latency (50 to 46 ms).
  - **`half-time-shuffle` clip deviation** goes from pass to fail (0.017 to 0.30). That is about pre-hub's 0.29 and
    inside its own spread (0.34), so it is not a regression under AC12. It is the re-select and 3-beat-bar cell S3 gave
    to S8.
  - **`summer2000`** hit share and false fires show as unavailable, because only 2 of 4 runs fired. On a
    confirmation run all 4 fire and both pass (0.017 and 0.97, as in S6).
  - **`high-bpm-dnb` is worse than the S6 baseline beyond the spread:** the gate opens 5.30 s after the lock
    (baseline 2.17 s), hit share is 0.006 (0.065) and latency 115 ms (102). Its offline replay is unchanged by S7. On
    the same day, 4 runs of the base build (`8a881c6`) split the same way: the gate opens at 6.67 s on 3 of 4 runs
    (spread 10.9 s), with hit share 0.018 and latency 100 ms. So the baseline's 2.17 s was a lucky recording, not what
    S7 changed. Recorded as an exception to confirm at review.

### Deferred (under D11; decided by the orchestrator under Trevor's standing instruction of 2026-11-20 to go with the recommendation, to confirm at review)
- **`low-bpm-rnb` beat error and gate:** needs a beat tracker that keeps several phase hypotheses (see Causes).
- **`summer2000` beat error:** its taps drift past the floor. Re-tap it (`npm run tap:beats -- --dir .debug-in --track
  summer2000.wav --force`, twice, keeping the run with less drift), which changes its `.beats.json` hash and the
  baseline.
- **`drifting-tempo` tempo error:** the 8-beat local truth is noise-bound. Score drifting tracks against a smooth fit
  of the taps, or a 16-beat window (`FU-S7-drifting-truth`, which changes the targets).
- **`beatless` lock:** needs a model of whether a beat is present.
- **`half-time-shuffle` gate:** needs the tracker to count the shuffle's beat (83 bpm), not its 169 bpm subdivision,
  or a gate that searches bar lengths. Both are redesigns.

## Follow-ups outside the fast lane
- **`FU-S7-drifting-truth`** (R2, it changes the targets; from S7): `tempo.maxErrorAfterLock` on `drifting-tempo`
  compares with the tempo of each 8-beat window of taps, which strays up to 2.0% from a smooth fit of the same taps, so
  a 2% floor measures tap jitter. Score drifting tracks against a quadratic fit of the tapped beat times (or a 16-beat
  window), and bump the targets version.
- **`FU-S7-retap-summer2000`** (Trevor; needs ears): re-tap `summer2000` twice with the calibration and keep the run
  with less drift against one tempo (today 80 ms rms, up to 188 ms), then regenerate the baseline.
- **`FU-S6-phase-strength-telemetry`** (the dancer's telemetry columns; from S6's review): a phase onset's strength is
  its value over the phase function's own decaying peak, while a level onset's is over its band's peak, so `hub.onsets`
  mixes two scales on `kick` and `bass`. Phase events are also not counted anywhere live. Decide the scale and add a DEV
  counter recorded by `debug:viz` before S9 moves visualizers onto `hub.onsets`.
- **`FU-HR-analyzer-counters`** (R2, it changes the `RhythmState` contract): the engine counts soft boundaries
  (`engine/boundaryProbe.ts`) and times song changes (`engine/songChanges.ts`) by wrapping `BoundaryDetector` and
  `RhythmAnalyzer` prototype methods for the duration of a replay. It works and its specs fail on a rename, but the
  analyzer should expose both counters instead.
- **`FU-S4-hitshare-relative-tolerance`** (R2, it changes the targets; from S4's review): the hit share cells allow an
  absolute 0.05 below pre-hub, so they cannot fail where pre-hub is under 0.05 (`high-bpm-dnb` 0 against 0,
  `summer2000` 0.034) and allow a 58% loss on `lonley` (0.086). Decide on a relative tolerance, such as
  max(0.05, 0.1 × pre-hub), or mark tracks with pre-hub under 0.1 as uninformative.
- **`FU-S4-gatebass-no-source`** (contract C1's wording; from the review of the render-time redesign): the contract and
  `types.ts` say `gateBass.pulse` is 0 with no source, but when the capture stops the tracker has no render time, so
  `hub.update()` returns early and the pulse keeps its last value (the dancer masks it; the cubes' envelope decays), and
  the old tap stays connected until the next source or the hub's dispose. Either release the tap and zero the pulse when
  the tracker has no render time, or document that the last value stays; test it with a tracker whose `renderTimeNow()`
  is undefined.
- **`FU-S4-gatebass-sync-offset`** (contract C1's wording; same review): the pulse is the newest audio, not shifted by
  the user's sync offset as `bands`, `lowEnd` and `beat` are. That is pre-hub's behavior, but the hub's class comment,
  `types.ts` and C1 say every field is read at one render time. Reword them, or shift the pulse, which would change the
  cubes and the dancer for users with an offset.
- **`FU-S5-gate-lock-edges`** (gate timing, needs a live run; from S5's review): on the lock tick a gate that opens from
  kicks placed before the lock can start a spurious bump (`lastPhase` is stale across an unlock), and the unplaced kicks
  are timed on the clamped `dt` clock, so frames longer than 0.1 s compress their spacing and the placement silently stops
  helping. Fix both and add specs for them and for a long unlock, bpm 0 and more than 32 kicks before the lock.
- **`FU-S5-placed-kicks-telemetry`** (the dancer's telemetry columns; from S5's review): a DEV counter of kicks placed
  from before the lock, recorded by `debug:viz`, so live recordings show the placement.
- **`FU-S5-sparse-false-opens`** (the gate rule; found pinning S5's specs): one random note every two beats over 40
  beats opens the gate on 26 of 300 patterns in the level-domain spec (bound 40 pins today's rate), against 2 of 300 for
  one note per beat. Measure it through the hub replay and decide whether the chance minimum or the open score should
  account for sparse bass.
