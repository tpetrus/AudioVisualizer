# Rhythm tracker replan after D11
> Double-diamond plan `rhythm-tracker-replan` revision 1 | status **final** | lane full | risk R2 | base ee7687560dff | updated 2026-11-23T14:52:27.275Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> in the last session, we made progress on resolving regressions with summer2000 and low-bpm-rnb, but the orchestrator came back and said we needed to replan some work. Please look at everything it did and replan these features (there are still open PRs that im working on merging too)

## Problem

After the D11 run, summer2000 is still 153 ms off the beat (target 40). D11's S1 trace showed that none of the evidence BeatTracker has (summed onset, per-band flux, a looser streak gate) points at the taps. Only the worklet's BandOnsets kick events do (a median 31 ms before the taps), and they never reach the analyzer today, because rhythmTracker.ts onMessage forwards only frames. Every move that lands the grid on the taps slides off within 2 s: through the 12-14.8 s fill the per-beat correction follows the envelope's strongest onset, and once the grid is more than BEAT_WINDOW_FRACTION from the kicks it never sees them again. The tracker needs a new input (kick events) and a way to hold a phase hypothesis against an envelope that disagrees and to ride out fills. Beat presence (beatless) and bar-level beat (6-8-time, half-time-shuffle) failed in D11 for lack of the same kind of evidence. low-bpm-rnb (S4b) and the dotted 3/2 change (S7) were fixed in D11 PRs that are still merging.

**Users:** Trevor, the developer, who judges tracker changes on the scorecard; Listeners watching any visualizer, whose visuals follow tracker.state beat phase

**Evidence:**
- d11 hub-scorecard.md 'Tracker plan D11, S1': the phase check's best window sits on the grid at bin 1, and the taps at bins 6-10. Band-0 flux also peaks at bin 1, while kick events peak 0.25-0.375 beat into the grid, near the taps
- d11 hub-scorecard.md S1 prototype table: kick events in the phase bins, a half-beat flip, a kick-preferring correction and a longer gate give 149.5 ms at best. Moves onto the taps slide off within 2 s
- rhythmTracker.ts:228-244 forwards only time0, frames and count to analyzer.pushBatch. FeatureBatch (types.ts:77-100) already carries onsetBand, onsetTime and onsetStrength
- audioHub.ts:274-341 is today's only onset consumer and releases events at render time
- d11 S6 and S8 records: no autocorrelation-based presence signal and no tie-multiple bar evidence separated beatless or 6-8-time without breaking blocking cells

## Goals

- Bring summer2000 beat.errorMedianMs to 40 ms or less, in at most two bounded attempts (required)
- Give the analyzer and BeatTracker the worklet's kick events as an input, in time order, with no per-frame allocation
- Keep every passing blocking cell, the S4b low-bpm-rnb result (at most 40 ms) and the S7 dotted change, with no added sweep:gate false opens
- Stretch: reuse the kick-event evidence for beat presence (beatless) and bar-level beat (6-8-time, half-time-shuffle), each shipped or reverted on its own
- Re-record the live cells (AC7 dance-clip consistency, gate seconds) once the D11 PRs and this plan's required slice merge

## Non-goals

- Re-doing D11 work that shipped (S4b halving re-search, S7 dotted rule) or retrying the measured misses (kick-weighted phase bins, a looser streak gate, the autocorrelation presence floor, tie multiples alone)
- Changing scorecard targets (v9) or the tapped .beats.json truth
- Hub, visualizer, bassGate or dance-clip code changes. Gate seconds are reported under D9, not tuned
- A finer low-end spectrum for bassline-kick-120 onsets (accepted in D11)
- Changing the worklet's onset detector or moving the tracker into the worklet; three.js upgrades

## Success metrics

- summer2000 beat.errorMedianMs is at most 40, or after two recorded attempts it is accepted at its measured value
- scorecard:check exits 0 against the post-merge baseline; low-bpm-rnb stays at most 40 ms; ac9.dottedChangeCounted stays 1
- sweep:gate false opens are not above post-merge main
- Total JS is at most 341.5 kB; bench:tracker median ratio is at most 1.25 against post-merge main

## Constraints

- The plan starts on main after the D11 PRs (S1 trace tools, S2 pins, S4b, S5, S7) merge; their results are the new before values
- Every tracker change is judged on the full npm run scorecard, scorecard:check, sweep:gate and bench:tracker
- Total JS may grow by at most 3 kB (to 341.5 kB), raised in the PR that needs it, with the reason; tracker CPU by at most 25 percent
- it.fails specs that start passing have .fails removed in the same change
- .debug-in/*.beats.json are hash-checked and cannot be recreated; the audio stays local and CI has none
- Kick events must be consumed in time order with the frames: analysis runs about 100 ms behind audio (rhythmTracker.ts:98), and the event buffers are fixed-size (rhythmProcessor.worklet.ts:27-30)
- tracker.state and BeatTracker contract fields (lastBeatTime, periodSeconds, beatCount, gridEpoch, phaseShiftCount, gridHitShare) keep their meaning
- AGENTS.md: logic outside React, no per-frame allocation, named exports, comments that explain why; never link shared folders into worktrees

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | main after the D11 PRs and the summer2000 slice merge, with .debug-in audio | npm run scorecard runs | beat.errorMedianMs on summer2000 is at most 40 ms; or, after two bounded attempts, each attempt's grid, result and trace are recorded in hub-scorecard.md and the cell is marked accepted at its measured value |
| AC2 | the post-merge baseline written by the S0 slice | npm run scorecard:check and npm run sweep:gate run after each tracker slice | scorecard:check exits 0, sweep:gate false opens are not above post-merge main, low-bpm-rnb beat.errorMedianMs is at most 40, ac9.dottedChangeCounted is 1, the synthetic ground-truth tracks' beat error and first lock are no worse than post-merge main, and syncopation-no-kick, syncopationbass, 6-8-time and high-bpm-dnb have beat error and first lock no worse than post-merge main. gate.secondsAfterLock cells that pass on post-merge main do not fail or rise by more than 0.5 s; cells failing there are reported only. For S4 the meter, downbeat and dance-clip cells are also no worse |
| AC3 | golden state digests committed from post-merge main on a few synthetic tracks, and the worklet's lagging batch shape (rhythmProcessor.worklet.test.ts fixture) | the same batch sequence is fed through RhythmTracker.onMessage and through the replay loop, with kicks and the model switched off | both make identical pushKick calls (each event once, in arrival order, with its own timestamp, before the first frame of the batch that carried it); the tracker state matches the golden digests; and KickQueue and the kick model clear on hardReset, a hard boundary and a time-base restart |
| AC4 | a production build and a bench that runs BandOnsets and feeds kick events | npm run size and bench:tracker (interleaved against post-merge main) run | total JS is at most 341.5 kB, with any limit change stated in the PR, and both the kickless and the with-kicks median time-per-frame ratios are at most 1.25 |
| AC5 | the changed BeatTracker | the unit specs and npm run test:e2e run | a phase move keeps gridEpoch and increments phaseShiftCount, and beatCount never decreases (also when attempt B's offset changes). The S2, S4b and S7 specs pass unchanged. The disagreeing-envelope-plus-fill synthetic keeps the kick phase. A synthetic where kicks stay steady while the groove moves a quarter beat, and a tempo ramp, both recover within KICK_RECOVER_BEATS. With kick support below its floor, the output equals the model-off output. Coverage stays at 95 percent or more and e2e passes |
| AC6 | the stretch beat-presence slice is attempted | npm run scorecard runs | tempo.beatlessNeverLocks is 0 and no kick track's first lock is later by more than 0.5 s, or the slice is reverted and the measurement recorded |
| AC7 | the stretch bar-level slice is attempted | npm run scorecard runs | 6-8-time beat.errorMedianMs and tempo cells, or half-time-shuffle's beat level, improve with no blocking cell failing, or the slice is reverted and the measurement recorded |
| AC8 | the required slice is merged or accepted | scorecard:live runs for the dancer from the main checkout, one run at a time on an idle machine | hub-scorecard.md has the before and after of live.clip.maxDeviationBeats and gate.secondsAfterLock on the request's tracks, each with a status of fixed, stretch-open or accepted |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Which D11 PRs does the plan assume? | All of them: S1 trace tools, S2 pins, S4b, S5 and S7 merge as they are. The plan starts on post-merge main and rebases if one changes | user | Trevor is merging them now |
| D2 | What does the replan cover? | Required: summer2000 through a kick-event phase input. Stretch: beat presence and bar-level beat, using the same evidence | user | summer2000 is the only required cell still failing |
| D3 | Budget? | Total JS up to +3 kB (341.5 kB), raised in the PR that needs it; tracker CPU at most 1.25x, measured interleaved | user | Same as D11; room for a few phase hypotheses |
| D4 | What if summer2000 misses 40 ms? | Two bounded attempts, each with a pre-registered grid. If both miss, record them and accept the cell at its measured value | user | Keeps the plan from stalling |
| D5 | Where do kick events come from? | The existing worklet BandOnsets in FeatureBatch (onsetBand, onsetTime, onsetStrength), forwarded by rhythmTracker.onMessage. The worklet and the message version stay unchanged | repo-fact | types.ts:77-100 already carries them; rhythmTracker.ts:228-244 drops them |
| D6 | Is gate.secondsAfterLock required? | No. It is reported, and passing tracks must not get worse (D9 of D11 carries over) | user | Carried from the D11 plan; bassGate is a non-goal |
| D7 | Does a phase move bump gridEpoch? | No. A phase move counts in phaseShiftCount; only a numbering break bumps the epoch | repo-fact | beatTracker.ts epoch specs; an epoch change shrinks the meter's evidence (rhythmAnalyzer.ts) |
| D8 | Is the framing confirmed? | Yes, as shown at the full-lane checkpoint | user | Checkpoint round |
| D9 | Is there a baseline slice first? | Yes. S0 waits for the D11 PRs, then re-runs scorecard and the live cells on post-merge main and rewrites the baseline as the before values, in one docs-only PR | user | Every later slice needs a stable before |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Forward band-0 kick events through rhythmTracker and analyzer into a small fixed ring in BeatTracker, and let a kick-phase vote (circular mean of kick offsets against the grid) gate and pull the existing per-beat correction, with no new tracker state machine. | 3 | 3 | 4 | 3 | 4 | no | 3.3 |
| O2 | robust | Forward kick events through a time-ordered, allocation-free channel into BeatTracker, and let a decayed kick-phase histogram act as a hysteresis-guarded prior that vetoes envelope-driven phase moves and freezes corrections through fills. | 4 | 3 | 2 | 4 | 4 | yes | 3.35 |
| O3 | contrarian | Stop trying to make the BeatTracker's own grid hold against the envelope; leave it untouched and add a downstream KickPhase estimator that learns a slow, circular median offset between kick events and the grid, applied only at the analyzer output. | 3 | 2 | 4 | 3 | 4 | no | 3.05 |
| **O4** (chosen) | hybrid | Hybrid of O2 and O3. One kick-event input path (O2's ordered, allocation-free queue), then two structurally different bounded attempts, both prototyped offline first. Attempt A is O2's in-tracker kick-phase model, with a veto, hysteresis and a fill hold. Attempt B, only if A misses, is O3's output-layer kick offset. Stretch slices reuse the kick-phase support. | 5 | 4 | 3 | 4 | 4 | yes | 4.1 |

## Decision

**O4**: Hybrid of O2 and O3. One kick-event input path (O2's ordered, allocation-free queue), then two structurally different bounded attempts, both prototyped offline first. Attempt A is O2's in-tracker kick-phase model, with a veto, hysteresis and a fill hold. Attempt B, only if A misses, is O3's output-layer kick offset. Stretch slices reuse the kick-phase support.

O4 is the top scorer. D11 failed because its premise was not checked before app code, so O4 prototypes offline first and isolates the new input path in its own identity-tested slice. O1 resembles D11's kick-preferring correction, which reached only 149.5 ms. O2 is the strongest single attempt, and O3 is a structurally different fallback that suits D4's two attempts. O3 alone drifts from BeatTracker's own grid.

**Approach:**
- S0 records post-merge main (after the D11 PRs) as the baseline, plus the kick-to-tap lead measured across every tapped track, not only summer2000
- S1 adds the input path with no behavior change: rhythmTracker forwards the batch onsets, the analyzer's KickQueue releases band-0 events in time order before the first frame at or after them, and BeatTracker.pushKick records them. The offline replay (scorecard, trace:beats) uses the same path. Identity spec
- S2 prototypes A and B in trace:beats with --set on summer2000 and the weak tracks, against pre-registered grids, and commits an it.fails synthetic (disagreeing envelope plus a fill) shown failing on main
- S3 ships attempt A (O2) if it meets AC1 and AC2; otherwise it is recorded
- S4 ships attempt B (O3) only if A missed. If both miss, summer2000 is accepted at its measured value (D4)
- S5 closes the required cells with live runs; S6 beat presence and S7 bar-level read the kick-phase support

## Design

Baseline, input path, model behind off-by-default constants, offline go/no-go, then up to two enabling slices, then close, then stretch. S0 runs after the D11 PRs merge. It re-runs scorecard, sweep:gate, bench, size and the live cells, and rewrites the baseline in its own commit. It measures the kick-to-beat lead on the delivered stream, separately for the tapped and the synthetic tracks, and checks whether beatless and 6-8-time carry kick events at all, which decides S6 and S7. S1 adds the input path with no behavior change. analyzer.pushKicks(batch) is called once per batch, before that batch's frames, by rhythmTracker.onMessage and by every offline runner (scorecard replay.ts, beatTraceRunner, ablateRunner, setDirector, bench-tracker), so live and offline share one entry. Worklet events lag their frames (2-frame lookahead, 2-frame batches), so each event is delivered in arrival order with its own timestamp, which is at or before the latest frame time. A preallocated KickQueue holds band-0 events and clears on hardReset, a hard boundary and a time-base restart. S1 commits golden digests from post-merge main, and the bench gains BandOnsets with kick events. S2 commits KickPhaseModel and attempt B with every constant defaulting off, plus the trace columns and the specs, so what S2 measures is what ships. Attempt A: a decayed, strength-weighted kick histogram over the beat period. It is off while support is below KICK_SUPPORT_FLOOR. It vetoes envelope corrections that move the grid away from strong kick support. A kick-driven move bypasses the PHASE_MIN_BEATS and PHASE_SHIFT_BEATS streak gate, which D11 showed the rival never passes, and uses its own gate: margin above KICK_VETO_MARGIN for KICK_MOVE_BEATS consecutive beats. The per-beat correction freezes during a fill, defined as the coefficient of variation of the kick intervals over the last KICK_FILL_BEATS beats above KICK_FILL_CV while the envelope stays strong. It releases after KICK_RELEASE_BEATS with no support, or when kicks disagree with a sustained envelope phase for KICK_RECOVER_BEATS. The lead constant is applied only if the tapped and synthetic leads agree within 10 ms; otherwise there is no constant, and the hysteresis absorbs the lead. Attempt B offsets the analyzer's anchorTime inside updatePhase, so beatPhase, nextBeatTime, beatCount and barPhase move together, and measureBeat and the meter read the shifted anchor, keeping bar evidence on the visible beat. S2's go/no-go for S3: offline summer2000 at most 40 ms with AC2 green, the first kick-driven move at or before about 12 s or the hold covering the 12-14.8 s fill, and the grid within 40 ms of the taps before 18 s. S3 enables A, and S4 enables B only if A missed. If both miss, summer2000 is accepted at its measured value (D4). No phase move bumps gridEpoch (D7).

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| Forwarding | Pass the onsetBand, onsetTime and onsetStrength of each FeatureBatch to the analyzer | app/features/rhythm/rhythmTracker.ts |
| KickQueue | Preallocated ring of band-0 events, released in time order against frame times, with an overflow counter | app/features/rhythm/kickQueue.ts |
| KickPhaseModel | Decayed kick-phase histogram with lead compensation, support and margin, and resets | app/features/rhythm/kickPhase.ts |
| BeatTracker | pushKick; attempt A's veto, hysteresis and fill hold | app/features/rhythm/beatTracker.ts |
| RhythmAnalyzer | Drains the KickQueue per frame; attempt B's output offset | app/features/rhythm/rhythmAnalyzer.ts |
| Trace tool | Feeds real kick events in replay and prints kick support, margin, veto and hold per beat | scripts/rhythm-tools/beatTrace.ts |

### Contracts (freeze before dependent work)

- **C1 tracker.state beat contract** (internal API): beatPhase, nextBeatTime, beatCount, barPhase, lastBeatTime, periodSeconds, gridEpoch, phaseShiftCount and gridHitShare keep post-merge meaning. A phase move never bumps gridEpoch and increments phaseShiftCount; beatCount never decreases. Under attempt B, the offset is applied to the analyzer's anchorTime in updatePhase, so beatPhase, nextBeatTime, beatCount and barPhase move together, and measureBeat and the meter read the shifted anchor. The derived beat (nextBeatTime - time)/(1 - phase) in the replay equals the declared beat, by spec.
- **C2 Kick input path** (internal API): analyzer.pushKicks(band, time, strength, count) is called once per FeatureBatch, before its frames, by rhythmTracker.onMessage and by every offline runner (scripts/scorecard/engine/replay.ts, scripts/rhythm-tools/beatTraceRunner.ts, ablateRunner.ts, setDirector.ts, scripts/bench-tracker.ts). FeatureBatch and FEATURE_MESSAGE_VERSION are unchanged. Band-0 events go into a preallocated KickQueue (capacity at least the worklet's per-batch onset capacity, oldest dropped on overflow, counted). They are delivered once each, in arrival order, with their own timestamp (at or before the latest frame time), to BeatTracker.pushKick(time: number, strength: number): void. The queue and model clear on hardReset, a hard boundary and a time-base restart. With the model off, output equals the golden digests.
- **C3 Tracker constants** (config): Named exports in rhythmConfig.ts, all defaulting off until S3 or S4 enables them: KICK_QUEUE_CAPACITY, KICK_LEAD_SECONDS (0 unless S0's tapped and synthetic leads agree within 10 ms), KICK_PHASE_BINS, KICK_PHASE_DECAY, KICK_SUPPORT_FLOOR, KICK_VETO_MARGIN, KICK_MOVE_BEATS, KICK_FILL_BEATS, KICK_FILL_CV, KICK_RELEASE_BEATS, KICK_RECOVER_BEATS, KICK_OFFSET_RING, KICK_OFFSET_HYSTERESIS. All are overridable with ablate:rhythm --set and trace:beats --set. No runtime flag ships.
- **C4 Kick-phase getters** (internal API): Read-only BeatTracker getters kickSupport (peak share, 0 to 1) and kickMargin (support at the best phase minus support at the grid phase), 0 with no kicks. Used by the trace tool and the stretch slices; not in tracker.state.

### Data

No persisted app data. The tapped .beats.json stay read-only. The baseline is rewritten by S0, then by each slice that improves cells, in its own commit after AC2 passes.

### UX

No UI change. On summer2000 the visuals' beat should sit on the kicks within a few beats of enough kick evidence and stay there through the fill. Elsewhere nothing should change.

### Accessibility

No change: no UI surface.

### Security and privacy

No change: client-side only. The audio stays local and is never committed.

### Observability

trace:beats prints kick support, margin, veto, hold and the KickQueue overflow count per beat. The scorecard cells and the existing debug:viz telemetry (gridEpoch, phaseShiftCount) cover the rest.

### Rollout and rollback

One PR per slice. S0, S2 and S5 are docs or test titles when nothing ships; S1 is refactor(rhythm); S3, S4, S6 and S7 are fix(rhythm). Each tracker PR runs scorecard, scorecard:check, sweep:gate, bench:tracker and size, lists every changed cell, and gets checked on the Cloudflare preview and with npm run dev. Any size-limit raise (at most 341.5 kB) goes in the PR that needs it, with the reason. If a D11 PR changes before merging, S0 is re-run first. Rollback is a PR revert.

## Test strategy

- **Unit:** kickQueue.test.ts: arrival-order, exactly-once delivery with the worklet's lagging batch shape, overflow drop and count, clear on reset, no allocation after construction. A parity spec: the same batches through RhythmTracker.onMessage and the replay loop give identical pushKick calls. Golden digests from post-merge main with kicks fed and the model off. beatTracker.test.ts: disagreeing envelope plus fill keeps the kick phase under A; steady-but-wrong kicks and a tempo ramp recover within KICK_RECOVER_BEATS; support below the floor equals model off; resets; gridEpoch kept and phaseShiftCount bumped on moves; beatCount monotonic under B's offset; the replay's derived beat equals the declared one under B; the S2, S4b and S7 specs unchanged. Coverage stays at 95 percent or more.
- **Integration:** Offline: npm run scorecard, scorecard:check (exit 0, no hash change), sweep:gate, eval:rhythm --alignment, and trace:beats with kick events on summer2000, low-bpm-rnb and the weak tracks. Pre-registered grids, with all results in the PR.
- **End-to-end:** npm run test:e2e after build: every visualizer renders, no console errors, contexts released.
- **Manual:** npm run dev and debug:viz on summer2000 with the dancer and cubes. scorecard:live for the dancer from the main checkout, one run at a time on an idle machine, repeating outliers.
- **Non-functional:** npm run size at most 341.5 kB total JS. bench:tracker median ratio at most 1.25 against post-merge main, interleaved. All new state is preallocated typed arrays.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Constants overfit summer2000 | medium | high | The lead constant is applied only if the tapped and synthetic leads agree. Grids are fixed before running (S2). The synthetic and weak tracks must be no worse (AC2). The whole grid goes in the PR. |
| K2 | Kicks sit off the beat on syncopated tracks, and the veto holds a wrong phase | medium | high | Kick-driven moves need a sustained margin; the release rule; syncopation-no-kick and syncopationbass are in AC2; an off-beat kick spec. |
| K3 | Even with lead compensation, the kick timing spread keeps summer2000 above 40 ms | medium | medium | S2 measures both attempts offline before app code. D4 caps it at two attempts, then accepts the measured value. |
| K4 | The offline replay and the live path deliver kicks differently | low | medium | One pushKicks entry is called by onMessage and all five runners. A parity spec with the worklet's lagging batch shape. S5's live runs. |
| K5 | Bundle or CPU over budget | low | medium | Fixed rings and O(bins) work per beat; size and bench in every PR; the raise is at most 3 kB. |
| K6 | A D11 PR changes or is dropped before merging, which invalidates the baseline | medium | low | S0 runs only after the merges and is re-run if any of them changes. |
| K7 | The veto or hold freezes a wrong grid on music the scorecard lacks (kicks steady while the groove shifts, ramps, mislabeled bass kicks) | medium | medium | Disagreement release after KICK_RECOVER_BEATS, the support floor, and the AC5 steady-but-wrong and ramp synthetics. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S0 | Post-merge baseline, kick lead and stretch check: After the D11 PRs merge: run scorecard, sweep:gate, bench, size and scorecard:live for the dancer on main, and rewrite the baseline in its own commit. Measure the kick-to-beat lead on the delivered stream, separately for tapped and synthetic tracks. Check whether beatless and 6-8-time carry kick events and what their support and bar pattern look like, and cancel S6 or S7 if not. Record everything in hub-scorecard.md as the before values |  | AC2, AC8 |  | R0 | S | docs/agents/hub-scorecard.md, docs/agents/hub-scorecard.baseline.json, docs/agents/hub-scorecard.live.json |
| S1 | Kick-event input path, no behavior change: Add analyzer.pushKicks, called per batch by rhythmTracker.onMessage and all five offline runners, plus KickQueue with clearing on reset and BeatTracker.pushKick (store only). Add golden digests from post-merge main, the parity and lagging-shape specs, and BandOnsets with kick events in the bench | S0 | AC3, AC4 | C1, C2 | R1 | M | app/features/rhythm/rhythmTracker.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/kickQueue.ts, app/features/rhythm/kickQueue.test.ts, app/features/rhythm/beatTracker.ts, app/features/rhythm/rhythmConfig.ts, scripts/scorecard/engine/replay.ts, scripts/rhythm-tools/beatTraceRunner.ts, scripts/rhythm-tools/ablateRunner.ts, scripts/rhythm-tools/setDirector.ts, scripts/bench-tracker.ts, scripts/rhythm-tools/benchTracker.ts |
| S2 | Kick model and attempt B behind off-by-default constants, with offline go/no-go: Commit KickPhaseModel (attempt A) and attempt B's anchor offset, with every C3 constant defaulting off, plus the C4 getters, the trace columns (support, margin, veto, hold, first kick move time, first time within 40 ms of the taps) and the AC5 specs. The disagreeing-envelope-plus-fill spec is it.fails, shown failing on main. Run the pre-registered grids on summer2000, the weak and the synthetic tracks. Go/no-go for S3 is set in the design; record the outcome for A and B | S1 | AC1, AC4, AC5 | C1, C3, C4 | R1 | M | app/features/rhythm/kickPhase.ts, app/features/rhythm/kickPhase.test.ts, app/features/rhythm/beatTracker.ts, app/features/rhythm/beatTracker.test.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmConfig.ts, scripts/rhythm-tools/beatTrace.ts, docs/agents/hub-scorecard.md, .size-limit.json |
| S3 | Attempt A: enable the kick-phase guard: Only if S2's go/no-go passed for A: enable A at S2's constants, flip its it.fails, and ship if AC1 and AC2 hold. Otherwise record the miss | S2 | AC1, AC2, AC4, AC5 | C1, C3 | R2 | S | app/features/rhythm/rhythmConfig.ts, app/features/rhythm/beatTracker.test.ts, docs/agents/hub-scorecard.md |
| S4 | Attempt B: enable the anchor offset: Only if A missed: enable B at S2's constants, and ship if AC1 and AC2 hold, including the meter, downbeat and dance-clip cells. Otherwise record it and accept summer2000 at its measured value (D4). When A shipped, S4 is recorded as not needed | S3 | AC1, AC2, AC4, AC5 | C1, C3 | R2 | S | app/features/rhythm/rhythmConfig.ts, app/features/rhythm/rhythmAnalyzer.test.ts, docs/agents/hub-scorecard.md |
| S5 | Close required cells with live runs: Once S3 has merged, or S3 and S4 are recorded: run scorecard:live for the dancer and cubes, remove it.fails markers that now pass, rewrite the baseline, and record the before and after of every cell in the status table, including AC7 dance-clip consistency and gate seconds | S3, S4 | AC1, AC8 | C1 | R1 | S | docs/agents/hub-scorecard.md, docs/agents/rhythm-stability-results.md, docs/agents/hub-scorecard.live.json, docs/agents/hub-scorecard.baseline.json |
| S6 | Stretch: beat presence from kick support: Only if S0 found that beatless's kick support separates it: block the hub's tempo lock while kick support on the proposed period is below a floor. Ship if beatless never locks and no kick track's first lock is later by more than 0.5 s; otherwise revert and record | S5 | AC6, AC2 | C3, C4 | R2 | M | app/features/rhythm/tempo.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmConfig.ts |
| S7 | Stretch: bar-level beat from kick patterns: Only if S0 found that 6-8-time's kicks carry a bar pattern: score bar lengths of 2, 3, 4 and 6 eighths from the kick pattern to pick the beat level on 6-8-time and half-time-shuffle (and check the 3/4 at 180 it.fails). Ship if AC7 and AC2 hold; otherwise revert and record | S5 | AC7, AC2 | C3, C4 | R2 | L | app/features/rhythm/tempo.ts, app/features/rhythm/meter.ts, app/features/rhythm/rhythmConfig.ts, docs/agents/rhythm-stability-results.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Are worklet onsetTime (window centre) and frame times on the same clock with a fixed offset? Settled by S1's ordering spec | implementer of S1 | no |
| Q2 | Should a kick-driven phase move be slewed over a beat or two, to soften the known abrupt re-align? | implementer of S3, confirmed by Trevor | no |
| Q3 | If both attempts miss, does summer2000 need a full multi-hypothesis particle-style tracker plan, or is acceptance final? | Trevor | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | C2, AC3 and S1 get the ordering direction wrong. They guard against a batch's events that 'lead its frames' and release each kick 'before the first frame at or after its time'. In the worklet the events lag. BandOnsets decides a candidate frame ONSET_LOOKAHEAD_FRAMES (2) later (bandOnsets.ts:278, 299, 305), and BATCH_FRAMES is 2, so an event's time is usually older than its own batch's first frame. rhythmProcessor.worklet.test.ts:318-341 asserts this and requires crossings > 0. By the time pushBatch sees a kick, frames later than it have already been analysed. The plan's release rule cannot be met, and a spec built on 'leading' events would pass while the real shape goes untested. The kick also reaches the model about 25 to 45 ms after its timestamp. That delay changes what KICK_LEAD_SECONDS and the 'hold' timing mean. | Changed the plan. C2 and AC3 now say events lag: delivered once, in arrival order, with their own timestamp, before the first frame of the batch that carried them. The spec uses the worklet's lagging fixture, and the lead is measured on the delivered stream (S0). |
| F2 | high | C2 says the offline replay 'uses the same call' as the live path (pushBatch), and K4 relies on that. It does not. The scorecard's deliver() (scripts/scorecard/engine/replay.ts:303-326) calls analyzer.pushFrame per frame, with updatePhase between frames, and hands the batch to the hub only afterwards. beatTraceRunner.ts:51-74, ablateRunner.ts:16-37, setDirector.ts:129-182 and scripts/bench-tracker.ts do the same. A drain placed in pushBatch is never exercised by the scorecard, trace:beats or ablate, so the offline wins that decide S3 and S4 would use different delivery code from the live app. S1's draft_paths cover only scripts/scorecard/ and omit scripts/rhythm-tools/ and bench-tracker.ts. | Changed the plan. One analyzer.pushKicks entry is called by onMessage and all five runners, listed in S1's draft_paths, with a parity spec (AC3). |
| F3 | high | Attempt B and C1 are inconsistent with what consumers read. C1 says B puts the offset on 'nextBeatTime and beatCount' and that the hub, gate and dancer 'read only tracker.state'. They read beatPhase and beatCount (replay.ts:260-275, computeDanceTiming), and the scorecard and eval/detect.ts:85 derive the beat time from beatPhase plus nextBeatTime ((nextBeatTime - time)/(1 - phase), replay.ts:318). Shifting nextBeatTime without beatPhase corrupts the derived period and the measured error. Shifting beatCount alone moves nothing visible. The offset D11 measured is large: kicks sit 0.25 to 0.375 beat, about 120 to 175 ms, from the grid. BeatTracker, measureBeat(lastBeatTime), meter, downbeat bookkeeping, gridHitShare and the boundary tempo cue would all stay on the unshifted grid. That puts accent and bar evidence about 0.3 beat from the beat the user sees. AC2 lists no barPhase or meter cell. Moving the offset in an output layer is also a different thing from 'a phase hold' and is easy to game on the one cell. | Changed the plan. B offsets anchorTime in updatePhase, so beatPhase, nextBeatTime, beatCount and barPhase move together, and measureBeat and the meter read the shifted anchor (C1). There are specs for monotonic beatCount and the derived beat equalling the declared one, and AC2 adds the meter, downbeat and dance-clip cells for S4. |
| F4 | high | AC4 (bench ratio at most 1.25) cannot measure the new cost. scripts/bench-tracker.ts and benchTracker.ts feed only OnsetExtractor/packFrame frames. They run no BandOnsets and send no kick events, so KickQueue and KickPhaseModel never run, and the ratio against main stays near 1.0 whatever the model costs. Per-beat histogram work lands on the live main thread next to the visualizer. AC3's 'identical to post-merge main' is also not a repository-checkable statement: a unit spec has no main to compare against. | Changed the plan. The bench runs BandOnsets and feeds kicks, and reports kickless and with-kicks ratios (AC4, S1). AC3 now checks committed golden digests from post-merge main. |
| F5 | high | S2 is circular and its contracts are not frozen before use. S2 must run A and B and print 'support, margin, veto and hold' (C4), but kickPhase.ts and the beatTracker.ts changes are not in S2's draft_paths. They arrive in S3 and S4. C3 (the KICK_* constants) and C4 (the getters) are attached to S1 and S2 although their code ships later. The likely outcome repeats D11. The prototype is scratch, uncommitted code, the S2 record says 'A works at constants X', and S3 re-implements it. The reimplementation then differs, and the pre-registered grid no longer describes what shipped. S2 is also marked R0 while it commits an it.fails spec and changes trace tooling. | Changed the plan. S2 commits the model and B behind off-by-default constants with C3 and C4, at R1, with a go/no-go. S3 and S4 only enable constants, so what is measured is what ships. |
| F6 | high | KICK_LEAD_SECONDS is taken from kick-to-tap offsets on 'every tapped track' (S0, O4, K1). A tap lead includes the tapper's latency, and the .beats.json files are human taps. D11 S1 shows taps jittering up to 50 ms and kick-to-tap quartiles of -73 and +9 ms around the 31 ms median. The synthetic tracks have exact sidecar beats with kicks on the beat, and alignment.test.ts holds them to a median error of 20 ms or better. A constant compensation applied wherever the kick model acts shifts those by about 31 ms. AC2 names only passing cells with a tolerance and no synthetic-alignment guard. An error floor of about 31 ms against a 40 ms target also leaves very little room. | Changed the plan. S0 measures the lead separately for tapped and synthetic tracks, the constant is applied only if they agree within 10 ms (C3), and AC2 guards the synthetic alignment cells. |
| F7 | medium | Attempt A's kick-driven move re-uses the evidence class D11 measured as a miss: kick events as a phase histogram (153 ms) and a half-beat flip (176 to 199 ms). The plan's non-goals forbid retrying 'kick-weighted phase bins'. What is new is the veto and the fill hold, which is a fair reading of the 'slides off within 2 s' result. Three gaps remain. It is not stated whether the kick-driven move uses the existing phaseBeats streak gate (PHASE_MIN_BEATS and PHASE_SHIFT_BEATS), which D11 found the rival never passes, or bypasses it. There is no timeline: lock is at 8.0 s, kicks are regular before the fill only partly (42 of 58 taps have one within 150 ms), the fill is 12 to 14.8 s, and the latest first move that still allows AC1 is about 18 s. A hysteresis of N beats on a decayed histogram may only fire after the fill ends. The fill hold is defined as 'envelope strong, kicks irregular', with no measure of irregular. | Changed the plan. The kick-driven move bypasses the phase streak gate and uses KICK_VETO_MARGIN for KICK_MOVE_BEATS. A fill is defined numerically (KICK_FILL_CV over KICK_FILL_BEATS). S2 records the first move time and the first time within 40 ms, with a go/no-go of a move by about 12 s or a hold covering the fill. |
| F8 | medium | The veto and hold can freeze a wrong grid in cases the scorecard does not contain: a real phase change that the kicks do not follow (a drum loop that stays steady while the groove shifts), a ramp, and live sources with sparse or mislabeled kicks (bass notes classified as kick, which the plan already lists under bassline-kick-120). The release rule (M beats with no kick support) fires only when kicks vanish, not when they stay but disagree. The tests list 'off-beat kicks release after KICK_RELEASE_BEATS', but no case has kicks present, steady and wrong. | Changed the plan. Disagreement release (KICK_RECOVER_BEATS), the support floor, and steady-but-wrong and ramp synthetics are in AC5 and K7. |
| F9 | medium | Stretch slices S6 and S7 (beat presence, bar level) rest on an unchecked assumption that kick support separates beatless and 6-8-time. D11's S6 note says beatless has a real 140 bpm periodicity that no presence signal told apart from a beat. A track whose kicks are periodic will also show high kick support on the proposed period. S7 is sized L, and S8 found the missing evidence is the bar itself (6 eighths), which a kick-onset pattern may not carry on 6-8-time. Both depend on S5, which depends on S4, a conditional slice. | Changed the plan. S0 checks the kick events on beatless and 6-8-time and cancels S6 or S7 if they carry no usable evidence. S4 is recorded as not needed when A shipped, so S5's dependency always completes. |
| F10 | low | AC2 requires every gate.secondsAfterLock cell on a passing track not to rise by more than 0.5 s, while D6 and the non-goals say gate seconds are reported and not tuned. summer2000, half-time-shuffle and lonley are already failing, so the check is hard to read on the tracks most likely to move. 'no .beats.json hash changed' holds trivially. K4 and C2 also never say what happens to queued kicks on analyzer reset, hardReset, song change, or worklet restart after skipped blocks (the worklet restarts the time base and resets BandOnsets), so stale kick times could survive a reset. | Changed the plan. Gate-seconds checks are scoped to cells passing on post-merge main, failing ones are reported only, the trivial hash clause is dropped, and reset clearing is in C2 and AC3. |

## Hand-off

A verified-diamond draft DAG with 8 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `adab355eaff8d068`).
