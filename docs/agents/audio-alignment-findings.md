# Audio alignment: baseline and root-cause findings

Slice S2 of the audio alignment plan (`docs/plans/audio-engine-alignment/`). It answers one question: why do the
visualizers not follow music the way a listener expects? Each hypothesis from the plan gets a verdict backed by a number
from a recorded run. Measured on 2026-11-13 at commit `c1047ca` (branch `research/audio-alignment`).

## How it was measured
- **Ground truth.** Eleven synthetic tracks with exact beat and onset times (`npm run ground-truth`), and the six debug
  tracks with beats tapped by one person (`npm run tap:beats`). The tapper's calibration on a click track: constant
  offset 38.7 ms (removed from the beat files), spread 26.2 ms. That spread is the noise floor: a beat error below about
  26 ms on a tapped track cannot be told from tapping error. The tapper reported `summer2000` as hard to tap, so its
  beat-position figures are weak evidence.
- **Offline.** `npm run eval:rhythm -- .debug-in --alignment`: the real `OnsetExtractor` and `RhythmAnalyzer` over each
  WAV. No gain stage, no batching, no browser.
- **Live.** `npm run debug:viz ... --headless` at 60 fps: 18 recordings (six tracks, three plays each, `bass-ink`), 5
  more with `--no-normalize`, and 8 recordings of `click-120` and `drums-128` through each of the four visualizers.
  Beat times come from the `bass-ink.beats` counter, reaction offsets from `npm run debug:summary -- <csv> --reaction
  <column>`. A recording has one row per frame, so every live time carries a quantization of about 19 ms.
- **What this does not cover.** The harness plays the file through the speakers, which production capture does not do,
  so no figure here is a production latency. Reactions are read from scene state, not from pixels. One tapper, one
  machine.

## Baseline

### Tempo and beat position on the debug tracks

| Track (label) | Offline: tempo ratio, lock | Offline beat error (median) | Live: tempo ratio after 15 s (3 plays) | Live beat error (median, 3 plays) | Live first beat |
|---|---|---|---|---|---|
| imyourgirl (135) | 0.999, 3.0 s | 18 ms | 0.992 | 12 ms | 3.2 to 3.4 s |
| syncopationbass2 (128) | 0.997, 3.0 s | 12 ms | 0.999 | 18 to 20 ms | 3.2 s |
| lonley (140) | 0.997, 8.0 s | **197 ms (0.41 beat)** | 0.999 | 17 to 20 ms | 8.3 s |
| summer2000 (127.5) | 1.001, 8.0 s | **121 ms (+0.26 beat)** | 1.001 | **169 to 180 ms (-0.30 beat)** | 8.3 s |
| syncopationbass (98) | 1.001, 27.5 s | 249 ms | **2.03 until about 30 s**, then 0.99 | not comparable (wrong tempo) | 3.3 or 8.3 s |
| syncopation-no-kick (135) | **1.333, never** | n/a | **1.34 in all plays** | not comparable (wrong tempo) | 3.3 or 8.3 s |

In two of the four live plays of `syncopation-no-kick` (one with normalization off) the tracker first held the right
tempo (ratio 0.99 to 1.06 between 5 and 15 s) and then moved to the 4:3 tempo at about 15 s and stayed there.

### Synthetic tracks, offline

| Track | Tempo ratio, lock | Beat error (median) | Onset F at 50 ms: kick / snare / highs |
|---|---|---|---|
| click-90, 120, 140, 174 | 0.997 to 1.000, 3.0 s | 0.8 to 2.2 ms | click scored as snare: 1.00 |
| drums-128, drums-150 | 0.997, 1.000, 3.0 s | 2.3, 1.6 ms | 0.58 / 0.69 / 1.00 and 0.50 / 0.63 / 1.00 |
| drums-100 | **2.000, never** | n/a | 0.57 / 0.62 / 1.00 |
| no-kick-124 | 1.001, 3.0 s | 1.3 ms | no kick in track / 0.95 / 1.00 |
| trap-4to3-120 | 1.000, **8.0 s** | 1.6 ms | 1.00 / 0.72 / no hi-hat in track |
| trap-2to1-double-90 | **2.000, never** | n/a | 1.00 / 0.67 / no hi-hat in track |
| trap-2to1-half-140 | 0.997, 3.0 s | 2.7 ms | 1.00 / no snare in track / 1.00 |

Where the tempo is right, the beat itself is within 3 ms. Kick and snare recall is 1.00 everywhere; the low F comes from
precision (0.34 to 0.57): each band also fires on the other drums. Bass has no band and is not scored. Scores at 20 ms
equal those at 50 ms.

### Reaction delay, live (click and drum tracks at 0 ms display delay)

| Signal | Median delay after the hit | p95 |
|---|---|---|
| Tracker onsets (`onsetKick`, `onsetMid`, `onsetHigh`), 8 recordings | 49 to 60 ms | 80 to 95 ms |
| Visualizer's own analyser read (`cubes.in`, `bass-ink.in`, `trio-color-wave.in`, `dancing-character.in`) | 9 to 36 ms | 20 to 44 ms |

The plan's target is 30 ms plus one frame (16.7 ms at 60 fps), so 46.7 ms. The direct reads meet it. The tracker onsets
do not: the worklet posts features in batches of 8 frames (80 ms), which matches a median near 55 ms and a p95 near
90 ms.

## Verdict per hypothesis

| # | Hypothesis | Verdict | Measurement |
|---|---|---|---|
| 1 | Tempo ratio errors (4:3, 2:1) | **Confirmed** | `syncopation-no-kick`: 1.333 offline and 1.34 in 4 of 4 live plays, for the whole track. `syncopationbass`: 2.03 for the first 30 s in 4 of 4 live plays. Synthetic `drums-100` and `trap-2to1-double-90`: 2.000, never corrected |
| 2 | Beat position is unstable (new, not in the plan's list) | **Confirmed** | With the right tempo, `lonley` is 176 ms (0.41 beat) off the taps offline and 17 to 20 ms off live. Offline, 37 ms of silence before the track, or doubling its level, moves it to 1 ms; 100 ms of silence moves it back. `summer2000` flips between +0.26 and -0.31 beat the same way. `imyourgirl` and `syncopationbass2` stay within 16 ms under all 11 variations |
| 3 | Onset detection misses or fires on non-events | **Confirmed** (false hits, not misses) | Offline kick precision 0.34 to 0.41 and snare 0.45 to 0.53 on the drum patterns, recall 1.00. Onset F 0.50 to 0.69 against a 0.9 target |
| 4 | Batching and latency | **Confirmed** | Tracker onsets arrive a median 49 to 60 ms and p95 80 to 95 ms after the hit; direct analyser reads take 9 to 36 ms |
| 5 | Slow lock | **Confirmed** | First beat at 3.2 to 3.4 s or at 8.3 s, nothing in between (18 of 18 live plays). The bass gate opens at 7.7 to 18.3 s. `syncopationbass` reaches the right tempo at 27.5 s |
| 6 | Bass gate opens on the wrong thing | **Confirmed** | On `syncopation-no-kick`, which has no kick, the gate opened in 2 of 4 live plays (12.7 and 14.5 s). On `syncopationbass` it opened at 8.5 s in 2 of 4 plays while the tempo was held at double. On `lonley` the gate pulses land about 240 ms after the tapped beat: 5 to 7 of 70 beats got a pulse within 250 ms |
| 7 | Shared analyser state | **Confirmed in code, fixed, effect not measured** | Before S3, `cubes` set smoothing 0.5 on the shared node and `bass-ink` set only the FFT size, so `bass-ink` read with smoothing 0.8 when opened first and 0.5 after `cubes`. S3 gives each its own node. No before and after recording was made |
| 8 | Smoothing | **Minor** | Analyser smoothing does not reach the tracker (the worklet takes audio, not the analyser's spectrum). Direct reads react within 9 to 36 ms with smoothing 0.5 to 0.8 |
| 9 | Automatic gain control | **Rejected** for tempo and beat position | With `--no-normalize`, all five tracks gave the same tempo ratio, first beat and beat error as with it on (for example `lonley` 20 ms, `summer2000` -0.30 beat, `syncopation-no-kick` 1.343) |
| 10 | Per-visualizer duplication | **Confirmed in code**, a maintenance cost, not a measured error | `cubes/bands.ts`, `bass-ink/spectrumField.ts` and `motionClock.ts`, and the `trio-color-wave` sheets each derive their own levels; only `BassPulse` and the bass gate are shared |
| 11 | Presentation lag | **Mixed** | See `audio-presentation-audit.md`. Inputs are prompt; several outputs do not react to single hits at all |

## Confirmed causes, ranked by measured effect
1. **Wrong tempo at a 4:3 or 2:1 ratio.** Everything driven by the beat is wrong for as long as it lasts: the whole
   track on `syncopation-no-kick`, 30 s on `syncopationbass`, forever on two synthetic patterns. The tracker also
   leaves a right tempo for a wrong one (`syncopation-no-kick` at about 15 s).
2. **Unstable beat position.** Up to 0.41 of a beat (176 ms) on a track whose tempo is right, decided by tens of
   milliseconds of start time or by the signal level. Earlier passes could not see this because only tempo was checked.
3. **Bass gate opening on the wrong thing.** It follows from 1 and 2, and it is what the viewer sees as hits on
   non-events: pulses on a track with no kick, pulses at double tempo, pulses half a beat late.
4. **Onset false hits.** Kick and snare bands fire on each other's drums (precision about 0.4 to 0.5).
5. **Batch delay.** About 55 ms median and 90 ms at worst on every tracker onset.
6. **Slow lock.** Nothing beat-driven for 3 to 8 s, and 8 to 18 s until the gate opens.
7. **Shared analyser.** Fixed in S3.

## What this decides
- **Q1** (the `it.fails` specs the docs mention): none existed before this work. `scripts/ground-truth/alignment.test.ts`
  now has nine, one per missed target.
- **Q2** (tap before or after the gain control): stay after it. Turning the gain control off changed no tempo or beat
  figure, so moving the tap would cost a retune for no measured gain.
- **S4, per-band onsets:** needed (cause 4). The offline kick and snare precision is the number to beat.
- **S5, timing model:** needed (cause 5). The batch size is the first thing to cut.
- **S6, tempo scoring:** needed (causes 1, 6), and its scope grows: it must also make the beat position stable
  (cause 2). The variation test above (lead silence 37, 100, 215 and 500 ms, level times 0.25, 0.5 and 2, start skipped
  by 100, 500 and 1000 ms) should become a regression spec: the beat position must not move by more than the tolerance.
- **S7, S8, the hub:** still wanted for cause 10, but it does not fix a measured error by itself.

## S4b: band onsets on real music
S4 met the synthetic onset target, but on the six tapped debug tracks the detector fired 6.6 to 16.1 events per beat
across its four bands (up to 6.7 per beat in the bass band alone). Its 0.95 to 1.00 "beats with an onset within 50 ms"
was chance: at that rate almost any time has an event within 50 ms. S4b changed three things and how they are measured.

- **Detector.** A floor that follows the music (a multiple of each range's running mean, `BAND_ONSET_NOISE_FACTOR`), a
  refractory time per range, and a low-end rise measured against two frames back (`LOW_ONSET_LAG_FRAMES`), so the
  ripple of a held pad chord is not a hit. The look-ahead stays at 2 frames, which keeps the 30 ms reaction target.
- **Metric.** Raw beat coverage is replaced by lift: coverage of the tapped beats (smoothed into a grid, at the best
  offset within ±100 ms) minus the mean coverage at shifts of 0.1 to 0.9 of a beat. 0 means the events are unrelated
  to the beat. `npm run eval:rhythm -- <dir> --alignment` prints it beside the events per beat.
- **Tools and tracks.** `npm run sweep:onsets` runs the detector over every synthetic and tapped track per grid point
  of `rhythmConfig.ts` overrides and checks the bounds below. Two new synthetic tracks have unlabelled distractors:
  `pad-lead-groove-110` (pad chords and a vibrato lead over drums) and `bassline-kick-120` (a pitched bassline between
  kicks).

Bounds: every labelled synthetic band F ≥ 0.9 at 50 ms; on tapped tracks at most 2 events per beat in kick, bass and
snare and 4 in highs (kick ≤ 0.5 on a track without one), and lift ≥ 0.15. Events per beat now (first 60 s):

| Track | Kick | Bass | Snare | Highs | Lift |
|---|---|---|---|---|---|
| imyourgirl | 1.15 | 0.31 | **2.20** | 1.75 | 0.51 |
| lonley | 0.93 | 0.42 | 1.03 | 2.65 | 0.30 |
| summer2000 | 1.60 | 0.78 | 0.48 | 0.67 | 0.17 |
| syncopation-no-kick | **0.67** | 0.53 | **2.39** | 2.66 | **0.10** |
| syncopationbass | 1.02 | 0.85 | 1.40 | 1.33 | 0.45 |
| syncopationbass2 | 1.02 | 0.05 | 1.00 | 1.36 | 0.78 |

Known weaknesses (bold above, and `it.fails` in `scripts/ground-truth/alignment.test.ts`):
- **Kick versus bass is not solved.** On `bassline-kick-120` kick F is 0.76 and bass F 0.83. The track without a kick
  still gets 0.67 kicks per beat, and `syncopationbass2`, which has a bassline, gets almost no bass events. A longer
  look-ahead for the classifier (4 or 5 frames) fixed the synthetic tracks partly but labelled nearly every real low-end
  hit a kick, so it was not kept. The classifier's cue fits the synthetic kick (a sine sweep with no click) and does
  not carry over to real drums. The next attempt needs labelled real music: separate drum and bass stems mixed
  together give exact per-band labels, or a tap-along pass per band.
- **Repeated bass notes.** `no-kick-124` bass recall fell from 1.00 to 0.51: the notes raise the running mean they are
  compared against, so every other one falls under the floor. Capping the mean's update at the threshold brought the
  pad false events back.
- **Snare rate** is above 2 per beat on `imyourgirl` and `syncopation-no-kick`, and lift on `syncopation-no-kick` is
  0.10.

No visualizer reads these onset events yet (the `RhythmState.bandOnsets` values they use come from the tracker's
older three-band flux), so none of this changes what is on screen.

## Limits of this evidence
- One tapper. The noise floor is 26 ms, and `summer2000` was hard to tap.
- The live beat error on `lonley` (17 to 20 ms) and the offline one (197 ms) disagree. That is cause 2 showing up, not
  a measuring fault, but it means an offline pass on beat position does not predict the live result.
- Live onsets were scored only against 60 fps samples of a peak-held value that is already 55 ms late, so the live
  onset F figures (0.04 to 0.48) mostly measure the delay and are not used above.
- Capture delay in production (tab audio, input device) was not measured; that belongs to S5.
