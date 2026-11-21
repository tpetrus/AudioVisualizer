# Hub regressions follow-up backlog
> Double-diamond plan `hub-followups` revision 1 | status **final** | lane full | risk R2 | base bb1e55fe5f14 | updated 2026-11-21T21:03:30.214Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> we have a lot of follow up backlog items from the hub-regressions plan. let's clear up these by replacing them with a new implementation plan from this session. We should reduce any repeat/unnecessary steps, and come up with a systematic plan to complete all of these items

## Problem

The hub-regressions plan closed with about 20 FU-* follow-ups spread over docs/agents/hub-scorecard.md (15 listed at 763-823) and plan run notes (5 more), some already done but still listed (FU-S8-live-retap, FU-HR-falsefire-onset, FU-S7-retap-summer2000), four with no written description (FU-S5-sweep-entry-guard, FU-S5-prelock-false-open-pin, FU-S9-bass-ink-specs, FU-S9-bass-ink-gate-raw), and many sharing the same mechanisms (targets version, dancer telemetry columns, gateBass contract C1, the bass gate rule). Done one by one in the S4-S10 style they would repeat baseline rewrites, targets bumps and slow live recordings many times.

**Users:** Trevor, the maintainer who records live runs and signs off deferrals; Implementing agents in fresh sessions working slice by slice

**Evidence:**
- docs/agents/hub-scorecard.md:763-823 lists 15 FU items, one of them (FU-S8-live-retap) already done at :720
- docs/plans/hub-regressions/hub-regressions.plan.md:316 and :402 name four fast-lane items with no description anywhere in the repo
- scripts/scorecard/targets.ts:10 TARGETS_VERSION = 8; three FU items each want a targets change

## Goals

- G1: Every open hub-regressions FU item is fixed, documented as intended behavior, or closed as won't-do with a reason and Trevor's sign-off, and the follow-up list in hub-scorecard.md is replaced by a pointer to this plan's ledger.
- G2: Shared mechanisms are touched once: one targets-version bump, one telemetry-column change, one contract C1 rewording, one consolidated live recording pass.
- G3: No blocking scorecard cell that passes today gets worse, except cells whose definition v9 changes in S6, each listed in the S6 PR with Trevor's sign-off.

## Non-goals

- Follow-ups from other plans or docs (audio-alignment-findings.md, rhythm-stability-results.md) that are not FU-* items of hub-regressions.
- The deferred offline floors in the S10 close table (6/8 time, dotted change, low-bpm-rnb beat error, beatless lock, onset f50) unless an FU item itself names them.
- Raising hit-share 0.9 or false-fire 0.1 stretch targets (needs a design, per S3's reading).
- Visual redesign of any visualizer; upgrading three.js; changing CI in tpetrus/ci-workflows.

## Success metrics

- M1: 0 untriaged FU ids; a grep for FU- over docs/ finds no id without a ledger row.
- M2: TARGETS_VERSION bumped exactly once (8 to 9); the committed baseline rewritten once in S6, or a second time in S7 only if S4 or S5 changed a live-scored visualizer.
- M3: Exactly one consolidated live recording pass, at the end.
- M4: scorecard:check exits 0 at the end of every slice (intermediate S6 commits are exempt).

## Constraints

- Repo rules: named exports only, logic outside React, refs in render loops, every resource freed, no per-frame allocation, 95% coverage; format, lint, typecheck, test:coverage and build green (AGENTS.md).
- Live runs are recorded one at a time from the main checkout; .debug-in audio is never committed and .beats.json hashes are checked by the baseline.
- Worktrees get their own npm ci, never links; remove them with npm run worktree:remove.
- Bundle budgets are near the limit (total JS about 335 kB, worklet 5.8 kB); DEV-only telemetry must not ship.
- User stance: document current behavior unless a cell or spec shows a real defect; a resource leak counts as a defect.

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the plan's ledger in docs/plans/hub-followups/ | a reader looks up any hub-regressions FU id, including the four undescribed fast-lane ids and the three already done | it shows a description, an outcome (fixed, documented, won't-do, done earlier) and the commit or reason, any won't-do carries Trevor's sign-off, a grep for FU- over docs/ finds no id without a row, and hub-scorecard.md no longer carries its own open list |
| AC2 | a hub whose tracker's getSource() becomes undefined after a capture stops | hub.update() runs | gateBass.pulse reads 0 and the gate-input tap is disconnected; a same-source resume with renderTimeNow() briefly undefined rebuilds no tap and leaves no pulse gap; update(now) with an explicit time behaves as before; all pinned by specs; and contract C1, hub types.ts and the hub class comment state that gateBass.pulse is the newest audio, not shifted by the sync offset |
| AC3 | a scorecard replay | soft-boundary and song-change counts are computed | they come from counters the analyzer exposes, boundaryProbe.ts and songChanges.ts no longer wrap prototype methods, and the offline scorecard cells are identical to before |
| AC4 | a debug:viz recording of the dancer | the telemetry CSV is written | it carries DEV-only columns for kicks placed before the lock, phase-onset count, and scene-build and model-parse marks; bass-ink's recording carries a scene-build mark; the two hub.onsets strength scales are documented as they are; and the production bundle stays within 0.1 kB of before |
| AC5 | the dancer's bass gate | it opens on the lock tick after an unlock, sees frames longer than 0.1 s, bpm 0, or more than 32 kicks before the lock | specs show no spurious bump from a stale lastPhase and placed kicks spaced on the unclamped clock; and sparse-bass false opens are measured through the hub replay with a recorded keep-or-change decision |
| AC6 | the scorecard | it runs over the real tracks | a set-director cell reports bass-ink transition count and times per track; the hub-energy move is kept only if on every real track the transition count is equal and each transition time is within one beat of the pre-move replay, otherwise it is reverted with the failing tracks recorded; a kept move is confirmed in S7 by bass-ink's live kicks cell not getting worse |
| AC7 | TARGETS_VERSION 9 | the scorecard runs | drifting tracks are scored against a smooth fit of the taps, clip comparison uses the meter-locked-runs and beatsPerLoop rule with a reported skipped share and a minimum span, hit share uses a relative tolerance, live cells are recomputed by --ingest from existing runs, the version bump is the first S6 commit with each scoring commit's diff produced against a scratch baseline, and the committed baseline is rewritten once at the end of S6 |
| AC8 | the final live pass | live cells of the changed visualizers and scorecard:order with 4 sessions per order are recorded | the scorecard is committed and scorecard:check passes (with the second baseline rewrite only if S4 or S5 changed a live-scored visualizer); FU-S10-order-hub-spread is closed as load timing if the scene-build or model-parse mark lands later relative to track start after a different visualizer by more than the control sessions' spread and the hub-signal spread follows it, otherwise deferred with the mark data |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Which items does the plan cover? | Every open FU item of hub-regressions, each fixed, documented or closed. | user | Clear the backlog list completely. |
| D2 | Document or change behavior when an item offers both? | Document unless a cell or spec shows a real defect. | user | Keeps visualizers stable and avoids re-scoring. |
| D3 | How are live recordings scheduled? | One consolidated pass at the end. | user | Live runs are slow and serial; per-slice recording repeated work in S4-S10. |
| D4 | One or several targets bumps? | One combined bump for drifting-truth, clip-unit and hitshare-relative-tolerance. | user | One sign-off, one rescore. |
| D5 | Which listed items are already done? | FU-S8-live-retap (S10 close), FU-HR-falsefire-onset (targets v6) and FU-S7-retap-summer2000 (S8). | repo-fact | hub-scorecard.md:177, :562, :720. |
| D6 | What does a targets bump imply? | TARGETS_VERSION is 8 and live files of another version are dropped, so v9 needs --ingest recomputation of live cells and a baseline rewrite. | repo-fact | scripts/scorecard/targets.ts:10, live/session.ts:22-27, inputs.ts:172-176. |
| D7 | FU-S4-gatebass-sync-offset: reword or shift the pulse? | Reword C1, types.ts and the class comment. | planner assumption (confirm) | D2; shifting would change cubes and the dancer for users with an offset. |
| D8 | FU-S4-gatebass-no-source: fix or document? | Fix: release the tap and zero the pulse when tracker.getSource() is undefined, not on renderTimeNow() alone. | planner assumption (confirm) | A tap left connected breaks the resource-ownership rule; getSource() is the real ownership signal, and renderTimeNow() can be transiently undefined with a live source (critic F3). |
| D9 | FU-S9-bass-ink-energy in scope? | Add the set-director cell first, then try the move onto the hub; keep it only if transitions stay within the pre-move spread, otherwise document and close. | user | Measure before changing the set director. |
| D10 | FU-S8-summer2000-gaps? | Optional re-tap by Trevor, scheduled before the v9 baseline rewrite so its hash lands in that single rewrite; skipping is allowed. | user | Avoids a second baseline rewrite. |
| D11 | Where do the analyzer counters live? | Methods on RhythmAnalyzer and BoundaryDetector only; RhythmState is unchanged. | user | No consumer contract change. |
| D12 | hub.onsets strength scale (FU-S6-phase-strength-telemetry): document or normalize? | Document both scales as they are and add the phase-onset counter; no visualizer reads hub.onsets, so normalizing is deferred to whoever first reads it. | planner assumption (confirm) | D2; keeps S3 at R1 with offline cells identical (critic F6). |
| D13 | Does a cell missing from the baseline fail scorecard:check? | No: compareToBaseline in scripts/scorecard/ratchet.ts iterates baseline cells only, so the S4 advisory cell passes until S6 adds it. | repo-fact | Critic F7 read of ratchet.ts; S4 adds one spec pinning it. |
| D14 | How are the undescribed fast-lane ids handled? | S1 recovers them from the S5 and S9 PR reviews and git log; spec gaps go to S4 (gate) or S5 (bass-ink); a won't-do needs Trevor's sign-off. | planner assumption (confirm) | Missing specs are a defect under the 95% coverage rule (critic F5). |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Three sequential PRs grouped by what they invalidate: PR1 code changes that leave every offline cell identical (no baseline touch), PR2 the single targets v9 bump plus bass-ink cell and one baseline rewrite, PR3 the one live pass and ledger close. | 4 | 3 | 4 | 3 | 3 | yes | 3.5 |
| O2 | robust | Seven ordered slices, each one mechanism, behavior changes in their own revertible commit behind a measure-first, ratchet-second rule, one baseline rewrite for the new cell and one for v9, one live pass last. | 4 | 4 | 2 | 4 | 4 | yes | 3.6 |
| O3 | contrarian | Sequence by measurement dependency and score impact, not shared mechanism: ledger and zero-score-impact work first, one offline measurement pass that decides every keep-or-change question, then a single v9 bump with baseline rewrite, then the live pass, so any item the measurements clear closes as documented or won't-do and never reaches a rewrite or recording. | 4 | 4 | 4 | 4 | 4 | yes | 4 |
| **O4** (chosen) | hybrid | O3's measurement-first order (ledger, zero-score-impact code, one offline measurement pass, defect-only edits, one v9 bump, one live pass) with O2's discipline: each behavior change spec-first in its own revertible commit with a before/after cell diff, and ledger rows updated in the same PR as each fix. The four undescribed fast-lane ids are recovered from the S5 and S9 PR review threads rather than pre-classified. | 5 | 4 | 4 | 4 | 4 | yes | 4.3 |

## Decision

**O4**: O3's measurement-first order (ledger, zero-score-impact code, one offline measurement pass, defect-only edits, one v9 bump, one live pass) with O2's discipline: each behavior change spec-first in its own revertible commit with a before/after cell diff, and ledger rows updated in the same PR as each fix. The four undescribed fast-lane ids are recovered from the S5 and S9 PR review threads rather than pre-classified.

O4 keeps O3's measurement-first order, which minimises rewrites and scopes the single live pass to visualizers that actually changed, and adds O2's spec-first, one-commit-per-behavior-change discipline so each change is reversible. O1 packs too much into one wide PR; O2 needs two baseline rewrites and more ceremony.

**Approach:**
- S1 ledger: docs/plans/hub-followups/ledger.md with every FU id; recover the four undescribed ids from the S5 and S9 PR review comments (gh pr view) and git log; fold each into a later slice or close it; hub-scorecard.md:763-823 becomes a pointer (AC1).
- S2 contracts and counters, baseline byte-identical: gateBass no-source fix with spec, C1/types.ts/class comment reworded (AC2, D7, D8); counter methods on RhythmAnalyzer and BoundaryDetector, prototype wrapping deleted, offline cells identical (AC3, D11).
- S3 DEV telemetry, one column change: placed-before-lock kicks, phase-onset count, scene-build and model-parse marks, onsets scale documented; bundle diff within 0.1 kB (AC4).
- S4 offline measurement and gate edges: lock-edge specs, sparse false opens via hub replay and sweep:gate, set-director cell added report-only; keep-or-change recorded; gate edits only for proven defects, each its own commit with cell diff (AC5, part of AC6).
- S5 bass-ink energy move tried against the S4 cell spread, kept or reverted with reason (AC6, D9).
- S6 targets v9: optional summer2000 re-tap first (D10), three scoring commits each with a rescore diff, one TARGETS_VERSION bump, --ingest live cells, one baseline rewrite including the set-director cell (AC7).
- S7 one live pass for the visualizers that changed plus scorecard:order 4 sessions per order using S3 marks; close FU-S10-order-hub-spread; close ledger (AC8).

## Design

Seven slices ordered by measurement dependency. S1 builds the ledger that replaces the backlog list. S2 and S3 make changes that leave every offline cell identical (gateBass contract and leak fix, analyzer counters, DEV telemetry). S4 measures every keep-or-change question offline (gate edges, sparse false opens, a report-only set-director cell) and edits the gate only for proven defects. S5 tries the bass-ink energy move against that cell. S6 does the single targets v9 bump and the one baseline rewrite. S7 is the single live pass, scoped to visualizers that changed, plus the order sessions, and closes the ledger. Each behavior change is spec-first in its own commit with a before/after cell diff in the PR description.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| Ledger | One row per FU id: description, outcome (fixed, documented, won't-do, done earlier), commit or reason, slice | docs/plans/hub-followups/ledger.md |
| Hub gateBass release | Zero the pulse and disconnect the tap when the tracker has no render time | app/features/audio/hub/audioHub.ts, app/features/audio/hub/gateBassTap.ts, app/features/audio/hub/types.ts |
| Analyzer counters | Expose soft-boundary and song-change counts; scorecard engine reads them instead of patching prototypes | app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/boundary.ts, scripts/scorecard/engine/boundaryProbe.ts, scripts/scorecard/engine/songChanges.ts |
| Dancer DEV telemetry | Placed-before-lock kicks, phase-onset count, scene-build and model-parse marks | app/features/visualizers/dancing-character/, scripts/debug-viz/ |
| Gate measurement | Lock-edge specs, sparse false-open measure, defect-only fixes | app/features/rhythm/bassGate.ts, bassGateConfig.ts, scripts/scorecard/sweepGate.ts |
| Set-director cell | bass-ink transition count and times per real track | scripts/scorecard/cells.ts, app/features/visualizers/bass-ink/ |
| Targets v9 | Drifting smooth-fit truth, clip rule, relative hit-share tolerance | scripts/scorecard/targets.ts |

### Contracts (freeze before dependent work)

- **C1 gateBass snapshot (hub contract C1)** (internal TypeScript interface): gateBass.pulse is the newest audio, not shifted by the sync offset (bands, lowEnd and beat are); when tracker.getSource() is undefined it reads 0 and the gate-input tap is disconnected; a transiently undefined renderTimeNow() with the same source keeps the tap. Wording updated in docs/plans/hub-regressions/contracts.md, hub types.ts and the hub class comment.
- **C2 Analyzer counters** (internal class methods): RhythmAnalyzer and BoundaryDetector expose read-only counters for soft boundaries and song-change times; RhythmState is unchanged; the scorecard engine reads the counters and no longer wraps prototype methods.
- **C3 DEV telemetry columns** (debug:viz CSV columns): New DEV-only columns: dancer placedKicks, phaseOnsets, sceneBuiltAt, modelParsedAt; bass-ink sceneBuiltAt; absent from production bundles; debug:summary tolerates their absence in older CSVs.
- **C4 Scorecard targets v9** (scorecard file format and rules): TARGETS_VERSION 9: drifting tracks scored against a quadratic fit of tapped beat times; clip compared within the bar only when at least 3 runs are meter-locked and every compared run has beatsPerLoop of 4 or more, with skipped share reported and a minimum span share; hit share tolerance max(0.05, 0.1 x pre-hub). Live v8 files are recomputed by --ingest.

### Data

Committed artifacts change: hub-scorecard.cells .json/.md and the baseline (rewritten once in S6), hub-scorecard.live.json and order .json/.md (S6 ingest, S7 recording), and summer2000.beats.json only if Trevor re-taps (D10). Audio in .debug-in stays uncommitted.

### UX

No visible change for end users except possibly bass-ink set transitions if the S5 move is kept, which must stay within the pre-move spread.

### Observability

New DEV telemetry columns (C3) make the gate placement, phase onsets and load timing visible in debug:viz recordings; the set-director cell makes bass-ink's director measurable.

### Rollout and rollback

One PR per slice, Conventional Commit titles (docs for S1 and S6 docs-only parts, fix for S2, chore or refactor for S3, fix or refactor for S4 and S5, test or chore for the scorecard-only S6, docs for S7), merged in order; each deploys to production via Workers Builds. Behavior changes sit in their own commits so a single revert undoes one; production rollback via the Cloudflare dashboard if smoke fails.

## Test strategy

- **Unit:** Spec-first per behavior change: hub spec with a tracker whose renderTimeNow() is undefined (pulse 0, tap disconnected); analyzer counter specs; bassGate specs for lock tick after unlock, dt over 0.1 s, bpm 0, more than 32 pre-lock kicks; targets specs for the quadratic fit, the clip rule edge cases and the relative tolerance. Coverage stays at 95%.
- **Integration:** npm run scorecard then scorecard:check at the end of every slice; S2 and S3 require offline cells identical to the base; S4 and S5 attach a before/after cell diff; S6 rewrites the baseline once and attaches the rescore diff per scoring commit.
- **End-to-end:** npm run test:e2e for slices touching app code (S2, S3, S4, S5), including e2e/order.spec.ts.
- **Manual:** S5: watch bass-ink in npm run dev on two real tracks if the move is kept. S7: live recordings one at a time from the main checkout.
- **Non-functional:** npm run size after S3 and S5: production bundle within 0.1 kB of base for S3; budgets in .size-limit.json unchanged.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | The four undescribed fast-lane ids cannot be recovered from PR threads or git history. | medium | low | Close them as won't-do with 'no recoverable description' and the PR links searched, so the ledger still has a row. |
| K2 | A refactor in S2 or S3 changes an offline cell by accident. | low | medium | Require scorecard cells identical to the base before merge; any diff blocks the PR. |
| K3 | The advisory set-director cell added in S4 is mistaken for a blocking one. | low | low | D13: the ratchet ignores cells absent from the baseline; S4 adds a spec pinning that. |
| K4 | The S7 live pass shows a changed visualizer worse than the S6 baseline. | medium | medium | Allowed second rewrite (M2) only for visualizers S4 or S5 changed, listed in the S7 PR; any other regression becomes a new ledger row with evidence. |
| K5 | DEV telemetry leaks into the production bundle near the budget. | low | medium | Guard with import.meta.env.DEV as existing columns do; check npm run size in S3. |
| K6 | The v9 clip or hit-share rule flips a passing blocking cell to failing. | medium | medium | One commit per rule with a rescore diff; any newly failing blocking cell needs Trevor's sign-off in the PR, recorded in the ledger. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Ledger and triage: Write docs/plans/hub-followups/ledger.md with every hub-regressions FU id; recover the four undescribed ids from the S5 and S9 PR reviews and git log and assign spec gaps to S4 or S5; record the three done earlier; assign each open id to a slice, or close it with Trevor's sign-off; add a ledger completeness check (grep for FU- over docs/); replace hub-scorecard.md:763-823 with a pointer. |  | AC1 |  | R0 | S | docs/plans/hub-followups/ledger.md, docs/agents/hub-scorecard.md |
| S2 | gateBass contract and analyzer counters: Spec-first fix that zeroes gateBass.pulse and disconnects the tap when tracker.getSource() is undefined, with specs for same-source resume and explicit update(now); reword C1, types.ts and the hub comment for the unshifted pulse; add analyzer counter methods and remove the prototype wrapping; offline cells identical. | S1 | AC2, AC3 | C1, C2 | R2 | M | app/features/audio/hub/audioHub.ts, app/features/audio/hub/gateBassTap.ts, app/features/audio/hub/types.ts, docs/plans/hub-regressions/contracts.md, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/boundary.ts, scripts/scorecard/engine/boundaryProbe.ts, scripts/scorecard/engine/songChanges.ts |
| S3 | Dancer DEV telemetry columns: One telemetry-column change: dancer placed-before-lock kicks, phase-onset count, scene-build and model-parse marks, bass-ink scene-build mark, recorded by debug:viz; document the two hub.onsets strength scales as they are (D12); bundle within 0.1 kB. | S1 | AC4 | C3 | R1 | M | app/features/visualizers/dancing-character/useDancingCharacterScene.ts, app/features/visualizers/bass-ink/useBassInkScene.ts, scripts/debug-viz/ |
| S4 | Offline measurement and gate edges: Add lock-edge specs and any recovered gate spec gaps, measure sparse false opens through the hub replay and sweep:gate, add the set-director cell as advisory with a spec that the ratchet ignores it (D13), record the pre-move set-director replay; record keep-or-change per item in the ledger; fix only proven gate defects, each in its own commit with a cell diff. | S2, S3 | AC5, AC6 |  | R2 | M | app/features/rhythm/bassGate.ts, app/features/rhythm/bassGateConfig.ts, scripts/scorecard/sweepGate.ts, scripts/scorecard/cells.ts |
| S5 | bass-ink energy onto the hub: Move bass-ink's set-level energy onto the hub low end and retune its ratio thresholds; keep the move only if every real track has an equal transition count and each transition within one beat of the S4 replay, otherwise revert and record the failing tracks; add any recovered bass-ink spec gaps. | S4 | AC6 |  | R2 | M | app/features/visualizers/bass-ink/ |
| S6 | Targets v9 and the one baseline rewrite: After the optional summer2000 re-tap, bump TARGETS_VERSION to 9 in the first commit, then land the drifting smooth-fit truth, the clip rule and the relative hit-share tolerance as three commits whose rescore diffs are produced against a scratch baseline; recompute live cells with --ingest; rewrite the committed baseline once at the end, including the set-director cell; list cells changed by v9 for Trevor's sign-off. | S5 | AC7 | C4 | R2 | M | scripts/scorecard/targets.ts, scripts/scorecard/cells.ts, docs/agents/hub-scorecard.cells.json, docs/agents/hub-scorecard.live.json |
| S7 | One live pass and close: Record live cells only for visualizers changed in S2-S5, and scorecard:order with 4 sessions per order using the S3 marks, one at a time from the main checkout; apply the AC8 rule to close or defer FU-S10-order-hub-spread; document FU-S8-manual-reselect; rewrite the baseline a second time only for visualizers S4 or S5 changed; close the ledger. | S6 | AC8, AC1 | C3, C4 | R1 | M | docs/agents/hub-scorecard.live.json, docs/agents/hub-scorecard.order.json, docs/agents/hub-scorecard.cells.json, docs/agents/hub-scorecard.md, docs/plans/hub-followups/ledger.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Will Trevor do the optional summer2000 re-tap of 8.6-13.4 s before S6? | Trevor | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | AC6, D9 and S5 gate the bass-ink hub-energy move on 'within the pre-move spread' of the set-director cell, but the cell is an offline replay over real tracks, which is deterministic, so a spread does not exist unless it is defined (across what: tracks, seeds, a tolerance on count and times?). S4 is told to 'record the pre-move spread' with no definition or number. S5 can therefore not fail, or is judged by taste. The live effect of the move on bass-ink is first seen in S7, after the baseline is rewritten in S6. | Changed: AC6 and S5 now define the pass rule (equal transition count and each transition within one beat per real track, else revert) and name bass-ink's live kicks cell in S7 as confirmation. |
| F2 | high | The 'baseline rewritten once' promise (AC7, M2) and the claim in O4 pros that 'S1-S5 leave the blocking baseline untouched' conflict with S4 and S5, which can change the dancer's gate and bass-ink's director. S6 then runs --ingest over live files recorded before those changes and rewrites the baseline from them. S7 records new live cells and runs scorecard:check against that baseline. ratchet.ts fails any live metric worse than baseline by more than its spread, so a changed visualizer can fail in S7 and force a second rewrite (K4 allows it, AC7 says once). S7 draft_paths also omit the baseline and cells.json, so the plan does not expect to touch them. | Changed: M2, AC7, AC8 and S7 allow a second rewrite only when S4 or S5 changed a live-scored visualizer; the baseline-untouched claim is limited to S2 and S3; S7 draft_paths include the cells file. |
| F3 | high | AC2/D8 key the tap release on tracker.renderTimeNow() being undefined. In audioHub.ts update() returns early on that, and readGateBassLevel() already decides on tracker.getSource(), which is the real ownership signal. If renderTimeNow() is also undefined transiently while a live source exists (before the first worklet message, or around a resume on the same source), releasing the tap there makes the hub rebuild a GateBassTap for the same source each time, dropping the gate level for those frames, and allocates in the update path. The plan also does not say that update(now) with an explicit time, which scorecard replay uses, is unaffected, and bass-ink and the dancer already mask the stale pulse with `source ? pulse : 0`. | Changed: D8, C1, AC2 and S2 key the release on getSource() being undefined, with specs for same-source resume and explicit update(now). |
| F4 | medium | S6 lands three scoring commits, each 'with a rescore diff', plus a single version bump. ratchet.ts returns not-ok on any targets-version mismatch with the baseline, so the commit that bumps the version fails scorecard:check until the baseline is rewritten. If the bump comes last, the earlier commits change definitions under version 8 and the diff against the v8 baseline mixes definition changes with real regressions. M4 'scorecard:check exits 0 at the end of every slice' holds only at the end of S6. G3 ('no blocking cell that passes today gets worse') also conflicts with a v9 whose purpose is to rescore, and K6 handles that only by sign-off. | Changed: the bump is the first S6 commit, scoring diffs are produced against a scratch baseline, M4 exempts intermediate S6 commits, G3 exempts v9-redefined cells with Trevor's sign-off. |
| F5 | medium | Several FU items have no acceptance criterion or slice: FU-S5-sweep-entry-guard, FU-S5-prelock-false-open-pin, FU-S9-bass-ink-specs, FU-S9-bass-ink-gate-raw (names appear only at hub-regressions.plan.md:316 and :402), FU-S8-manual-reselect (only a clause in the S7 objective) and FU-S8-summer2000-gaps (only D10). AC1 is satisfied by a ledger row alone, and K1 lets the four undescribed ids close as won't-do with 'no recoverable description'. The names suggest real work: a sweepGate entry guard, a spec pin, and bass-ink specs, where the repo's 95% coverage rule makes missing specs a defect, not a won't-do. A won't-do without a description cannot honestly meet G1. | Changed: D14 and S1 recover the undescribed ids and route spec gaps to S4 or S5; won't-do needs Trevor's sign-off; AC1 and M1 add a grep completeness check; manual-reselect is documented in S7. |
| F6 | medium | S3 says 'decide and document the hub.onsets strength scale' (AC4), but the decision is not in the decisions list, has no owner, and may mean changing hub values rather than writing a note. That would break S3's R1 rating and the 'offline cells identical' ratchet, and it touches app/features/audio/hub/, which S3 lists only as draft_paths for the counter. Also, FU-S10-order-hub-spread showed spread on bass-ink's kick onsets and the dancer's gain, but only the dancer gets build/parse marks (C3), so S7 can name the cause for one of the two visualizers at most. | Changed: D12 documents both scales as they are (S3 stays R1); C3 and AC4 add a bass-ink scene-build mark. |
| F7 | low | AC8 lets FU-S10-order-hub-spread close as 'load timing or hub state named as cause' or 'deferred with its evidence', so it cannot fail, and gives no rule for what the 4 sessions per order must show. Q2 and K3 are open for a point the code already answers: compareToBaseline in ratchet.ts iterates baseline cells only, so a new cell absent from the baseline does not fail scorecard:check. The 'check exception' in K3 is not needed. | Changed: AC8 has a concrete close-or-defer rule; Q2 closed by D13 (repo fact); K3 updated. |

## Hand-off

A verified-diamond draft DAG with 7 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `8bcf00a67ff72cd3`).
