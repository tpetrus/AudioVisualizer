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
- `npm run scorecard:order -- --pair A,B` checks AC11: per track, alternating sessions that open A then B and B then A
  in one page (`debug:viz --then`), then a comparison of each visualizer when it led and when it followed. Hub rows
  (`gain`, `bassRaw`, the three onset columns and the visualizer's `.in`) compare the RMS difference between the two
  orders, on a 10 ms track-time grid, with the largest difference between two runs of one order. Reaction rows compare
  the followed runs' median hit share, latency and false fires with the committed live cell, allowing its spread. It
  writes `hub-scorecard.order.json` and `.md` and is a report, not a gate.
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
- **`bass-ink` shares the rule**, fed by its own `BassPulse` until S9 moved it onto `gateBass`; S9 adds its reaction
  cell.

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
- **`summer2000` (129 ms): mostly the tapped truth** (corrected in S8: with Trevor's new taps the error is the
  tracker's; see "S8 findings"). Fitted with one tempo, the taps stray by 80 ms rms and up to
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

## S8 findings (targets version 8, measured on `775ad02`)
S8 owned AC7: in 3 of 4 plays of each real track (two fresh page loads and one page that plays the track twice) the
dance stays with the run median after the lock, and the lock times agree within 2 s. Trevor also re-tapped `lonley` and
`summer2000` before S8 (`FU-S7-retap-summer2000`), so the baseline carries their new `.beats.json` hashes. Each cause
below was traced from the dancer's telemetry, run by run, against its own tracker's beat and bar phase.

### The re-tapped truth
- **`lonley`**: 21 ms rms against one tempo (was 25). Beat error 33.3 to 25.9 ms; cubes hit share 0.09 to 0.14 and
  latency 83 to 50 ms.
- **`summer2000`**: 65 ms rms against one tempo (was 80) and tight after 14 s; a few uneven gaps remain between 8.6 and
  13.4 s (0.68, 0.78, 0.35 and 0.34 s against a 0.47 s beat). The cubes now land on the taps (hit share 0.03 to 0.30,
  latency 119 to 45 ms), but the tracker's beat error rises from 129 to 150 ms: its beats sit 130 to 150 ms off the new
  taps through most of the track. That corrects S7's cause ("mostly the tapped truth"): with taps that match the kicks,
  the error is the tracker's. The cell stays deferred under D11.

### Causes
- **A re-select kept the dance the rotation had reached.** `restartDance` rewound the clock and the director's counters
  but kept the active dance, so the second play in a page danced another clip, often with another loop length, than a
  fresh load (S3's finding).
- **The dancer keeps only the beat, and the bar once its meter locks, by design.** Before the meter lock it compares only
  its place in the beat (`computeDanceTiming`: targeting the tracker's beat count would jump half a loop when the count
  jitters), and after it only its place in the bar, while the calm clip is two bars long. Which beat or bar of the loop
  it is on depends on when its clock started: a fresh load starts it when the model loads, about 1.4 s into the track, a
  re-select when the source is chosen. With the re-select fixed, nearly every remaining deviation in loops was a whole
  number of beats (0.125, 0.25, 0.375 or 0.5 of an 8-beat loop): on `imyourgirl` the re-selected run was 0.25 loop off
  until its meter locked at about 20 s and then matched (0.339 against 0.342). The 0.05-loop cell measured that freedom,
  not whether the dancer was with the music.
- **The dancer slides into the bar after a lock.** The phase correction is capped at 0.06 loop a second, so closing two
  beats of an 8-beat clip takes about 4 s; the cell sampled from the latest run's meter lock, when that run had not yet
  caught up (`imyourgirl`, `syncopationbass`, `syncopationbass2` after its tempo lock, `lonley`'s re-select). Once caught
  up every run was within 0.02 beat of its own tracker.
- **A dance an octave from the tracker could not hold the beat** (`half-time-shuffle`). The dance tempo is folded into
  80 to 160 BPM, but the beat and bar phases it aligns to are the tracker's, at the raw tempo: 165 BPM was danced at
  82.5, so one dance beat spanned two tracker beats, the correction could hold no fixed offset, and each run stopped
  somewhere else (every run half a tracker beat off its tracker, runs 0.14 to 0.28 beat apart).
- **The tracker disagrees between runs** (`summer2000` before S8's fixes, `low-bpm-rnb`, `high-bpm-dnb`, `6-8-time`,
  `syncopation-no-kick`): runs put the downbeat a beat apart, the meter lock comes on and off, or the tempo differs (one
  `syncopation-no-kick` run locks 180 BPM, the 4:3 rival of 135).

### The change
- **A re-selected source starts on the dance a fresh load starts with** (`DanceDirector.restart`): in Auto the rotation
  goes back to the initial dance through the usual cross-fade; a manually chosen dance stays.
- **The dancer counts its place in the tracker's beats** (`computeDanceTiming`): `beatsPerLoop` is the clip's beats over
  the step multiple times the tracker tempo over the dance tempo, so a dance at half the tracker's tempo holds one offset
  to its beat and bar. A loop shorter than a tracker bar keeps to the beat. Nothing changes when the two share a tempo.
  The DEV telemetry gains a `beatsPerLoop` column.
- **AC7 measures the alignment the dancer keeps** (targets version 8, Trevor's option 2 at S8):
  `live.clip.maxDeviationBeats` is each run's largest distance, in beats, from the run median, compared within the bar
  where every run is meter-locked and within the beat otherwise; floor 0.2 beat (the old 0.05 loop of a 4-beat clip).
  It skips the 4 s after each run's tempo and meter locks, the slide above (Trevor), and is unavailable when fewer than
  4 s of samples remain, so a lock near the end of a recording cannot pass on a moment. Recordings without the
  `beatsPerLoop` column have no value.
- **The live file was carried to version 8 by hand**: only the clip metric changed, so the header was bumped, the old
  clip cells removed and every other cell kept (the cubes', `trio-color-wave`'s and the pre-hub fields); the dancer's
  cells were then recorded again.

### Result
- **Offline**, against the version 7 baseline only the six re-tap cells above change, none from pass to fail; blocking
  failures stay at 14. The baseline is regenerated at version 8 with the new hashes, and `scorecard:check` passes. All
  repository checks and budgets pass (total JS 334.84 of 335 kB, worklet 5.76 of 5.8 kB).
- **Live** (`dancing-character`, 4 runs per track, headless, one at a time): 62 of 86 applicable cells pass, 9 fail and
  15 are unavailable. The recording was stopped twice for low memory, so 5 tracks were recorded again with `--tracks`;
  every cell comes from runs of `844d72c` or later (the metric commit after it changes no recording).
  - **AC7 clip:** passes on 7 of 11 real tracks: `drifting-tempo` 0.023, `half-time-shuffle` 0.031 (0.24 before the
    octave fix), `imyourgirl` 0.027, `lonley` 0.026, `summer2000` 0.038, `syncopationbass2` 0.040 beat. Fails on
    `syncopation-no-kick` (0.22 beat: the 180 BPM run, and the other runs' tracker grids 0.12 beat apart). Unavailable
    on `6-8-time`, `high-bpm-dnb`, `low-bpm-rnb` and `syncopationbass`, whose latest meter lock comes at 26 to 32 s and
    leaves under 4 s of samples.
  - **AC7 lock spread:** passes on all 11 (largest 0.19 s).
  - **Against the S7 baseline:** `drums-150`'s gate opens 3.12 s after the lock (2.80), inside its 3.1 s spread; S8 does
    not touch the gate. `low-bpm-rnb`'s hit share, false fires and latency show as unavailable (too few runs fired);
    its gate is deferred under D11.
- **Not re-recorded:** the cubes' and `trio-color-wave`'s live cells on `lonley` and `summer2000` are still scored
  against the old taps, because a run folder keeps its own copy of the sidecar (`FU-S8-live-retap`).

### Deferred (under D11, the tracker's; to confirm at review)
- **AC7 on `syncopation-no-kick`, `6-8-time`, `high-bpm-dnb`, `low-bpm-rnb` and `syncopationbass`:** the runs' trackers
  disagree on the tempo, the downbeat or when the meter locks.
- **`summer2000` beat error (150 ms):** the tracker's, as above.

## S9 findings (targets version 8, measured on `64bc86e` before and `9487cf0` after)
S9 owned AC10: every hub-fed visualizer takes its bands and onsets from the hub, with no private band or onset analysis,
and its reaction cell does not drop across the move.

### What was private, and what moves
- **`bass-ink`'s bass gate ran its own `BassPulse`**: two lowpass filters and an analyser of its own, the last private
  analysis feeding a reaction. It now reads `gateBass.pulse` through `BassBump` with `GATE_BASS_BUMP`, as the dancer
  does since S4. The input is `BassPulse`'s by construction (the hub's `GateBassTap` is its chain, and `BassBump` is its
  envelope frame for frame at 60 fps, pinned by `bassBump.test.ts`); away from 60 fps it is now time-based rather than
  per frame, which retires the audit's finding 7 for `bass-ink`. A new source, or a source that goes away and comes
  back, starts a fresh envelope. `bassInkNoAnalysis.test.ts` fails if the folder builds a filter or an analyser,
  reads a time-domain buffer, or imports `BassPulse` or `GateBassTap` again. `BassPulse` stays in the app only as the
  pre-hub reference `BassBump`'s spec and the scorecard's pre-hub column replay.
- **Spectrum displays keep their owned analyser** (contract C5 of audio-engine-alignment: "Visualizers that need a raw
  or fine spectrum keep an owned analyser (C4) for that only"): the cubes' columns (40 Hz to 14 kHz, one band per
  column), `trio-color-wave`'s three sheets and `bass-ink`'s 48-frequency spectrum field. The hub has six bands; moving
  them would be a visual redesign, a non-goal. The cubes' bass bump has read `gateBass` since S4, and the trio has no
  bass or onset reaction to move. No visual baseline changes.
- **The shared rhythm tracker is not private analysis**: `bass-ink` keeps reading the tracker's beat phase, tempo
  confidence and `bandOnsets`, as the dancer does.
- **Deferred under D11: `bass-ink`'s set-level bass energy** (`bassLevel` over its owned spectrum below 120 Hz into
  `EnergyTracker`). Its fast-to-slow ratio drives the set director's surge, dip, build and drop, whose thresholds were
  tuned on the analyser's byte-dB scale, and no cell measures the director. Moving it is a retune with nothing to hold
  it to, so it is `FU-S9-bass-ink-energy`, below.

### The reaction cell
- **`bass-ink` joins the live cells** (hit share, false fires and latency) on `bass-ink.kicks`, the gate's pulse
  counter, as the audit's finding 5 asks: `bass-ink.out` is a governed brightness, capped at two kick flashes a second,
  with no per-hit reaction. A counter column fires on each increment, as `measureReactionOffset` already read one.
  Adding a visualizer adds cells and changes none, so the targets version stays 8.
- **Before** (`64bc86e`, the hub-regressions build without the move, 4 runs per track): 39 of 45 applicable cells pass,
  0 fail, 6 unavailable; written into the baseline first so `scorecard:check` holds the move to it.

### Result
- **Offline:** nothing changes (`scorecard:check` against S8's version 8 baseline passes; blocking failures stay 14).
- **Live, after against before** (`bass-ink`, 4 runs per track, one at a time): 38 of 45 pass, 0 fail, 7 unavailable.
  On every track with a fixed outcome the cells are equal within a frame: hit share `drums-100` 0.80, `drums-128` 0.81,
  `trap-2to1-half-140` 0.88, `trap-4to3-120` 0.71 in both; latency `drums-128` 33.5 and 35.6 ms, `imyourgirl` 49.6 and
  49.3 ms, `lonley` 239 in both (the gate's kick place, the audit's finding 3, not the input).
- **`drifting-tempo` latency 9.5 to 14.7 ms** is the one cell `scorecard:check` lists (spread 3 ms). Its runs split
  between two outcomes of the gate, 38 or 46 pulses: 9 to 12 ms after the beat at 38, 12 to 20 ms at 46, which also
  hits more beats (hit share 0.375 to 0.48). Before, 3 runs of 4 settled at 38; after, 1. It is S4's split on the same
  track, and the input is identical by construction. A confirmation set of 4 runs (3 at 46 pulses) measured 9.3 ms and
  a hit share of 0.50, which is what the committed cells hold; `scorecard:check` then passes against the before cells.
- **`summer2000`** splits the same way: before, two runs placed the kick and hit 4 of 54 beats at about 165 ms, and two
  hit none; after, all four hit none, so its latency is unavailable. The deferred tracker beat error (150 ms) and the
  gate's kick place are its causes (S7, S8).
- **`high-bpm-dnb`** was unavailable before (too few runs fired) and has cells after (hit 0.02, latency 100 ms).

## S10 findings: order independence (AC11) and the close (targets version 8, measured on `c2c343c`)
### Order independence (AC11)
- **Method.** `npm run scorecard:order` records, per track (`drums-128`, `imyourgirl`, `syncopationbass2`), 2
  sessions each of A then B, B then A, A then A and B then B, one page per session (`debug:viz --then`), for the
  pairs `dancing-character` with `cubes` and `bass-ink` with `dancing-character`: 48 sessions, all three hub-fed
  visualizers. Reports: `hub-scorecard.order.dancing-character-cubes.md` and
  `hub-scorecard.order.bass-ink-dancing-character.md`.
- **Why a control session.** The second play of a session is always a navigation plus a re-select, and the first
  version of the check compared it with fresh loads: 28 hub rows failed. With 8 fresh runs per visualizer, a play after
  the *other* visualizer was no further from a fresh load than a re-select on the *same* visualizer, column by column
  (for example the dancer's input on `syncopationbass2`: fresh 0.047, re-select 0.110, after `cubes` 0.063), so those
  failures measured the re-select, not the order. Each row now judges "after the other" against "after itself" (hub:
  RMS difference to the lead runs on a 10 ms grid, allowed the larger of the lead runs' own spread and the control's;
  reaction: the followed runs' median against the control's, allowed the larger of the committed cell's spread and the
  spread of this recording's lead and control runs).
- **Result: 99 of 108 rows pass.** Reaction telemetry matches everywhere: hit share, latency and false fires, 36 of 36
  rows. Hub signals: 63 of 72. Of the 9 that fail, 4 are at the noise floor (`onsetKick` on `syncopationbass2` for the
  dancer, 0.1501 and 0.1487 against 0.1486; `gain` on `imyourgirl` for `cubes` and `bass-ink`, a track whose gain
  barely moves, 0.008 against 0.007). Five recur in both pairs and point one way: a visualizer opened after a
  *different* one sees a little more spread in the dancer's input on `imyourgirl` (0.038 and 0.034 against 0.027),
  the dancer's `gain` on `syncopationbass2` (0.115 and 0.132 against 0.083 and 0.088), and `bass-ink`'s `onsetKick`
  on `syncopationbass2` (0.182 against 0.144). The cause is not isolated. The likeliest is load timing (the next scene
  builds, and the dancer parses its model, while the re-selected track starts), not state left in the hub, since the
  same hub serves the control sessions. No reaction cell moves, so no visualizer reacts differently. Recorded as
  `FU-S10-order-hub-spread` below.
- **Two harness fixes** came out of the recording: live ingest ignores order runs (their `options.json` has `then` or
  `after`), and choosing the track again after a navigation waits for the page first (`c2c343c`; the source chooser
  could open a moment after the check).
- **End to end:** `e2e/order.spec.ts` opens the dancer and `cubes` in both orders in one page session and checks the
  source survives, each renders one canvas, nothing reloads and nothing logs an error.

### The close
- **FU-S8-live-retap done:** `cubes` and `trio-color-wave` are recorded again on `lonley` and `summer2000` against
  the S8 taps. All 12 cells pass; `cubes` on `summer2000` now hits 0.27 of its beats (0.03 on the old taps) within
  47 ms (140), as S8a predicted offline. Their pre-hub reference values are still the old taps' (the pre-hub runs
  carry their own copy of the sidecar).
- **Scorecard** (`npm run scorecard`, then `scorecard:check` passes against the S9 baseline): 426 applicable cells,
  377 pass, 24 fail, 25 unavailable. Offline (blocking): 188 of 202 pass. Live (advisory): 189 pass, 10 fail, 25
  unavailable.
- **Every offline floor is met or deferred** (success metric 1). The 14 failing offline cells, each with its deferral:

| Cell | Value (floor) | Deferred at |
|---|---|---|
| `ac9.dottedChangeCounted` | 0 (1) | S3 review, Trevor 2026-11-18 (the shelved 3/2 work) |
| `6-8-time` beat error, tempo error, false song changes | never locks, never locks, 1 | S3 review, Trevor 2026-11-18 (no one tempo for 6/8) |
| `low-bpm-rnb` beat error | 183 ms (40) | S7, merged in PR #101 (a syncopated kick captures the beat loop) |
| `summer2000` beat error | 151 ms (40) | S7, merged; still 150 ms on the S8 re-tap |
| `drifting-tempo` tempo error after lock | 0.028 (0.02) | S7, merged (the 8-beat tapped truth strays by itself; `FU-S7-drifting-truth`) |
| `beatless` never locks | locks (0) | S7, merged (a real 140 bpm periodicity) |
| `onset.f50` `bassline-kick-120` bass and kick | 0.77 and 0.81 (0.9) | S6, Trevor 2026-11-20 (two low tones in one bin) |
| gate after lock, `half-time-shuffle` and `low-bpm-rnb` | 7.2 s and never (4 s) | S5, Trevor 2026-11-19, handed to S7 and deferred there |
| gate after lock, `lonley` and `summer2000` | 10.8 s and 6.1 s (4 s) | S5, Trevor 2026-11-19 (5.3 s and 6.4 s live) |

- **Live cells** are advisory (D13). The 10 failing: the dancer's gate after the lock on `drums-150`,
  `half-time-shuffle`, `high-bpm-dnb`, `lonley`, `low-bpm-rnb` and `summer2000` (the deferrals above, and runs that
  split on `drums-150` and `high-bpm-dnb`); its clip on `syncopation-no-kick` (S8's deferral); its hit share and
  latency on `lonley` (the gate's kick place, audit finding 3); and `trio-color-wave`'s hit share on `low-bpm-rnb`
  (below 0.25 in both builds since S3).
- **Stretch targets** (reported, not blocking; cells met of measured):

| Metric | Stretch | `dancing-character` | `cubes` | `bass-ink` | `trio-color-wave` |
|---|---|---|---|---|---|
| gate after lock, offline | 2 s | 6 of 15 | - | - | - |
| gate after lock, live | 2 s | 3 of 15 | - | - | - |
| hit share 50 ms, offline | 0.9 | - | 1 of 16 | - | - |
| hit share 50 ms, live | 0.9 | 0 of 15 | 1 of 15 | 0 of 14 | 1 of 15 |
| false fires, live | 0.1 | 6 of 15 | 1 of 15 | 5 of 14 | 1 of 15 |
| latency, offline | 46.7 ms | - | 12 of 16 | - | - |
| latency, live | 46.7 ms | 8 of 14 | 8 of 15 | 6 of 14 | 10 of 15 |

  The gate and latency stretches are within reach on most kick tracks. Hit share 0.9 and false fires 0.1 are met only
  on the clean synthetic tracks: on real songs every reaction to an onset that is not a tapped beat counts as false,
  and a reaction a frame late misses the 50 ms window, so those two stretches measure onset selectivity and tap
  jitter as much as the visualizers (S3's reading, unchanged). Raising them needs a design, not a retune.

## Hub follow-ups S6: targets version 9

Version 9 (contract C4 of `docs/plans/hub-followups/contracts.md`) changes three definitions, adds the set-director cells
and takes Trevor's third tap of `summer2000`. The version bump is its own first commit; each rule's effect below was
measured against a scratch scorecard of that commit, and the committed baseline is rewritten once, at the end.

- **Drifting truth** (`FU-S7-drifting-truth`, `engine/tempoTruth.ts`): `drifting-tempo` is scored against a quadratic
  least-squares fit of the tapped beat times instead of the tempo of each 8-beat window of taps, which strayed up to
  2% from the fit (tap jitter, as large as the 2% tolerance). One cell changes: `tempo.maxErrorAfterLock` on
  `drifting-tempo` goes from 0.028 (fail) to 0.017 (pass).
- **Clip unit** (`FU-S8-clip-unit`, `live/measures.ts`): a sample is compared within the bar only when at least 3 runs
  are meter-locked and each of them has a loop of 4 beats or more, and then only those runs are compared; otherwise all
  runs are compared within the beat. A cell needs the scored samples to cover at least half of the span from its first
  sample (`CLIP_MIN_SPAN_SHARE`, 0.5) or it is unavailable: lock flicker and settling can leave a few moments that say
  nothing about the whole track, and half is the share below which the moments left are a minority of the span.
  `scorecard:live` logs the span share and the share compared on the beat unit. Two dancer cells change: `summer2000`
  from 0.038 (pass) to unavailable (too little of the span left), `syncopation-no-kick` from 0.219 to 0.141 (still
  failing: the cell is judged per run, and two of its four runs are at 0.202 and 0.205 beat, just over the 0.2 floor).
- **Hit share tolerance** (`FU-S4-hitshare-relative-tolerance`, `prehubSlack` in `targets.ts`): the hit share cells,
  offline and live, may be at most `min(0.05, 0.1 x pre-hub)` below their pre-hub value. The plan's contract said
  `max`, which is never tighter than 0.05 and could not fix what the follow-up was opened for; Trevor chose `min` on
  2026-11-21. Offline nothing changes (every offline cubes share equals its pre-hub value). Live, four cells now fail:
  `dancing-character` on `summer2000` (0 against 0.017 pre-hub), `trio-color-wave` on `lonley` (0.154 against 0.171)
  and `syncopationbass` (0.089 against 0.107), and `cubes` on `half-time-shuffle` (one of its four runs, 0.324, is below
  the new floor of 0.328).
- **Set-director cells** (`FU-S9-bass-ink-energy`): `npm run scorecard` now measures `bass-ink`'s set director on every
  real track (17 advisory, non-blocking cells: the transition count and the time of each transition).
- **`summer2000` third tap** (`FU-S8-summer2000-gaps`): 58 beats instead of 54, residual against a straight fit 55 ms
  instead of 68 ms, largest 127 ms instead of 256 ms; the mean beat phase moves by 21 ms. Offline it changes three
  cells, all still with the same status: `beat.errorMedianMs` 150.5 to 153.4 ms (fail, deferred), and the cubes' hit
  share 0.296 to 0.034 and latency 45 to 163 ms (both pass: the pre-hub values move the same way, so the bound moves
  with them). The live cells keep scoring against the sidecar copy each run folder carries, the S8 taps, until those
  visualizers are recorded again (S7).

**Live cells** were recomputed with `npm run scorecard:live -- --ingest` from the recorded runs, not re-recorded: the
dancer from the newest 4 runs per track, `cubes` and `trio-color-wave` on the tracks they had runs for (to recompute the
hit share passes; their run values are unchanged), and `bass-ink` not at all (it has no pre-hub values, so no v9 rule
changes its cells). Under version 8 that selection reproduces the committed version 8 live file exactly; for `bass-ink`
on `summer2000` the committed cells come from the 4 runs at 04:02 to 04:04 UTC on 2026-11-21, not the newest 4.

## Hub follow-ups S7: the final live pass (targets version 9, measured on `4ab6eaf`)

S3 to S5 changed two live-scored visualizers: the dancer (real frame time into its gate, the load marks) and `bass-ink`
(raw frame time into its gate, the scene-build mark). Both were recorded again, 4 runs per applicable track, headless,
one run at a time from the main checkout; `cubes` and `trio-color-wave` did not change and keep their runs. Then
`scorecard:order` recorded 4 sessions of each order for both pairs (96 sessions), and the baseline was rewritten a
second time, as the plan allows when S4 or S5 changed a live-scored visualizer.

- **Offline: nothing moves.** All 369 offline cells equal the S6 baseline's; 13 blocking cells fail, each deferred as
  listed under S10's close (drifting tempo now passes, S6).
- **Live: 13 cells fail against 14 at S6, 190 pass against 184, 24 are unavailable against 26.** Against the S6
  baseline, `scorecard:check` reports four advisory cells worse than their spread, which this rewrite takes:
  - the dancer on `drums-100`: latency 20 to 31 ms (three runs at 31 ms, one at 20; `bass-ink` is at 31 ms on the same
    track in all four) and false fires 0 to 0.013 (one stray fire in each of two runs). Both stay well inside the stretch
    targets (46.7 ms, 0.1). The likeliest cause is S3's change of the gate to the real frame time (`687e401`) instead
    of a clamped one; 11 ms is under one frame, and it was not traced further.
  - the dancer's hit share on `high-bpm-dnb` (0.083 to 0.036) and `bass-ink`'s false fires there (0.939 to 0.957, now
    unavailable): in half of the runs the tracker does not settle on this track, the runs split as S10 recorded, and
    one or two runs per visualizer have nothing to measure. `bass-ink`'s hit share, false fires and latency on
    `high-bpm-dnb` are unavailable for that reason.
- **Better:** the dancer's clip on `syncopation-no-kick` passes (0.132, was 0.141), its gate after the lock on
  `drums-150` passes (3.56 s, was 3.12 s and failing per run), and its clip on `high-bpm-dnb`, its hit share and false
  fires on `high-bpm-dnb` and `low-bpm-rnb`, and its latency on `low-bpm-rnb` are available again. `bass-ink`'s latency
  on `summer2000` is measurable on the new taps (228 ms, pass).
- **Newly failing:** the dancer's latency on `summer2000`, 196 ms against 104 ms before the hub, measurable now that the
  runs carry Trevor's third tap. Its hit share there was already failing (0 against 0.017): the gate fires on few of
  this track's tapped beats, the S5 deferral.

### Order independence, again (AC8)

| Pair | Rows | Pass | Fail | Reaction rows failing |
|---|---|---|---|---|
| `dancing-character` with `cubes` | 54 | 49 | 5 | `cubes`' latency on `imyourgirl`, lower after the dancer (41.5 against 49.6 ms) |
| `bass-ink` with `dancing-character` | 54 | 44 | 10 | `bass-ink`'s latency and false fires on `drums-128` after the dancer |

- **`bass-ink` after the dancer on `drums-128`**: two of its four runs ran at 32 fps instead of 57 for nearly the whole
  play (from 2 s and from the start), the only two plays of 192 whose median is under 50 fps. Without those two
  sessions all three of its reaction rows pass (latency 37.4 against 35.3 ms after itself, false fires 0.060 against
  0.049). Recorded as `FU-S7-order-half-fps` and settled below: it was the machine, not the order.

### `FU-S7-order-half-fps`: the machine, not the dancer

- **Per second, the slowdown was everywhere in that recording.** Counting frames in each second of track time, almost
  every second play of both pairs (after itself as well as after the other visualizer, all three tracks) drops from 57
  to 32 fps about 20 s in and stays there: a frame that takes just over one display interval is shown every other one.
  Frame times are a steady 17.5 ms up to the drop, so it is a switch, not a growing cost. The two `bass-ink` plays
  above are the same switch arriving early, and in one of those sessions the dancer's own lead play had already
  dropped to 32 fps 12 s in, before `bass-ink` was loaded. The sessions were recorded between 17:00 and 18:25 UTC on
  2026-11-22, while the machine was short of memory (background jobs were being stopped for it).
- **Repeated with the memory free** (20:17 to 20:57 UTC): `scorecard:order -- --pair bass-ink,dancing-character
  --tracks drums-128.wav --sessions 8`, 32 sessions and 64 plays. No play slows down in any order: every second of
  every `bass-ink` play is at 59 fps or more, after the dancer as after itself, and the dancer's only slow second is
  its first, while its model loads, in every order. All 18 order rows pass, the reaction rows included.
- **A long page does not slow down by itself**: three plays of `drums-128` in one page (`debug:viz --reselect 3`, about
  95 s on the page) stay at 59 fps throughout.
- **So** nothing the dancer leaves behind slows the next visualizer, and the half-rate tail and the two slow plays came
  from the machine at the time. A recording made while memory is short is not a measurement of the app: the per-second
  frame rate (rows per second of `t`) shows it at once, where the median `fps` of a play hides a tail.
- **The hub rows** that fail beyond the noise floor are the dancer's `gain` on `drums-128` and `syncopationbass2`
  (0.20 and 0.13 after `cubes`, 0.16 after `bass-ink`, against 0.05 to 0.07 after itself) and its input, which follows
  the gain. The rest are within 0.002 of their allowance.
- **The AC8 rule.** The dancer's model-parse mark does land later after a different visualizer: 0.18 to 0.20 s after
  the track starts, against 0.08 to 0.11 s after itself, with a control spread of about 0.02 s (one control session
  at 0.19 s). Its scene-build mark does not move (0.03 s either way), and nor does `bass-ink`'s (0.034 against 0.036 s).
  The hub-signal spread does not follow the parse mark: the late control session has no extra gain distance (0.075),
  and all the extra distance sits in the first 5 s of the track (0.37 to 0.56 after the other visualizer, 0.03 to 0.08
  after itself), past which the two are equal. So the rule's condition fails and `FU-S10-order-hub-spread` is deferred,
  with this data.
- **What the data points to instead.** These tracks open on a second or two of near silence, over which the volume
  normalization's gain (the `gain` column) holds the value it reached before the track started. After a fresh load
  that is 1.00; after the dancer itself 1.1 to 1.3; after `cubes` 2.4 to 2.8. By 2 s every run is on the same gain. The
  normalization raises its gain over silence, so the start value measures how long the input was quiet between the two
  plays, which the parse mark only partly reflects. Telling the two apart needs that gap, or the gain at the moment the
  track starts, in the recording; until then the hub rows compare a 2 s settling transient, and no reaction cell moves
  because of it. (Settled below: the gap is not it either.)

### `FU-S10-order-hub-spread`: the volume normalization before the first beat

- **The test.** `debug:viz --settle S` (and `scorecard:order --settle S`) waits S seconds after the move to the second
  visualizer before choosing the track again, so its scene build and model parse are over before the track starts.
  The dancer with `cubes` was recorded twice, 4 sessions per order each, with memory free: without the wait (21:14 to
  22:16 UTC, 2026-11-22) and with 3 s (22:16 to 23:18 UTC).
- **The wait changes nothing.** Both reports have 51 of 54 rows passing, and the same three fail: the dancer's `gain`
  on `syncopationbass2` (0.156 after `cubes` against 0.078 after itself without the wait, 0.151 against 0.069 with
  it) and its input on `drums-128` and `imyourgirl`, by less than 0.01 over the allowance. The dancer's gain on its
  first row is the same in both: 2.2 to 3.5 after `cubes` against 1.1 to 1.3 after itself on `drums-128`, 2.5 to 3.0
  against 2.5 to 2.8 on `syncopationbass2`. So it is not load timing.
- **Where the spread is.** Split at 2 s, the dancer's gain distance to its lead runs after `cubes` and after itself is
  the same past 2 s on every track (`drums-128` 0.069 and 0.068, `syncopationbass2` 0.066 and 0.077, `imyourgirl`
  0.007 and 0.006, without the wait; the same with it). All of the extra distance is in the first 2 s (1.06 against
  0.17 on `drums-128`, 0.88 against 0.06 on `syncopationbass2`). `drums-128` is silent until its first kick at 1.45 s;
  over that silence `bassRaw` is 0 and the gain wanders between 1 and 5 depending on the run, and within a frame or
  two of the first kick every run is at the same gain (0.95 to 1.0).
- **It is not the gap or state left behind either.** Every new source gets a fresh gain node at 1 and a cleared peak
  envelope (`AudioEngine.startSource` and `teardown`), and the 3 s wait lengthens the quiet gap without moving the
  start gain. What still differs by order is where in the lead-in the recording starts: the first row is about 0.93 s
  into the track after the dancer itself and 1.3 s after `cubes`, so the two compare different stretches of a gain
  that is only moving while nothing plays.
- **Closed as documented.** The spread is the normalization's gain over silence before the music starts, which no
  visualizer shows (there is no bass to scale) and which every run leaves at the first beat. No reaction row moves
  in any recording since S10, and every hub row past the first 2 s is within its control. A later order check could
  compare from the first beat instead of the first row; that is not needed for AC11.

### `FU-S8-manual-reselect`: intended

With a dance chosen by hand, a fresh load starts on the calm dance and moves to the chosen one at the first bar line
(the scene always starts on the calm dance, and a chosen dance takes over only on a bar line, fading over one beat),
while choosing the track again keeps the chosen dance with
no fade (`DanceDirector.restart` leaves a manual choice alone). That is the intent: a re-select is the same visitor
asking for the same dance, and only Auto goes back to the dance a fresh load starts with. AC7's clip comparison
records Auto, so it never sees the difference; a recording made with a manual dance would show its first bar on the
calm dance after a fresh load and not after a re-select.

## Review decisions (Trevor, 2026-11-22)

Trevor confirmed every decision above that was recorded "to confirm at review", and settled the open ones:
- **AC7's clip floor** is 0.2 beat (targets version 8, S8), not the plan's 0.05 loop.
- **S7's `high-bpm-dnb` exception** stands: the S6 baseline's 2.17 s gate was a lucky recording.
- **The D11 deferrals of S7 and S8** stand: `low-bpm-rnb`'s beat error and gate, `summer2000`'s beat error,
  `beatless`'s lock, `half-time-shuffle`'s gate, and AC7 on `syncopation-no-kick`, `6-8-time`, `high-bpm-dnb`,
  `low-bpm-rnb` and `syncopationbass`.
- **S9's scope** stands: the spectrum displays keep their owned analyser, and `bass-ink`'s set energy stays on it
  (`FU-S9-bass-ink-energy`).
- **The stretch targets** (Q4, D10) stay as they are: hit share 0.9, false fires 0.1, the gate within 2 s of the lock,
  latency 30 ms plus a frame. They are reported, not required.
- **The live hit share of `trio-color-wave`** on `lonley`, `low-bpm-rnb` and `syncopationbass`, and of `cubes` on
  `half-time-shuffle`, is accepted as it is under the version 9 tolerance: no fix is planned, and the cells stay as
  measured.
- **AC2 for `beatless`**: its no-beat truth is the track class in `scripts/scorecard/tracks.ts`, not a `.beats.json`.
  A track with no beat has nothing to tap, so that is the accepted form.
- **The tracker work D11 deferred is its own plan**, made with the double-diamond workflow in a fresh session: the
  `6-8-time` cells, `low-bpm-rnb`, `summer2000`'s beat error, `beatless`, `half-time-shuffle`'s gate, the dotted 100 to
  150 change (`ac9.dottedChangeCounted`, the shelved `FU-S6-three-halves-change`), the `bassline-kick-120` onsets, and
  `syncopation-no-kick`'s first lock (AC5 of the audio alignment plan).
- **Not accepted, still open:** the dancer's live hit share and latency on `lonley` (0 against 0.293 pre-hub, 249
  against 53 ms) and `summer2000` (0 against 0.017, 196 against 104 ms), AC8. S5 handed `lonley` to S8, which did not
  close it. `lonley` is fixed since 2026-11-23 and `summer2000` joins the tracker plan; see "The dancer's kick place on
  `lonley` (AC8)" below.

### Tap spread of the S1 tracks

S1 asked for the spread of each new tap, which was recorded only for `summer2000` (above). The table fits each
committed `.beats.json` with a straight line on the beat index (a quadratic for `drifting-tempo`, whose tempo moves)
and gives the taps' distance from it. The tap calibration's noise floor on `click-120` is 26 ms. No beat was missed in
any of them.

| Track | Taps | Mean gap, ms (bpm) | Residual RMS, ms | Largest, ms |
| ----- | ---- | ------------------ | ---------------- | ----------- |
| `summer2000` | 58 | 467 (128.5) | 55 | 127 |
| `high-bpm-dnb` | 85 | 346 (173.6) | 30 | 90 |
| `low-bpm-rnb` | 35 | 737 (81.4) | 28 | 81 |
| `6-8-time` | 62 | 482 (124.5) | 53 | 226 |
| `half-time-shuffle` | 37 | 724 (82.8) | 73 | 178 |
| `drifting-tempo` (quadratic) | 56 | 524 (114.5) | 22 | 64 |

`6-8-time` was tapped at about twice its 62 bpm label. `half-time-shuffle` is the noisiest, at almost three times the
noise floor.

## The dancer's kick place on `lonley` (AC8, 2026-11-23, measured on `6fd6611`)
- **Cause.** `lonley`'s bassline lands, per 4-beat bar, at about +0.6, +0.6 and +0.33 of a beat and then at +0.07 on
  beat 4 (kicks read from the gate input of six live runs against the S8 taps). The gate opens at about 13.5 s, before
  the first kick on beat 4 has played, so `bestSupportedPlace` finds no repeated place on the beat and opens on the
  off-beat one (0.55). Once open, the place only adapted toward kicks within `BASS_GATE_PHASE_WINDOW` of it, so it
  stayed there: every bump landed half a beat after the tapped beat. This is S5's "no place on the beat to learn" and
  the audit's finding 3; the tracker's beat on `lonley` sits on the taps.
- **The change** (`app/features/rhythm/bassGate.ts`). While open, on each kick heard on the grid, a gate whose place is
  off the beat moves to the place `bestSupportedPlace` picks when that place is on the beat, the choice it would have
  made at opening; the kick at the new place counts as in rhythm. A place already on the beat, and a bassline with no
  repeated kick on the beat, never move. It applies to the dancer and `bass-ink`, which share the gate.
- **Offline.** `sweep:gate`: false opens, opening times and no-kick openings identical to `main` (3 and 15, 12 of 16
  within 4 s). `scorecard` cells identical, `scorecard:check` passes. A replay of 88 recorded dancer runs through the
  new gate: the six `lonley` runs go from a hit share of 0 to 0.67 to 0.83 (latency 31 to 38 ms), 81 are identical,
  and one `summer2000` run from 2026-11-21 loses hits (0.19 to 0.10 on the current taps).
- **Live** (4 runs per track and visualizer, `scorecard:live --tracks`):

| Cell | Before | After | Pre-hub |
|---|---|---|---|
| dancer `lonley` hit share | 0 | 0.49 | 0.29 |
| dancer `lonley` latency | 249 ms | 38.7 ms | 53 ms |
| dancer `lonley` false fires | 1 | 0.20 | 0.47 |
| `bass-ink` `lonley` hit share | 0 | 0.49 | - |
| `bass-ink` `lonley` latency | 239 ms | 38.8 ms | - |
| `bass-ink` `lonley` false fires | 1 | 0.23 | - |
| dancer `summer2000` hit share | 0 | 0 | 0.017 |
| dancer `summer2000` latency | 196 ms | 226 ms (spread 11) | 104 ms |

- **`summer2000` stays open and moves to the tracker plan.** The tracker's beat there sits 0.3 to 0.7 of a beat from the
  taps (its beat error, 150 ms), so the gate's place on the tracker's beat is off the tapped beat whichever rule picks
  it, and its kicks spread over the whole beat, so they give no other place. The rule above makes that place the
  tracker's beat on more runs, which is the run that lost hits offline. It is the `summer2000` beat error already
  deferred under D11 to the tracker plan.

### Why the tracker's beat misses `summer2000` (offline diagnosis, 2026-11-23, on `4c06881`, for the tracker plan)
- **The tempo is right and the phase is not.** The tracker locks at 8.0 s on 127.66 bpm, the taps' tempo (ratio 1.001),
  and never rebuilds its grid. Beat by beat against the S8 taps, its beats sit 170 to 230 ms from them from the lock to
  about 18.5 s, close to half a beat (235 ms), on either side as the nearest-beat match flips. From 18.5 s it drifts
  toward the taps (20 to 160 ms) and does not settle. `eval:rhythm --alignment`: median 146 ms, bias +76 ms.
- **The kicks are on the taps.** The nearest kick onset is within 75 ms of a tap on two thirds of the beats after the
  lock (31 of 46), mostly just before it. Kick onsets fall in the last quarter of the tapped beat or on it, not near its middle. Before
  the lock the kick is sparse, and the bass onsets sit 0.1 to 0.4 of a beat after the taps.
- **The first phase is wrong, and nothing pulls it back.** An onset corrects a predicted beat only within
  `BEAT_WINDOW_FRACTION` (0.2 of a beat, about 94 ms here), so kicks half a beat away never reach the grid. The phase is
  searched again only after `BEAT_LOST_BEATS` (8) beats with no onset near the prediction, which the track's dense
  onsets (1.6 kick events a beat) never allow.
- **No single constant fixes it** (median distance from the taps in ms, 8 to 14 s, 14 to 20 s, 20 to 30 s, whole
  track; one `rhythmConfig` override each through the `ablate:rhythm` override plugin):

| Override | 8-14 s | 14-20 s | 20-30 s | All |
|---|---|---|---|---|
| none | 193 | 188 | 77 | 149 |
| `BEAT_WINDOW_FRACTION=0.3` | 169 | 198 | 44 | 132 |
| `BEAT_WINDOW_FRACTION=0.45` | 169 | 180 | 49 | 160 |
| `BEAT_LOST_BEATS=4` | 193 | 188 | 105 | 171 |
| `BEAT_PHASE_GAIN=0.6` | 192 | 188 | 77 | 144 |
| `BEAT_INIT_PERIODS=16`, `BEAT_INIT_MIN_SECONDS=6` or `BEAT_HISTORY_SECONDS=10` | 193 | 188 | 77 | 149 |

- **For the tracker plan.** The initial phase alignment settles on an off-beat place from the intro's envelope, and
  how many beats or seconds it sums over does not change that. The candidates are a different phase evidence (one that
  weighs the kick band, or keeps several phase hypotheses, as `low-bpm-rnb` already needs) or a re-search that does not
  wait for the onsets to stop. Each changes how the tracker works on every track, so each belongs in that plan with the
  full scorecard, not here.

## Tracker plan D11, S1: beat trace diagnosis (2026-11-23, on `ee76875`)
Measured with `npm run trace:beats` and scratch prototypes on top of it (none of them is committed). At the shipped
constants the tool's `beat.errorMedianMs` equals the scorecard's cell: 153.4 ms on `summer2000` and 183.4 ms on
`low-bpm-rnb`.

- **The scorecard scores the extrapolated beat, not the declared one.** The replay takes a beat from each rise of
  `state.beatCount` at its phase (what visualizers see). On `summer2000`, 40 of 47 beats differ from the tracker's
  declared beat: most by a few to 30 ms, six by about one period, where the extrapolated count rose before the declared
  beat. The window medians of the two lists agree to within 10 ms (5 to 10 s: 181 and 171; 10 to 15 s: 218 and 219), so
  this does not explain the misses. It means a fix has to be judged on the replay's beats, which the tool's summary does.
- **On `summer2000` the phase evidence says the grid is right.** From the lock (8.0 s) to 18.5 s the phase check's best
  3-bin window is bin 1, 1/16 of a beat from the grid, which is under `PHASE_MIN_SHIFT`, at ratios 1.01 to 1.15. So the
  check never wins and `phaseBeats` resets on every beat. The taps sit at bins 6 to 10 of the grid. Folding the
  peak-normalized flux of each of the analyzer's three bands alone gives the same answer: band 0 (low) also peaks at bin 1,
  and the taps' window holds only 0.14 to 0.5 of the grid's band-0 energy. The plan's C2 kick term, `flux[0] /
  fluxPeak[0]`, therefore can't move the grid onto the taps. Loosening the winning-streak gate (`PHASE_MIN_BEATS`,
  `PHASE_SHIFT_BEATS`) can't either, because the rival never wins on a single beat.
- **Only the worklet's kick events point near the taps.** The BandOnsets `kick` events fall a median 31 ms before the
  taps (quartiles -73 and +9 ms; 42 of 58 taps have one within 150 ms). Folded on the grid from 8 to 18.5 s, they peak
  at 0.25 to 0.375 of a beat, a sixteenth before the taps, while the summed onset peaks on the grid. But from 12 to
  14.8 s the kicks are irregular (a fill), and they only run regularly, every 0.47 s and about 30 ms before the taps, from
  14.8 s on. The taps themselves jitter by up to 50 ms (intervals of 389 to 528 ms).
- **Prototypes that feed the kick events to `BeatTracker` all miss AC1.** They used the scorecard's beat error on the
  replay with the events passed in. That needs a new input path, since the analyzer never sees the events today.
  | Mechanism | Points | Best `beat.errorMedianMs` |
  |---|---|---|
  | Kick events weighted into the phase bins (weights 1 to 100) | 6 | 153 ms, unchanged up to weight 4; one move at 12.7 to 13.6 s then 170 to 182 |
  | Half-beat flip when the kicks favor the opposite half and the envelope there is within a ratio of the grid's (0.5 to 0.95; kick ratios 1.5 to 3) | 10 | 153 (no flip); 176 to 199 with a flip |
  | Correction that prefers a kick event in its window, alone or with the two above | 6 | 149.5 |
  | The same with a longer evidence gate (`PHASE_MIN_BEATS=16`, `PHASE_SHIFT_BEATS=8`, `PHASE_DECAY=0.85`) | 8 | 164 |

  Every move that lands the grid on the taps (for example, a flip at 12.1 s gave -6, -12 and -45 ms on the next beats)
  slides off within two seconds. Through the fill, the correction follows the envelope's strongest onset, and once the
  grid is more than `BEAT_WINDOW_FRACTION` (94 ms) from the regular kicks it never sees them again.
- **The latest first move that still allows AC1** is about 18 s. The track ends at 29.4 s with 46 beats after the lock,
  so 24 of them, from about 18.2 s, have to be within 40 ms of the taps.
- **`low-bpm-rnb` does not meet S4's precondition.** The grid sits a sixteenth (0.25 beat, about 185 ms) from the taps
  for the whole track, and `phaseShiftCount` stays 0. The onset bins' best place moves between bins 9, 15 and 1, while
  the taps sit at bins 3 to 5 or 8 to 10, so no rival built from this evidence stays on the taps through the slide. Its
  kick events are sparse: 13 of 35 taps have one within 150 ms.
- **Tracker CPU:** `npm run bench:tracker` measures about 7.9 µs a frame. Main against itself gives a ratio of 0.999
  (0.993 to 1.008 per track), so the bench's own noise is about 1%.

**Outcome for the plan.** S1 contradicts the premise of S3 and S4 (O5) on both required tracks. Kick-weighted phase bins
and a looser gate can't reach AC1, and there is no stable rival for S4. Under D8, and with the authority Trevor
delegated for this run, S3 and S4 are recorded as misses, not merged. `summer2000` and `low-bpm-rnb` go back to
planning (Q1). The measurements above point at a tracker that takes the worklet's kick events as an input, holds a phase
against an envelope that disagrees, and copes with fills. That is a multi-hypothesis design, not a constant in today's
phase check.

## Tracker plan D11: status of the request's failing cells (S5 and later slices)
Each slice of the tracker plan (`docs/plans/rhythm-tracker/rhythm-tracker-d11.plan.md`) adds its cells here. "Before" is
`npm run scorecard` on `ee76875` (targets version 9); "after" is the value once the plan's slices are merged. Statuses:
**fixed**, **stretch-open** (a stretch slice was attempted and recorded), **re-plan** (back to planning), and
**accepted** (as measured, or out of the plan's scope).

| Cell | Track | Before | After | Status | Where |
|---|---|---|---|---|---|
| `beat.errorMedianMs` | `summer2000` | 153.4 ms | 153.4 ms | re-plan | S1 diagnosis: no phase evidence the tracker has favors the taps; S3 recorded as a miss |
| `beat.errorMedianMs` | `low-bpm-rnb` | 183.4 ms | 24.2 ms | fixed | S4's rival was dropped (S1); a halving now searches the phase again (S4b, found while measuring S8) |
| `gate.secondsAfterLock` | `summer2000`, `half-time-shuffle`, `lonley`, `low-bpm-rnb` | 6.10, 7.18, 10.83 s, never | 6.10, 7.18, 10.83, 14.92 s | re-plan (with the beat), reported under D9 | follows the tracker's beat; `low-bpm-rnb`'s gate now opens (S4b) |
| `beat.errorMedianMs`, `tempo.maxErrorAfterLock` | `6-8-time` | never locks to the truth | unchanged | stretch-open | S8 |
| `tempo.falseSongChanges` | `6-8-time` | 1 | 1 | stretch-open | S8 |
| `tempo.beatlessNeverLocks` | `beatless` | locks (1) | locks (1) | stretch-open | S6: no presence signal tried separates it; reverted |
| `ac9.dottedChangeCounted` | dotted 100 to 150 | 0 | 1 | fixed | S7: a dotted move counts once the old beat stops sounding on its grid |
| `onset.f50.kick` / `.bass` | `bassline-kick-120` | 0.808 / 0.768 | unchanged | accepted (a non-goal: a finer low-end spectrum is a separate onset project) | plan non-goals |
| `live.clip.maxDeviationBeats` (AC7 dance-clip consistency) | `syncopation-no-kick`, `6-8-time`, `high-bpm-dnb`, `low-bpm-rnb`, `syncopationbass` | 0.163, unavailable, 1.793, unavailable, unavailable | unchanged | re-plan (with the beat level and phase) | no required tracker change merged, so the live cells were not re-recorded |
| `tempo.lockSeconds` (AC5 of the audio-alignment plan) | `syncopation-no-kick` | 8.02 s | 8.02 s | stretch-open | S8 |

**S5 (the close of the required cells).** S3 and S4 were recorded as misses (see "Tracker plan D11, S1"), so no
required tracker change merged. There is no improvement to record, and so no baseline rewrite and no live run:
`scorecard:check` against the current baseline is unchanged by S1, S2 and S5, which change no shipped code. The
`it.fails` specs added in S2 stay `.fails`.

**S6 (stretch: beat presence), attempted and reverted.** Q3 is answered by the code: `tempo.beatlessNeverLocks` reads
the replay's `everReportedLock`, the hub's lock (a held tempo above 0 and a beat phase), so the gate belongs on the tempo
lock in `tempo.ts`. Both candidate signals that exist before the lock were measured with the full scorecard:
- **A higher first-lock confidence** (`TEMPO_LOCK_CONFIDENCE` 0.3, 0.4, 0.5, against 0.2) leaves `beatless` locked,
  because its confidence is 1.0. From 0.4 it delays real locks (`low-bpm-rnb` 3.0 to 3.8 s, and 13.0 s at 0.5) and adds
  a false song change on `6-8-time`.
- **How sharp the autocorrelation peak is at the beat lag** (the peak minus the mean of its neighbors at a fixed
  distance, over the peak) is 0.72 to 1.00 on `beatless` at its lock, but 0.42 to 0.58 on `summer2000` and 0.05 to 0.07 on
  `6-8-time` at theirs, for neighbors 3, 4 or 6 frames away. A floor of 1.01 to 1.03 on a width of 0.15 of the lag
  passes `beatlessNeverLocks`, but `high-bpm-dnb` then never locks (four blocking cells fail) and `summer2000` locks
  at 21 s instead of 8 s.

Neither tells `beatless`'s real 140 bpm periodicity from a beat. A beat-presence model needs another kind of evidence
(how the onsets sit on the grid once one is proposed, or the kick events), which is a design for the re-planned
tracker. Nothing ships; the cell stays failing as before.

**S7 (stretch: the 3/2 tempo change), shipped.** The shelved attempt (`FU-S6-three-halves-change`, "3/2 tempo changes:
shelved" in `audio-alignment-findings.md`) asked for a statistic of whether the old beat still sounds at its own grid
places. The beat tracker already has one: whether each beat's window found an onset. `BeatTracker.gridHitShare` keeps a
leaky share of the recent beats that did (`BEAT_HIT_SHARE_RATE`, about 8 beats). The tempo cue of `BoundaryDetector`
(`FU-boundary-dotted`) now counts a sustained dotted move as a new song when that share is under 0.75, at confidence
0.6 or more, for 4 s, and only against a reference the estimates have confirmed for 4 s.
- **Dotted 100 to 150 (gapless, the AC9 scenario):** the share falls from 1.0 to 0.5 to 0.6 after the change. The song
  change is counted at 32.8 s (8.8 s after it), and the held tempo is 150 by 41 s. On `main` it is never counted, and
  the tempo stays at 100. `ac9.dottedChangeCounted` goes from 0 to 1.
- **No other offline cell changes,** on any track or scenario. The grid support from 0.6 to 0.9 all scored the same.
  `ac9.dottedPassageQuiet` needed the confirmed reference: without it, a reference seeded by a brief 160 reading of the
  passage's 120 beat raised two soft boundaries.
- **AC6 still passes:** the S2 pin (a 3:2 polyrhythm holds 150, with no song change) is unchanged. New specs keep four
  3:2 layers (levels 1 and 2, four offsets) joining a steady 100 BPM beat free of song changes. The 100 to 150 spec
  fails with the rule off.
- **The tempo side is not needed.** Skipping the bar veto in `TempoTracker` while the grid support is low changed
  nothing: once the soft boundary trims the history, the 150 estimate wins on its own. It was left out to save bytes.
  `FU-dotted-leaky` was not needed either.
- **Budget:** total JS 338.19 kB (+0.15 kB, limit 338.5 kB unchanged). `bench:tracker` against `main`: ratio 1.000.
  sweep:gate: see the PR.

**S4b (`low-bpm-rnb`, a second attempt), shipped.** Found while measuring S8. Letting the first-lock tie also weigh
3/2 rivals took `low-bpm-rnb` to 22 ms, but only because every tie then waited for the full 8 s history (11 tracks
locked 5 s later, and `syncopation-no-kick` never locked), so that rule was not shipped. What it showed is that the
grid is right when it is placed at 81 bpm directly. On `main` the tempo first locks at 162 and halves to 81, and the
halving keeps the better of the old grid's two halves, both of which sit a sixteenth early. Now a halving searches the
phase again with the first alignment's comb, on the next retry (up to 10 frames later). The beats are counted on, no
beat is declared twice, and `gridEpoch` is not bumped (C1).
- `low-bpm-rnb` `beat.errorMedianMs` 183.4 to **24.2 ms** (AC2 met). `syncopationbass` 35.67 to 35.53 ms. No other
  offline cell changes.
- `gate.secondsAfterLock` on `low-bpm-rnb`: never to 14.92 s (the gate first opens at 18.05 s, the dancer locks at
  3.13 s). It is still failing, accepted under D9, and better than before.
- sweep:gate: false opens 3 and 15, as on `main`. `low-bpm-rnb`'s opening moves from 24.1 to 14.9 s and nothing else
  moves.
- Searching at once, inside `setTempo`, instead of on the next retry put `syncopationbass` at 39.0 ms (3 ms worse
  than `main`), so the search waits for the retry. A comb that only overrode the old choice by a margin (1.05 to 1.3)
  did the same, and from 1.6 it lost `low-bpm-rnb` again.
- Two specs that described the old halving (keep every second beat, lock held through the call) now describe the new
  one: the grid is back within one retry, on the music's pulses, numbered on in the same epoch.
- Budget: total JS 338.09 kB (smaller than before; the keep-every-second-beat code is gone). `bench:tracker`: 0.999.

**S8 (stretch: bar-level beat for `6-8-time` and `half-time-shuffle`), attempted, not shipped.** `6-8-time` (truth 62
bpm) first locks at 184 (3x), while its raw estimate moves between 121 and 124 (2x, which the scorecard accepts as an
octave) and 184. The bar-length evidence of the first-lock tie (`TEMPO_TIE_MULTIPLES` 3, 6 and 12 next to 4 and 8) changes
nothing alone, because a 3/2 rival is not one of the tie's rivals. With the 3/2 rivals added, `6-8-time` holds 122 to
124 from 9.5 s, but it wanders again after 20 s (beat error 134 ms, two false song changes). Every tie ratio tried
(0.4 to 0.9) breaks other blocking cells, and `half-time-shuffle` (truth 81, held 163 to 169) does not move to its beat
level with any of them. Removing the third-of-a-lag rule (`TEMPO_FASTER_DIVISORS=[2]`) or changing its ratio does not
move `6-8-time`'s lock either. Choosing the beat level needs evidence of the bar itself (a 6/8 bar is 6 eighths, which
none of the 4x and 8x lags reaches), which belongs with the re-planned tracker.

| Cell | Track | Before | After | Status |
|---|---|---|---|---|
| `beat.errorMedianMs`, `tempo.maxErrorAfterLock`, `tempo.falseSongChanges` | `6-8-time` | none, none, 1 | unchanged | stretch-open |
| `gate.secondsAfterLock` | `half-time-shuffle` | 7.18 s | unchanged | stretch-open |
| `tempo.lockSeconds` (first lock) | `syncopation-no-kick` | 8.02 s | unchanged | stretch-open (not touched by any shipped rule) |
| 3/4 click at 180 reads 90 (`it.fails`) | synthetic | fails | still fails | stretch-open |

## Tracker replan, S0: the post-merge baseline (2026-11-23, on `7b602b8`)
The replan (`docs/plans/rhythm-tracker-replan/`) starts on `main` once every D11 PR has merged (#127 to #134). These are
its before values. `npm run scorecard` gives 446 applicable cells: 400 pass, 22 fail, 24 unavailable, 11 blocking
failures. `scorecard:check` against the D11 baseline passes, and the baseline is rewritten from this run.

| Guard (AC2) | Before |
|---|---|
| `beat.errorMedianMs`, `summer2000` | 153.4 ms (fail) |
| `beat.errorMedianMs`, `low-bpm-rnb` | 24.2 ms |
| `ac9.dottedChangeCounted` | 1 |
| `beat.errorMedianMs`, synthetic tracks | 0.8 to 3.6 ms (`drifting-tempo` 38.0) |
| `beat.errorMedianMs`, `syncopation-no-kick`, `syncopationbass`, `high-bpm-dnb` | 29.9, 35.5, 21.5 ms |
| `tempo.lockSeconds`, `syncopation-no-kick`, `syncopationbass`, `high-bpm-dnb`, synthetic | 8.02, 3.02, 8.02 s; 3.02 s (`trap-4to3-120` 8.02) |
| `6-8-time` | never locks to the truth; 1 false song change |
| `gate.secondsAfterLock`, passing | `imyourgirl` 0.15, `trap-2to1-half-140` and `trap-4to3-120` 0.77, `syncopationbass` 1.73, `syncopationbass2` 1.80, `high-bpm-dnb` 1.93, `drums-128` 2.82, `drums-150` 3.00, `trap-2to1-double-90` 3.07, `drums-100` 3.38, `drifting-tempo` 3.40, `bassline-kick-120` 3.83 s |
| `gate.secondsAfterLock`, failing (reported only) | `summer2000` 6.10, `half-time-shuffle` 7.18, `lonley` 10.83, `low-bpm-rnb` 14.92 s |
| `sweep:gate` false opens | 3 of 300 at 120 beats, 15 of 300 at 400; 12 of 16 kick tracks within 4 s, 6 within 2 s |
| Total JS | 338.12 kB (limit 338.5) |

**The kick lead, on the delivered stream.** Measured with a scratch script over `replayPcm` (not committed): every truth
beat is paired with the nearest BandOnsets kick event within 150 ms, and the event's own timestamp is compared with it.

| Tracks | Pairs | Median | Quartiles |
|---|---|---|---|
| Synthetic (exact sidecar beats) | 575 | -0.2 ms | -1.6, +4.1 |
| Tapped | 352 | -0.7 ms | -22.7, +28.7 |
| `summer2000` alone | 42 of 58 | -31.0 ms | -72.7, +22.7 |

The two classes agree within 10 ms, and both leads are about 0, so `KICK_LEAD_SECONDS` stays 0 (C3). `summer2000`'s own
31 ms lead is that track's spread, not a lead of the detector. Its kick events are also widely spread on the
tracker's grid: folded into 16 bins from the lock on, the best 3-bin window holds only 0.28 of them (bin 12, a quarter
beat before the grid). The synthetic kick tracks hold 0.84 to 1.00, and `syncopationbass2` 0.84. Attempt A's support
floor has to sit below that 0.28, or the model never acts on the track it is for.

**The stretch check (S6 and S7 are canceled).** The plan made both conditional on the kick events carrying evidence
they lack today.
- **`beatless` (S6).** It has 53 kick events. Their autocorrelation peaks at 0.42 s, the tracker's period there
  (412 ms), and folded on its grid the best 3-bin window holds 0.41 of them. That is more kick support than six
  tapped kick tracks have on theirs: `summer2000` 0.28, `syncopation-no-kick` and `6-8-time` 0.30, `high-bpm-dnb` 0.31,
  `lonley` 0.35, `low-bpm-rnb` 0.37. Any floor that stops `beatless` locking would stop those, so kick support does not
  separate a beat from `beatless`'s periodicity, as D11's S6 found for the autocorrelation.
- **`6-8-time` and `half-time-shuffle` (S7).** `6-8-time` has 47 kick events, and only 20 of its 62 taps have one within
  150 ms. Their autocorrelation is weak everywhere (at most 0.15, at 1.16 s), with no peak at the 6-eighth bar (1.94 s
  at 62 bpm) or at its beat (0.97 s). The kick events carry no bar pattern to choose a beat level from. On
  `half-time-shuffle` (truth 81 bpm, held at 163 to 169), the kick autocorrelation is as high at the held beat (0.37 s,
  0.26) as at the true one (0.74 s, 0.23), so the kicks do not prefer the true level either.

**Live (`dancing-character`, 4 runs per track, headless, one at a time from the main checkout, 48.5 min, and
`high-bpm-dnb` again, see below).** 71 of 86 applicable cells pass, 9 fail and 6 are unavailable. With the live cells
merged, the baseline has 401 passing, 24 failing and 21 unavailable cells, and 11 blocking failures, the same as
offline. Before values for AC8, against the D11 recording on `6fd6611`:

| Track | `live.clip.maxDeviationBeats` (`6fd6611` → `7b602b8`) | `live.gate.secondsAfterLock` (`6fd6611` → `7b602b8`) |
|---|---|---|
| `summer2000` | unavailable → unavailable | 6.44 → 6.44 s (fail) |
| `low-bpm-rnb` | unavailable → 0.875 (fail) | 16.26 → 15.05 s (fail) |
| `syncopation-no-kick` | 0.132 → 0.121 | n/a |
| `6-8-time` | unavailable → 0.306 (fail) | n/a |
| `high-bpm-dnb` | 0.058 → 0.081 | 2.20 → 2.52 s (fail, floor 2 s) |
| `syncopationbass` | unavailable → unavailable | 1.56 → 1.56 s |
| `half-time-shuffle` | 0.029 → 0.042 | 10.38 → 10.36 s (fail) |
| `lonley` | 0.024 → 0.027 | 5.31 → 5.30 s (fail) |

`low-bpm-rnb` and `6-8-time` now have clip cells, because the dancer locks there since S4b, but both fail. In the
first full recording, the dancer's gate on `high-bpm-dnb` opened in only one of four runs (12.78 s), and its clip, hit
and false-fire cells were unavailable. Offline its gate opens 1.93 s after the lock, so the track was recorded again
alone, 4 runs on an idle machine. The gate opened in three of the four, at 2.52 s, and every other cell came back. The
re-recording replaced the outlier in `hub-scorecard.live.json`. Elsewhere, `live.hit.share50ms` on `summer2000` went
from fail to pass, and `live.lock.spreadSeconds` on `drifting-tempo` from pass to fail.

**Kick delivery.** The worklet decides a kick 2 frames after it sounds and posts 2-frame batches, so the analyzer sees
an event 2 to 3 frames after its timestamp. That is why C2 delivers events in arrival order with their own timestamp.
Folding uses the timestamp, so the delay does not move the lead above.

## Tracker replan, S1 to S4: the kick input and both attempts (2026-11-23)
- **S1 (the kick input path, `refactor(rhythm)`).** `RhythmAnalyzer.pushKicks` takes each batch's onset events before its
  frames, from `RhythmTracker.onMessage` and from every offline runner. `KickQueue` hands the band-0 events to
  `BeatTracker.pushKick` at the batch's first frame, in arrival order with their own timestamps. Nothing reads them yet:
  golden digests taken at `7b602b8` and all 717 scorecard cells are unchanged. Total JS 338.12 → 338.56 kB.
  `bench:tracker` against `7b602b8`: 1.000 without kicks, 1.004 with them.
- **S2 (both models behind off-by-default constants).** Attempt A (`kickPhase.ts` in `BeatTracker`): a decayed kick
  histogram over the beat that vetoes envelope corrections pointing away from the kicks, holds the correction through a
  fill, moves the grid onto the kicks after `KICK_MOVE_BEATS` beats of margin, and gives way to a sustained envelope
  phase. Attempt B (`kickOffset.ts` in the analyzer): the median offset between the kicks and the grid, applied to the
  anchor. With the defaults every offline cell is unchanged. Together they add 1.82 kB (340.38 kB, limit raised to
  340.5).
- **Review (independent, before the grids were final).** No blocking finding. One finding changed attempt B: it read a
  beat's kicks when the beat was declared, about a fifth of a period after it, before the kicks late of the beat had
  arrived. So it could only learn offsets up to about 0.15 of a beat, and summer2000's kicks sit about 0.3 of a beat
  after the grid. Each beat is now read at the next declaration, and both grids were run again on the repaired code;
  the numbers below are from that run. Attempt A's numbers did not change.

**The pre-registered grids, full offline scorecard per point** (fixed before running; base summer2000 153.4 ms,
low-bpm-rnb 24.2 ms, 11 blocking failures):

| Attempt | Grid | summer2000 `beat.errorMedianMs` | Blocking failures | What breaks |
|---|---|---|---|---|
| A | `KICK_SUPPORT_FLOOR` 0.2, 0.25 × `KICK_VETO_MARGIN` 0.05, 0.1, 0.15 × `KICK_MOVE_BEATS` 2, 4 × `KICK_PHASE_DECAY` 0.85, 0.9 × `KICK_FILL_CV` 0.25, 0.4 (48 points) | 142.7 to 161.2 | 13 to 16 | `low-bpm-rnb` 153.7 to 183.0 ms on every point; `drifting-tempo`, `lonley`, `syncopation-no-kick` or `high-bpm-dnb` on most |
| B | `KICK_OFFSET_RING` 8, 16, 32 × `KICK_OFFSET_HYSTERESIS` 0.01, 0.03 (6 points) | 98.9 to 137.2 (best: ring 16, 0.03; 92.7 before the repair) | 12 to 18 | `low-bpm-rnb` 148 to 171 ms on every point; `lonley` 60 to 111 ms and `syncopation-no-kick` 45 to 66 ms with rings of 8 and 16 |

No point of either grid meets the go/no-go (summer2000 at most 40 ms with AC2 green), so S3 and S4 enable nothing and
are recorded as misses.

**Why A misses (`trace:beats` on summer2000 at the floor 0.2, margin 0.05, 2 move beats, decay 0.9, fill CV 0.25).**
The model does what the plan asked of it at first. Its first kick-driven move is at 10.79 s, before the fill, and it
puts the grid on the taps (-13.8 ms at 11.4 s). But the fill hold is on at every beat from the lock to 22.7 s, not only
during the fill. summer2000's kicks are syncopated throughout, so the spread of their intervals over 4 beats is above
both `KICK_FILL_CV` values all the time. The hold freezes the per-beat correction, so the period stays at 470 ms against
the tapped 467 ms. That drifts the grid 3 ms a beat, back to 145 to 185 ms off by 16 to 19 s. A hold measured by the
kick intervals alone cannot tell a syncopated groove from a fill. On `low-bpm-rnb`, whose kicks are sparse (13 of 35
taps have one), the same hold and the kick moves pull a grid that was right (24 ms) off the beat.

**Why B misses.** The median kick offset moves summer2000 toward the taps (98.9 ms at best), not onto them: its kicks
are syncopated, so their median sits between the beat and the off-beat notes. On `low-bpm-rnb` (13 of 35 taps have a
kick), `lonley` and `syncopation-no-kick`, the kicks are not on the beat the taps mark, and their median moves grids
that were right. The longest ring (32) hurts the fewest tracks, but `low-bpm-rnb` still fails (148 ms), and summer2000
improves only to 137 ms. No single offset between the kicks and the beat holds across these tracks.

**Outcome (decision D4).** Both attempts missed their pre-registered grids, so `summer2000` `beat.errorMedianMs` is
accepted at 153.4 ms for this plan. The S2 code is not merged: it waits on the local branch `replan/s2-kick-model`
(`5eaddde`, on top of S1) for the next design (Trevor, 2026-11-23). Question Q3 of the plan, answered by Trevor: one
more design attempt, planned separately. The trace points at a narrower next step than this plan registered: during
the hold, keep a correction that follows the nearest kick event instead of freezing.

**S5 to S7.** No tracker change is enabled, so there are no after values to record and no live run: the S0 values
stand, and the `it.fails` spec of the disagreeing envelope plus a fill stays `.fails`. S6 and S7 are canceled by S0's
check (above).

| Cell | Track | Before (`7b602b8`) | After | Status |
|---|---|---|---|---|
| `beat.errorMedianMs` | `summer2000` | 153.4 ms | 153.4 ms | accepted (D4: attempts A and B missed) |
| `beat.errorMedianMs` | `low-bpm-rnb` | 24.2 ms | 24.2 ms | fixed (D11 S4b), kept |
| `ac9.dottedChangeCounted` | dotted 100 to 150 | 1 | 1 | fixed (D11 S7), kept |
| `live.clip.maxDeviationBeats` | request's tracks | see S0 | unchanged | accepted (no tracker change enabled) |
| `gate.secondsAfterLock` | `summer2000`, `half-time-shuffle`, `lonley`, `low-bpm-rnb` | 6.10, 7.18, 10.83, 14.92 s | unchanged | accepted, reported under D6 |
| `tempo.beatlessNeverLocks` | `beatless` | locks | locks | stretch-open (S6 canceled: kick support does not separate it) |
| `beat.errorMedianMs`, tempo cells | `6-8-time`, `half-time-shuffle` beat level | never locks to the truth | unchanged | stretch-open (S7 canceled: no bar pattern in the kicks) |

## summer2000 beat phase, the final attempt: no-go at the pre-flight (2026-11-23, on `dac157d`)
Plan `docs/plans/summer2000-beat-phase` (one bounded attempt; a miss closes the tracker work, decision D4). The design
(option O2) was a gated kick phase-locked loop: per declared beat, the nearest kick in a window, read one beat late,
drives a phase move and a period trim, engaged only by an N-of-M gate on kick regularity, with attempt A's kick move as
the entry anchor. Contracts and the orchestrator's decisions OD1 to OD4 are in
`docs/plans/summer2000-beat-phase/contracts.md`.

**What was built (not merged).** Branch `replan2/s2-kick-pll-r` (`dac157d`): attempt A rebased with KickOffset, the veto
and the fill hold removed; `KickGate` and `KickLoop` (`kickLoop.ts`) behind `KICK_PHASE_GAIN` 0. With the defaults all 717
offline cells equal main's, `bench:tracker` 1.010, total JS 340.93 kB. The tooling it needed (kick events in
`eval/detect.ts` and `testSignals.runPipeline`, `npm run scorecard -- --set`) is PR #137 and merges on its own (D8).

**Why the anchor had to be gated (OD1).** Attempt A's move on its own, at the values A measured (floor 0.2, margin 0.05,
2 beats), gives summer2000 163.0 ms and low-bpm-rnb 181.4 ms in a full scorecard. Ungated, it would fail every grid
point on low-bpm-rnb before the loop acted.

**The pre-flight (S3).** Its rule was fixed in the plan (K6) and made concrete in OD4 before any pre-flight data: for N in
3 to 8 of M = 8, with the loop's gain 0 and the anchor on, N qualifies when the in-window kick count reaches N on at
least 70% of summer2000's beats after 12 s (window 0.25 of a period), and no beat of low-bpm-rnb reaches N-1 (window
0.35). The smallest qualifying N would set the gate; none means no-go without a grid run.

| N | summer2000: share of beats after 12 s with count >= N | low-bpm-rnb: largest count before the anchor first moves | Qualifies |
|---|---|---|---|
| 3 | 0.89 | 4 (needs < 2) | no |
| 4 | 0.68 | 4 (needs < 3) | no |
| 5 | 0.51 | 5 (needs < 4) | no |
| 6 | 0.24 | 7 (needs < 5) | no |
| 7 | 0.16 | 7 (needs < 6) | no |
| 8 | 0.03 | 8, the anchor never moves (needs < 7) | no |

No N qualifies, so the attempt ends here and none of the 24 registered points was run. The two tracks want opposite
gates. summer2000's syncopated kicks put one in a beat's window often enough only for the loosest gate (N = 3). After its
halving, low-bpm-rnb runs on a 740 ms grid, where a window of 0.35 of a period is ±259 ms wide, so its kicks fill the
window on most beats even though only 13 of its 35 taps have a kick within 150 ms. Once open, the gate let the anchor
pull its grid from -11 ms to -242 and -269 ms (15.97 to 16.66 s at N = 6), the failure the gate was meant to prevent.
Kick regularity counted per beat does not separate a syncopated groove that needs the kicks from a sparse one that must
not follow them.

**Independent review of the unmerged loop**, kept for any later design (it does not change this verdict, which ran
with the loop's gain at 0):
- High: the summed loop moves outlive a gate close, but other forces move the grid back, so after a clamp-close the loop
  has no room left and stalls. Clearing the sum on close lets a steady off-beat pattern walk the grid in steps instead.
  A loop needs to bound the real displacement from a reference grid.
- Medium: with the onset term suppressed, the period nudge still sees the old place's onsets and biases the period while
  the grid is part way to the kicks (only gain 1.0 jumps past it).
- Medium: the trim's phase is not counted in the summed moves, so `KICK_MAX_PHASE_FRAC` does not bound the grid.
- Medium-low: the analyzer's extrapolated beat phase ignores a pending kick move and jumps at the next beat.

**Outcome (D4, AC6).** `summer2000` `beat.errorMedianMs` is accepted at 153.4 ms and the tracker is left as it is. Main
keeps only the kick input of #136 and the tooling of #137. The model branches (`replan2/s1b-anchor`,
`replan2/s2-kick-pll`, `replan2/s2-kick-pll-r`) stay unmerged. The follow-ups that served only the model
(`FU-RP-kickmove-guard-spec`, `FU-RP-kickoffset-realign`) are closed; `FU-RP-eval-kicks` is done by #137.

## Alignment and tracker leftovers, S5: the published phase glide (2026-11-23, on `be82b93`)
Plan `docs/plans/alignment-tracker-leftovers` (contracts C2 and C3, decisions OD4 and OD5 in `contracts.md`). When a
re-align moves the beat grid by more than `PHASE_GLIDE_MIN_MS` (20 ms), `RhythmAnalyzer.updatePhase` now eases the
published anchor to the new grid over `PHASE_GLIDE_MS` instead of jumping. `beatPhase`, `nextBeatTime` and the
counters all read the one eased anchor, so the beat counter steps exactly when the published phase wraps. The move is
measured as the jump in published phase, in beats of each anchor's own period. A tempo change at the re-align (the
halving on `low-bpm-rnb`) therefore changes only how fast the phase runs, not where it is. A first attempt measured
the move in seconds, and on that halving it made the jump larger (0.31 to 0.46 beat).

**The measure (OD5).** `scripts/rhythm-tools/phaseStepMain.ts` replays every scorecard track and calls `updatePhase`
at 60 fps. Per call it takes the published phase step minus the step the tempo explains, in beats. The figure is the
largest of these over the tracks with a grid move (`lonley` and `low-bpm-rnb`); the pre-registered limit is 0.10 beat.

| `PHASE_GLIDE_MS` | Largest step (worst track) | `beat.errorMedianMs` change | Gate cells | `scorecard:check` |
|---|---|---|---|---|
| 0 (the old jump) | 0.367 (`lonley`; `low-bpm-rnb` 0.310) | none | unchanged | pass |
| **100 (chosen)** | **0.061** (`lonley`; `low-bpm-rnb` 0.052) | none | unchanged | pass |
| 150 | 0.041 (`lonley`) | none | `lonley` 10.83 to 5.37 s after the lock | pass |
| 250 | 0.038 (`lonley`) | none | as at 150 | pass |

100 ms is the smallest value that passes, which is the pre-registered choice. At 150 and 250 ms, `lonley`'s gate
first opens at 13.50 s, exactly at its grid move (13.48 s), so it opens mid-glide. That earlier opening is recorded
as a follow-up to test live, not taken here: `FU-ATL-S5-glide-150` (R2, the full workflow). Run `sweep:gate` and
`scorecard --set PHASE_GLIDE_MS=150`, and record `scorecard:live` for `dancing-character` on `lonley`, 4 runs each at 100
and 150 ms, from the main checkout. Switch the constant only if the live gate opens earlier, no live cell gets worse
and false opens do not rise. That is a revision of OD5 and needs Trevor's approval.

The independent review found nothing that blocks. Two findings change the published phase, so each is an R2
follow-up for the full workflow:
- `FU-ATL-S5-glide-latch`: the glide starts at the newest time already shown, so the first read after a move carries
  the time since the previous read. At 60 fps that is one frame, which is what OD5 measures. At lower frame rates the
  first step is larger. Starting the glide at the first `updatePhase` after the move would fix it. The OD5 tool would
  then need to call `updatePhase` once per batch, as the app does.
- `FU-ATL-S5-backward-glide`: a move back by more than `PHASE_GLIDE_MS` makes the published phase run backwards for
  the length of the glide. The counter holds, as it did on the old jump. Lengthening the glide for large backward
  moves would fix it.

C3 says the counter "increments exactly when the published phase wraps". That holds for moves under half a beat at
an unchanged tempo. A tempo doubling at the re-align steps the counter without a wrap, as the old jump did. The
specs that pin this, and the reset specs that cannot fail today, are fast-lane follow-ups.

**Gates at 100 ms, against `be82b93`.**
- Every offline cell equals the base (446 applicable, 401 passing, 11 blocking failures). The baseline is rewritten
  from this run.
- `sweep:gate`: unchanged on every column (false opens 3 and 15; 12 of 16 within 4 s).
- `bench:tracker`: 1.001 (1.006 with kicks). The base ref was the local `main`, so this figure is advisory.
- Unit specs pass, coverage passes and `test:e2e` passes (58 passed, 6 skipped).
- Total JS: 338.91 to 339.05 kB (+0.148 kB, within the slice's 0.15 kB). `main` had only 94 B left under 339 kB, so
  Trevor raised the limit to 339.1 kB in this change (2026-11-23; the OD2 amendment in `contracts.md`).
- The `no kick` digest in `kickGolden.test.ts` moves, because it hashes the published phase. At 0 ms it is the base
  digest.

## Follow-ups outside the fast lane

The open follow-ups no longer live in this file. `docs/plans/hub-followups/ledger.md` has one row for every `FU-` id of
the hub-regressions plan with its description, the slice that owns it, its outcome and the commit or reason. Add and
close follow-ups there.
