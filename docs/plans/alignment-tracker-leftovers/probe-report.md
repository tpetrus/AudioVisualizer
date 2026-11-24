# Probe report: bar and level evidence (slice S4)

This report records what the probe pre-registered in `probe-plan.md` measured. Nothing in `app/` changed. The plan was
merged at commit `cf84b06`, and the probe ran on `origin/main` at `438d961` with the probe scripts of branch
`atl/s4-probe` (last script commit `8a1be60`). No threshold, formula or track list was changed after the plan merged.

## Result in one table

| Family | Decision | Rule that decided it |
|---|---|---|
| Level and meter (3/4 at 180, `6-8-time`, `half-time-shuffle`, `syncopation-no-kick`) | **No-go**, accepted as measured | Rule 2: no function gets two of the three real targets to a margin of at least 0.05 (every function gets 0). Rule 3 also fails: no function keeps every control above 0 |
| Candidate set (`high-bpm-dnb`) | **Go** on the pre-registered rule, with a thin rival pool (see "Step 4") | Margin 0.764 against the required 0.05 |
| Beat presence (`beatless`) | **No-go**, accepted as measured (AC8) | No function has a margin of 0.05: `beatless` scores higher than every other track on all three |

Step 2's reproduction gate held: the harness gives 2 of 10 wrong tempos on `main`, so the probe went on to scoring.

## Interpretations
The plan left these open, and each was settled on the narrowest literal reading.
1. **Probe analysis pass.** `replayPcm` does not expose the frames, the beat features or the tempo tracker's comb scores,
   so `scripts/probe-bar-evidence/harness.ts` repeats its delivery (same AGC from `scripts/scorecard/engine/agc.ts`, same
   extractor and `BandOnsets`, kick events then frames per batch through the scorecard's own `pushBatchToAnalyzer`) and
   reads the analyzer from outside by wrapping `pushFrame`, `TempoTracker.update` and `MeterEstimator.addBeat` on the
   instance. The hub, gates and dancer are left out because the tracker does not read them. Equality with the scorecard's
   replay on `drums-128`: 2996 of 2996 tempo samples and 58 of 58 beat times are identical (largest difference 0).
2. **First lock.** The first analyzed frame where the shared snapshot's own test holds (`bpm` above 0 and a beat phase),
   the hub's `beat.locked`. It is the tracker's own lock, not the scorecard's truth-based `tempo.lockSeconds`. Step 4 is
   the exception: the plan says "first-lock cell in the scorecard", so it uses the scorecard's lock rule.
3. **H.** The tempo the tracker holds is read as 60 over the median interval of its declared beats from the lock to the end
   of the run (the beat grid's own rate). The beats are derived exactly as the replay derives them.
4. **Tatums.** A tatum's time is its start. The chroma channel compares the summed chroma of the frames whose center is in
   the tatum with the same length before it (for the first tatum, the frames before the lock).
5. **Truth period.** The candidate within 4% of the sidecar tempo (or `.bpm`), also for `drifting-tempo`, whose constant
   sidecar tempo is used. A sample with no such candidate, or with a truth and no rival, is "not scorable" and counts as a
   miss. `syncopation-no-kick` counts as not scorable if any of its 10 variations is.
6. **Tie-break.** The plan says the median over the four targets. A target that is not scorable has no margin, so the median
   is over the margins that exist. Every function has 0 real targets at or above 0.05, so this only picks the function
   shown in the tables (`fold.T`). The decision is the same for every function (see the per-function lines below).
7. **Step 1 equality.** The beat features are the arguments the analyzer passes to `MeterEstimator.addBeat`, read, not
   recomputed. The accent is read from the meter's own ring, which is float32 storage. Recomputed in double from the same
   inputs and the meter's own means it differs by at most 7e-6, so the 1e-9 bound of the plan does not apply to it. The
   plan's bound is for values the probe recomputes from frames, and the probe recomputes none.
8. **Step 2 wrong tempo.** A variation is wrong when the median held tempo over the last 10 s of the track is not within 2%
   of 135 at any octave (the scorecard's own tolerance and fold).
9. **Step 4 comb score.** The tempo tracker's own `scores` array (the autocorrelation peak plus the double-lag term, times
   the prior), read after each update at the peak nearest the estimate's lag and at the peak nearest 2/3 of it (the
   tracker's own `peakNear` search). R is 0 when there is no peak near 2/3. The estimate is the unfiltered `rawBpm`.
   "Holding 115" means that estimate is within 4% of 2/3 of the truth (115.3).
10. **Step 5 comparison set.** The 27 plain runs of the targets, controls and held-out tracks (the syncopation variations
    and offsets are not included, and `high-bpm-dnb` is not part of the plan's list for this step). The fold is over the
    first 8 s after the lock, at least 12 tatums on every run.
11. **`6-8-time` is not scorable.** The tracker holds 179.8 bpm (three times 62). The truth level is P = 18, which is 59.9
    bpm, 0.1 bpm under the range edge `TEMPO_MIN_BPM` (60), so the plan's range rule drops it and the target is a miss.
    That is the literal reading and it is what the decision uses. With the edge relaxed to 50 bpm (information only) the
    margins are half.NK -0.222, half.T -0.162, half.C 0.069, fold.NK -0.062, fold.T 0.040, fold.C -0.367. Only `fold.T` (0.040) and `half.C` (0.069) are positive, and only `half.C` reaches 0.05.

## Step 1: what the meter receives
Per beat dumps (beat index, time, period, `featureKick`, `featureTotal`, `featureChroma`, accent) are in the `step1-*.csv`
files. Mean accent at each beat position, over the overall mean accent (1.00 means no accent at that position):

```
6-8-time: 62 beats, mean accent 0.929; mod 2: 0.95 1.05 (spread 0.09); mod 3: 0.90 1.01 1.09 (spread 0.19); mod 4: 0.92 1.04 0.99 1.05 (spread 0.13)
half-time-shuffle: 46 beats, mean accent 0.904; mod 2: 1.01 0.99 (spread 0.01); mod 3: 0.92 1.05 1.03 (spread 0.13); mod 4: 1.00 0.96 1.01 1.03 (spread 0.07)
syncopation-no-kick: 53 beats, mean accent 0.773; mod 2: 1.03 0.97 (spread 0.05); mod 3: 1.00 1.03 0.97 (spread 0.05); mod 4: 1.13 0.90 0.92 1.05 (spread 0.23)
drums-128: 58 beats, mean accent 0.990; mod 2: 1.46 0.54 (spread 0.92); mod 3: 0.99 1.02 1.00 (spread 0.03); mod 4: 0.97 0.56 1.92 0.52 (spread 1.40)
low-bpm-rnb: 45 beats, mean accent 0.830; mod 2: 1.14 0.86 (spread 0.28); mod 3: 1.01 1.02 0.97 (spread 0.04); mod 4: 1.16 0.87 1.13 0.86 (spread 0.31)
synthetic-3/4-180: 124 beats, mean accent 0.932; mod 2: 0.99 1.01 (spread 0.02); mod 3: 0.90 0.11 2.01 (spread 1.90); mod 4: 0.99 1.02 0.98 1.01 (spread 0.03)
```

Read: `drums-128` has a clear accent at mod 2 and mod 4 (1.46 against 0.54, and 1.92 against about 0.5), which is the
beat-and-bar structure the meter uses. The 3/4 click at 180 has a very strong accent on one of every three beats (2.01
against 0.90 and 0.11), but the tracker reads it at 90, so those beats are not the beats of its grid. `6-8-time`,
`half-time-shuffle` and `syncopation-no-kick` have almost no accent spread at any modulus (at most 0.19 at mod 3 and 0.23 at
mod 4), so the evidence the meter already has on these three is close to flat. This step decides nothing.

## Step 2: start variations on `syncopation-no-kick`
| variation | tempo at the end | wrong | first nonzero | lock s |
|---|---|---|---|---|
| plain | 134.8 | ok | 134.8 | 8.02 |
| lead37 | 134.8 | ok | 134.8 | 8.02 |
| lead100 | 134.9 | ok | 134.9 | 8.02 |
| lead215 | 134.8 | ok | 134.8 | 8.02 |
| lead500 | 180.0 | WRONG | 76.9 | none |
| gain0.25 | 134.9 | ok | 134.9 | 8.02 |
| gain0.5 | 134.8 | ok | 134.8 | 8.02 |
| gain2 | 134.9 | ok | 134.9 | 8.02 |
| skip100 | 180.0 | WRONG | 180.0 | none |
| skip500 | 134.9 | ok | 134.9 | 8.02 |
| skip1000 | 134.9 | ok | 134.9 | 8.02 |

wrong tempo count: 2 of 10 (lead500, skip100). This reproduces the audio alignment plan's count: variations 4 (500 ms of lead) and 8 (100 ms skipped) lock to 180.
`skip1000` holds 140.9 at its first lock, which is 4.4% from 135 and is the one variation that is not scorable in step 3.

## Level and meter (step 3)
Targets, margin per function over the full window (n/a is not scorable and counts as a miss):

| function | synthetic-3/4-180 | 6-8-time | half-time-shuffle | syncopation-no-kick | real targets >= 0.05 | median of four |
|---|---|---|---|---|---|---|
| half.NK | -0.329 | n/a | -0.329 | n/a | 0 | -0.329 |
| half.T | -0.922 | n/a | -0.124 | n/a | 0 | -0.523 |
| half.C | -1.104 | n/a | -0.452 | n/a | 0 | -0.778 |
| fold.NK | -0.014 | n/a | -0.388 | n/a | 0 | -0.201 |
| fold.T | -0.022 | n/a | -0.234 | n/a | 0 | -0.128 |
| fold.C | -0.017 | n/a | -0.445 | n/a | 0 | -0.231 |

Chosen function: `fold.T` (best median margin, 0 targets at or above 0.05). `syncopation-no-kick` as one sample is the smallest
of its 10 variations, and it is n/a because `skip1000` is not scorable. Among the nine scorable ones `fold.T` ranges from
-0.426 to 0.091, and only `lead500` and `skip100` (the wrong-lock runs, where the truth level is the lower one) are at or
above 0.05.

```
Information only, 6-8-time with the lower tempo edge relaxed to 50 bpm: H 179.8, candidates 6,8,9,12,18, truth period 18, margins half.NK -0.222, half.T -0.162, half.C 0.069, fold.NK -0.062, fold.T 0.040, fold.C -0.367
Information only, syncopation-no-kick half.NK: 9 of 10 variations scorable, smallest margin among them -0.766, at or above tau 0
Information only, syncopation-no-kick half.T: 9 of 10 variations scorable, smallest margin among them -0.377, at or above tau 0
Information only, syncopation-no-kick half.C: 9 of 10 variations scorable, smallest margin among them -0.351, at or above tau 0
Information only, syncopation-no-kick fold.NK: 9 of 10 variations scorable, smallest margin among them -0.437, at or above tau 0
Information only, syncopation-no-kick fold.T: 9 of 10 variations scorable, smallest margin among them -0.426, at or above tau 2
Information only, syncopation-no-kick fold.C: 9 of 10 variations scorable, smallest margin among them -0.353, at or above tau 0
```

`syncopation-no-kick` variations, `fold.T` margin:

| syncopation-no-kick+lead37 | H 134.8 | P* 6 | -0.375 | candidates 6,8,9,12 |
| syncopation-no-kick+lead100 | H 134.6 | P* 6 | -0.190 | candidates 6,8,9,12 |
| syncopation-no-kick+lead215 | H 134.8 | P* 6 | -0.064 | candidates 6,8,9,12 |
| syncopation-no-kick+lead500 | H 179.7 | P* 8 | 0.091 | candidates 6,8,9,12 |
| syncopation-no-kick+gain0.25 | H 134.6 | P* 6 | -0.189 | candidates 6,8,9,12 |
| syncopation-no-kick+gain0.5 | H 135.5 | P* 6 | -0.426 | candidates 6,8,9,12 |
| syncopation-no-kick+gain2 | H 134.3 | P* 6 | -0.121 | candidates 6,8,9,12 |
| syncopation-no-kick+skip100 | H 179.8 | P* 8 | 0.056 | candidates 6,8,9,12 |
| syncopation-no-kick+skip500 | H 134.6 | P* 6 | -0.178 | candidates 6,8,9,12 |
| syncopation-no-kick+skip1000 | H 140.9 | P* null | n/a | candidates 6,8,9,12 |

Controls, `fold.T` margin (the last column is all six functions in the order half.NK, half.T, half.C, fold.NK, fold.T, fold.C):

| control | H | truth P | margin | all six |
|---|---|---|---|---|
| click-174 | 174.6 | 6 | 0.000 | 0.998 0.983 1.102 0.000 0.000 0.000 |
| drums-150 | 150.0 | 6 | -0.382 | -0.490 -0.585 -0.923 -0.352 -0.382 -0.819 |
| trap-2to1-half-140 | 139.8 | 6 | 0.001 | 0.378 -0.804 -1.316 0.006 0.001 -0.020 |
| low-bpm-rnb | 160.9 | 12 | -0.391 | -0.152 -0.681 -0.273 -0.307 -0.391 -0.498 |
| summer2000 | 127.7 | 6 | -0.126 | 0.075 -0.037 0.303 0.027 -0.126 -0.214 |
| lonley | 140.1 | 6 | -0.519 | -0.520 -0.313 0.036 -0.495 -0.519 -0.320 |
| drums-128 | 127.8 | 6 | -0.726 | -0.562 -0.815 -0.740 -0.410 -0.726 -0.819 |
| imyourgirl | 135.2 | 6 | -0.437 | -0.868 -0.627 0.078 -0.542 -0.437 0.112 |
| syncopationbass2 | 128.0 | 6 | -0.206 | 0.014 0.119 -0.404 -0.174 -0.206 -0.159 |
| synthetic-4/4-180 | 180.1 | 6 | -0.012 | -0.028 -0.034 -0.055 -0.049 -0.012 -0.081 |
| synthetic-3/4-120 | 120.0 | 6 | -0.000 | 0.967 0.157 -0.021 0.000 -0.000 -0.018 |
| synthetic-3/4-140 | 139.8 | 6 | -0.000 | 0.839 0.122 -0.007 -0.000 -0.000 0.668 |

Held out, `fold.T` margin, same column order:

| sample | H | truth P | margin | all six |
|---|---|---|---|---|
| click-90 | 90.0 | 6 | 0.000 | 1.079 1.077 0.518 0.000 0.000 0.000 |
| click-90+lead300 | 90.0 | 6 | 0.000 | 1.079 1.077 0.518 0.000 0.000 0.000 |
| click-90+skip250 | 90.0 | 6 | 0.000 | 1.065 1.060 0.504 0.000 0.000 0.000 |
| click-120 | 120.0 | 6 | 0.000 | 1.170 1.170 0.000 0.000 0.000 0.000 |
| click-120+lead300 | 120.0 | 6 | 0.000 | 1.172 1.172 1.051 0.000 0.000 0.000 |
| click-120+skip250 | 120.0 | 6 | 0.000 | 1.173 1.173 0.000 0.000 0.000 0.000 |
| click-140 | 139.8 | 6 | 0.000 | 1.030 1.015 1.088 0.000 0.000 0.000 |
| click-140+lead300 | 139.8 | 6 | 0.000 | 1.036 1.020 1.153 0.000 0.000 0.000 |
| click-140+skip250 | 139.8 | 6 | 0.000 | 1.037 1.023 1.092 0.000 0.000 0.000 |
| drifting-tempo | 114.8 | 6 | -0.752 | -0.385 -0.589 -0.271 -0.281 -0.752 -0.497 |
| drifting-tempo+lead300 | 114.8 | 6 | -0.787 | -0.249 -0.513 -0.258 -0.556 -0.787 -0.561 |
| drifting-tempo+skip250 | 114.8 | 6 | -0.710 | -0.381 -0.604 -0.285 -0.274 -0.710 -0.504 |
| drums-100 | 100.0 | 6 | -0.471 | -0.506 -0.797 -0.793 -0.371 -0.471 -0.513 |
| drums-100+lead300 | 100.0 | 6 | -0.468 | -0.510 -0.794 -0.795 -0.375 -0.468 -0.514 |
| drums-100+skip250 | 100.0 | 6 | -0.471 | -0.507 -0.798 -0.793 -0.371 -0.471 -0.514 |
| no-kick-124 | 124.1 | 6 | -0.550 | -0.781 -1.091 -1.136 -0.449 -0.550 -0.025 |
| no-kick-124+lead300 | 124.1 | 6 | -0.567 | -0.753 -1.087 -1.160 -0.445 -0.567 -0.023 |
| no-kick-124+skip250 | 124.1 | 6 | -0.538 | -0.800 -1.095 -1.136 -0.456 -0.538 -0.025 |
| syncopationbass | 98.1 | 6 | -0.257 | -0.057 -0.191 -0.156 -0.303 -0.257 -0.070 |
| syncopationbass+lead300 | 97.9 | 6 | -0.338 | -0.104 -0.133 -0.166 -0.254 -0.338 -0.106 |
| syncopationbass+skip250 | 97.9 | 6 | -0.400 | -0.111 -0.161 -0.133 -0.135 -0.400 -0.141 |
| trap-2to1-double-90 | 90.0 | 6 | -0.930 | -0.915 -1.314 -1.118 -0.553 -0.930 -0.821 |
| trap-2to1-double-90+lead300 | 90.0 | 6 | -0.954 | -0.941 -1.335 -1.118 -0.563 -0.954 -0.820 |
| trap-2to1-double-90+skip250 | 90.0 | 6 | -0.957 | -0.939 -1.338 -1.116 -0.568 -0.957 -0.809 |
| trap-4to3-120 | 120.0 | 6 | -0.449 | 0.358 -0.358 -0.242 -0.172 -0.449 -0.251 |
| trap-4to3-120+lead300 | 120.0 | 6 | -0.430 | 0.379 -0.315 -0.245 -0.167 -0.430 -0.268 |
| trap-4to3-120+skip250 | 120.0 | 6 | -0.448 | 0.361 -0.358 -0.242 -0.171 -0.448 -0.250 |
| bassline-kick-120 | 120.0 | 6 | -0.568 | -0.177 -0.715 -0.805 -0.311 -0.568 -0.382 |
| bassline-kick-120+lead300 | 120.0 | 6 | -0.568 | -0.176 -0.719 -0.813 -0.311 -0.568 -0.651 |
| bassline-kick-120+skip250 | 120.0 | 6 | -0.569 | -0.177 -0.715 -0.806 -0.311 -0.569 -0.382 |
| pad-lead-groove-110 | 109.8 | 6 | -0.049 | -0.452 0.176 0.670 -0.269 -0.049 -0.066 |
| pad-lead-groove-110+lead300 | 109.8 | 6 | -0.049 | -0.452 0.176 0.669 -0.269 -0.049 -0.066 |
| pad-lead-groove-110+skip250 | 109.8 | 6 | -0.056 | -0.477 0.171 0.678 -0.285 -0.056 0.151 |

```
Rule 2 (at least two real targets at or above 0.05): fail (0)
Rule 3 controls all above 0: fail; held-out all above 0: fail; held-out at or above 0.05: 0% (0 of 33)
LEVEL AND METER FAMILY: NO-GO
  (info) half.NK: controls above 0 false; held-out above 0 12/33; at or above tau 12/33
  (info) half.T: controls above 0 false; held-out above 0 12/33; at or above tau 12/33
  (info) half.C: controls above 0 false; held-out above 0 10/33; at or above tau 10/33
  (info) fold.NK: controls above 0 false; held-out above 0 9/33; at or above tau 0/33
  (info) fold.T: controls above 0 false; held-out above 0 9/33; at or above tau 0/33
  (info) fold.C: controls above 0 false; held-out above 0 8/33; at or above tau 1/33
```

The fold contrast cannot separate the beat from a rival on a click track at all (margin 0 on every click), and the
half-autocorrelation functions are positive on the clicks and negative on most real tracks. No function meets rule 3, so
the family is accepted as measured: the 3/4 at 180, `6-8-time`, `half-time-shuffle` and `syncopation-no-kick` keep the
levels the tracker reads today, and S6 does not run for them.

## Step 4: candidate set (`high-bpm-dnb`)
```
readability check on drums-128: 108 of 108 estimates have a comb peak at their own lag with a positive score within 1.5 lags (scores read from the tracker's own array, not recomputed)
6-8-time: no first lock in the scorecard sense, left out
click-120: 0 updates before the lock, largest R 0.000
click-140: 0 updates before the lock, largest R 0.000
click-174: 0 updates before the lock, largest R 0.000
click-90: 0 updates before the lock, largest R 0.000
drifting-tempo: 0 updates before the lock, largest R 0.000
drums-100: 0 updates before the lock, largest R 0.000
drums-128: 0 updates before the lock, largest R 0.000
drums-150: 0 updates before the lock, largest R 0.000
half-time-shuffle: 68 updates before the lock, largest R 0.000
high-bpm-dnb: 0 updates before the lock, largest R 0.000
imyourgirl: 0 updates before the lock, largest R 0.000
lonley: 16 updates before the lock, largest R 0.000
low-bpm-rnb: 0 updates before the lock, largest R 0.000
no-kick-124: 0 updates before the lock, largest R 0.000
summer2000: 20 updates before the lock, largest R 0.000
syncopation-no-kick: 20 updates before the lock, largest R 0.000
syncopationbass: 0 updates before the lock, largest R 0.000
syncopationbass2: 0 updates before the lock, largest R 0.000
trap-2to1-double-90: 0 updates before the lock, largest R 0.000
trap-2to1-half-140: 0 updates before the lock, largest R 0.000
trap-4to3-120: 20 updates before the lock, largest R 0.000
bassline-kick-120: 0 updates before the lock, largest R 0.000
pad-lead-groove-110: 0 updates before the lock, largest R 0.000
target: high-bpm-dnb updates holding 115 (within 4%) before its lock: 20, smallest R 0.764
rival: 144 updates on every other track, largest R 0.000 (half-time-shuffle at 3.02 s (estimate 125.9))
margin 0.764; CANDIDATE SET: GO
```

On the plan's rule this is a go: R is at least 0.764 while `high-bpm-dnb` holds 115 (20 updates) and exactly 0 on every
rival update. Two things limit how much this shows. The rival pool is small (144 updates on 5 tracks), because the plan
counts updates only from 3 s to the scorecard's first lock and 17 of the 22 other tracks lock at about 3 s, so they have no
update to count. And R is 0 on every rival update because the 3:2 neighbor has no autocorrelation peak at all there, so the
rule amounts to "weigh the 3:2 neighbor only when it has a peak". The readability check on `drums-128` shows the score is
read from the tracker's own array and that every estimate sits on a peak with a positive score. S7 has to show against the
scorecard that such a rule does not delay first locks (AC5), which is judged there, not here.

## Step 5: beat presence (`beatless`)
```
beatless: lock 3.12, held 144.1, tatums 384, fold6 NK 0.237, T 0.421, C 0.789
| function | beatless | smallest elsewhere | on | margin |
|---|---|---|---|---|
| fold.NK | 0.237 | 0.024 | lonley | -0.213 |
| fold.T | 0.421 | 0.045 | low-bpm-rnb | -0.377 |
| fold.C | 0.789 | 0.000 | click-120 | -0.789 |
BEATLESS: NO-GO; tracks compared: 27
```

No function has a margin of 0.05. `beatless` locked at 3.12 s on the tracker's own test, and its fold contrast at P = 6 is the
highest of the 28 runs on all three channels (0.237, 0.421 and 0.789, against lowest values elsewhere of 0.024, 0.045 and
0). It has a real periodicity, as the plan said. `beatless` stays accepted as measured (AC8).

## Step 6: dance-clip tracks (AC7), from the committed `docs/agents/hub-scorecard.cells.json`
| Track | Truth | Tempo the tracker holds at its first lock | Scorecard cells | Expected to move |
|---|---|---|---|---|
| `low-bpm-rnb` | 81 | 160.9, the double | `tempo.lockSeconds` 3.019, `maxErrorAfterLock` 0.001 (octave-folded, so it passes) | no, the level family is a no-go |
| `6-8-time` | 62 | 179.8, three times the truth | `tempo.lockSeconds` and `maxErrorAfterLock` unavailable (fail), 1 false song change | no, the level family is a no-go |
| `syncopationbass` | 98 | 98.1, the truth | `tempo.lockSeconds` 3.019, `maxErrorAfterLock` 0.003 | no |
| `syncopation-no-kick` | 135 | 134.7, the truth (2 of the 10 start variations hold 180) | `tempo.lockSeconds` 8.019, `maxErrorAfterLock` 0.001 | no, the level family is a no-go |
| `high-bpm-dnb` | 173 | 86 on the beat grid (the estimate was 115 before), half of the truth | `tempo.lockSeconds` 8.019, `maxErrorAfterLock` 0 | S7, if it ships the candidate-set rule |

The live cells are recorded in S8.

## Commands
Everything ran in the worktree of branch `atl/s4-probe` (its own `npm ci`), with the tracks read from the main checkout's
`.debug-in`. Outputs are in the scratch folder
`C:/Users/trevo/AppData/Local/Temp/claude/40433fb8e4496660/18d80d07-f7d9-4823-99e8-b26024a5d5fd/scratchpad/s4/` (`<scratch>`
below) and are not committed. The tables above are copied from `stdout.txt`.

```
npx esbuild scripts/probe-bar-evidence/probe.ts --bundle --platform=node --format=esm --packages=external --log-level=warning --outfile=node_modules/.cache/probe-bar-evidence.mjs
node node_modules/.cache/probe-bar-evidence.mjs gate --dir C:/Users/trevo/CODE/AudioVisualizer/.debug-in --out <scratch>   # step 2 and the equality check: step2.json
node node_modules/.cache/probe-bar-evidence.mjs all  --dir C:/Users/trevo/CODE/AudioVisualizer/.debug-in --out <scratch>   # stdout.txt, tables.md, runs.json, step2.json, step4.json, step1-*.csv
npx vitest run scripts/probe-bar-evidence
```

Two runs of `all` give identical output.
