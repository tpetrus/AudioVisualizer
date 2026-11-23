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

## S5: timing model and reaction offset
Measured on 2026-11-14 on branch `feat/timing-model`, through the dev harness (`npm run debug:viz ... --viz cubes
--seconds 25 --headless`, 60 fps, display delay 0 ms) and `npm run debug:summary -- <csv> --reaction <column>`.

### Batch size (cause 5)
Every tracker onset waits for the worklet's batch to fill. Median and p95 delay from the hit to the tracker's onset
value (`onsetMid`; `onsetHigh` agrees within 1 ms, and so does `onsetKick` on the click track; on the drum track it
reacts to only half the hits and its figures are not used), frame allowance ±18.6 ms:

| `BATCH_FRAMES` | click-120 median / p95 | drums-128 median / p95 | Messages per second |
|---|---|---|---|
| 8 (before) | 40 / 80 ms | 56 / 91 ms | 12 |
| 4 | 31 / 51 ms | 35 / 50 ms | 25 |
| **2 (now)** | **20 / 31 ms** | **23 / 36 ms** | **50** |
| 1 | 11 / 20 ms | 19 / 29 ms | 100 |

The target is a median within 30 ms plus one frame (46.7 ms at 60 fps). 4 is the largest value that meets it, but its
p95 (about 51 ms) is still above 46.7 ms. 2 brings the p95 inside as well, at twice the messages, and is the value
kept. With one play per cell and a frame allowance of ±18.6 ms, the gap between neighboring rows is near the
noise. No page errors and 60 fps at every value. The direct analyser read (`cubes.in`) is 11 / 20 ms for
comparison. One machine, one play per cell.

### Timing model and sync offset
`app/features/audio/timingModel.ts` (contract C6 in `docs/plans/audio-engine-alignment/contracts.md`):
`renderTime = audioNow - display delay - user sync offset`. `RhythmTracker.updatePhase()` reads at that time. The
sync offset is one audio-wide setting (the "Sync" slider in the audio source panel, -200 to +200 ms, 0 by default,
positive is later). It moves what `updatePhase` extrapolates (beat and bar phase, `nextBeatTime`, the beat counters).
It does not move the peak-held onset values or direct analyser reads: those cannot be made earlier, and delaying the
stamped onset events belongs to the hub (S7). Captured audio arrives late, so in production the visuals are late
and the correction is a negative offset ("earlier"). For a positive offset the analyzer runs the beat grid backwards
by up to one beat, because a read 100 to 200 ms back can fall before the beat that was just declared.

### Look-ahead display delay (D11): dropped
The rule was to adopt a display delay only if it bought synthetic onset F +0.05 or a quarter less beat error for at
most 80 ms. `npm run sweep:onsets -- --grid ONSET_LOOKAHEAD_FRAMES=2,4,6,8 --dir .debug-in --no-kick
syncopation-no-kick`:

- Synthetic: the worst band stays at F 0.67 (`no-kick-124` bass) at every value. One band gains: `bassline-kick-120`
  bass passes 0.9 at 4 and 6 frames and fails again at 8. `bassline-kick-120` kick fails at every value.
- Real tracks get worse with more look-ahead: bass events per beat fall from 0.31 to 0.00 on `imyourgirl` and from
  0.85 to 0.42 (4 frames) and 0.20 (8 frames) on `syncopationbass`, and kicks on the track without a kick rise from
  0.67 to 0.75 (4), 0.95 (6) and 0.80 (8) per beat. Lift is unchanged within 0.03, except `imyourgirl` at 8 frames
  (0.58 from 0.51).
- Beat error does not depend on the look-ahead: the beat grid comes from the tracker's own flux, which is unchanged.

One synthetic band is not worth 20 to 60 ms of delay on every reaction, and the real tracks move the wrong way, so
`DISPLAY_DELAY_MS` stays 0 and `ONSET_LOOKAHEAD_FRAMES` stays 2.

### Production capture delay (AC9): not measured yet
The page cannot observe when the listener hears a sound, so this is an estimate by loopback, per machine:
`npm run measure:capture-delay` (see `docs/agents/capture-delay.md`) plays clicks at known AudioContext times and
times their arrival through a capture of the same machine. Its self-check (`--source direct`, the in-page stream
round trip with no hardware) found 20 of 20 clicks with no spread, at a constant 18.0 ms in one run and 20.7 ms in
another; that is the floor of the measuring path. The `tab` and `device` sources need a person and real hardware and
have not been run. Until they are, `CAPTURE_DELAY_MS` is 0 for every source, nothing is compensated automatically,
and the sync offset is the correction. No production latency figure is claimed.

## S6: tempo ratio scoring, beat position and the library comparison
Measured on 2026-11-15 on branch `feat/tempo-scoring`. Offline figures come from `npm run eval:rhythm -- .debug-in
--alignment` and `npm run ablate:rhythm`; live figures from `npm run debug:viz ... --viz dancing-character --seconds 30
--headless` at 60 fps (lock times there include about 2.2 s before the track starts).

### What changed
- **Octave choice** (`tempo.ts`, `TEMPO_OCTAVE_PRIOR_*`). A pulse at twice the winning tempo takes over when its
  interpolated autocorrelation peak, weighted by a log-Gaussian around 128.5 BPM (0.63 octaves wide), is at least the
  winner's. Whole-lag correlation under-read pulses whose period falls between two frames (34.48 frames at 174 BPM).
- **Octave hold.** A move up one octave to a tempo that prior likes less needs 8 s of estimates at confidence 0.5,
  like a dotted rival. `syncopationbass` loses its 98 pulse for about 2.5 s near 17 s and reads 196 there.
- **Bar evidence for dotted rivals.** A 4:3 or 3:2 challenger only counts while its own 4x and 8x lag peaks sum to at
  least 1.1 times the held tempo's. On `syncopation-no-kick` those are 0.6 to 0.9 for 135 BPM against 0.2 to 0.35 for
  180, although the 180 pulse itself is twice as strong.
- **Beat position check** (`beatTracker.ts`). Onset energy is folded over the beat into 16 bins. When a place at least a
  quarter beat from the grid holds 1.15 times the grid's energy for 4 beats in a row, with at least 8 beats of
  evidence, the grid moves there and the evidence turns with it.

### Offline, before and after
| Track (label) | Tempo ratio, lock: before | After | Beat error median: before | After |
|---|---|---|---|---|
| syncopation-no-kick (135) | 1.333, never | 0.999, 8.0 s | n/a | 78 ms |
| syncopationbass (98) | right from 27.5 s | 1.001, 4.5 s | 249 ms | 31 ms |
| lonley (140) | 0.997, 8.0 s | same | 197 ms | 22 ms |
| drums-100 | 2.000, never | 1.000, 3.0 s | n/a | 1.6 ms |
| trap-2to1-double-90 | 2.000, never | 1.000, 3.0 s | n/a | 2.2 ms |
| the other 12 | unchanged | unchanged | unchanged (0.8 to 18 ms; summer2000 121 ms) | unchanged |

The variation test from S2 (lead silence 37, 100, 215, 500 ms; level times 0.25, 0.5, 2; start skipped by 100, 500,
1000 ms; 10 variants per track), median beat error and tempo:

| Track | Beat error median over the variants | Wrong tempo |
|---|---|---|
| imyourgirl | 16 to 19 ms | 0 of 10 |
| syncopationbass2 | 12 to 14 ms | 0 of 10 |
| lonley | 16 to 22 ms (was 1 to 197 ms) | 0 of 10 |
| syncopationbass | 31 to 77 ms | 0 of 10 (one variant reads 196 until about 5 s) |
| syncopation-no-kick | 21 to 93 ms | **2 of 10** (500 ms lead, 100 ms skipped: locks 180 at 3 s and stays) |

`summer2000` still reads 121 ms off its taps, but its onset energy does not line up with the taps at any place in the
beat (flat within 0.83 to 1.00 over 12 bins), so the taps cannot judge it.

### Live (AC5)
Three plays per track at commit `2538d76` and one more at `097d843`; all at 60 fps, no song changes, no grid rebuilds.

| Track (label) | Held tempo, 4 plays | Within 1% while locked | Lock (track time about 2.2 s less) | Gate opens after lock |
|---|---|---|---|---|
| imyourgirl (135) | 134.9 | 100% | 5.2 to 5.3 s | 2.8 to 3.0 s |
| syncopationbass2 (128) | 127.7 | 100% | 5.2 s (three plays), 10.3 s (one) | 2.5 s |
| lonley (140) | 139.5 | 100% | 10.2 to 10.4 s | **8.0 to 8.1 s** |
| summer2000 (127.5) | 127.7 | 100% | 10.2 to 10.4 s | **4.0 to 7.9 s** |
| syncopationbass (98) | 98.0 | 100% | 10.2 to 10.4 s | **16.8 to 17.9 s, never in one play** |
| syncopation-no-kick (135) | 134.9 | 100% | 10.2 s | 2.5 to 4.3 s; 91 to 97% of bumps on the grid |

AC5 is met for tempo on these plays: every play is within 2% of the label and none holds a 4:3 or 2:1 tempo. It is not
met as a guarantee: `syncopation-no-kick` locks wrong in 2 of 10 offline start variations. The 10.3 s lock on one
`syncopationbass2` play is the first-lock tie-break opening on a weak first estimate (confidence 0.43 against 0.80);
the old tracker does the same on other start times.

### Six more tracks (added after the tuning, so they test it)
| Track (label) | Old tracker, offline | New, offline | New, live (one play) |
|---|---|---|---|
| low-bpm-rnb (81) | 162, then 81 from 10 s | same | 81.1 |
| high-bpm-dnb (173) | 86.5, then 115 with a rebuild | 86.5, held | 173.2 |
| half-time-shuffle (81) | 162 to 169 | same | 166.8 |
| 6-8-time (62) | 184, then about 133 | same | 134.8, 3 rebuilds, 1 song change |
| beatless (71) | 140 to 153 | same | 143.9 |
| drifting-tempo (109 to about 113) | 111 rising to 116 | same | not played |

The first version of the octave prior (center 131, 0.5 wide) held `low-bpm-rnb` at 162 for good; these tracks caught
it. Nothing here fixes drum and bass offline, half-time shuffles or 6/8.

### Library comparison (AC8): not adopted
essentia.js, offline over each whole file (`RhythmExtractor2013` multifeature and degara, `PercivalBpmEstimator`),
tempo ratio against the label:

| Track | multifeature | degara | Percival | This tracker now |
|---|---|---|---|---|
| syncopation-no-kick | 1.320 | 1.276 | 0.500 | 0.999 |
| click-174 | 0.500 | 0.990 | 0.499 | 0.999 |
| trap-4to3-120 | 1.001 | 1.291 | 0.668 | 1.000 |
| trap-2to1-double-90 | 1.000 | 1.980 | 0.999 | 1.000 |
| the other 13 original tracks | 0.997 to 1.002 | 0.994 to 1.002 | right, or half on 3 | 0.997 to 1.001 |

No estimator wins on these tracks, each gets a hard one wrong, and they see the whole file where the tracker is
causal. Cost: a 1.9 MB WASM file against a JS budget with 0.15 kB to spare, and the AGPL-3.0 license. The six later
tracks were not run through it.

### Known costs and what is left
- **A 3/4 click at 180 BPM reads 90** (`it.fails` in `rhythmAnalyzer.test.ts`). The octave break-even is 182 BPM so
  that an 81 BPM track is not doubled; the margins are thin on both sides.
- **The grid move is abrupt.** One beat gap becomes 0.56 to 1.5 periods, `updatePhase` ticks one beat at the old place
  after a forward move, and the bass gate and meter keep what they learned at the old place. This may be why
  `lonley`'s gate opens 8 s after lock (measured later: it is not, see "Bass gate evidence"). Next: let `RhythmAnalyzer` watch `BeatTracker.phaseShiftCount`,
  shrink the meter evidence and make the gate forget its place, or spread the move over a few beats (R2: it touches
  shared state).
- **Thin evidence can still move the grid**: about once in two minutes on sparse noise or on eighth notes of equal
  strength (16 seeds of 120 s: 63 and 15 moves, from 208 and 38 before the review repair).
- **`syncopation-no-kick` first lock.** In the two failing variations the 135 pulse has almost no peak at its own lag
  (0.06 to 0.18 against 0.37 to 0.45), so it is neither a tie nor ever the estimate, although its bar evidence is
  decisive from 4 s. Correcting on bar evidence alone was tried and dropped: it cannot tell a 4/4 bar from a 3/4 bar and
  it flipped `summer2000` to 4:3 (R2).
- **Drum and bass offline.** The first estimate on `high-bpm-dnb` is the 2:3 pulse at 115 and the tie-break compares
  only 4:3 neighbors, so 173 is never weighed. Adding 3:2 neighbors fixed it but delayed the lock to 8 s on
  `imyourgirl`, the drum patterns and `syncopationbass`, and broke one `lonley` variation.
- **Gate on the right tempo.** `syncopationbass` now holds 98, and its gate opens 17 s after lock or not at all.
- Follow-ups recorded in the verified-diamond state: `FU-S6-octave-pins`, `FU-S6-change-delay`,
  `FU-S6-mirror-close-gate`, `FU-S6-telemetry`.

## Bass gate evidence (after S6)
The gate was the main visible miss after S6: with the tempo right, it still opened 10 s after the lock on `lonley` and
17 to 20 s after it, or never, on `syncopationbass`. Measured by replaying 44 live recordings (the S6 plays of eleven
tracks) through the gate, first with a copy that matched the shipped gate on every output of every recording.

### What was wrong
- **Grid moves are not the cause.** None of the 24 plays of `lonley`, `summer2000` and `syncopationbass` has a grid
  move after the lock. Moves appear on `low-bpm-rnb`, `6-8-time`, `beatless` and one `syncopationbass` play. Shifting
  the gate's learned place and kick history with the grid was tried in the replay and changed no opening time on any
  recording, so it was not built. This answers the "not measured" note under S6.
- **A missed kick cost two.** The gate compared each kick with the bar before. `lonley`'s bassline repeats every bar,
  but when the kick detector misses one, the kick that repeats it a bar later fails as well, and the old rule (six of
  the last eight, the latest three in a row) started over.
- **Busy bass opened it by chance.** The old rule counted repeats without asking how likely a repeat is. Two random
  notes per beat over 120 beats opened it in 52 of 100 patterns. The spec only used one note per beat over 40 beats.

### What changed (`bassGate.ts`, `bassGateConfig.ts`)
- When nothing at all landed within a beat of the place one bar back, the place two bars back is compared instead.
  When that is empty too, the kick counts neither way.
- Evidence while closed is a running sum that never goes below 0. Each kick adds the log of how much likelier its
  outcome is for a real bassline (repeats at least 60% of the time) than for chance, where the chance comes from how
  many kicks landed in the last 8 beats. The gate opens at 6, as before. Behavior once open is unchanged.

### Replay, seconds from tempo lock to the gate opening
| Track (plays) | Before | After |
|---|---|---|
| `lonley` (5) | 10.0 to 10.1 | 5.5 to 5.6 |
| `syncopationbass` (8) | 5.3 to 19.9, never in 1 | 4.7 to 18.7 |
| `summer2000` (7) | 5.9 to 9.9 | 6.8 to 12.5 |
| `imyourgirl` (5) | 4.8 to 5.0 | 4.5 to 4.8 |
| `syncopationbass2` (6) | 4.5 to 4.6 | 4.1 |
| `syncopation-no-kick` (7) | 4.4 to 6.3 | 4.5 to 5.5 |
| `high-bpm-dnb` (1) | never | 6.7 |
| `half-time-shuffle` (1) | 10.4 | 10.7 |
| `low-bpm-rnb` (1) | 11.9 | never |
| `beatless` (1) | 4.2 | 4.2 |
| `6-8-time` (1) | never | never |

Random bass that opened the gate: one note per beat over 40 beats, 0 of 205 before and after; one note per beat over
120 beats, 2 of 100 before and 1 after; two notes per beat over 120 beats, 52 of 100 before and 2 after.

- The 44 replayed recordings are in the git-ignored `.debug-out` folder and are not committed. Only the five
  trimmed fixtures in `scripts/fixtures/rhythm/gate` are.
- False opens on random bass grow with length. With two notes per beat, 3 of 300 patterns open over 120 beats and 10 of
  300 over 400 beats (`bassGate.test.ts` bounds them at 6 and 16).
- The committed `lonley` fixture (an older recording) opens 10.44 s after the lock with this rule, against 14.95 s
  before it, as pinned in `scripts/rhythm-tools/gateReplay.test.ts`. That file pins 10.4403 s for today's rule and the
  4.51 s gain in its comment; the before figure is their sum.

These are replays of recorded gate inputs, not new live plays.

### Known costs and what is left
- **`summer2000` opens 0.5 to 4 s later.** Accepted by Trevor for the gain on `lonley` and on busy random bass.
- **`low-bpm-rnb` no longer opens.** At 81 BPM its bass gives 3 to 4 kicks per beat, and about 45% of them repeat a
  bar, which is what chance gives at that density. The old rule opened on it for that reason, and its pulses then sat
  at a place only a few kicks landed on. A slow track with a busy bassline gets no pulse until the kick detector
  can tell its kicks from the notes between them (the kick against bass weakness under S4b).
- **`syncopationbass` is still slow.** About half its kicks repeat a bar, close to chance for its density. A looser
  empty-place radius (0.75 of a beat) opens it at 12 to 16 s in the replay, for one more random pattern in 205.
- **The 4 s target is not met** on `lonley`, `summer2000` and `syncopationbass`. The tempo lock itself comes at 8.2 s on
  those tracks, and the beat grid appears no earlier than the lock, so the gate cannot start gathering sooner.
- **`beatless` still opens at 4.2 s**, on the pulse the tracker locks to. Declining to lock on a weak pulse is tracker
  work.

## 3/2 tempo changes: shelved (2026-11-16)
`FU-S6-three-halves-change` was attempted and not merged. This records why, so the next attempt starts from the
measurements rather than the same idea.

### Why the tracker never follows a 3/2 change
Not confidence and not the switch count. After a 100 to 150 change the raw estimate reads 150 at confidence 1.00 from
about 4 s on, and the bar evidence (`barFavors`) refuses every estimate: `barVetoes` rises by 4 a second for the rest of
the track. The same holds for 120 to 180 and 90 to 135, while 128 to 170 (4/3 up) gets no veto. `barFavors` compares
each pulse at 4x and 8x its own lag, and only 4x is in reach of the 8 s history at these tempos. At 3/2 the held beat's
4x lag is the new pulse's 6x lag, so a pure 150 pulse train scores as high at the old bar as at its own, and the tie
(`TEMPO_TIE_SWITCH_FACTOR` 1.1) keeps the held tempo for good. The same coincidence (4x and 8x of the held lag are 3x
and 6x of the rival's) blocks every 4/3 change down.

### What was tried
Each was run on synthetic pulse trains: a beat of 100, 90, 110 or 120 BPM with a continuous 3:2 layer from 15 s, at
layer weights 1 to 4, 8 layer phases against the beat, jitter 0 or 2 frames and light noise (256 cases), plus clean
and jittered changes. Probes stayed in the git-ignored `.debug-out/review/`.

| Rule when the bar lags are shared | Beat held under the layer | Real changes followed |
|---|---|---|
| Today (`main`) | 223 of 256 | 3/2 up and 4/3 down: never |
| Skip shared lags, then refuse while the held beat's own-lag peak is at least 0.05 | 25 of 32 clean phase and weight cases switched where `main` held | 3/2 up and 4/3 down in 13.75 to 15 s on clean trains |
| The same with the own-lag peak minus its neighbors at 0.85 and 1.15 of the lag, thresholds 0.02 to 0.05 | 152 to 176 of 256 | slower, several never |
| Favor the rival when its own-lag peak is at least 0.9 of the peak at the shared period | 152 of 256: as `main` up to a layer twice the beat, switches at 3 to 4 times | 11.5 to 14 s clean; 27 to 34 s with 2 frames of jitter on some, 170 to 128 never |

The autocorrelation cannot tell a beat that has stopped from a beat buried under a louder 3:2 layer. At the held lag
the layer is half a cycle out of phase, so it pulls the beat's own peak down, and how far depends on the phase between
them. Every threshold that follows real changes reliably also gives way to loud 3:2 layers. The first rule passed its
own spec only because that spec put the layer at the one phase that holds. Each version also cost 60 to 80 bytes of
production JS against a budget with about 20 to spare.

### Why it was shelved
In a DJ set a jump of exactly 3/2 almost always comes at a change of song. Catching that change is
`BoundaryDetector`'s job (`FU-boundary-dotted`), and after a song change the tracker starts fresh. Following a 3/2
change within one song is rare, and the dance-tempo rule ("Which octave the tracker leans toward") argues for following
a 3:2 layer only once it clearly dominates. A future attempt needs a statistic that measures whether the old beat still
sounds at its own grid positions, rather than an autocorrelation peak. It has to hold on the phase, weight and jitter
grid above, and should come with a spec over that grid, not one phase.

## Limits of this evidence
- One tapper. The noise floor is 26 ms, and `summer2000` was hard to tap.
- The live beat error on `lonley` (17 to 20 ms) and the offline one (197 ms) disagree. That is cause 2 showing up, not
  a measuring fault, but it means an offline pass on beat position does not predict the live result.
- Live onsets were scored only against 60 fps samples of a peak-held value that is already 55 ms late, so the live
  onset F figures (0.04 to 0.48) mostly measure the delay and are not used above.
- Capture delay in production (tab audio, input device) was not measured; that belongs to S5.

## Next steps (2026-11-15, status updated 2026-11-22)
**Status on 2026-11-22.** S8 is closed: the bass gate's input was settled by the hub-regressions plan
(`docs/plans/hub-regressions/`, its S4 and S5), the dancing character moved onto the hub in #96, and `bass-ink` and the
close of the audit came with hub-regressions S9 (#106; see "S9 findings" in `hub-scorecard.md`). AC6 and AC7 are met
there: every hub-fed visualizer takes its bands, onsets and gate bass from the hub, and the spectrum displays (the
cubes' columns, `trio-color-wave`'s three sheets, `bass-ink`'s spectrum field) keep an owned analyser, as contract C5
allows. Still open from this plan: AC9 (the `tab` and `device` capture delay, which needs a person at the machine) and
AC5 as a guarantee (`syncopation-no-kick`'s first lock), which joins the tracker plan that hub-regressions deferred
under D11 (see "Review decisions" in `hub-scorecard.md`). The follow-ups below carry their status; the rest of each
entry is the 2026-11-15 record.

This records where the audio alignment plan (`docs/plans/audio-engine-alignment/`) stands, and every follow-up that is
still open. The full task packets (owned paths, acceptance, verification) are kept in the verified-diamond follow-up
state outside the repository, so each one is listed here by its ID with enough detail to rebuild it. Before starting
an older item, check that it still applies: some were recorded against code that has changed since.

### The plan
| Slice | Status |
|---|---|
| S1 metrics and synthetic ground truth | done |
| S2 baseline and root causes | done (#80) |
| S3 analysers owned by each consumer | done |
| S4 per-band onsets, S4b onsets on real music | done (#82 to #84) |
| S5 timing model and reaction offset | done (#85, #86), apart from the tab and device capture delay |
| S6 tempo ratio scoring and library comparison | done (#88); bass gate evidence #89, its follow-ups #90 |
| S9 tap-along and harness instrumentation | done |
| S10 presentation audit | done (`audio-presentation-audit.md`) |
| S7 shared audio hub, cubes as the reference migration, docs | done (`feat/audio-hub`); migration check in `audio-presentation-audit.md` |
| S8 every other visualizer reads the hub, the audit is closed | done: dancing character #96, `bass-ink` and the close in hub-regressions S9 (#106) |

Acceptance criteria still open:
- **AC5** is met for tempo on the live plays but not as a guarantee: `syncopation-no-kick` locks wrong in 2 of 10
  offline start variations. Moved to the tracker plan (2026-11-22).
- **AC9** has only the self-check (`--source direct`). The `tab` and `device` loopback runs of
  `npm run measure:capture-delay` need a person and real hardware.
- **AC10** is met by S7 (architecture, conventions and the add-visualizer skill describe the hub). **AC6** and **AC7**
  are met since hub-regressions S9 (2026-11-20).

Suggested order:
1. Measure AC9 on real hardware.
2. `FU-S6-telemetry`, so the tracker work below can be measured live (done).
3. `FU-S6-slow-octave` (closed: intended behavior).
4. S7 (done). It froze contract C5, the hub snapshot, before any worker started.
5. S8, one pull request per visualizer, bass ink last. Held after the dancing character (#96) until the follow-up
   plan below settles the bass gate's input.

The other tracker items can wait until after S7, because none of them blocks it.

### Which octave the tracker leans toward
The visuals play during DJ sets, so when a song can be counted at two octaves the tracker leans toward the tempo a
person would dance at to that song. The octave prior is centered at 128.5 BPM, where people prefer to step. A slow
track with eighth notes that can be heard reads at double time (65 reads 130), 80 BPM stays 80 because 160 is too fast
to step to, and a pulse above about 182 BPM folds to half time, as drum and bass is danced. Judge octave fixes against
this rule, not against the notated beat.

### S8 and the bass gate input (resolved by the hub-regressions plan)
Moving the dancing character onto the hub (draft #96) passed the reaction-delay check (`dancing-character.in` on
`drums-128`: 30.4 ms over three runs against 29.0 ms before, limit 39.0 ms) but not the bass gate. Fed the hub's low end
(the louder of `sub` and `kick`) through `BassBump`, the shared gate opens later and far less repeatably than with
`BassPulse`. Replayed with `npm run replay:gate`, from the first locked frame, two runs each:

| Track | `BassPulse` | Hub, cubes' margin and gain | Hub, best of a 36-pair sweep (margin 1.12, gain 1.0) |
|---|---|---|---|
| `drums-128` | 3.89, 3.89 s | 6.0, 4.6 s | 4.6, 4.6 s |
| `imyourgirl` | 4.52, 4.53 s | 4.5, 4.5 s | 4.5, 4.5 s |
| `lonley` | 5.62, 5.61 s | 8.4, 5.6 s | 5.6, 8.4 s |
| `summer2000` | 6.86, 6.96 s | 21.2 s, never | 21.2, 9.3 s |
| `syncopationbass` | 15.0, 18.0 s | 9.5, 9.5 s | 11.5, 11.0 s |
| `syncopationbass2` | 4.05, 3.97 s | 6.4, 9.2 s | 4.1, 4.1 s |
| `syncopation-no-kick` (should stay shut) | 4.51, 4.50 s | 8.4, 11.6 s | 5.5, 6.6 s |

`BassPulse` repeats within about 0.1 s per track; the hub-fed gate varies by up to 10 s between runs. No margin and gain
from 1.0 to 1.12 and 1 to 6 matches `BassPulse` on every track. The suspected cause, not yet tested, is timing rather
than level: the hub hands over bands in 20 ms batches scaled by a running peak, so the per-frame value steps with batch
arrival, and the gate's level-rise kick detector scatters its kick positions.

Trevor is writing a separate plan, in the same format as this one, to research and resolve this. It replaces the
choice recorded at the end of S8a (move the dancing character back to `BassPulse`, or have the gate count the hub's
time-stamped kick onsets). Until it lands: #96 stays a draft, the rest of S8 (bass ink, and the trio-color-wave audit
note) waits for it, and `FU-S10-basspulse-time-based` stays open. The tooling from #96 (`BassBump` options, the
dancing-character `lowEnd` probe column and `replay:gate --bump-margin/--bump-gain`) is there for that plan to use.

### Audio hub follow-ups (from the S7 review)
- **`FU-S7-hub-no-source`** (decided by Trevor on 2026-11-22: the snapshot rests; contract C5 amended): with no bound
  source `hub.update()` kept the snapshot at its last values, so a reader would see music still playing after the
  capture stops. It now puts bands, gate bass and onset strengths at 0 and unlocks the beat, keeping the counters.
- Smaller items, all fixed in #95 (`b20eac8`, `bf32bd5`, `bda9ee9`, `62f1f96`): `FU-S7-cubes-start-state` (a stale
  snapshot can fire one downbeat accent on entering cubes; the bass flash saturates for about 3 s on a sustained level
  at start), `FU-S7-provider-start-order` (a throwing `hub.start` is never retried), `FU-S7-hub-input-hardening`
  (non-finite energy poisons a band peak until the next reset; batch version unchecked; weak ring specs) and
  `FU-S7-tracker-dispatch-edges` (listeners added during dispatch; a throwing listener logs 50 times a second).

### Tempo tracker work (each needs a full run: it changes behavior every visualizer sees)
- **`FU-S6-telemetry`**: done. The dancing-character probe records `gridMoves`, `octaveHolds` and `barVetoes`, and the
  `debug:viz` tempo report prints how far each rose after the lock (see `debug-harness.md`). They are read through the
  analyzer's read-only `beat` and `tempo` fields, since a forwarding getter each did not fit the JS budget.
- **`FU-S6-slow-octave`**: closed as intended behavior. 65 BPM with eighth notes reads 130 and 75 BPM reads 150, which
  is the tempo a dance floor steps to (see "Which octave the tracker leans toward" above). The `it.fails` pins in
  `tempo.test.ts` are now plain specs.
- **`FU-S6-three-halves-change`**: done in the D11 tracker plan's S7 (2026-11-23). A gapless 100 to 150 change now counts as a song change 8.8 s after it, once the old beat stops finding its onsets (`BeatTracker.gridHitShare`), and the tempo follows; see "Tracker plan D11" in `hub-scorecard.md`. Shelved before that (2026-11-16), see "3/2 tempo changes: shelved" below. A real 100 to 150
  BPM change is still never followed within 30 s, and neither is a 4/3 change down (128 to 96). A 128 to 170 change
  follows after 11.25 s and a 140 to 70 change after 6.75 s.
- **`FU-boundary-dotted`** (done in D11 S7, 2026-11-23, by the grid hit share rather than a longer jump time): BoundaryDetector can swallow a sustained
  dotted-ratio tempo change forever. Give it a longer, confidence-gated jump time that refreshes its reference.
- **`FU-dotted-leaky`** (not needed after D11 S7, 2026-11-23: the boundary rule follows the 3/2 change without it): replace the hard challenger reset for dotted rivals
  below 0.5 confidence with a leaky counter. Then a real change at a dotted ratio with middling confidence is not held
  off forever. Tried with the 3/2 work: half a win per weak dotted estimate followed a noisy 4/3 change after 35.75 s
  and kept an 8 s weak burst out, but it gave 2 extra switches in 1296 noisy on-and-off dotted figures (0.15%), and
  alone it changes nothing a listener hears while the bar veto still blocks 3/2. Not shipped; worth redoing only
  together with a working 3/2 rule.
- **`FU-S10-basspulse-time-based`**: BassPulse smooths per frame, so its speed depends on the frame rate. Make its
  envelopes time-based, with the same behavior at 60 fps, and add specs for equal settling at 30, 60 and 144 fps. It
  changes three visualizers through one shared class, so check with Trevor before routing it.
- Known weaknesses without a packet yet, from "Known costs and what is left" under S6 and the bass gate above:
  - the 3/4 click at 180 BPM reads 90
  - `syncopation-no-kick`'s first lock
  - `high-bpm-dnb` first locks at 115
  - the abrupt grid move
  - the gate opens more than 4 s after lock on `lonley`, `summer2000` and `syncopationbass`
  - `low-bpm-rnb` never opens
  - `beatless` opens on a weak pulse
  - the onset miss on `bassline-kick-120` in `scripts/ground-truth/alignment.test.ts` (`no-kick-124`'s was fixed in
    hub-regressions S6; see "S6 findings" in `hub-scorecard.md`)

### Rhythm specs and dev tools (small, fast lane)
- **`FU-pin-state-bpm`** (done in #67): add analyzer specs pinning `state.bpm` to the held tempo when the grid is
  locked, and the `60 / lastBeatPeriod` fallback when the held tempo is 0.
- **`FU-state-bpm-standin-spec`** (fixed in the 2026-11-23 follow-up drain; the stand-in is not dead: it is what moves
  `state.bpm` while onsets steer the grid after the estimate is lost, and a spec now fails without it): removing the
  `handleBeat` stand-in (`state.bpm = 60 / period` while `tempo.bpm` is 0) leaves every spec passing, because the 0.5
  BPM tolerance accepts the stale value. Make one fail. It owns the same file as `FU-pin-state-bpm`, so do the two
  together.
- **`FU-app-csv-infinity`** (supersedes **`FU-csv-infinity`**; fixed in the 2026-11-23 follow-up drain, an empty cell
  reads as NaN): `scripts/debug-visualizer/csv.ts` round-trips Infinity, but `formatTelemetryCsv` and
  `parseTelemetryCsv` in `devTelemetrySummary.ts` still write it as NaN. Fold them into one implementation.
- **`FU-report-rounding`**: print enough digits in tempo verdict failures that a value below the target never reads as
  "0.99 < 0.99" (`scripts/debug-visualizer/tempoReport.ts`).
- **`FU-reselect-harden`**: fix `waitForPlaybackStart` after a very short previous play, and cap `--reselect`
  (`scripts/debug-visualizer/run.ts`, `args.ts`).

### Dancing character
- **`FU1`** (decided by Trevor on 2026-11-22, fixed in #120): relocking the camera puts it back on the dancer and at
  its starting spot, as Reset view does. Before, the dragged pose stayed and the Reset view button kept showing.
- **`DCR-FU6`** and **`FU4`** (fixed in #120; there is no skybox download any more): abort the GLB fetch and parse when
  the load signal aborts, not only check the signal after `loadAsync`, keeping the existing load semantics (AbortError,
  late arrivals disposed).
- **`DCR-FU3`** (won't do, Trevor, 2026-11-23): send the bass-driven rim light and bass ring through the club flash
  limiter and the reduced-motion flash strength, so no bass-driven brightness jump starts more than 3 times a second.
  Tried in the follow-up drain and reverted before merging: behind the limiter the rim light jumps only on loud bass
  peaks, at most 3 a second, and stops following every bass bump, which is the DJ-set feel it is there for. The rim
  light lights the dancer's edge, not a large area of the screen, so it keeps reading the gated bass directly.
- **`DCR-FU4`** (fixed in the 2026-11-23 follow-up drain): make the flash cap hold for any closed 1 s window: a minimum
  interval slightly above 1/3 s, and a tighter test.
- **`FU-octave-fold-after-dotted-lock`** (done in #72: a dotted correction re-seeds the octave): keep the dance octave
  stable when the tracker corrects a first lock at a 4/3 pulse, so one track does not dance at 70 on one play and 140 on
  another (`dancingCharacterSync.ts`).
- **`ND-F1`** (fixed in the 2026-11-23 follow-up drain): validate the committed `MakeHumanDances.glb` against the
  build's hard rules in a unit test.
- **`ND-F2`** (fixed in the 2026-11-23 follow-up drain; `collectBones` was not dead and stays): keep one source for
  `FOOT_SKATE_MAX_METERS`, and remove the dead `collectBones` and the test-only `DANCE_CLIP_DURATION` and
  `NATIVE_BEATS_PER_LOOP`.
- **`ND-F3`** (fixed in the 2026-11-23 follow-up drain; a switch asked for mid-fade waits for the fade): when
  `startFade` is called during a running fade, finish the running fade first (or fix the comment), with a test.
- **`ND-F4`** (fixed in the 2026-11-23 follow-up drain): DEV `console.warn` when the dances file fails to load or a clip
  is rejected.
- **`ND-F5`** (fixed in the 2026-11-23 follow-up drain; the salsa helper bones already turn about 12.6 degrees a frame
  in the approved clip, so they get a 14 degree ceiling and the others keep 12): include the salsa helper bones in the
  cross-fade bound test.
- **`DCR-FU2`** (fixed in the 2026-11-23 follow-up drain; four specs, not three): move the duplicated GLTFLoader image
  stand-in in three specs into one test-only helper.
- **`DCR-FU5`** (fixed in the 2026-11-23 follow-up drain): cleanups:
  - guard `setCharacter` after dispose
  - rename the shadowing `target` in `computeDanceTiming`
  - rename `dancingCharacterClip.test.ts` and the `robotBox` variable
  - fix the CREDITS.md intro and note the sharp version
- **`DCR-FU1`, `ND-F6`** (docs and hygiene; fixed in the 2026-11-23 follow-up drain, except the 1.5 s wait in the
  character e2e loop, which stays because the page exposes no load signal):
  - AGENTS.md rows for regenerating the model and for the dance fetch and build
  - use `DANCES` instead of a hard-coded list in the dances spec
  - no `waitForTimeout` in the e2e select spec
  - `fileURLToPath` in `pipeline.test.ts`

### Bass ink
- **`BI-F2`** (fixed in the 2026-11-23 follow-up drain): normalize the relative luminance of the core and edge colors
  across the 12 pitch classes in `writePalette`, so that max over min is below 1.2.
- **`BI-F4`** (fixed in the 2026-11-23 follow-up drain; a rebuild also waits for a running fade): debounce the density
  rebuild (about 250 ms of stable value), and build the new cloud before disposing the old one. That keeps the program,
  the seed and an in-flight fade.
- **`BI-F5`** (fixed in the 2026-11-23 follow-up drain): reseed EnergyTracker and restart the SetDirector warm-up after
  3 s under the silence floor, so music after a long gap does not read as a drop.
- **`BI-F6`** (fixed in the 2026-11-23 follow-up drain; a tension jump that crosses three steps at once now grants two):
  cap core steps plus kick flashes at 2 grants a second combined so the drop always has a slot. Add a denied counter for
  the telemetry probe.
- **`BI-F8`** (fixed in the 2026-11-23 follow-up drain): coalesce the fill upload into one update range per fill, or
  record why one small object per chunk is acceptable.
- **`BI-F9F10`** (fixed in the 2026-11-23 follow-up drain): fix the stale comment above `bassBinCount`, and reject
  non-finite input in `KickRing.update` and `BrightnessGovernor.request`.

### Landing page
- **`FU5`** (fixed in #121): the "More coming soon" tile sat alone on a row of the 3-column grid. The cards are now
  two columns from the `sm` breakpoint (one below it) with a title caption each, and the tile is a slim strip under
  the grid.
