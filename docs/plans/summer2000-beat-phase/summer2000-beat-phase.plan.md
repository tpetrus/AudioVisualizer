# Fix summer2000 beat phase final attempt
> Double-diamond plan `summer2000-beat-phase` revision 1 | status **final** | lane full | risk R2 | base 2b95c688f9c2 | updated 2026-11-23T22:27:11.713Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> Last attempt: fix summer2000's beat phase (tracker plan, after the replan)
> 
> Plan one more design to bring summer2000 beat.errorMedianMs from 153.4 ms to 40 ms or less (offline, npm run scorecard), without breaking any passing blocking cell. This is the final bounded attempt: if it misses its pre-registered grid, summer2000 is accepted at its measured value and the tracker is left as it is.
> 
> Read first:
> - docs/agents/hub-scorecard.md, sections "Tracker plan D11, S1" (the beat trace diagnosis), "Tracker replan, S0" and "Tracker replan, S1 to S4"
> - docs/plans/rhythm-tracker-replan/rhythm-tracker-replan.plan.md (decisions, contracts C1 to C4, the critic's findings)
> 
> What exists:
> - PR #136 (S1, merged or merging): the worklet's band-0 kick events reach BeatTracker.pushKick through RhythmAnalyzer.pushKicks, in arrival order with their own timestamps, from the live path and every offline runner. Nothing reads them on main.
> - Local branch replan/s2-kick-model (5eaddde, on top of S1, not pushed): KickPhaseModel (attempt A), KickOffset (attempt B, with the review fix), the C3 constants (all off), the C4 getters, and trace:beats columns for kick support, margin, veto, hold, kick move, first kick move and first time within 40 ms of the taps. It is unmerged and may be reused, changed or dropped.
> - Six follow-ups in verified-diamond state (FU-RP-*), mainly for that branch. One matters if the next design builds on it: eval/detect.ts and testSignals.runPipeline never call pushKicks.
> 
> What was measured, and why both attempts missed:
> - Kick lead: about 0 ms (synthetic -0.2, tapped -0.7). summer2000's kicks sit a median 31 ms before the taps and about 0.3 beat after the tracker's grid. Folded on the grid, only 0.28 of them fall in the best 3-bin window, because the kicks are syncopated throughout.
> - Attempt A (veto, fill hold, kick-driven move; 48 pre-registered points): best 142.7 ms, with 13 to 16 blocking failures. The kick move works and lands the grid on the taps (-13.8 ms at 11.4 s). But the fill test (the coefficient of variation of the kick intervals over 4 beats, above 0.25 or 0.4) is true at every beat on a syncopated groove, so the hold freezes the per-beat correction for the whole track. The 470 ms period, 3 ms longer than the tapped 467 ms, then drifts the grid back to 145 to 185 ms off within about 15 beats.
> - Attempt B (median kick offset on the analyzer anchor; 6 points): best 98.9 ms. On low-bpm-rnb, lonley and syncopation-no-kick the kicks are not on the tapped beat, so their median moves grids that were right (low-bpm-rnb 148 to 171 ms on every point).
> - low-bpm-rnb (24.2 ms) broke under every point of both grids. It has sparse kicks: 13 of 35 taps have one within 150 ms.
> 
> The direction the trace points to (a candidate, not a decision): keep A's kick move, but do not freeze during the hold; instead correct each beat toward the nearest kick event in its window, so the period keeps following the kicks. Also gate the model on kick regularity at the beat level (not raw interval spread), so sparse or off-beat kicks (low-bpm-rnb, lonley) never engage it. Weigh this against at least one structurally different option. Do not repeat these measured misses: kick-weighted phase bins, a half-beat flip, a looser streak gate, a kick-preferring correction alone (149.5 ms in D11), a hold decided by interval spread alone, or a single global kick-to-beat offset.
> 
> Constraints (carried from the replan):
> - tracker.state contract C1 is unchanged. A phase move bumps phaseShiftCount and never gridEpoch; beatCount never decreases.
> - Everything is off by default until the enabling slice. Constants live in rhythmConfig.ts, one per line, so --set can override them.
> - Prototype offline first, with trace:beats and the full scorecard per grid point. Pre-register one grid before running it, with no post-hoc widening (risk K1).
> - AC2 guards: scorecard:check exits 0; low-bpm-rnb stays at 40 ms or less; ac9.dottedChangeCounted stays 1; the synthetic tracks and syncopation-no-kick, syncopationbass, 6-8-time and high-bpm-dnb get no worse; sweep:gate false opens no higher than 3 and 15.
> - Budget: total JS at most 341.5 kB (main after #136 is about 338.6), and bench:tracker ratio at most 1.25.
> - The tapped .beats.json files and the scorecard targets (v9) do not change. No hub, visualizer, bassGate, worklet or onset-detector changes.
> - AGENTS.md rules apply: no per-frame allocation, named exports, comments that explain why, and no links into worktrees.
> 
> Deliver a plan with a go/no-go: summer2000 at 40 ms or less with AC2 green on the pre-registered grid, or record the miss and close.

## Problem

On summer2000 the beat tracker's grid sits about 0.3 beat off the tapped beats (beat.errorMedianMs 153.4 ms against a 40 ms target). Its kicks are syncopated, so phase evidence from folded onsets or kick bins picks the wrong place, and the 470 ms period (taps 467 ms) drifts any one-off correction away within about 15 beats. Two kick-based attempts missed: A froze the per-beat correction for the whole track, B moved grids that were already right on tracks whose kicks are off the beat (low-bpm-rnb 24.2 to 148-171 ms).

**Users:** Viewers of the visualizers, whose beat-driven motion lands off the beat on syncopated tracks like summer2000; Trevor as maintainer, who needs a bounded last attempt with a clear go/no-go

**Evidence:**
- docs/agents/hub-scorecard.md: Tracker plan D11 S1 trace, Tracker replan S0 and S1 to S4
- Attempt A best 142.7 ms with 13-16 blocking failures over 48 points; attempt B best 98.9 ms over 6 points
- summer2000 kicks: median 31 ms before the taps, 0.28 of them in the best 3-bin fold window

## Goals

- summer2000 beat.errorMedianMs at 40 ms or less offline (npm run scorecard) on one point of a pre-registered grid
- Every AC2 guard stays green on that same point
- A recorded go/no-go: ship the winning point on by default, or record the miss and close the tracker work

## Non-goals

- No change to the tapped .beats.json files or the scorecard targets (v9)
- No hub, visualizer, bassGate, worklet or onset-detector change
- No change to the tracker.state contract C1
- No post-hoc widening of the grid and no further attempt after a miss
- Not fixing other tracks beyond keeping them no worse

## Success metrics

- summer2000 beat.errorMedianMs <= 40 ms
- low-bpm-rnb beat.errorMedianMs <= 40 ms
- scorecard:check exits 0; ac9.dottedChangeCounted == 1
- sweep:gate false opens <= 3 and <= 15
- total JS <= 341.5 kB; bench:tracker ratio <= 1.25

## Constraints

- tracker.state C1 unchanged: a phase move bumps phaseShiftCount, never gridEpoch; beatCount never decreases
- Everything off by default until the enabling slice; constants in rhythmConfig.ts one per line, overridable by --set
- Prototype offline with trace:beats and the full scorecard per grid point; one grid of at most 24 points pre-registered before running
- Do not repeat measured misses: kick-weighted phase bins, half-beat flip, looser streak gate, kick-preferring correction alone, hold by interval spread alone, single global kick-to-beat offset
- AGENTS.md rules: no per-frame allocation, named exports, comments explain why, no links into worktrees

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the reused s2 branch rebased on main, with KickOffset removed, pushKicks called from eval/detect.ts and testSignals.runPipeline, and every new constant at its off default | npm run scorecard then npm run scorecard:check run | check exits 0 and every cell equals the S0 baseline (summer2000 153.4, low-bpm-rnb 24.2), so the off path is inert |
| AC2 | any grid point that is declared the winner | the full scorecard, scorecard:check, sweep:gate, size and bench:tracker run on it | scorecard:check exits 0; low-bpm-rnb <= 40 ms; ac9.dottedChangeCounted == 1; the synthetic tracks, syncopation-no-kick, syncopationbass, 6-8-time and high-bpm-dnb are no worse than S0; sweep:gate false opens <= 3 and <= 15; total JS <= 341.5 kB; bench ratio <= 1.25 |
| AC3 | a read-only pre-flight (S3) that fixed the gate dimensions by its pre-stated rule, and a grid of at most 24 points written into hub-scorecard.md and committed with its sha recorded before its first run | every point runs the full scorecard offline via scorecard --set, each to its own --out, plus trace:beats on summer2000 and low-bpm-rnb | a per-point table records summer2000, low-bpm-rnb, blocking failures, engaged-beat share per track and whether the prediction held (gate open on at least 70% of summer2000 beats after 12 s, grid within 40 ms of the taps by 20 s and staying there); no unregistered point is run; the verdict is go only if a point has summer2000 <= 40 ms with AC2 green, and the winner is the lowest summer2000 among those, ties to the lowest KICK_PHASE_GAIN |
| AC4 | unit specs driving BeatTracker with synthetic kick streams (on-beat, kicks 0.3 beat after the grid, syncopated with a regular on-beat subset, sparse at 0.37 density with a 2-bar cluster, stable off-beat, none) | the new model is enabled | the residual of a beat is read one declaration later so late kicks are seen; a kick move bumps phaseShiftCount and never gridEpoch and rotates the phase bins; beatCount never decreases; sparse and off-beat streams never hold the gate open; halving, doubling, rebuild, re-search and reset() clear the gate ring and both trims without bumping gridEpoch; no allocation per frame |
| AC5 | a go verdict | the enabling slice sets the winning constants as defaults and re-writes the scorecard baseline | format, lint, typecheck, test:coverage (>= 95%), build, size and test:e2e pass, and summer2000 <= 40 ms is in the committed baseline |
| AC6 | a no-go verdict | the run closes | hub-scorecard.md records the grid, the best point and why it missed, summer2000 is accepted at its measured value, main keeps only S1's pushKicks plumbing, and follow-ups that only serve the model branch are closed |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How many points may the pre-registered grid have? | At most 24 full-scorecard points, in one grid registered before the first run | user | Half of attempt A's cost, enough for 2-3 values on the few knobs that matter |
| D2 | What does the design build on? | Reuse replan/s2-kick-model (kick move, C3 constants, C4 getters, trace:beats kick columns); remove attempt B's KickOffset; add pushKicks to eval/detect.ts and testSignals.runPipeline | user | Keeps the measured working parts and avoids shipping dead code |
| D3 | On a go, is the winning point enabled in this plan? | Yes: a final enabling slice sets the winning constants as defaults and re-baselines | user | The result ships instead of waiting for another plan |
| D4 | On a miss, what happens to the code? | Record the miss in hub-scorecard.md, keep S1's pushKicks plumbing on main, leave the model branch unmerged, close follow-ups that only serve it; summer2000 accepted at its measured value | user | Bounded final attempt; no dead code shipped |
| D5 | Is the framing (problem, goals, non-goals, ACs) right? | Confirmed as shown at the full-lane checkpoint | user | Checkpoint before Develop |
| D6 | How does each grid point override rhythmConfig for a full scorecard run? | Add a dev-only --set NAME=VALUE flag to npm run scorecard, reusing ablate's one-line rewrite; nothing ships | user | The scorecard has no --set today (scripts/scorecard/run.ts); 24 hand edits are error-prone |
| D7 | Where does per-beat period adaptation happen today? | Only in beatTracker.ts declareBeat (about lines 282-327): nudge 0.05 x error, pulled to the held tempo at 0.2; the held tempo moves only past 4% hysteresis, which keeps 470 ms against the tapped 467 | repo-fact | Scout brief, Relevant code and Constraints |
| D8 | On a no-go, do S1's tooling changes (scorecard --set, pushKicks in eval/detect.ts and testSignals.runPipeline) land on main? | Yes, S1 merges on its own as dev tooling that ships no bytes; only the model (S2) stays unmerged on a no-go | planner assumption (confirm) | They fix a measured gap (FU-RP) and make future offline grids cheap; inert for users |
| D9 | Which kick-to-tap lead does the loop target? | KICK_LEAD_MS fixed at 0: measured lead is about 0 ms across tracks, and summer2000's 31 ms leaves 9 ms of the 40 ms budget; tuning it to summer2000's taps would overfit | planner assumption (confirm) | Critic F7; synthetic -0.2 and tapped -0.7 ms lead |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Keep attempt A's kick move, delete the fill hold, and add a per-beat pull toward the nearest kick in a window, engaged only when a beat-level gate (fraction of recent beats with a kick at a consistent offset) is open. | 4 | 2 | 4 | 3 | 5 | yes | 3.45 |
| **O2** (chosen) | robust | A gated kick PLL on the s2 branch: per declared beat, the nearest kick in a window drives separate phase and period trims, engaged only by an N-of-M regularity gate with hysteresis, bounded from the analyzer's grid, released without a jump, never freezing the existing correction. | 4 | 3 | 3 | 4 | 5 | yes | 3.65 |
| O3 | contrarian | Stop correcting phase per beat: fit the period (slope) of kick time against beat slot over a sliding window, apply it past the 4% hysteresis, and keep A's one-shot kick move only for anchoring, engaged only when the fit is tight and dense. | 3 | 2 | 3 | 3 | 4 | yes | 2.85 |

## Decision

**O2**: A gated kick PLL on the s2 branch: per declared beat, the nearest kick in a window drives separate phase and period trims, engaged only by an N-of-M regularity gate with hysteresis, bounded from the analyzer's grid, released without a jump, never freezing the existing correction.

O2 is the top scorer and removes both measured causes of attempt A's miss in one loop: nothing freezes, and a period trim kept outside the held tempo cancels the 470 vs 467 ms drift every beat without touching setTempo, its 4% hysteresis or gridEpoch. Engagement uses an N-of-M beat-level gate with a spread bound and hysteresis, and excursion clamps bound the damage on a wrong engage. O1 is close to the 149.5 ms kick-preferring correction and has no period path of its own. O3 attacks the slope directly, but needs a new setFittedPeriod that bypasses hysteresis and relies on a slot assignment that a 0.3-beat-off grid biases. O3's diagnostic value is kept cheaply: the trace adds O2's integrated period trim, which is the same slope signal.

**Approach:**
- Reuse s2 KickQueue ring and C4 getters; drop KickOffset and the veto/hold; add pushKicks to eval/detect.ts and testSignals.runPipeline.
- In declareBeat, after the existing correction, find the kick nearest the declared beat within +-KICK_WINDOW_MS (ring scan, no allocation). Residual r = kickTime - beatTime - KICK_LEAD_MS (0 measured).
- Loop: phaseTrim += KICK_PHASE_GAIN*r applied as a pendingBeat move (phaseShiftCount++, gridEpoch untouched); periodTrim += KICK_PERIOD_GAIN*r/period applied additively to the beat interval, never to the held tempo, so the 4% setTempo hysteresis and re-search never fire.
- While engaged the onset-error term in the per-beat nudge keeps running (no hold), so there is no freeze; the kick PLL integrates r to zero, and the period trim removes the 470 vs 467 ms drift by following the kicks every beat.
- Gate over the last M=8 beats in a preallocated Float64Array: enter when >=N beats have a kick in window and the MAD of their signed residuals <= KICK_SPREAD_MS; exit when <N-2 beats or MAD > 1.5x bound (hysteresis).
- Excursion bounds from the analyzer's own grid: |sum phase moves| <= KICK_MAX_PHASE_MS (200), |periodTrim| <= KICK_MAX_PERIOD_PCT (2%); hitting a bound clamps and counts toward exit.
- Disengage: stop kick moves, decay periodTrim to 0 over 4 beats, keep the grid where it is (no jump); the existing correction resumes from there. Pre-register the 24-point grid in hub-scorecard.md before any run.

## Design

On the reused replan/s2-kick-model branch (KickOffset, veto and fill hold removed), A's one-shot kick move stays as the entry anchor at the constants A measured working (it landed the grid at -13.8 ms at 11.4 s). After it, a gated kick loop keeps the grid there. Causality (F1): beat k's residual is read at the declaration of beat k+1, when every kick within the window of beat k has arrived, and is applied as a move of pendingBeat. Residual r = nearest kick within KICK_WINDOW_FRAC x period of beat k, minus beat k, minus KICK_LEAD_MS (0), in ms. Loop (F7): phase move = KICK_PHASE_GAIN x r, clamped so the summed moves stay within KICK_MAX_PHASE_FRAC x period of the analyzer's grid; period trim += KICK_PERIOD_GAIN x r / period, as a fraction per beat, clamped to KICK_MAX_PERIOD_PCT; at r of 0.05 beat and gain 0.03 a step is 0.15%, so the loop does not saturate. The trim is added to the beat interval and to lastBeatPeriod, so updatePhase and meter follow it, and it never calls setTempo. Gate (F4): over the last KICK_GATE_M beats, open when at least KICK_GATE_N had a kick in the window and the residual MAD is at most KICK_SPREAD_FRAC x period; close below N-1 or above 1.5x spread; N and M are chosen in the S3 pre-flight so low-bpm-rnb's 0.37 density cannot hold it. While open (F2), a kick move rotates phaseBins and resets phaseWins, and KICK_SUPPRESS_ONSET (0 or 1, a grid dimension) suppresses checkPhase and the onset phase term so old-grid evidence cannot pull the grid back; the period nudge keeps running, so nothing freezes. On close, moves stop and the trim decays to 0 over 4 beats without a jump. Resets (F5): halving, doubling, rebuild, the BEAT_LOST_BEATS re-search and reset() clear the gate ring, the move sum and the trim. KICK_PHASE_GAIN 0 makes everything inert.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| KickPhaseLoop | Deferred nearest-kick residual, phase move with bin rotation, period trim, clamps, no-jump release, reset hooks | app/features/rhythm/kickPhase.ts |
| KickGate | N-of-M regularity with period-relative MAD bound and entry/exit hysteresis, preallocated Float64Array | app/features/rhythm/kickPhase.ts |
| declareBeat and reset hooks | Calls the loop one declaration late, applies move and trim, suppresses checkPhase and the onset phase term while engaged when KICK_SUPPRESS_ONSET is 1, clears state on halving, doubling, rebuild, re-search and reset() | app/features/rhythm/beatTracker.ts |
| Analyzer period | lastBeatPeriod includes the trim | app/features/rhythm/rhythmAnalyzer.ts |
| KICK_* constants | One per line, off by default (KICK_PHASE_GAIN 0) | app/features/rhythm/rhythmConfig.ts |
| scorecard --set | Per-point rebuild with an esbuild plugin that rewrites rhythmConfig constants, as scripts/onset-sweep.ts does; refuses --write-baseline; engaged-beat share per track in the output | scripts/scorecard/run.ts |
| trace:beats columns | kickEngaged, deferred residual, move sum, period trim, gate open/close events | scripts/rhythm-tools |

### Contracts (freeze before dependent work)

- **C1 tracker.state** (state contract): Unchanged. A kick phase move bumps phaseShiftCount, never gridEpoch; beatCount never decreases; the trim never calls setTempo; reset paths clear kick state without bumping gridEpoch.
- **C2 pushKicks delivery** (internal API): RhythmAnalyzer.pushKicks(band, time, strength, count) once per batch before its frames, from onMessage and every offline runner, now including eval/detect.ts and testSignals.runPipeline.
- **C3 KICK_* constants** (config): KICK_PHASE_GAIN, KICK_PERIOD_GAIN, KICK_WINDOW_FRAC, KICK_GATE_N, KICK_GATE_M, KICK_SPREAD_FRAC, KICK_MAX_PHASE_FRAC, KICK_MAX_PERIOD_PCT, KICK_LEAD_MS, KICK_SUPPRESS_ONSET, plus A's kick-move constants (support floor, margin) kept at the values A measured working; one export const per line, off by default; hold, veto and KickOffset constants removed.
- **C4 Kick getters** (read-only API): kickSupport, kickMargin, kickEngaged, kickPeriodTrim and an engaged-beat counter, read-only, for trace:beats and the scorecard engaged share.
- **C5 scorecard --set** (dev CLI): npm run scorecard -- --set NAME=VALUE (repeatable) rebuilds the runner with the constants rewritten by an esbuild plugin, refuses unknown names, exits non-zero when combined with --write-baseline (with a spec), and records overrides in a field scorecard:check is shown to accept or ignore.

### Data

No persisted data. Grid results are recorded as a table in docs/agents/hub-scorecard.md; the baseline cells change only in the enabling slice.

### UX

On a go, beat-driven motion on summer2000-like syncopated tracks lands on the beat; every other track is unchanged or within its guard.

### Accessibility

No UI change.

### Security and privacy

None; local audio stays uncommitted.

### Observability

trace:beats columns for engagement, residual and trims; the scorecard json records the --set overrides of each grid point.

### Rollout and rollback

S1 merges alone as dev tooling. S2 stays off by default. S3 pre-flight may end the attempt early (no N fits its rule: S6 no-go without a grid run). The grid is committed with its sha recorded before its first run (S4). Go: S5 sets the winner's constants as defaults, re-writes the baseline with no --set, and ships through a normal PR; rollback is reverting the defaults. No-go: S6 records the miss; S2 stays unmerged.

## Test strategy

- **Unit:** kickPhase.test.ts and beatTracker specs: kicks 0.3 beat after the grid are seen through the deferred residual; on-beat, syncopated, sparse 0.37 with a 2-bar cluster, stable off-beat and none; engage and release with hysteresis; phase bins rotated on a move; phaseShiftCount without gridEpoch; beatCount monotonic; clamps; no-jump release; resets on halving, doubling, rebuild, re-search and reset(); loop stable at the highest grid gains; inert at KICK_PHASE_GAIN 0. run.ts spec: --set with --write-baseline exits non-zero. Re-check the existing it.fails and flip it if fixed.
- **Integration:** scorecard with defaults equals S0 cells (AC1); per grid point: full scorecard via --set, scorecard:check, trace:beats on summer2000 and low-bpm-rnb; for the winner also sweep:gate, size and bench:tracker.
- **End-to-end:** Enabling slice only: npm run build and npm run test:e2e.
- **Manual:** Enabling slice: debug:viz on summer2000 and low-bpm-rnb in npm run dev to see the beat land.
- **Non-functional:** No per-frame allocation (ring scan per declared beat only); bench:tracker ratio <= 1.25; total JS <= 341.5 kB; coverage >= 95%.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | The single pre-registered grid misses (all three options were low confidence) | high | medium | Accepted by design: D4 closes with summer2000 at its measured value; no widening. |
| K2 | Stable off-beat kicks on lonley or syncopation-no-kick pass the gate and the loop moves a right grid | medium | high | Phase and period clamps; run trace:beats with kickEngaged on all tracks at grid point 1 and record any engagement outside summer2000; the AC2 guards decide, not tuning. |
| K3 | low-bpm-rnb engages briefly and leaves its 40 ms budget | low | high | N of 5 or 6 of 8 with 13/35 kick coverage; guard checked per point. |
| K4 | Phase loop and the running period nudge fight, or the onset term pulls the grid back | medium | medium | KICK_SUPPRESS_ONSET is a grid dimension; phase bins rotate on each move; stability spec at the highest gains; synthetic tracks no worse is in AC2. |
| K5 | The gate never opens on summer2000, making the grid uninformative | medium | medium | S3 pre-flight measures occupancy after A's move before any grid point runs; if no N fits its rule the attempt ends as a no-go at once. |
| K6 | The pre-flight looks at summer2000 and low-bpm-rnb before the grid, which could leak tuning | low | medium | Its rule is fixed in this plan (smallest N of M 8 with summer2000 occupancy >= 70% of beats after 12 s while no 8-beat window of low-bpm-rnb reaches N-1; spread the 90th percentile of summer2000's residual MAD), it runs no scorecard point, and its output is committed with the grid. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Branch prep and grid runner: Rebase replan/s2-kick-model on main, remove KickOffset, veto and fill hold, call pushKicks in eval/detect.ts and testSignals.runPipeline, add scorecard --set as a per-point esbuild-plugin rebuild that refuses --write-baseline and writes engaged share; defaults reproduce the S0 cells exactly; merges alone |  | AC1 | C2, C5 | R1 | M | app/features/rhythm/kickPhase.ts, app/features/rhythm/rhythmConfig.ts, app/features/rhythm/testSignals.ts, app/features/rhythm/beatTracker.ts, eval/detect.ts, scripts/scorecard/run.ts |
| S2 | Gated kick PLL, off by default: KickPhaseLoop and KickGate with the deferred residual, bin rotation, onset suppression flag, period-relative window and clamps, reset hooks, trimmed lastBeatPeriod, C3 constants, C4 getters, trace:beats columns and unit specs; scorecard with defaults still equals S0 | S1 | AC1, AC4 | C1, C3, C4 | R1 | M | app/features/rhythm/kickPhase.ts, app/features/rhythm/kickPhase.test.ts, app/features/rhythm/beatTracker.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmConfig.ts |
| S3 | Pre-flight and register the grid: Read A's trace on summer2000 to name the mover that undid A's move; run the read-only pre-flight (trace:beats with A's move on, no scorecard) and apply K6's fixed rule to set KICK_GATE_N, KICK_GATE_M 8 and KICK_SPREAD_FRAC, or record a no-go; commit the grid (KICK_PHASE_GAIN 0.3, 0.6, 1.0 x KICK_PERIOD_GAIN 0.01, 0.03 x KICK_WINDOW_FRAC 0.25, 0.35 x KICK_SUPPRESS_ONSET 0, 1 = 24 points; fixed lead 0, KICK_MAX_PHASE_FRAC 0.35, KICK_MAX_PERIOD_PCT 1), the prediction and the winner rule to hub-scorecard.md, recording the commit sha | S2 | AC3 | C3 | R0 | S | docs/agents/hub-scorecard.md |
| S4 | Run the grid and decide: Run the 24 registered points (each its own --out), record the AC3 table with engaged share and prediction per point, apply the winner rule and record go or no-go | S3 | AC2, AC3 | C3, C5 | R1 | M | docs/agents/hub-scorecard.md |
| S5 | Go: enable the winning point: Only when S4 recorded go: set the winner's constants as defaults, re-write the scorecard baseline with no --set, pass all gates and e2e, merge S2 with it | S4 | AC2, AC5 | C1, C3 | R2 | S | app/features/rhythm/rhythmConfig.ts, docs/agents/hub-scorecard.cells.json, docs/agents/hub-scorecard.md |
| S6 | No-go: record the miss and close: Only when S3 or S4 recorded no-go: record the grid or pre-flight, the best point, which predicted link failed, accept summer2000 at its measured value, leave S2 unmerged, close follow-ups that only serve it | S3 | AC6 |  | R0 | S | docs/agents/hub-scorecard.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | What is lonley's current beat error and kick regularity? It is not recorded post-merge. | implementer, S3 grid point 1 trace | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | blocker | O2 scans for the nearest kick inside declareBeat, 'after the existing correction'. A beat is declared once time >= pendingBeat + BEAT_WINDOW_FRACTION x period (beatTracker.ts:206, 0.2 beat, about 94 ms at 470 ms), and kicks also arrive 2-3 frames after their timestamp (hub-scorecard.md Kick delivery). summer2000's kicks sit about 0.3 beat (about 140 ms) after the grid, so they have not arrived when the beat is declared. The loop only sees the early syncopated kicks before the beat, so it would pull the grid the wrong way. This is the same causality bug the independent review found in attempt B (hub-scorecard.md 1259-1263: 'could only learn offsets up to about 0.15 of a beat'). The plan, C2 and the K5 window argument do not mention it. A window of 130 or 170 ms is meaningless if the kicks are not yet in the ring. | Fixed: beat k's residual is read at the declaration of beat k+1, so kicks 0.3 beat late have arrived; AC4 spec with kicks 0.3 beat after the grid. |
| F2 | high | The root cause that O2's period trim relies on does not add up, and the plan does not address the other movers. A 3 ms per beat period error moves the grid about 30 to 50 ms over the 10 to 17 beats between 11.4 s and 16-19 s. The trace shows the grid 145 to 185 ms off (hub-scorecard.md 1281). The remaining 100 ms or more came from something else. A 'gives way to a sustained envelope phase', and checkPhase (beatTracker.ts:333-367) moves pendingBeat back by any offset of at least PHASE_MIN_SHIFT 0.25 beat after 4 wins at 1.15x. summer2000's offset is about 0.3 beat, past that threshold. O2 keeps the onset correction running at BEAT_PHASE_GAIN 0.4 (rhythmConfig.ts:167). Kick moves do not rotate phaseBins or reset phaseWins, so the onset evidence for the old grid can pull the grid straight back. The period trim may be fixing a minor part of the drift. | Fixed: S3 first reads A's trace to name the mover; kick moves rotate phaseBins and reset phaseWins; KICK_SUPPRESS_ONSET (checkPhase and onset phase term off while engaged) is a grid dimension; spec added. |
| F3 | high | Nothing shows the gate can open on summer2000, and a miss may be uninformative. Only 0.28 of its kicks fall in the best 3-bin window. The gate needs 5 or 6 of 8 beats with a kick in the window and a MAD of at most 45 ms, both fixed. The window is measured against the current grid, which is 140 ms off; window 130 cannot hold the mean kick (K5). With window 170 (+-0.36 beat) a syncopated groove has a kick on both sides of the grid, so 'nearest' can flip between them and inflate the MAD. The grid varies only N and the window, and leaves M and the spread, which decide whether the gate opens, fixed. If the gate never opens, all 24 points equal S0 and the last attempt is wasted. O2's 'A's one-shot kick move stays available as the entry anchor' is not in S2, C3 (no KICK_MOVE_* or support-floor constants listed) or the grid. It is unclear what moves the grid onto the kicks first. | Fixed: A's kick move is the named entry anchor with its constants in C3; a read-only pre-flight with a rule fixed in this plan (K6) sets N, M and spread, and ends the attempt early if no N fits. |
| F4 | high | The gate and the clamps are in milliseconds, not fractions of the period. KICK_WINDOW_MS 170 is +-0.49 beat at 345 ms (high-bpm-dnb) and +-0.46 beat at 370 ms (low-bpm-rnb before its 162 to 81 BPM halving, beatTracker.ts:140-149). Almost every beat has a kick 'in window', so the gate depends only on a 45 ms MAD. KICK_MAX_PHASE_MS 200 is more than half a beat on fast tracks, so the clamp does not protect them. The exit hysteresis (exit below N-2, so 3 of 8 with N=5) equals low-bpm-rnb's kick density (13 of 35 = 0.37). Once a lucky bar opens the gate it can stay open. K3 rates low-bpm-rnb's chance 'low' on N alone. | Fixed: window, spread and phase clamp are fractions of the period; exit below N-1; N chosen so low-bpm-rnb's density cannot hold it; sparse 0.37 spec with a 2-bar cluster. |
| F5 | medium | The plan does not say what happens to the gate ring, phase trim sum and period trim when the tracker reset paths fire: setTempo halving (aligned=false and a re-search), doubleTempo (period halved, bins cleared), a rebuild with epoch++, the BEAT_LOST_BEATS re-search, and reset(). low-bpm-rnb goes through a halving on its way to 24.2 ms. A trim of 2% of the old period or a stale residual ring carried across a period change corrupts the first beats of the new grid. 'Never calls setTempo' covers only one direction. C1 (beatCount never decreases, epoch only on rebuild) is checked only against kick moves. | Fixed: halving, doubling, rebuild, re-search and reset() clear the ring, move sum and trim; spec in AC4. |
| F6 | high | scorecard --set (C5, S1) is under-specified and its baseline guard is only prose. 'npm run scorecard' bundles run.ts with the esbuild CLI before it runs (package.json:35), so constants are fixed at bundle time and run.ts cannot override them at runtime. A per-point rebuild with an esbuild plugin is needed, as scripts/onset-sweep.ts does. Plan D6 'reuse ablate's one-line rewrite' and S1 draft_paths list only scripts/scorecard/run.ts. Each of 24 points also writes the default --out and, with --write-baseline, BASELINE_PATH from the same invocation (run.ts:74-76). C5 says 'never with --write-baseline' without enforcing it, so an override run could become the baseline, or the S4 re-baseline could pick up a stale override. The plan also adds an 'overrides' field to the output json, which scorecard:check or the sidecar hash may reject. | Fixed: C5 is a per-point esbuild-plugin rebuild like onset-sweep, exits non-zero with --write-baseline (spec), each point has its own --out, and scorecard:check acceptance of the overrides field is checked in S1. |
| F7 | medium | The loop arithmetic and the error budget are not shown. Only the period trim integrates r; the phase move is proportional and fights the onset correction (phase gain 0.4), so the steady-state residual is a nonzero weighted mix. The claim 'the kick PLL integrates r to zero' is true only for the period term. Kicks sit a median 31 ms before the taps, and KICK_LEAD_MS is fixed at 0, so tracking the kicks exactly costs 31 ms of the 40 ms budget and leaves 9 ms for the competing loop. The period trim is r/period times gain, and r is 0.3 beat, so gains 0.05 and 0.12 give 1.5% and 3.6% per beat. Against the 2% clamp that is saturation in one or two beats, so the KICK_PERIOD_GAIN dimension is effectively bang-bang. The trim is also invisible to consumers: updatePhase and meter use lastBeatPeriod without the trim (rhythmAnalyzer.ts:290-300, 208). | Fixed: loop written in the design with units; period gains 0.01 and 0.03 per beat do not saturate a 1% clamp; lead fixed at 0 (D9, 31 ms within budget); lastBeatPeriod includes the trim. |
| F8 | medium | O2's core is a nearest-kick-preferring correction, which is on the do-not-repeat list ('kick-preferring correction alone, 149.5 ms in D11'). The plan says O1 is 'close to' that miss and never makes the same argument for O2. What separates them (gate, period trim, no freeze) are the very things A and B already tried in part. The plan gives no falsifiable statement for why the run should now reach 40 ms from 142.7 or 98.9 ms. summer2000 is the only target track, and the AC4 specs use synthetic kick streams that do not reproduce its 0.28 concentration. | Fixed: AC3 records a falsifiable prediction per point (gate open on 70% of beats after 12 s, grid within 40 ms by 20 s and staying). Unlike the D11 correction it is gated, period-following, causal and shielded from old onset evidence. |
| F9 | medium | The go/no-go wiring is loose. S3 both commits the grid and runs it, with no commit hash recorded between them, so 'committed before its first run' is not checkable. The winner rule is undefined when several points pass: AC3 says 'one point has summer2000 <= 40 ms with AC2 green', and no tie-break or order is given. S4 and S5 are both marked dependent on S3 with nothing selecting one. Q2 (whether pushKicks in eval/detect.ts and --set land on main on a no-go) is non-blocking but decides what AC6 'main keeps only S1's pushKicks plumbing' means. S1 draft_paths omit eval/detect.ts and beatTracker.ts, and eval/detect.ts is required by AC1. | Fixed: register (S3, sha recorded) is split from run (S4); winner rule in AC3; S5 and S6 run only on the recorded verdict; Q2 answered as D8; eval/detect.ts added to S1 paths. |
| F10 | low | Observability gap: trace:beats columns (C4) show engagement, residual and trims, but there is no per-point record of when the gate opened and closed, how often it chattered, or how many beats had a kick inside the window. K2 and K3 ask for 'read, not widen' on engagement outside summer2000, yet only grid point 1 is traced on all tracks and the scorecard table has only summer2000, low-bpm-rnb and a blocking-failure count. When a point breaks lonley or syncopation-no-kick, the cause would need a re-run, which is outside the registered grid. | Fixed: engaged-beat share per track goes into every point's scorecard json and the AC3 table; trace records gate open and close events. |

## Hand-off

A verified-diamond draft DAG with 6 task(s) and 5 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `8f250a22f77406de`).
