# Close out audio-alignment and tracker leftovers
> Double-diamond plan `alignment-tracker-leftovers` revision 1 | status **final** | lane full | risk R2 | base 2b95c688f9c2 | updated 2026-11-24T00:47:20.568Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> Feature: Close out the audio-alignment and tracker leftovers (everything still open except summer2000's beat phase)
> 
> Context. The hub plans are finished: hub-regressions and hub-followups are closed (every row of
> docs/plans/hub-followups/ledger.md is resolved), and audio-engine-alignment's 10 slices are done. The tracker work
> deferred under D11 went through the D11 plan (docs/plans/rhythm-tracker/) and the tracker replan
> (docs/plans/rhythm-tracker-replan/). summer2000's beat.errorMedianMs has its own final plan
> (docs/plans/summer2000-beat-phase/) and is OUT of scope here. This plan collects everything else still open.
> 
> Read first:
> - docs/agents/audio-alignment-findings.md: "Next steps" (status on 2026-11-22 and 2026-11-23), "Tempo tracker work"
>   and its known-weaknesses list, and "3/2 tempo changes: shelved"
> - docs/agents/hub-scorecard.md: "Review decisions (Trevor, 2026-11-22)", "Tracker plan D11: status of the request's
>   failing cells", "Tracker replan, S0" and "Tracker replan, S1 to S4"
> - docs/agents/capture-delay.md and docs/agents/debug-harness.md
> 
> Open items:
> 1. AC9 (audio-alignment): the tab and device capture delay has only the --source direct self-check. The loopback runs
>    of `npm run measure:capture-delay -- --source tab|device` need Trevor at real hardware. Plan it as a guided manual
>    step with a clear procedure, what to record, and where the result goes (the default sync offset?).
> 2. FU-S10-basspulse-time-based: BassPulse smooths per frame, so how fast it reacts depends on the frame rate. Make its
>    envelopes time-based, behave the same at 60 fps, and add specs for equal settling at 30, 60 and 144 fps. It changes
>    three visualizers through one shared class: ask Trevor whether it goes ahead, and say how the live cells prove no
>    regression (scorecard:live, scorecard:order).
> 3. AC5 (audio-alignment): syncopation-no-kick's first lock (8.02 s; 2 of 10 offline start variations lock wrong). Its
>    135 pulse has almost no peak at its own lag; correcting on bar evidence alone was tried and flipped summer2000 to 4:3.
> 4. Tracker weaknesses with no packet yet: a 3/4 click at 180 BPM reads 90 (an it.fails spec); high-bpm-dnb first locks
>    at 115 (adding 3:2 neighbors fixed it but delayed other locks to 8 s); the abrupt grid move when the phase
>    re-aligns (beat-grid jump; R2, touches shared state).
> 5. Beat level: 6-8-time never locks to its truth (1 false song change) and half-time-shuffle holds 163 to 169 against
>    81. D11 S8 and the replan's S0 found that neither the tempo lags nor the kick events carry the bar evidence needed.
> 6. beatless locks on a real 140 bpm periodicity; neither confidence, peak sharpness nor kick support separates it.
> 7. AC7 dance-clip consistency (live.clip.maxDeviationBeats) failing or unavailable on low-bpm-rnb, 6-8-time,
>    syncopationbass, and borderline on syncopation-no-kick and high-bpm-dnb.
> 8. Accepted as measured, for triage only (keep accepted unless the plan finds a cheap shared fix): the dancer's gate
>    after the lock on lonley 10.83 s, half-time-shuffle 7.18 s and low-bpm-rnb 14.92 s; the bassline-kick-120 onset F50
>    (a separate low-end spectrum project).
> 
> Constraints.
> - Every tracker change affects every visualizer: judge it on the full `npm run scorecard` plus `scorecard:check`
>   (passing blocking cells must not get worse) and `sweep:gate` false opens; `bench:tracker` for CPU.
> - it.fails specs record known weaknesses; fixing one means removing .fails.
> - Committed .beats.json files are hash-checked and can't be recreated; the audio is local only.
> - Total JS is about 338.1 of 338.5 kB on main, so any growth needs a budget decision.
> - Live cells: `npm run scorecard:live` from the main checkout, one run at a time on an idle machine (machine load has
>   skewed results before). Worktrees: never link node_modules or .debug-in (AGENTS.md).
> - Two attempts already missed (D11 S6/S8, replan A and B): pre-register grids and go/no-go numbers per slice, and say
>   what gets accepted as measured if a slice misses.
> 
> Questions for the plan:
> 1. Which of items 3 to 7 share one cause (beat-level or bar evidence, phase hypotheses), and which are independent?
> 2. Which items are required, which are stretch, and which should be closed as accepted or won't-do now?
> 3. Do AC9 and FU-S10 belong in this plan or in a small fast-lane packet of their own?
> 4. Should this plan wait for summer2000-beat-phase to finish, since both touch BeatTracker?

## Problem

After the hub, audio-engine-alignment, D11 and replan work, a mixed set of items is still open: one manual measurement (AC9 tab/device capture delay), one follow-up already delivered in code but still listed open (FU-S10), and several tracker weaknesses (items 3-7) that two earlier attempts (D11 S6/S8, replan A/B) failed to fix because the evidence they relied on was not there. Without a probe-first, pre-registered approach, another attempt risks a third miss and scorecard regressions across every visualizer.

**Users:** Trevor (maintainer, runs the manual and live measurements and reviews go/no-go); Listeners using any visualizer, who see tempo, beat grid and dance clips follow the music

**Evidence:**
- docs/agents/audio-alignment-findings.md 528-566: open known weaknesses as of 2026-11-23
- docs/agents/hub-scorecard.md 1156-1295: D11 S8 and replan S0/A/B found no bar evidence in tempo lags or kick events; kick-phase attempts A and B missed
- app/features/audio/hub/bassBump.ts and bassBump.test.ts: time-based envelope with 30/60/144 fps specs, used by cubes, bass-ink and dancing-character; BassPulse is only built by scripts/scorecard/engine/prehubBass.ts
- app/features/audio/timingModel.ts 17-21, 58: CAPTURE_DELAY_MS is 0 per kind and feeds the latency estimate
- Scorecard S0 baseline: 446 cells, 22 fail, 11 blocking failures; JS 338.12 of 338.5 kB

## Goals

- Close FU-S10 as delivered by BassBump, in docs and ledger, with no code change
- Run AC9 as a guided manual loopback for tab (screen) and device, and set CAPTURE_DELAY_MS per kind when the result is stable
- Classify items 3-7 by cause with one measurement-only probe slice before any tracker code changes
- Attempt a fix only for a family the probe shows has a separable signal, under pre-registered grids and go/no-go numbers
- Replace the abrupt beat-grid jump on phase re-align with a short glide, without changing where the grid lands
- Leave every open item either fixed, or closed as accepted as measured or won't-do with its evidence

## Non-goals

- summer2000 beat.errorMedianMs and kick-phase detection (summer2000-beat-phase was canceled; stays accepted as measured)
- Changing BassPulse (the frozen pre-hub reference) or the pre-hub scorecard column
- The bassline-kick-120 onset F50 (a separate low-end spectrum project)
- The dancer gate-after-lock latencies on lonley, half-time-shuffle and low-bpm-rnb (stay accepted unless a fix slice improves them for free)
- Raising the JS budget without an explicit decision recorded in the PR
- 3/2 tempo change following beyond what D11 S7 shipped

## Success metrics

- Every item 1-8 has a recorded outcome (fixed, accepted as measured, won't-do) in audio-alignment-findings.md
- scorecard:check passes after every merged slice (no passing blocking cell gets worse; .beats.json hashes unchanged)
- sweep:gate false opens not above the S0 baseline after any tracker change
- bench:tracker branch/base median ratio at most 1.05 for any tracker change
- Total JS stays at or under 338.5 kB unless a budget change is decided in the PR
- AC9: tab and device loopback medians recorded with two runs each

## Constraints

- Every tracker change is judged on the full npm run scorecard plus scorecard:check, sweep:gate false opens and bench:tracker
- Fixing an it.fails weakness means removing .fails in the same change
- Committed .beats.json files are hash-checked and cannot be recreated; audio is local only in .debug-in
- Live cells: scorecard:live and scorecard:order from the main checkout, one run at a time on an idle machine
- Worktrees never link node_modules or .debug-in; remove them with npm run worktree:remove
- Grids and go/no-go numbers are fixed in the plan or the probe report before any fix run
- PR titles are Conventional Commits; docs-only slices use docs: and change nothing that ships

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | bassBump.ts already scales its rates from 60 fps and bassBump.test.ts checks 30, 60 and 144 fps | the FU-S10 closeout lands | audio-alignment-findings.md and the hub-followups ledger list FU-S10-basspulse-time-based as done by BassBump, BassPulse is described as the frozen pre-hub reference, and no file under app/ changes |
| AC2 | a run sheet in capture-delay.md for --source tab and --source device (Stereo Mix), recording per run the median, outputLatency, clicks found and machine | Trevor runs each source twice on real hardware | the runs are recorded; for each kind whose two hearing-relative figures (median minus outputLatency) agree within 10 ms, CAPTURE_DELAY_MS for that kind (screen for tab, device) is set to their mean rounded to 5 ms, and a user with no saved sync offset starts at the offset that moves visuals earlier by that delay (clamped to the slider range), with specs pinning the sign, the clamp and that a saved offset wins; a kind whose runs disagree or whose outputLatency reads n/a stays 0 with the reason recorded |
| AC3 | probe-plan.md merged in its own PR before any probe run, fixing the score formula, lags and bands, margin, target tracks, controls (including a faster-level-truth track, a true 3/4 or 6/8 track and a true half-time track) and held-out tracks | the probe runs on that plan with no app change, starting from what meter.addBeat already sees | probe-report.md cites the probe-plan commit hash and gives, per family (level and meter: 3/4-180, 6-8-time, half-time-shuffle, syncopation-no-kick; candidate set: high-bpm-dnb; beatless; clip cells follow beat level), the measured margin on targets and on held-out tracks against the pre-registered threshold, and a go only if the held-out tracks pass |
| AC4 | the probe gave the level and meter family a go | the level fix is tried on its pre-registered grid of at most 6 points | it ships only if every named held-out track passes, at least two of 6-8-time, half-time-shuffle and syncopation-no-kick (counting its start variations as one sample) lock within 4% of truth, the named regression set (an 81 to 90 BPM track, a true 4/4 track at 170 to 185 BPM and the probe controls) keeps its level, the C2 ladder passes and the slice adds at most 0.15 kB; the 3/4-180 .fails is removed only if that spec passes; otherwise nothing ships and the family is recorded as accepted as measured |
| AC5 | the probe gave the high-bpm-dnb candidate-set item a go, with the 3:2-neighbor cost (other first locks delayed toward 8 s) pre-registered as the no-go | the candidate-set change is tried on its pre-registered grid | it ships only if high-bpm-dnb first locks within 4% of truth, no track in the named first-lock set (every scorecard track with a first-lock cell) locks more than 0.5 s later than the committed baseline, the C2 ladder passes and the slice adds at most 0.15 kB; otherwise it is recorded as accepted as measured |
| AC6 | a phase re-align that moves the beat grid by more than rhythmConfig.phaseGlideMinMs | RhythmAnalyzer.updatePhase publishes beat phase, nextBeatTime and counters after the re-align | all three derive from one anchor that eases to the new grid over phaseGlideMs, the beat counter increments exactly when the published phase wraps, the largest per-frame phase step on the tracks with gridMoves falls below the pre-registered value, specs cover a wrap-crossing move, a counter step mid-glide, a backwards now, a second move mid-glide and reset on clear, hardReset and grid epoch change, and scorecard:check passes with beat.errorMedianMs no worse than 2 ms on any track, sweep:gate false opens not above baseline and the dancer gate-latency cells not worse |
| AC7 | any slice that changed tracker or phase behaviour has merged | scorecard:live runs for dancing-character and scorecard:order runs on one pair, one at a time from the main checkout | live.clip.maxDeviationBeats is recorded for low-bpm-rnb, 6-8-time, syncopationbass, syncopation-no-kick and high-bpm-dnb, scorecard:check passes on the merged live json, and any cell still failing is recorded as accepted as measured with its value |
| AC8 | all slices are done or stopped at their no-go | the closeout lands | audio-alignment-findings.md lists every item 1-8 with its outcome and evidence, beatless and item 8 are recorded as accepted as measured unless fixed, and the open-items list under Tempo tracker work is empty or each remaining entry names why |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Does FU-S10 go ahead? | Close as done: the visualizers already use time-based BassBump with 30/60/144 fps specs; BassPulse stays per-frame as the pre-hub reference | user | Repo shows the work is delivered; changing BassPulse would only move the pre-hub column |
| D2 | Do AC9 and FU-S10 belong here or in a fast lane? | Separate fast-lane slices first, independent of the tracker work | user | They depend on nothing and gain nothing from waiting |
| D3 | Wait for summer2000-beat-phase? | No: that plan finished as canceled because its solutions did not improve it enough; summer2000 stays accepted as measured and out of scope | user | No concurrent BeatTracker work to sequence against |
| D4 | How ambitious is the tracker part? | Probe first, then fix only families with a separable signal, under pre-registered go/no-go | user | Two attempts already missed on missing evidence |
| D5 | What happens to the beat-grid jump? | Smooth the visible jump with a glide; do not change where the grid lands or retry kick-phase detection | user | Presentation fix independent of the missing phase evidence |
| D6 | Framing of items 3-7 | Families: octave/3:2 level (3/4 at 180, 6-8-time, half-time-shuffle), first lock (syncopation-no-kick, high-bpm-dnb), beatless (own cause), AC7 clip cells follow beat level; item 8 stays accepted | user | Matches D11 S8 and replan S0 findings; confirmed by Trevor |
| D7 | Where does the AC9 result go? | CAPTURE_DELAY_MS per kind, used as the default sync offset for screen and device when the user has no saved offset; the slider still overrides | user | The critic found the constant had no consumer; Trevor chose to make it the starting sync offset |
| D8 | Which CaptureKind does --source tab map to? | screen (tab audio is captured via getDisplayMedia, CaptureKind is screen, device or file) | repo-fact | timingModel.ts line 3 has no tab kind |
| D9 | How are items 3 and 4 grouped after the critic's review? | syncopation-no-kick joins the level and meter family (its bar evidence cannot tell 4/4 from 3/4); high-bpm-dnb is its own candidate-set item (173 is never weighed; 3:2 neighbors delayed other locks) | planner assumption (confirm) | findings 306-312; refines D6 without changing its probe-first intent |
| D10 | JS budget for this plan | No budget raise in this plan; each code slice adds at most 0.15 kB and the total stays within 338.5 kB; a fix that needs more is a no-go | planner assumption (confirm) | 0.38 kB headroom; decided now so no slice argues for a raise after seeing results |
| D11 | Order of the glide and the tracker fixes | The glide ships first and its scorecard becomes the committed baseline that the level and candidate-set fixes are judged against | planner assumption (confirm) | The glide changes published phase that the scorecard reads; judging fixes on a moving baseline mixes effects |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Two docs/manual fast-lane slices, one measurement-only probe with fixed thresholds, at most two gated fix slices, a small phase glide, one live pass and a closeout; nothing ships on a missed gate. | 5 | 4 | 4 | 3 | 4 | yes | 4.15 |
| O2 | robust | Staged, pre-registered pipeline: docs/hardware fast lane, one measurement-only probe with held-out tracks, then flag-guarded fixes per family that each ship only through a fixed gate ladder or close as accepted as measured. | 4 | 4 | 2 | 3 | 5 | yes | 3.55 |
| O3 | contrarian | Stop trying to make the tracker know the bar: run the two fast-lane slices, one measurement-only probe that also tests non-kick evidence (chroma change, non-kick-band flux periodicity) with pre-registered thresholds, ship only the glide, and close items 3-7 as accepted unless the probe clears its bar; clip level ambiguity is handled consumer-side only if Trevor approves. | 4 | 4 | 4 | 3 | 4 | yes | 3.85 |
| **O4** (chosen) | hybrid | O1's slice structure with O2's pre-registered probe plan and held-out split, and O3's non-kick evidence sources tested in the probe. Ship config constants, not default-off flags, to keep JS within the 0.38 kB headroom. | 5 | 5 | 3 | 4 | 4 | yes | 4.35 |

## Decision

**O4**: O1's slice structure with O2's pre-registered probe plan and held-out split, and O3's non-kick evidence sources tested in the probe. Ship config constants, not default-off flags, to keep JS within the 0.38 kB headroom.

O4 keeps O1's small slice structure but adds the two things that address why earlier attempts missed: a committed pre-registration with a held-out split (O2) and a test of evidence not tried before, non-kick flux and chroma (O3). It avoids O2's default-off flag code, which the 0.38 kB headroom cannot carry, by using rhythmConfig constants whose old values reproduce S0. O3's clip-side folding is not taken: it changes what AC7 measures, and Trevor kept the cells as they are.

**Approach:**
- Fast lane (from O1): S1 docs closeout of FU-S10; S2 AC9 run sheet and manual loopback, CAPTURE_DELAY_MS per kind if two runs agree within 10 ms
- S3 (from O2): commit probe-plan.md naming tracks per family, grids, thresholds and a held-out split before any probe run
- S4 probe (O1 plus O3): trace:beats, ablate:rhythm and eval:rhythm on the target tracks, plus a scripts-only measurement of non-kick-band flux periodicity and chroma-change period as candidate bar evidence; no app change
- S5 and S6: conditional level and first-lock fixes, each one rhythmConfig grid of at most 6 points, tuned on the tuning half and judged on the held-out half plus the full scorecard
- S7: phase glide via rhythmConfig.phaseGlideMs (0 reproduces the old jump), counters read the target grid
- S8: one live pass after the last tracker merge, then closeout of items 1-8

## Design

Two independent fast-lane slices (FU-S10 docs closeout, AC9 manual loopback with the result as the default sync offset per kind) ship first. Tracker work starts with probe-plan.md merged on its own, then a measurement-only probe that starts from the meter's existing features (kick, total and chroma per beat) and per-band flux, and gives each family a go only if held-out tracks pass. The phase glide ships next in RhythmAnalyzer.updatePhase and its scorecard becomes the baseline. Only families with a go get one fix slice through the C2 ladder. One live pass after the last tracker merge records the AC7 clip cells, and a closeout records every item's outcome.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| FU-S10 closeout | Mark FU-S10 delivered by BassBump; describe BassPulse as the frozen pre-hub reference | docs/agents/audio-alignment-findings.md, docs/plans/hub-followups/ledger.md |
| AC9 run sheet and default offset | Procedure, record table, per-kind constant and its use as the default sync offset | docs/agents/capture-delay.md, app/features/audio/timingModel.ts, app/features/audio/audioEngine.ts |
| Probe plan, start-variation harness and report | Pre-registration, reproducible start offsets, verdicts | docs/plans/alignment-tracker-leftovers/, scripts/probe-bar-evidence/ |
| Phase glide | Ease the published anchor after a re-align | app/features/rhythm/rhythmAnalyzer.ts, rhythmConfig.ts |
| Level and meter fix | Choose the truth level using probe-proven evidence | app/features/rhythm/rhythmAnalyzer.ts, meter code, rhythmConfig.ts |
| Candidate-set fix | Weigh the missing tempo candidate for high-bpm-dnb | app/features/rhythm/tempo code, rhythmConfig.ts |

### Contracts (freeze before dependent work)

- **C1 Probe pre-registration** (process): probe-plan.md is merged in its own PR before any probe run and fixes: the score formula, lag set, band set and margin; targets per family (level and meter: 3/4-180 synthetic, 6-8-time, half-time-shuffle, syncopation-no-kick; candidate set: high-bpm-dnb; beatless); controls including at least one faster-level-truth track, one true 3/4 or 6/8 track and one true half-time track besides summer2000, lonley, drums-128, imyourgirl and syncopationbass2; held-out tracks (every other scorecard track plus untouched start offsets) whose pass is the condition for a go; the 10 syncopation-no-kick start variations defined as exact offsets and counted as one sample. A threshold change needs a new merged revision that Trevor approves in its PR.
- **C2 Gate ladder and no-go rule** (process): Every tracker slice is judged against the committed baseline at its start (after S5, the glide's baseline) and passes, in order: unit specs (it.fails removed if fixed), npm run scorecard, scorecard:check, sweep:gate false opens not above baseline, bench:tracker median ratio at most 1.05, npm run size within 338.5 kB with the slice adding at most 0.15 kB, then its AC numbers on held-out tracks. A slice that passes commits a refreshed baseline. Any miss ships nothing, the code is reverted, and the family is recorded as accepted as measured with the measured values.
- **C3 Published phase glide** (behaviour): In RhythmAnalyzer.updatePhase, when a re-align moves the grid by more than phaseGlideMinMs, the anchor eases to the new grid over phaseGlideMs (pre-registered grid 0, 100, 150, 250 ms; 0 reproduces the old jump). beatPhase, nextBeatTime and the beat and bar counters all derive from the eased anchor, so the counter increments exactly when the published phase wraps. Scorecard readers (replay beat times, gateTrace, live clip) all see the eased values. Glide state resets on clear, hardReset and grid epoch change, restarts on a second move, and treats a backwards now as no progress. No allocation per frame.
- **C4 Capture delay as default sync offset** (config): CAPTURE_DELAY_MS.screen and .device become the mean of two hearing-relative figures (loopback median minus outputLatency), rounded to 5 ms, only when they agree within 10 ms and outputLatency is known; otherwise 0. file stays 0. When no sync offset is saved, the engine starts at the offset that moves visuals earlier by CAPTURE_DELAY_MS of the current kind, clamped to the slider range; a saved offset always wins.

### Data

No schema change. Probe outputs and live json committed under docs/; .beats.json files untouched and hash-checked.

### UX

Listeners see the beat grid ease instead of jump after a re-align; any level or first-lock fix that ships changes tempo display and dance timing on the affected tracks only.

### Accessibility

No UI change.

### Security and privacy

Audio stays local; the probe reads .debug-in only; nothing new is committed from it.

### Observability

trace:beats, debug:viz telemetry (gridMoves) and the scorecard cells; the glide's effect shows in gridMoves and beat.errorMedianMs.

### Rollout and rollback

Fast-lane slices merge first as separate PRs (docs: for S1, fix(audio): for S2's constant). Each tracker slice is its own PR behind the C2 ladder; rollback is reverting the PR or setting its rhythmConfig constant back to the S0 value (phaseGlideMs 0). Cloudflare preview checked for any change that renders. Live pass runs once after the last tracker merge, from the main checkout on an idle machine.

## Test strategy

- **Unit:** timingModel.test.ts for the new constants; beatTracker spec for the glide (no counter skip, bounded duration, 0 reproduces the jump); remove .fails from rhythmAnalyzer.test.ts 3/4-180 only if the level fix passes; coverage stays at or above 95%.
- **Integration:** npm run scorecard and scorecard:check on every tracker slice; sweep:gate and bench:tracker per C2; held-out start variations via trace:beats.
- **End-to-end:** npm run test:e2e after any app change; visual baselines unchanged expected.
- **Manual:** AC9 loopback runs by Trevor; npm run dev check of the glide on a track with a known re-align; scorecard:live for dancing-character and scorecard:order on one pair, one at a time from the main checkout.
- **Non-functional:** bench:tracker ratio at most 1.05; npm run size at or under 338.5 kB.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | A third attempt overfits the tuning tracks and regresses others | medium | high | C1 held-out split and C2 ladder; no-go reverts the code |
| K2 | Probe finds no separable evidence for any family | high | low | Accepted outcome: families close as accepted as measured with numbers (AC8) |
| K3 | Glide shifts beat.errorMedianMs or confuses counters in shared state | medium | medium | Counters follow the target grid; 2 ms limit per track; phaseGlideMs 0 restores old behaviour |
| K4 | JS budget exceeded by a fix | medium | medium | D10: at most 0.15 kB per code slice, no raise in this plan; a fix that needs more is a no-go |
| K5 | Live cells skewed by machine load | medium | medium | One run at a time on an idle machine; rerun a failing cell once before recording |
| K6 | AC9 runs disagree, leaving the constants at 0 | medium | low | Record the spread; sync slider remains the correction |
| K7 | Default sync offset from one machine is wrong for other machines | medium | low | Only applies with no saved offset; slider overrides; documented as one machine |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Close FU-S10 as done by BassBump: Docs-only closeout of FU-S10 in findings and the ledger |  | AC1 |  | R0 | S | docs/agents/audio-alignment-findings.md, docs/plans/hub-followups/ledger.md |
| S2 | AC9 capture-delay loopback: Write the run sheet, Trevor runs tab and device twice each, record results, set CAPTURE_DELAY_MS and the default sync offset per C4 |  | AC2 | C4 | R1 | S | docs/agents/capture-delay.md, app/features/audio/timingModel.ts, app/features/audio/timingModel.test.ts, app/features/audio/audioEngine.ts, app/features/audio/audioEngine.test.ts |
| S3 | Probe pre-registration: Write and merge probe-plan.md per C1 in its own docs PR, before any probe run |  | AC3 | C1 | R0 | S | docs/plans/alignment-tracker-leftovers/probe-plan.md |
| S4 | Probe run and report: Build the start-variation harness and reproduce the 2-of-10 baseline, dump what meter.addBeat sees on targets, measure the pre-registered scores, and write probe-report.md citing the plan's commit | S3 | AC3 | C1 | R0 | M | scripts/probe-bar-evidence/, docs/plans/alignment-tracker-leftovers/probe-report.md |
| S5 | Phase glide on re-align: Implement C3 in RhythmAnalyzer.updatePhase on its pre-registered grid through the C2 ladder; commit the refreshed baseline |  | AC6 | C2, C3 | R2 | M | app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmAnalyzer.test.ts, app/features/rhythm/rhythmConfig.ts, docs/agents/hub-scorecard.cells.json |
| S6 | Level and meter fix, conditional: Only on an S4 go for the level and meter family: one grid of at most 6 points through the C2 ladder, judged on the glide baseline; ship on AC4 or record accepted as measured | S4, S5 | AC4 | C1, C2 | R2 | M | app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmAnalyzer.test.ts, app/features/rhythm/rhythmConfig.ts |
| S7 | high-bpm-dnb candidate set, conditional: Only on an S4 go for the candidate-set item: one grid through the C2 ladder on the latest committed baseline (the glide's, or S6's if it shipped; independent of S6's outcome); ship on AC5 or record accepted as measured | S4, S5 | AC5 | C1, C2 | R2 | M | app/features/rhythm/rhythmConfig.ts, app/features/rhythm/tempo.ts, app/features/rhythm/tempo.test.ts |
| S8 | Live pass and closeout: After the last tracker merge or no-go, scorecard:live for dancing-character and scorecard:order on one pair from the main checkout; record the AC7 clip cells; write every item 1-8 outcome in findings, recording AC9 as pending if S2 is not done | S1, S4, S5, S6, S7 | AC7, AC8 | C2 | R1 | M | docs/agents/hub-scorecard.live.json, docs/agents/hub-scorecard.md, docs/agents/audio-alignment-findings.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Which pair does the S7 scorecard:order run use (dancing-character with cubes, or bass-ink)? | Trevor, at S7 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | C3/S4 put the glide in beatTracker.ts, but BeatTracker publishes nothing continuous. Published beatPhase, nextBeatTime and the counters come from RhythmAnalyzer.updatePhase (app/features/rhythm/rhythmAnalyzer.ts:196-233), a stateless extrapolation from the newest anchor. The glide therefore has to live there, and S4's draft_paths omit rhythmAnalyzer.ts. O2 placed it in the analyzer and O4 did not, so the plan is inconsistent. The scorecard also derives its beat times from the published phase: scripts/scorecard/engine/replay.ts:311-319 computes beats.push(time - phase*period) with period from nextBeatTime. If phase is eased while nextBeatTime and the counters follow the target grid, every beat counted during a glide gets a wrong derived time. The AC6 gate (beat.errorMedianMs within 2 ms, a median over all beats) hides this and cannot show the glide's benefit either. gateTrace (replay.ts:274) and live clip (scripts/scorecard/live/measures.ts:205, phase*beats) also read beatPhase, and sweep:gate false opens and the dancer-gate cells move with it. AC6 gates none of these. | Fixed: C3 and S5 place the glide in RhythmAnalyzer.updatePhase; phase, nextBeatTime and counters derive from one eased anchor so every scorecard reader sees consistent values; AC6 adds the max per-frame phase step observable, sweep:gate and gate-latency cells. |
| F2 | high | C3 says counters follow the target grid and never skip or double-count, while the published phase is eased. During a glide the beat counter can rise while beatPhase is still, say, 0.8. Consumers that treat the phase wrap as the beat (clip position, dancer timing) then disagree with the counter, which is the same inconsistency the glide is meant to remove. The glide also has to cross the 0/1 wrap when it eases from 0.9 to 0.1, and its state is time-domain. updatePhase(now) is called with explicit offline times and with sync-offset times that can go backwards (rhythmAnalyzer.ts:205-208). The spec list covers none of this. Glide state must also reset on clear(), hardReset, a grid epoch change and a second re-align that starts mid-glide. | Fixed: C3 invariant is that the counter increments exactly at the published wrap; AC6 lists specs for wrap crossing, mid-glide counter, backwards now, second move and resets. |
| F3 | high | C4/AC2/S2 assume that setting CAPTURE_DELAY_MS reaches listeners (D7: 'Every user gets the estimate'). In app/ and scripts/ the only consumer is featureDelaySeconds (timingModel.ts:55-58), which is referenced only in timingModel.test.ts. The comment at timingModel.ts:14-16 says nothing is subtracted automatically. A measured non-zero constant would change no behaviour, no scorecard cell and no sync default, so S2 would ship a dead constant. The formulas disagree too. AC2 says the mean of the two medians rounded to 5 ms, while C4 says the mean of the two medians minus outputLatency. capture-delay.md:45-54 defines the hearing-relative figure as median minus outputLatency, and outputLatency can read n/a. timingModel.test.ts:63 pins {0,0,0} and must change with it. | Fixed with Trevor (D7): the constant becomes the default sync offset per kind when none is saved; one formula (median minus outputLatency) in AC2 and C4; n/a outputLatency keeps 0; audioEngine paths added to S2. |
| F4 | high | C1's separability rule and held-out split will not stop a third miss. (a) The 'score' of the truth level against the best wrong level is not an output of trace:beats, ablate:rhythm or eval:rhythm. The scripts-only probe defines its own score, lags and bands after seeing the data, which is the same freedom the earlier attempts had. (b) The rule is checked only on the tuning targets. The level family has 3 targets (one a synthetic unit-test signal). The first-lock family has 2 tracks, and one is 10 start variations of the same music, so they are not independent (findings:245 says only 2 of the 10 fail). Splitting them in halves can leave the held-out half with no failing variation. (c) Every named control (summer2000, lonley, drums-128, imyourgirl, syncopationbass2) is a case where the expected level is the slow one, so 'no control picks a wrong level' passes trivially. No control has the faster level as truth (the 81 BPM versus 182 break-even trade at findings:297-298) and none is in triple meter, and findings:308 says the bar evidence already cannot tell 4/4 from 3/4. | Fixed: C1 fixes score formula, lags, bands and margin; adds faster-level, triple-meter and half-time controls; held-out tracks are the go condition; start variations count as one sample. |
| F5 | medium | D6 (a planner framing, marked as confirmed) splits level from first lock, but findings:306-312 show these are not two clean causes. syncopation-no-kick's bar evidence 'is decisive from 4 s' but cannot tell 4/4 from 3/4, which is the level family's missing signal. high-bpm-dnb is a candidate-set gap: only 4:3 neighbors are weighed and 173 never is, and adding 3:2 neighbors delayed other locks to 8 s. A bar-evidence probe does not address that. S6 carries one grid for these two causes. S6 also depends on S5, so a no-go in S5 leaves S6 without the evidence it was meant to inherit. | Fixed: D9 moves syncopation-no-kick into the level and meter family and makes high-bpm-dnb a candidate-set item with the 3:2 cost as its no-go; S7 no longer depends on S6's outcome. |
| F6 | medium | The AC4/AC5 go conditions are 'A or B' lists, which lets the cheapest ship. AC4 passes if the synthetic 3/4-at-180 it.fails spec passes. That target is the most overfittable, since the likely lever is the 182 break-even (findings:297-298). AC5 passes if high-bpm-dnb alone locks within 4%, even though findings:311 records the 8 s delay to other locks from that exact change. scorecard:check protects only passing blocking cells, and a 'no first lock later than 0.5 s' check needs a defined list of tracks and a baseline. The 81 BPM tracks the break-even protects may not be in the scorecard at all. | Fixed: AC4 requires held-out tracks, two of three real tracks and a named regression set; AC5 names the first-lock set (every scorecard track with a first-lock cell). |
| F7 | high | S4 (R2) has depends_on [], yet it changes the published phase that the scorecard reads (see F1) and edits beatTracker.ts and rhythmConfig.ts, the files S5 and S6 edit. Whichever merges first moves the baseline the others are gated against. C2 says 'sweep:gate not above S0' and scorecard:check runs against the committed baseline, so after S4 merges, S5 and S6 are judged on a shifted S0. The AC4 and AC5 'no worse' comparisons then mix the glide with the fix. S4 and S5/S6 will also conflict on rhythmConfig.ts. | Fixed: D11 and C2: the glide ships first and its committed baseline gates S6 and S7; each passing slice commits a refreshed baseline. |
| F8 | medium | S3 holds both the pre-registration (C1: probe-plan.md 'committed before any probe run') and the probe in one slice and one PR, so nothing in AC3 shows the order, and thresholds can be edited before the PR lands. C1's 'new committed revision and Trevor's agreement' has no gate either. S7 (closeout, AC8) depends on S2, a manual hardware step with no deadline, so a stalled loopback blocks the live pass and closeout of the tracker items. S7 also lists no dependency on S3 or on the slice outcomes it records. | Fixed: pre-registration is its own slice and PR (S3), the report cites its commit (AC3); S8 no longer waits on S2 and records AC9 as pending if needed. |
| F9 | medium | The plan misdescribes the evidence the probe tests. Q2/K4 and the O4 cons say chroma needs an FFT-to-pitch-class stage that may not fit 338.5 kB. RhythmAnalyzer already holds CHROMA_BINS frames and computes a per-beat chroma change (rhythmAnalyzer.ts:63-68, 356-371), and passes featureKick, featureTotal and featureChroma to meter.addBeat (:294). Per-band flux is also already in each frame. So the 'new' evidence partly exists in the meter, and the probe may duplicate it or ignore it. The budget risk was also weakened. O1 capped each fix at +0.15 kB; O4 dropped the cap, and C2 allows 'or a recorded budget decision', so the 0.38 kB headroom is not enforced. The glide, the only slice sure to run, takes state, config constants and logic and could use most of it before S5 and S6. | Fixed: the probe starts from what meter.addBeat already sees; the chroma budget premise and Q2 are dropped; D10 caps each code slice at 0.15 kB with no raise. |
| F10 | medium | AC5's '9 of 10 offline start variations' and the held-out start variations in the test strategy ('via trace:beats') rely on a harness I could not find. A search of scripts/rhythm-tools, scripts/scorecard and scripts/ground-truth for start, offset or variation options turned up no start-variation option. The only record is the findings table (:245: 500 ms lead, 100 ms skipped). The 10 variations are not defined (offsets, trims or leads), and they were produced outside the named tools. The go/no-go number may be unmeasurable with the listed tools, or measured differently from the baseline of '2 of 10'. | Fixed: S4 builds the start-variation harness with exact offsets in probe-plan.md and must reproduce the 2-of-10 baseline before measuring. |

## Hand-off

A verified-diamond draft DAG with 8 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `fd953c11a097df15`).
