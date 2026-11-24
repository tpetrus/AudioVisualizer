# Probe plan: bar and level evidence (pre-registration, contract C1)

This file is the pre-registration for slice S4 of the alignment-tracker-leftovers plan
(`alignment-tracker-leftovers.plan.md`, contracts in `contracts.md`). It fixes, before any probe run, what is measured,
how it is scored, which tracks it is judged on and the numbers that give a family a go. It merges in its own pull
request, and S4 starts only after that. `probe-report.md` cites the commit that merged this file. Changing a threshold,
a track list or a formula after that needs a new revision of this file, merged in a pull request that Trevor approves,
and the report then names both commits.

Two earlier attempts missed because the evidence they relied on was not there (D11 S6 and S8, the replan's S0, A and B).
So this probe asks one question per family, with no app change: is there a signal the tracker could use that picks the
truth over the best wrong choice on the target tracks, and still agrees with the truth on tracks it was not tuned on?
A no is an accepted outcome (risk K2). The family is then recorded as accepted as measured, with the numbers below.

## Ground rules
- **No app change.** The probe runs the app's offline pipeline exactly as `npm run scorecard` does (the replay in
  `scripts/scorecard/engine/`, kick events delivered per batch) and reads the analyzer from outside. Code lives in
  `scripts/probe-bar-evidence/` and runs through the `npx esbuild ... && node ...` form, with no `package.json` change.
- **Tracks are read** with `--dir C:/Users/trevo/CODE/AudioVisualizer/.debug-in`. The audio is never committed. The
  generated tracks `bassline-kick-120` and `pad-lead-groove-110` are rendered in memory, as the scorecard does.
- **Synthetic triple-meter tracks** come from `renderTrack` in `app/features/rhythm/testSignals.ts` with the options
  of the click-track specs in `rhythmAnalyzer.test.ts`: `{ seconds: 45, bpm, beatsPerBar }`, run through `runPipeline`.
- **Deterministic.** Every number in the report comes from a command written into the report, and running it twice
  gives the same output.

## Step 1: what the tracker already sees (descriptive, not scored)
Before any score, dump what `MeterEstimator.addBeat` receives at each declared beat (beat index, time, period,
`featureKick`, `featureTotal`, `featureChroma`, and the accent the meter computes from them) on every target and on
`drums-128` and `low-bpm-rnb`. If the probe recomputes these values instead of reading them, it must first show equality
with the analyzer's own values on `drums-128` (largest absolute difference at most 1e-9) and report it. The report
summarizes, per target, how the accent is spread over beat positions mod 2, 3 and 4. This step decides nothing. It
records the evidence the meter already has, so the scored channels below can be compared with it.

## Step 2: the start-variation harness (syncopation-no-kick, AC5 of the audio alignment plan)
The 10 variations are the ones from the audio alignment plan's S2 (`audio-alignment-findings.md`, "the variation
test"). Each changes one thing in the PCM before the replay:

| # | Variation |
|---|---|
| 1 to 4 | Silence added before the track: 37, 100, 215 and 500 ms |
| 5 to 7 | Level multiplied by 0.25, 0.5 and 2 (a level of 2 may clip; it is clamped to [-1, 1]) |
| 8 to 10 | Start skipped: the first 100, 500 and 1000 ms removed |

Truth beat times shift with the variation: plus the lead for 1 to 4, minus the skip for 8 to 10 (beats before 0 are
dropped). **Reproduction gate:** on `main`, the harness must reproduce "2 of 10 lock to a wrong tempo" (variations 4
and 8, locking near 180). If it gives a different count, the report records the count and the variations. The measured
count on `main` becomes the baseline, and S4 stops for a decision before scoring if the count is 0.

**Untouched offsets** for held-out runs use values not in the table: a lead of 300 ms and a skip of 250 ms.

## Step 3: the scored evidence (level and meter family)
### The grid the scores are read on
On each run, the tracker's declared beats from its first lock to the end of the track are each split into 6 equal
**tatums**. A tatum's value per channel is the channel's value in the frame whose center is nearest the tatum time.
Six per beat makes every level ratio below a whole number of tatums.

### Channels (frame features already computed by the worklet)
- **NK (non-kick flux):** the sum of the flux of bands 1 and 2 (`FRAME_FLUX_OFFSET + 1` and `+ 2`), the bands above the
  kick band.
- **T (total flux):** the sum of the flux of all `BAND_COUNT` bands, with `ONSET_BAND_WEIGHTS`, as the analyzer's onset is
  summed.
- **C (chroma change):** 1 minus the cosine similarity between the summed chroma (`FRAME_CHROMA_OFFSET`, `CHROMA_BINS`)
  of the frames in the tatum and in the tatum before it, and 0 when either sum has a norm below 1e-9.

The kick channel alone is left out: the replan's S0 measured that the kick events carry no level or bar evidence on
these tracks.

### Candidate levels
With the tracker holding H bpm, a level with ratio r to H has a period of P = 6 / r tatums. The candidate set is
P in {2, 3, 4, 6, 8, 9, 12, 18} (r = 3, 2, 3/2, 1, 3/4, 2/3, 1/2, 1/3), keeping only those whose tempo H·r lies in
[`TEMPO_MIN_BPM`, `TEMPO_MAX_BPM`]. The truth's period is the candidate whose tempo is within 4% of the track's truth
(the `.bpm` sidecar, or the rendered tempo). A run where no candidate is within 4% is reported as not scorable; on a
target that counts as a miss.

### Score functions (six, fixed here)
For a channel's tatum series x over the window, with mean μ, the normalized autocorrelation at lag L is
A(L) = Σ (x[t] − μ)(x[t + L] − μ) / Σ (x[t] − μ)², summed over the t where both terms exist. Where a lag is not a whole
number (P / 2 for odd P), A is the mean of the two neighboring whole lags.

The fold profile at period P is p[k] = the mean of x[t] over t ≡ k (mod P), for k = 0 to P − 1, with t = 0 at the first
tatum after the lock. k* is the k with the largest p.

| Function | Score of a candidate period P |
|---|---|
| `half.NK`, `half.T`, `half.C` | A(P) − A(P / 2): the level repeats more strongly than its own half |
| `fold.NK`, `fold.T`, `fold.C` | (p[k*] − p[(k* + P / 2) mod P]) / (p[k*] + 1e-9), with P / 2 rounded down: the beat is stronger than the point halfway to the next one |

The window is from the first lock to the end of the run. The report also gives each score over the first 8 s after the
lock, for information only; that figure decides nothing.

### Margin
For one run and one function, the **margin** is m = s(P_truth) − max over the other candidates of s(P). A positive
margin means the function prefers the truth. On `syncopation-no-kick` the 10 variations count as one sample, whose
margin is the smallest over the 10.

**Pre-registered threshold: τ = 0.05.**

### Tracks
**Targets (level and meter):**
- the synthetic 3/4 click at 180 bpm (`renderTrack`, `beatsPerBar` 3), truth 180, read today as 90
- `6-8-time`, truth 62
- `half-time-shuffle`, truth 81, held today at 163 to 169
- `syncopation-no-kick`, truth 135, as the 10 variations of step 2

**Controls** (the truth must keep winning here; C1 requires a faster-level truth, a triple meter and a half-time track):
- faster level is the truth: `click-174`, `drums-150`, `trap-2to1-half-140` (accents at half the tempo), and the synthetic
  4/4 click at 180 (`renderTrack`, `beatsPerBar` 4)
- true triple meter: the synthetic 3/4 clicks at 120 and 140 bpm
- true half-time: `low-bpm-rnb` (truth 81; the tracker first locks at 162 and halves)
- named by the plan: `summer2000`, `lonley`, `drums-128`, `imyourgirl`, `syncopationbass2`

**Held out** (every other scorecard track, plus the untouched offsets): `click-90`, `click-120`, `click-140`,
`drifting-tempo`, `drums-100`, `no-kick-124`, `syncopationbass`, `trap-2to1-double-90`, `trap-4to3-120`,
`bassline-kick-120`, `pad-lead-groove-110`, each run plain and with the 300 ms lead and the 250 ms skip (three runs per
track, each its own sample). `high-bpm-dnb` and `beatless` belong to their own families below and are not held out
here.

### Decision rule (level and meter)
1. For each of the six functions, count the real targets (`6-8-time`, `half-time-shuffle`, `syncopation-no-kick`) with
   a margin of at least τ. The **chosen function** is the one with the highest count; a tie goes to the larger median
   margin over the four targets. Only the chosen function goes on to steps 2 and 3.
2. **Targets:** at least two of the three real targets have a margin of at least τ. The 3/4 click at 180 is reported
   but does not count toward the two.
3. **Controls and held out:** every control and every held-out sample has a margin above 0, and at least 80% of the
   held-out samples have a margin of at least τ.

**Go** only if 1 to 3 all hold. A go sends the family to S6 with the chosen function as its evidence. A no-go records
the family (3/4 at 180, `6-8-time`, `half-time-shuffle`, `syncopation-no-kick`) as accepted as measured, with the
table of margins.

## Step 4: the candidate set (high-bpm-dnb)
`high-bpm-dnb` (truth 173) first estimates 115, the 2:3 pulse. The tie only weighs 4:3 neighbors, so 173 is never
compared. Adding the 3:2 neighbors fixed it once, but delayed other first locks to 8 s. The probe asks whether a rule
that weighs the 3:2 neighbor only when its own evidence is strong enough would separate the cases.

At every tempo update from 3 s until the first lock, on every track with a first-lock cell in the scorecard, record:
the estimate's lag, and the ratio R = (comb score at 2/3 of the estimate's lag, the 3:2 faster neighbor) / (comb score at
the estimate's lag). The comb score is the same one the tempo tracker uses to rank its candidates, read from outside or
recomputed; equality with the tracker's own score on `drums-128` comes first, as in step 1. If it cannot be read or
recomputed without an app change, the family is reported as not measurable (a no-go).

- **Target value:** the smallest R on `high-bpm-dnb` over its updates while it holds 115 (within 4%).
- **Rival value:** the largest R on every other track over updates where the 3:2 neighbor is not within 4% of the
  truth.
- **Margin:** target value minus rival value. **Go** if the margin is at least 0.05. A no-go records `high-bpm-dnb`'s
  first lock as accepted as measured.

The no-go of AC5 itself (no first lock more than 0.5 s later than the committed baseline) is judged in S7, not here.

## Step 5: beat presence (beatless)
`beatless` has a real 140 bpm periodicity, and none of confidence, peak sharpness or kick support separated it from a
beat. The probe tries the scored channels: for each of `fold.NK`, `fold.T` and `fold.C` at the held period (P = 6),
measured over the first 8 s after the lock, compare `beatless`'s value with the smallest value over every other track
of this plan (targets, controls and held out, plain runs).
- **Margin:** that smallest value minus `beatless`'s value, per function. **Go** if one function has a margin of at
  least 0.05. There is no fix slice for `beatless` in this plan, so a go is recorded as evidence for a later plan, and
  `beatless` stays accepted as measured either way (AC8).

## Step 6: dance-clip cells (AC7)
There is no separate probe. The report lists, for each AC7 track (`low-bpm-rnb`, `6-8-time`, `syncopationbass`,
`syncopation-no-kick`, `high-bpm-dnb`), the tempo level the tracker holds against the truth, from the committed
scorecard. It also says which of them would be expected to move if S6 or S7 ships. The live cells themselves are
recorded in S8.

## What the report must contain
- The commit that merged this file, and the commit the probe ran on.
- Step 1's summary and the equality checks. Step 2's reproduced count.
- Per family, the measured margins on targets, controls and held-out samples against the thresholds above, and the
  go or no-go with the rule that decided it.
- Every command used, with its output files.
