# Rhythm stability results

Where the bassline and tempo stability work stands, and where to pick it up. It is the reference for further refinement.
The earlier measurements and reasoning are in `rhythm-findings.md`; where the two differ, this file is newer.

The goal: on a track with a constant tempo, added notes must not make visualizers appear to speed up or slow down, and one
clip should give the same dance every time it plays.

## What shipped

| Change | Where | Why |
|---|---|---|
| `state.bpm` publishes the held tempo | `rhythmAnalyzer.ts` | The beat period was corrected on every beat, so added notes moved the published tempo by up to 2.6% while the estimate stayed flat |
| `BEAT_PERIOD_GAIN` 0.1 to 0.05 | `rhythmConfig.ts` | Steadies the beat clock. Below about 0.05, the white-noise meter spec fails |
| `BEAT_LOST_BEATS` 4 to 8 | `rhythmConfig.ts` | A 2 s break with no kick counted as a lost beat and rebuilt the grid |
| Lost beats no longer poison state | `beatTracker.ts`, `rhythmAnalyzer.ts` | An infinite tempo froze the dance and the beat counters until the page was reloaded |
| Longer, confidence-gated hold for dotted rivals | `tempo.ts`, `boundary.ts`, `rhythmConfig.ts` | Dotted notes make a pulse at 4/3 of the beat, which took over the tempo and raised false song changes |
| Dance restarts on a new source | `dancingCharacterScene.ts` | The clip position depended on page age or the previous play |
| 140 BPM dance speed limit, using half time | `dancingCharacterSync.ts` | Requested: there is only so fast a person dances. Double time in the settings is exempt |
| Bass gate's pre-open penalty removed | `bassGate.ts` | Off-place notes kept the gate shut, for a whole track on `lonley`. **Kept after a listening trial; see the known cost below** |
| `BassPulse` and the gate moved to `features/rhythm/` | `bassPulse.ts`, `bassGate.ts`, `bassGateConfig.ts` | One documented shared surface for future visualizers |
| Tempo telemetry and reports | `scripts/debug-visualizer/`, `debug-harness.md` | Makes all of the above measurable |

## Results

### Live, per track

Measured with `npm run debug:viz` at about 60 fps. The "now" gate column comes from one play per track, and the `lonley` and
`syncopation*` rows rest on few plays overall, so treat those as direction, not proof.

| Track | Reference BPM | Within 1%: before | Within 1%: now | Gate opens after lock | Grid rebuilds | Verdict |
|---|---|---|---|---|---|---|
| `imyourgirl` | 135 (metronome; comb agrees) | 100% | 100% | 0.3 s | 0 | **PASS** |
| `syncopationbass2` | 128 (comb) | 100% offline | 100% | 0.2 s | 0 | **PASS** |
| `summer2000` | 127.5 (comb; Trevor's metronome read 129) | 64% to 98% | 100% | 3.5 s | 0 | **PASS** |
| `syncopationbass` | 98 (comb) | 73% to 79% | 100% | 1.5 s | 1 to 2 | Fail: rebuilds, bump spacing 81% |
| `lonley` | 140 (comb; not confirmed by ear) | about 65% offline | 100% on the latest play; 2 of 3 earlier plays locked wrong first | 9.1 s | 0 to 1 | Fail: slow gate, wrong first lock |
| `syncopation-no-kick` | 135 (comb, confirmed by ear, track is loosely structured) | 0% | 0%, steady at 180 | 3.9 s | 0 | Fail: wrong tempo |

Reference tempos live in git-ignored `.debug-in/<track>.bpm` files, so these values are the record of them. The audio files
are not in the repository.

### Offline: `npm run eval:rhythm` over the same six tracks

| Measure | Before | After |
|---|---|---|
| Tempo accuracy (4%) | 66.7% | 83.3% |
| 4/4 recall | 50.0% | 66.7% |
| Ended unsure of the meter | 50.0% | 33.3% |
| Median time to lock | 12.0 s | 9.0 s |
| Never locked | 3 | 3 |
| False song changes per file | 0.50 | 0.00 |

Its 4% tolerance cannot see tempo wobble, so it only guards against gross regressions. "Never locked" here is the meter's lock
in that tool, which is unchanged.

### Repeatability, 4 plays compared (`npm run debug:repeat`)

Measured before the last two commits (speed limit, gate penalty), neither of which changes the clock.

| Track, mode | bpm spread p95 (target 1%) | Beat spread p95 (target 40 ms) | Clip spread p95 (target 0.05) | Verdict |
|---|---|---|---|---|
| `imyourgirl`, fresh | 0% | 4.1 ms | 0.013 | **pass** |
| `imyourgirl`, re-select | 0% | 11.7 ms | 0.199 | fail: clip |
| `summer2000`, fresh | 0% | 26.5 ms | 0.463 | fail: clip |
| `summer2000`, re-select | 0% | 32.4 ms | 0.533 | fail: clip |

Before this work, `summer2000` from fresh loads was 2.36% bpm spread and 142 ms beat spread.

### Acceptance criteria

The plan is `docs/plans/rhythm-bass-stability/` on Trevor's machine; it is not committed.

| ID | Status | Note |
|---|---|---|
| AC1 telemetry and reports | Met | |
| AC2 findings | Met | `rhythm-findings.md`, corrected by this file |
| AC3 decoration specs | Met | Specs in `rhythmAnalyzer.test.ts` failed before the fix |
| AC4 tempo within 1%, no rebuilds, no song changes | **Partly** | Tempo met on 5 of 6; rebuilds remain on `syncopationbass` and sometimes `lonley` |
| AC5 gate and bump spacing | **Partly** | Revised with Trevor: open within 4 s of lock, then stay open. Misses on `lonley` and on `syncopationbass` spacing |
| AC6 real song changes not slower; kickless locks | Met | Specs pass; `eval:rhythm` improved. **Gap:** see the dotted-ratio song change under known costs |
| AC7 shared surface documented | Met | `architecture.md` section 6 |
| AC8 repository checks | Met | Format, lint, typecheck, coverage, build, size, e2e. `cubes` and `trio-color-wave` ran 20 s at 60 fps with no falloff; their look was not reviewed |
| AC9 later work listed | Met | Below |
| AC10 repeatable dance | **Partly** | Tempo and beat timing met; clip position is not |

## Known costs of what shipped

- **A real song change at a dotted ratio can go unnoticed as a song change.** Found by the independent review and confirmed by a
  probe. `BoundaryDetector.pushTempo` skips dotted ratios with no time limit and leaves its reference stale, so 90 to 120 or
  100 to 150 never raises the tempo cue. Only the spectral-novelty cue can catch it, and without it `songChangeCount` does not
  rise, so the dance locks and the bass gate are not reset. The held tempo itself still switches after about 8 s, if confidence
  stays at 0.5 or above; below that a new tempo at these ratios may never replace the old one. Fix first if a change between
  songs looks wrong: give dotted ratios a longer, confidence-gated jump time, as `tempo.ts` does. Follow-up `FU-boundary-dotted`.
- **The `state.bpm` change has no direct spec.** Reverting it leaves all rhythm specs passing, because the decoration specs pass
  on `BEAT_PERIOD_GAIN` alone. Add this before changing that code. Follow-up `FU-pin-state-bpm`.
- **Scattered bass can open the gate.** Without the penalty, 4 of 5 random bass patterns open it in the spec, recorded with
  `it.fails` in `bassGate.test.ts`. The pulse still lands on the beat clock. If stray pulses show up on real music, this is the
  first thing to revisit: revert the removal, or use the leads below.
- **Double time ignores the speed limit.** At 135 BPM it runs at 270. Capping it would leave the option doing nothing while
  the tempo is locked, because normal tempos fold into 80 to 160, so that needs a product decision.
- **Bundle budget.** Total JS is 312.26 kB against a limit raised from 312 to 312.5 kB, so little room is left.

## Where to refine next

In the order I would take them.

### 1. Wrong first lock at 4/3 (highest value)

`lonley` locks on 187.5 instead of 140 in 2 of 3 plays and corrects near 11.4 s. `syncopation-no-kick` holds 180 instead of 135
for the whole track. `syncopationbass` locks on 196 and sees a rival at 130.7. All three are the dotted-note ratio.

- **Tried on `syncopation-no-kick`, no effect:** disabling faster-pulse takeover, `TEMPO_FASTER_PULSE_RATIO` 0.9,
  `TEMPO_SWITCH_ESTIMATES` 12 and 32, `TEMPO_HISTORY_SECONDS` 16, `TEMPO_DOUBLE_LAG_WEIGHT` 0, `TEMPO_COMB_PARTIALS` 8.
- **Lead:** the first choice is made in `TempoTracker.update` from autocorrelation with a prior. When the winner has a strong
  rival at a dotted ratio, kick-band evidence could break the tie, because a kick usually marks the true beat. `lonley` has a
  clear kick peak at 70 and 140. `syncopation-no-kick` has no kick, so it may stay ambiguous, and the track is loosely
  structured, so it may not be worth chasing alone.
- **Note:** the 8 s dotted hold also delays recovery from a wrong first lock. Telling the two cases apart would help.

### 2. Dance speed differs per play after a corrected lock (small, known bug)

On `lonley`, after 187.5 corrects to 140, `normalizeOctave` picks the octave nearest its previous value, about 94, and lands on
70. Those plays dance at `timeScale` 0.58, against 1.16 on a play that locked on 140 first. Recorded as follow-up
`FU-octave-fold-after-dotted-lock`. Fixing item 1 mostly removes the trigger.

### 3. Grid rebuild on an octave change

`syncopationbass` moves from 196 to 98 near 29 s, and that rebuilds the grid because the change exceeds
`BEAT_REINIT_TEMPO_RATIO` (`beatTracker.ts`). The tempo stays right after octave normalization, but phase can jump. An octave
move could keep the grid. Some plays also rebuild near 9 s, which is **not yet explained**.

### 4. Gate on loosely placed bass

`lonley` still opens 9.1 s after lock, because only 32% to 41% of its kicks land in one place. Lower rates are too near chance (20%
in a 0.1 beat window either side) for a constant to separate them. Tried and rejected, in replay and against the specs: miss
penalties of 0.25 and 0.5, a per-beat leak of 0.1 to 0.2, `BASS_GATE_PHASE_WINDOW` 0.15 and `BASS_GATE_OPEN_SCORE` 3.

- **Lead:** a real bassline repeats every bar and random bass does not, so comparing kicks with the previous bar could tell them
  apart. That could also restore the penalty's protection against scattered bass.
- **Lead:** at evidence 0 each kick relearns the place, so a pattern that never lands twice running never starts counting.
- **Unproven:** `BassPulse` reads once per rendered frame (`bassPulse.ts`), so which kicks it detects depends on frame timing.
  That may explain gate differences between plays.

### 5. Clip position spread

After meter lock the clip always converges to within about 0.01 of the bar, but it starts a whole number of beats away, because
before that it only aligns to the nearest beat. The capped nudge (`MAX_PHASE_NUDGE_PER_SECOND`) then takes up to 8 s.

- **Visible side effect:** during that catch-up the dance runs about 11% fast or slow, which may read as a tempo change. Not
  yet fixed. A short crossfade to the right beat would avoid it, but the current cap was chosen so that the dancer never jumps.
- `summer2000` plays can also re-lock the meter a beat apart after its break near 23 s. Its `meterConfidence` falls to about 0
  from 23.1 s in every play (`meter.ts`). Improving the meter was out of scope.

### Other

- Slow first response: tempo lock about 5 s, meter lock 11 to 13 s.
- `eval:rhythm` needs a stability metric to guard this work, and a labeled dataset does not exist on this machine.
- `summer2000`'s reference is a weaker estimate than the others; `lonley`'s has not been confirmed by ear.
- Small tooling follow-ups: verdict rounding (`0.99 < 0.99`), and CSVs writing Infinity as NaN.

## Evidence probe (2026-11-06)

Measured to choose the first-lock rule. Offline numbers come from `npm run probe:rhythm` and the committed fixtures, which
leave out the AGC and block timing. Live numbers come from `npm run debug:viz` at 60 fps, on code whose tempo decisions match
`main`. Six tracks can overfit a threshold, so treat any value below as a starting point.

### What the tracks do live

| Track | First lock, this run | Grid rebuilds | Settled `timeScale` | Note |
|---|---|---|---|---|
| `imyourgirl` | 134.8, 1 of 1 plays | 0 | 1.12 | Correct |
| `syncopationbass2` | 127.7, 1 of 1 | 0 | 1.06 | Correct |
| `summer2000` | 126.8, 1 of 1 | 0 | 1.06 | Correct |
| `lonley` | 141.1, 4 of 4 | 0 | **0.58 on all 4** | 187.5 in 2 of the 4 earlier plays on this tempo code, so 2 of 8 overall |
| `syncopationbass` | 195.7 or 195.1, 4 of 4 | 1 on all 4, at the octave move | 0.82 | Twice the reference, then 98. Passes the "or its octave" test |
| `syncopation-no-kick` | 179.1, 1 of 1 | 0 | 0.75 | Wrong for the whole track. The raw estimate is also 180, so the hold is not the cause |

### Corrections to the earlier reading

- **`lonley`'s speed difference has a second cause.** The section "Dance speed differs per play" blames a corrected lock. On
  these plays the first lock was right and the dance still settled at half speed. The first estimate, 141.1, is over the
  140 limit, so half time starts. The tempo then settles at 139.5, which is inside the hysteresis band (135.8 to 140), so half
  time never ends. A play whose first estimate is 139.5 dances at 1.16. Re-seeding the octave alone cannot close this.
- **`lonley`'s wrong first lock is rarer live than offline.** Offline it is always 187.5, live 2 of 8. Fixtures can guard the
  rule but cannot predict how often a live play fails.
- **The kick does not break the tie on `lonley`.** Band 0 at 8 s is 0.138 for 140 and 0.112 for 187, too close to use.

### Bar repeat separates the rivals, given a full window

Autocorrelation at each rival's own 4L and 8L, offline. 8L needs the full 8 s window on the tempos below.

| Track, true against rival | 4L at 8 s | 8L at 8 s | 4L + 8L at 8 s | 4L + 8L at 10 s |
|---|---|---|---|---|
| `lonley`, 140 against 186.7 | 0.40 / 0.55 (wrong) | 0.68 / 0.33 | **1.08 / 0.88** | 1.08 / 1.04 |
| `syncopation-no-kick`, 135 against 180 | 0.57 / 0.25 | 0.61 / 0.16 | **1.19 / 0.40** | 1.54 / 0.63 |
| `syncopationbass`, 196 against 130.7 | 0.54 / 0.37 | 0.60 / 0.53 | **1.14 / 0.90** | 1.64 / 1.38 |
| `summer2000`, 127.5 against 170 | 0.43 / 0.41 | 0.29 / 0.30 | 0.71 / 0.71 (tie) | 1.29 / 0.78 |
| `syncopationbass2`, 128 against 170.7 | 0.48 / 0.53 | 0.56 / 0.50 | 1.05 / 1.03 (tie) | 1.66 / 1.73 (wrong) |

- 4L alone is wrong on `lonley` until about 12 s, so it cannot be the rule.
- The last two rows must not reach a tie-break. At first lock the dotted rival's height against the winner's is 0.07 on
  `imyourgirl` and 0.29 on `syncopationbass2`, and 0.52 to 0.87 on the four tie tracks (`syncopation-no-kick` 0.52,
  `syncopationbass` 0.57, `lonley` 0.85, `summer2000` 0.87). `summer2000` does reach it, so a tie must keep the current winner,
  which is right on this track.
- `summer2000` turns against the true tempo after its break (from about 16 s), so the comparison belongs at first lock only.

### Causes for `syncopation-no-kick`

The raw estimate is 180 from first lock to the end, with confidence 0.59 to 0.65.

| Cause | Evidence | Reading |
|---|---|---|
| Self-locking hold | Raw is already 180 | Ruled out as the main cause |
| No subdivision test | L/2 and L/3 are 0.19 / 0.12 for 135, and -0.02 / 0.27 for 180 | Supported: 180 looks ternary |
| No bar-repeat test | 1.19 against 0.40 at 8 s | Strongly supported |
| Band mix | Every band favors 180 at L (1.32 against 0.85) | Not a way out |
| Frame-grid bias | 0.47 against 0.27 at L, too large for a split peak | Not the main cause |
| Early decision | Locks at 3 s, when 4L does not fit | Supported, and the same fix as bar repeat |

### Old-pulse support, for a song change at a dotted ratio

Height at the old tempo's lag. Spliced songs are the only real changes available, and only one correction exists.

| Case | Old-pulse height | Result wanted |
|---|---|---|
| `lonley` correcting from 187.5 to 140, 8 to 31 s | 0.17 to 0.31 | No boundary |
| Song change, 98 to 128 (splice), 6 to 16 s after | -0.10 to 0.03 | Boundary |
| Song change, 128 to 98 (splice), 6 to 16 s after | 0.21 to 0.32 | Boundary |

The test does not fully separate them. A threshold near 0.10 raises nothing on the correction and catches the first change, but
misses the second, because `syncopationbass` really has a pulse near 128.

## How to reproduce

```
npm run debug:viz -- --dir .debug-in --track summer2000.wav --viz dancing-character --headless
npm run debug:viz -- --dir .debug-in --track summer2000.wav --viz dancing-character --reselect 4 --headless
npm run debug:repeat -- <a.csv> <b.csv> <c.csv> <d.csv>
npm run debug:summary -- <telemetry.csv> --window 2
```

- A sidecar is one number in `.debug-in/<track>.bpm`. Without one the report gives no pass or fail.
- Compare any change on all six tracks, live. Offline results misled more than once here: the live chain differs, and
  `syncopationbass` needed two further fixes after it looked solved offline.
- **Check the true tempo independently of the tracker.** A comb over the WAV works; scan past 200 BPM, because a scan that stopped
  at 180 hid a candidate on `syncopation-no-kick`.
- **Two techniques worth rebuilding** (their scripts were temporary and are not in the repository):
  - Offline ablation: run the real `OnsetExtractor` and `RhythmAnalyzer` over a WAV, with one `rhythmConfig` constant overridden
    by an esbuild `onLoad` plugin. Quick and deterministic, but it leaves out the AGC and block timing.
  - Gate replay: feed a recording's `in`, `beatPhase`, `tempoLocked`, `beatCount` and `songChanges` columns into `stepBassGate`
    with a rule changed. It reproduced recorded opening times on all 16 baseline recordings.
