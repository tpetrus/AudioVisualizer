# Rhythm baseline findings

Why visualizers appear to speed up and slow down on steady tracks, measured on the unchanged tracker before any fix was
written. This is the S3 baseline of the `rhythm-bass-stability` plan. All numbers come from commit `9149d1c` unless stated.

## Summary

The source of the issue is identified. Four separate defects produce what looks like one problem, and the two with the
largest effect are not the ones the plan expected:

1. **Published tempo follows beat-level timing errors (H2, confirmed).** The tracker's tempo estimate stays steady, but the
   value visualizers read wobbles by up to 2.6% around decorative onsets. This is the reported symptom.
2. **A permanent poison bug (new, H7).** After 4 missed beats, the tracker publishes an infinite tempo. The dancer's clock
   and the beat counters stay broken until the page is reloaded. It happened in 1 of 16 plays.
3. **The bass gate opens late and unpredictably (new, H8).** Off-beat bass notes keep it closed for 8 to 23 s after the
   tempo locks, and how long varies from run to run.
4. **The dance position differs between runs until the bar is known (H6, confirmed for repeatability).** The tempo and the
   chosen downbeat agree across runs, but the clip does not align with them until well after the meter locks.

The leading plan fix, weighting the onset envelope toward the kick (H1), makes the tempo worse on these tracks and should
be dropped.

## Method

- **Live:** `npm run debug:viz` on `dancing-character`, headless with GPU, at about 60 fps. Each track was played 8 times:
  4 fresh page loads and 4 re-selections in one page. All 16 plays completed.
- **Offline ablation:** the real `OnsetExtractor` and `RhythmAnalyzer` run over each WAV with one constant changed in memory.
  It is deterministic, but it leaves out the live AGC and block timing.
- **Gate replay:** the recorded bass input and beat phase replayed through the real `stepBassGate`, with one rule changed in
  memory. It reproduced the recorded opening time on all 16 recordings, so its variants are credible. It holds the clock
  fixed, so it cannot show how a clock fix and a gate fix interact.
- **Scope of evidence:** two tracks, and only `summer2000` shows the tempo and gate defects. Every "confirmed" below means
  confirmed on these samples. The ablation results have not yet been checked live.

### Datasets

- `eval:rhythm` needs a genre-folder layout, and no labeled dataset exists on this machine. It was run only on these two
  tracks, placed in a temporary genre folder.
- Its result was 100% tempo accuracy, 100% 4/4 recall, a median of 11.5 s to lock and 0 false resets.
- **It cannot detect this defect.** Its tempo tolerance is 4%, the wobble is at most 2.6%, and it reads a median at the end
  of the track. It remains useful as a guard against gross regressions only. Kickless music has no real-audio coverage, so
  that case rests on a synthetic fixture.

### Reference tempos

| Track | Sidecar | Source | Independent check |
|---|---|---|---|
| `imyourgirl` | 135 | Trevor's metronome recording | Comb filter over the WAV: 135.0, strong peak (score 6.1) |
| `summer2000` | 127.5 | Comb filter over the WAV, chosen by Trevor over the metronome's 129 | Every band and both halves of the track agree on about 127.5, but the peak is weaker (score 2.1 to 2.4; 129 scores 1.2, about noise level) |

The reference was deliberately not taken from the tracker, whose held tempo is 127.66. That is 0.13% from the reference, so
the choice between them affects no verdict.

## Results

### Per play

Targets are at least 98% of post-lock time within 1% of the reference, at least 99% gate open, and no grid rebuilds.

| Track, play | Lock (s) | Within 1% | bpm p1 to p99 | Gate first open (s) | Gate open | Grid rebuilds | Verdict |
|---|---|---|---|---|---|---|---|
| imyourgirl, all 8 | 5.19 to 5.36 | 100% | 134.3 to 135.2 | 5.51 to 5.52 | 98.9% to 99.5% | 0 | 4 pass; 4 miss only on gate share |
| summer2000, fresh 1 | 5.23 | 64.4% | 124.7 to 130.8 | 14.70 | 61.3% | 1 (poison) | fail |
| summer2000, fresh 2 | 5.24 | 96.7% | 126.6 to 129.6 | 13.76 | 65.2% | 0 | fail |
| summer2000, fresh 3 | 5.40 | 96.7% | 126.5 to 129.6 | 13.76 | 65.6% | 0 | fail |
| summer2000, fresh 4 | 5.24 | 96.7% | 126.6 to 129.6 | 14.70 | 61.4% | 0 | fail |
| summer2000, re-select 1 | 5.23 | 88.6% | 124.7 to 130.2 | 13.75 | 65.2% | 0 | fail |
| summer2000, re-select 2 | 5.19 | 98.0% | 126.9 to 129.2 | 28.03 | 6.9% | 0 | fail |
| summer2000, re-select 3 | 5.19 | 98.1% | 126.9 to 129.2 | 14.70 | 61.3% | 0 | fail |
| summer2000, re-select 4 | 5.18 | 96.5% | 126.5 to 129.6 | 16.12 | 55.4% | 0 | fail |

There were no song changes and no octave changes in any play. The tempo lock itself held for 100% of post-lock time in every
play.

### Deviation windows

`imyourgirl` had none. On `summer2000`, these are all the windows where the published tempo left the 1% band. During every
one, `rawTempoBpm` stayed at 127.66 and `heldTempoBpm` stayed between 127.4 and 127.7.

| Track time (s) | Peak deviation | Plays showing it | Supports |
|---|---|---|---|
| 6.26 to 6.81 | -2.20% or +1.61% | fresh 1, 2, 4; re-select 1 | H2 |
| 7.23 to 7.68 | -1.58% | fresh 1; re-select 1 | H2 |
| 8.18 to 9.53 | +1.22% | fresh 1; re-select 1 | H2 |
| 9.98 to 10.44 | +1.25% to +2.09% | all 8 | H2 |
| 19.39 to 22.57 | +2.59% | fresh 1 only, ending just before the poison at 23.06 | H2, H7 |
| 24.74 to 27.36 | +2.50% | fresh 1 only, after the rebuilt grid | H2, H7 |
| 25.57 to 25.96 | +1.65% | fresh 3; re-select 4 | H2 |

Windows recur at the same track times, so they follow the music rather than random noise. That matches the report of tempo
following temporary notes. The effect reaches the dance: `timeScale` ranges from 1.044 to 1.087 around a median of 1.063
(about -1.8% to +2.3%) on `summer2000`, against 1.121 to 1.126 on `imyourgirl`.

### Repeatability

| Track, mode | bpm spread p95 (target 1%) | Beat spread p95 (target 40 ms) | Clip spread p95 (target 0.05 loops) | Lock spread (target 2 s) | Verdict |
|---|---|---|---|---|---|
| imyourgirl, fresh | 0.185% | 9.14 ms | 0.009 | 0.14 s | pass |
| imyourgirl, re-select | 0.379% | 11.2 ms | 0.254 | 0.06 s | fail (clip) |
| summer2000, fresh | 2.36% | 142 ms | NaN (poisoned run) | 0.17 s | fail (bpm, beat, clip) |
| summer2000, re-select | 1.68% | 51.7 ms | 0.502 | 0.05 s | fail (bpm, beat, clip) |

Runs choose the same octave and the same downbeat: the downbeat falls at 2.27 beats on `imyourgirl` and 3.94 on `summer2000`
in every play, apart from the poisoned stretch.

## Hypotheses

| ID | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| H1 | Equal band weights give decorations too strong a vote | **Rejected** on these samples | The estimate never moves. Offline, weights of 1, 0.25, 0.25 widen `summer2000` to 124.5 to 130.2 and kick only to 124.3 to 130.5, against 125.2 to 130.0 today. Share within 1% falls from 92.3% to 88.3% and 72.7% |
| H2 | Each beat's error moves the period, which is published as `state.bpm` | **Confirmed** | The estimate is flat through every window above. Offline, `BEAT_PERIOD_GAIN` of 0 narrows the range to 127.1 to 127.7 and raises the share within 1% from 92.3% to 100%. A gain of 0.02 gives 127.2 to 128.0 and also 100% |
| H3 | The estimate moves to a faster pulse | **Rejected** on these samples | `rawTempoBpm` is constant after lock and no octave changes occur. Disabling the takeover offline changes nothing |
| H4 | False soft song changes clear the locks | **Rejected** on these samples | No song changes in 16 plays |
| H5 | Clock error reaches the bass pulse through clock-driven bumps | **Mostly rejected** | Bump intervals are on the grid for 100% of plays without the poison, and 90.3% with it. The clock's wobble is too small to move a bump off the grid |
| H6 | Confidence or bar position makes the dancer jump with a steady tempo | **Confirmed for repeatability; open for visible jumps** | See below |
| H7 | New: losing the beat poisons tempo, dance and counters | **Confirmed, reproduced deterministically** | See below |
| H8 | New: off-beat bass notes hold the gate closed | **Confirmed** | See below |

### H6: dance position

- Before the meter locks, at about 11 to 13 s, the dance only aligns to the nearest beat. The clip can therefore sit a whole
  beat (0.25 of a loop) or two beats (0.5) away from another run, which is exactly the spread measured.
- Runs converge after the meter locks, at a rate limited by the nudge cap, by about 17 s on `imyourgirl` and 25 s on
  `summer2000`.
- On re-selection the clip keeps its position from the previous play (0.10 at 5 s, against 0.36 to 0.45 on fresh loads), so
  carried-over state is confirmed as one cause.
- On `summer2000`, `meterConfidence` falls to between 0 and 0.11 starting at 23.1 to 23.3 s in all 8 plays, lasting until
  about 24 or 28 s, and the dance can leave its bar lock. Whether this looks wrong can only be judged by watching it.

### H7: the poison bug

1. `BeatTracker.declareBeat` clears `aligned` after `BEAT_LOST_BEATS` (4) misses, but `push` still reports a beat
   (`beatTracker.ts:119`, `:216`).
2. `RhythmAnalyzer.handleBeat` then reads `periodSeconds`, which is 0 without a grid (`beatTracker.ts:66`), stores it as
   `anchorPeriod` and publishes `state.bpm = 60 / 0` (`rhythmAnalyzer.ts:263`, `:270`, `:275`).
3. `updatePhase` divides by that period, so `beatCount` becomes Infinity. Because counters only ever rise, it can never
   recover (`rhythmAnalyzer.ts:184`, `:190`). No later beat is ever seen by code comparing that counter.
4. `normalizeOctave` turns the infinite tempo into NaN, and `slew` keeps NaN forever, so `mixer.update` poisons the clip time
   (`dancingCharacterSync.ts:96`, `:201`; `dancingCharacterScene.ts:275`).

A deterministic reproduction through the real analyzer and timing code gave `bpm=Infinity`, `beatCount=Infinity` and
`timeScale=NaN`. Both survived `hardReset`, so only a page reload clears them. The tracker is app-wide, so the counters stay
broken in every visualizer reading them. In the live run, `clipPhase` stayed NaN for the remaining 399 rows.

The lost beats followed a +2.59% excursion and fell at 23.06 s, just as the meter's confidence starts to drop in every play.
The likely trigger is therefore a passage in the music near 23 s, reached by a period that H2 had already moved off the
onsets. That link is inferred, not proven. The bug must be fixed regardless, because any real change of phase can reach it.

### H8: late gate

- Kicks on `imyourgirl` land at the learned place 88% of the time. On `summer2000` only 27% to 34% do, and they fall in
  several clusters across the beat. This looks like a syncopated bassline, not clock error, because the clusters hold still
  in every play.
- Before the gate opens, each kick away from the learned place costs a point of evidence (`bassGate.ts:176`), and a new
  place is only learned when evidence reaches 0. A syncopated bassline therefore keeps paying the penalty. Once open, the
  gate holds steadily.

| Gate replay variant on `summer2000` | Opens (s) | Post-lock open |
|---|---|---|
| Today | 13.7 to 28.0 | 6.9% to 65.6% |
| No pre-open penalty | 7.5 to 9.0 | 84.6% to 90.7% |
| `BASS_GATE_PHASE_WINDOW` of 0.15 | 9.4 to 16.1 | 55.4% to 83.0% |
| `BASS_GATE_OPEN_SCORE` of 3 | 12.8 to 14.7 | 61.2% to 69.5% |

These exclude fresh 1, whose replay is distorted by the poison. `imyourgirl` is unchanged by the first two variants. Removing
the penalty also removes its stated purpose, keeping scattered bumps from opening the gate, so a fix needs a spec for stray
bass.

The run-to-run spread has a likely cause that is not yet proven: `BassPulse` reads the analyser once per rendered frame
(`bassPulse.ts:45`), so which kicks are detected depends on frame timing, and which kick teaches the place decides how long
opening takes. Kick counts vary from 66 to 73 between plays of one clip.

### Other leads

- **Two clusters of results on one clip.** `summer2000` within-tolerance values group near 96.7% and 98%, with outliers at
  64% and 89%. The analyzer is deterministic, so something upstream differs between runs. Worklet block alignment against the
  audio and the AGC are the leading candidates. Neither is measured yet.

## Proposed slices

**These are proposals until Trevor confirms them at the S3 review.**

| Slice | Plan | Proposal |
|---|---|---|
| S4 | Failing specs and fixtures | **Proceed**, adding a poison spec and a syncopated-bass gate spec to the planned fixtures |
| S5 | Input fixes | **Replace.** Drop onset weighting (H1), the faster-pulse change (H3) and the boundary guard (H4). Fix the poison (H7) and the gate's opening (H8) |
| S6 | Steady published clock | **Reduce, then decide.** Try the small change H2 points to first, and re-measure live. Build the full `steadyClock` only if beat-level wobble remains, or if a smaller change breaks `AC6` |
| S7 | Repeatable dance | **Proceed, smaller.** Clear carried-over clip state on a new source; re-measure the rest after S5 and S6 |
| S8 | Final checks and docs | **Proceed** |

### Plan items that need a decision

- **`AC5` gate share.** At least 99% open across post-lock time cannot hold on a syncopated track, because the gate has to hear
  several kicks after the tempo locks. Even with no penalty the best replay reaches 90.7%. The proposal is to measure two
  things: opening within a set time of lock, and then staying open for at least 99% of the remainder.
- **`AC10` clip spread.** Measuring it from tempo lock counts the period before the bar is known, when the dance cannot be
  aligned to a bar. The proposal is to measure it from meter lock.
- **Sample set (risk K2).** Only one track shows these defects, and there is no labeled dataset. More tracks with syncopated
  bass, ideally some without kicks, would guard against overfitting.

## Later work (not fixed here)

- **Meter confidence collapse** on `summer2000` from about 23 s, in every play, in `app/features/rhythm/meter.ts`. Out of scope for the
  bassline; it does affect the dance's bar lock.
- **Slow first response.** Tempo lock takes about 5 s and meter lock 11 to 13 s (`TEMPO_MIN_HISTORY_SECONDS` and
  `BEAT_INIT_MIN_SECONDS` in `app/features/rhythm/rhythmConfig.ts`, `app/features/rhythm/meter.ts`).
- **`eval:rhythm` cannot see tempo wobble**, because it scores a final median at 4% tolerance (`TEMPO_TOLERANCE` in
  `scripts/eval-rhythm.ts`). A stability metric would make it a useful guard.
- **Docs mismatch.** `AGENTS.md` says rhythm specs use `it.fails`, but none exist in `app/` (plan question Q3).
- **Other visualizers.** `cubes` and `trio-color-wave` were not measured in this baseline. `useCubesScene.ts` reads
  `downbeatCount`, so H7 can reach it.
