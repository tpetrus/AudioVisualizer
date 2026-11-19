# Hub regressions vs acceptance benchmarks
> Double-diamond plan `hub-regressions` revision 1 | status **final** | lane full | risk R2 | base 8b64efc06235 | updated 2026-11-17T23:31:52.878Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> if you look at the last session, youll as we were implementing the hub plan, we've had some regressions for some of the visualizations.  Let's take a hard look at every metric that is not being met by acceptance criteria based on what is currently in origin main, and divulge possible solutions that will help us meet our benchmarks for all files in ./debug-in.

## Problem

Since the audio hub (PR 95) and the dancer hub-bass commits, some visualizers react worse than before and several acceptance criteria from the audio-engine-alignment and rhythm-stability-followups plans are failing or unmeasured on the .debug-in tracks. Nobody has a current per-track, per-metric scorecard, so fixes are tuned against single tracks and break others.

**Users:** Trevor, the developer tuning visualizers against .debug-in; Viewers watching hub-fed visualizers (dancing character, cubes and others) react to music

**Evidence:**
- Gate timing regressed: imyourgirl 0.3 s to 2.8-3.0 s, summer2000 3.5 s to 4.0-7.9 s (rhythm-stability-results.md:33-35)
- Cubes threshold crossings fell from about 30 to 17 of 61 beats after hub migration while the migration check passed (audio-presentation-audit.md:66-78)
- Onset F below 0.9: no-kick-124 bass 0.67, bassline-kick-120 kick 0.76 (audio-alignment-findings.md:136-141)
- Gate within 4 s fails on lonley 8.0 s and syncopationbass 16.8-17.9 s; clip spread p95 0.199 to 0.53 against 0.05
- Hub bands are normalized to a running peak (hubConfig.ts:12-20) while bassGateConfig thresholds were tuned on raw BassPulse RMS
- Six .debug-in tracks have no .beats.json; 2026-11-16/17 telemetry in .debug-out was never summarized

## Goals

- Produce a repeatable scorecard of every applicable acceptance metric, for every .debug-in file and every hub-fed visualizer, on the current branch, with a pre-hub reference column
- Identify the cause of each failing or regressed cell, by measurement
- Bring every cell to at least its floor (absolute AC target and no worse than pre-hub) without dropping any other cell, and push reaction cells toward stretch targets above pre-hub
- Make the scorecard a re-runnable no-regression check for later hub work (local, since .debug-in is uncommitted)

## Non-goals

- Upgrading three.js or changing the rhythm tracker architecture beyond what a measured cause requires
- Capture-delay work that needs loopback hardware
- New visualizers or visual redesigns
- Changing CI workflows in tpetrus/ci-workflows

## Success metrics

- Floor: 100 percent of applicable cells pass their floor (absolute AC target and no worse than the pre-hub reference), excluding only cells deferred with user sign-off
- Zero blocking cells that pass at the latest merged baseline fail after any slice
- Stretch, cubes and each hub-fed reaction: at least 90 percent of labelled beats hit within 50 ms with false fires at most 10 percent of fires, on every kick track (pre-hub was about 30 of 61 crossings on drums-128)
- Stretch, dancer gate: engages within 2 s of track start on every kick track (floor 4 s and pre-hub 0.3 s and 3.5 s on imyourgirl and summer2000)
- Stretch, reaction latency: at most 30 ms plus one frame on every visualizer

## Constraints

- Measure on branch feat/s8-dancing-character-hub-bass (D1)
- No allocation per frame; logic outside React; reuse hub, useRhythm, useAnalyser (AGENTS.md rules)
- format:check, lint, typecheck, test:coverage at 95 percent, build and test:e2e pass; bundle within .size-limit.json
- Rhythm changes need live checks on all real tracks (rhythm-stability-results.md:254)
- Telemetry stays in git-ignored .debug-out; .debug-in audio is not committed

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the current branch and every WAV in .debug-in | the scorecard script runs eval:rhythm --alignment, sweep:onsets and debug:viz on each hub-fed visualizer plus cubes and trio-color-wave, 4 runs per track | a committed scorecard lists every applicable metric x track x visualizer cell (per the applicability matrix, n/a cells shown and not counted) with floor, stretch, pre-hub reference, measured value, spread, source and pass or fail; offline cells give identical verdicts on rerun, and live cells pass when at least 3 of 4 runs pass |
| AC2 | the six tracks without .beats.json (high-bpm-dnb, low-bpm-rnb, 6-8-time, half-time-shuffle, drifting-tempo, beatless) | ground truth is made with tap:beats and the tap calibration | each has a .beats.json (beatless carries an explicit no-beat truth) and appears in every metric the applicability matrix marks applicable for its class (tapped, drifting or beatless) |
| AC3 | every .debug-in track with a beat | recorded after lock | reported bpm, octave-normalized to the truth, stays within 2 percent of it, using local bpm from the tapped beats per 8-beat window on drifting-tempo and the sidecar elsewhere, with zero false song changes; on beatless the tracker never locks |
| AC4 | every .debug-in track with beats in its .beats.json (beatless is n/a) | eval:rhythm --alignment runs | beat error is at most 20 ms on synthetic tracks and at most 40 ms median on tapped tracks |
| AC5 | every track with labelled onset truth (the synthetic tracks, including no-kick-124 from .debug-in and bassline-kick-120) | sweep:onsets runs | per-band onset F is at least 0.9 at 50 ms, including no-kick-124 bass and bassline-kick-120 kick |
| AC6 | every kick track in .debug-in played through dancing-character | recorded with debug:viz | the bass gate engages within 4 s of track start and no later than the pre-hub reference column measured by the same scorecard; the 2 s stretch is reported per track |
| AC7 | each real .debug-in track played 4 times (fresh loads and re-select) | compared with debug:repeat | in at least 3 of 4 runs the dance clip phase stays within 0.05 of a loop of the run median after lock, and lock times are within 2 s of each other |
| AC8 | drums-128 and every kick track on cubes and each other hub-fed visualizer | recorded with debug:viz | the beat hit share (labelled beats with a reaction crossing within 50 ms, defined once in targets.ts) is no lower than the pre-hub reference column and reaction latency is no worse than it; the 90 percent hit share and 30 ms plus a frame stretch are reported per cell |
| AC9 | a real dotted song change from 100 to 150 bpm, and a dotted passage with the old pulse still present | the tracker runs on each | the change raises a soft boundary and songChangeCount rises once the old pulse's support collapses, the dotted passage raises nothing, and eval:rhythm false song changes stay 0.00, as in rhythm-stability-followups AC6; if the probe shows they cannot be separated, AC9 is deferred to a separate plan with user sign-off |
| AC10 | every hub-fed visualizer | its source is inspected and its scene runs | it takes bands and onsets only from the hub, with no private band or onset analysis, and its reaction cell measured before and after the move does not drop |
| AC11 | two hub-fed visualizers opened in either order in one page session | each is recorded on the same track | their hub signals and reaction telemetry match within the AC1 spread |
| AC12 | any fix slice | it is merged after rerunning the full scorecard | no blocking (offline) cell that passed at the latest merged baseline fails, no live cell median worsens by more than the run-to-run spread recorded in S3, missing tracks show as unavailable and never pass, a changed .beats.json hash fails the check until the baseline is regenerated, and all repository checks and budgets pass |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Which code is the baseline measured on? | The current branch feat/s8-dancing-character-hub-bass only (it contains origin/main plus 3 dancer-hub commits) | user | User chose round 1 |
| D2 | Which visualizers are in scope? | Every visualizer that reads signals from the audio hub, plus cubes and trio-color-wave as reference controls | user | User chose round 1 |
| D3 | How do .debug-in tracks without .beats.json count? | Tap ground truth first: a slice produces .beats.json for every .debug-in track that lacks one so every metric applies to every file | user | User chose round 1 |
| D4 | What wins when fixes conflict? | Hit every AC with no trade-offs: a fix is accepted only if no track or metric drops below target | user | User chose round 1 |
| D5 | Which plans define the benchmarks? | docs/plans/audio-engine-alignment (hub) and docs/plans/rhythm-stability-followups (rhythm targets) | repo-fact | Scout brief |
| D6 | Beat error target for tapped real tracks | At most 40 ms median, since tap jitter makes the 20 ms synthetic target unfair | user | User confirmed 40 ms median in round 2 |
| D7 | Is the framing (problem, goals, non-goals, AC1-AC12) right? | Confirmed as written | user | Full-lane checkpoint, round 2 |
| D8 | Measure a pre-hub reference? | Yes: run the same scorecard once on the commit before the hub merge (b449f56 first parent) in a worktree as a reference column; the current branch stays the baseline | user | Round 3; doc numbers came from a different harness |
| D9 | Are pre-hub values the goal? | No: pre-hub is the floor and stretch targets are set above it where better is possible | user | Round 3: 30 of 61 beats is still many misses |
| D10 | Stretch target numbers | 90 percent beat hit share at 50 ms with at most 10 percent false fires; gate within 2 s; latency at most 30 ms plus a frame; confirmed or adjusted at the S3 review | planner assumption (confirm) | Hit share and false-fire bound are the planner's; 30 ms comes from the hub plan click target; user to confirm |
| D11 | Failures that predate the hub | Own slices (gate rule, clip phase, tempo); if a fix needs a gate or tracker redesign the cell is deferred to a separate plan with user sign-off at review and excluded from the 100 percent | user | Round 3 |
| D12 | Keep AC10 migration? | Keep as a late slice, gated on a before and after reaction cell per visualizer; bass-ink moves only onto the gate input S4 proves | user | Round 3 |
| D13 | Do live cells block merges? | No: offline cells block; live cells are advisory, pass at 3 of 4 runs, and regress only when the median worsens beyond the S3 run-to-run spread | user | Round 3 |
| D14 | Which metrics apply to which tracks? | Applicability matrix by class: onset F only on tracks with labelled onsets (synthetic); beat error and hit share n/a on beatless; drifting-tempo uses local bpm | repo-fact | onsetSweepRunner.ts:23-33 scores F only on labelled synthetic tracks (critic F2) |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Add one scorecard script that wraps the existing eval, sweep and debug tools into a committed pass/fail table, then fix only the measured failing cells, starting by retuning bassGateConfig thresholds to the hub's peak-normalized bass. | 4 | 3 | 4 | 2 | 4 | no | 3.45 |
| O2 | robust | Build a deterministic scorecard with a committed baseline and a no-regression diff gate, then fix causes at the hub boundary by adding an absolute-scale (non-peak-normalized) band output and moving every private band or onset path onto the hub. | 4 | 3 | 2 | 4 | 3 | yes | 3.25 |
| O3 | contrarian | Stop tuning each visualizer against live browser runs: make the hub emit a fixed-reference (absolute) band so thresholds tuned on raw RMS still hold, and make the scorecard an offline, deterministic replay of hub plus gate over the WAVs, committed as a ratchet baseline. | 4 | 3 | 3 | 3 | 4 | no | 3.4 |
| **O4** (chosen) | hybrid | Hybrid of O3 and O2: an offline, deterministic scorecard (hub plus gate plus tracker replayed over every .debug-in WAV) as the tuning loop and ratchet, a thin live wrapper over debug:viz and debug:repeat only for browser-only metrics, a measured cause for every failing cell before any fix, then an additive absolute-scale hub band channel, an onset retune, tempo follow-ups and migration of the private analysis paths, each slice re-scored with no cell allowed to drop. | 4 | 4 | 2 | 5 | 4 | yes | 3.75 |

## Decision

**O4**: Hybrid of O3 and O2: an offline, deterministic scorecard (hub plus gate plus tracker replayed over every .debug-in WAV) as the tuning loop and ratchet, a thin live wrapper over debug:viz and debug:repeat only for browser-only metrics, a measured cause for every failing cell before any fix, then an additive absolute-scale hub band channel, an onset retune, tempo follow-ups and migration of the private analysis paths, each slice re-scored with no cell allowed to drop.

O4 is the top scorer and the only option besides O2 that covers every AC, which D4 requires. It keeps O3's deterministic offline loop, so tuning one track cannot silently break another, and it uses O2's breadth for the onset, tempo, migration and order-independence work. Unlike O1 it does not retune thresholds against a moving normalized scale, and unlike O2 it does not make slow, noisy live runs the tuning loop.

**Approach:**
- Tap .beats.json for the six tracks that lack one (beatless gets an explicit no-beat truth) so every cell exists (from O1/O2)
- Offline scorecard: decode each WAV and drive the real hub, bassGate, cube trigger and RhythmTracker code headlessly on track time, reusing eval:rhythm --alignment, sweep:onsets and replay:gate paths; write scorecard.json and a markdown table (from O3)
- Live wrapper: run debug:viz and debug:repeat 4 times per real track only for clip spread, lock spread, reaction latency and order independence; median-of-4 with a per-metric tolerance (from O2)
- Ratchet: a committed baseline plus scorecard:check that fails if any baseline-passing cell fails; every fix slice runs it before merge (O2 and O3)
- Cause isolation first: replay the gate and cube trigger on raw BassPulse-scale versus hub normalized bass over the recorded and offline inputs and record which cells each cause explains, in a findings doc, before code changes
- Additive hub change: absolute-scale band channel next to the normalized one; dancer gate and cubes threshold read it so pre-hub thresholds keep their meaning
- Separate measured slices for onset F (per-band detector retune with sweep:onsets grids), tempo (syncopation-no-kick wrong lock, dotted 100 to 150 follow), and AC10 migration of cubes bars, bass-ink and trio sheets onto hub bands and hub.onsets, finishing with an order-independence check and an all-green scorecard (from O2)

## Design

Measure first, then fix, one change at a time. S1 completes ground truth. S2 builds the offline scorecard (tracker, onsets, and gate via stepBassGate on hub frames) and the ratchet, with an applicability matrix. S3 adds the live wrapper, a DEV-only raw BassPulse column next to hub bass, the pre-hub reference column from a worktree, the committed baseline and a findings doc giving each failing cell a measured cause and an owning slice; the user then confirms stretch targets, which slices proceed and any deferrals. Fix slices are serialized (S4 gate input, S5 gate rule, S6 onsets, S7 tempo, S8 clip phase, S9 migration), each regenerating and committing the baseline at merge so AC12 compares against the latest merged baseline. S10 adds order independence and closes with every floor met and stretch results reported.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| offline scorecard | Headless deterministic replay of hub, bassGate, cube trigger and RhythmTracker over every .debug-in WAV on track time | scripts/scorecard/ |
| live wrapper | debug:viz and debug:repeat runs (4 per real track) for clip spread, lock spread, reaction latency, order independence | scripts/scorecard/live.ts |
| targets and ratchet | AC targets in code; compare against committed baseline | scripts/scorecard/targets.ts, docs/agents/hub-scorecard.baseline.json |
| findings doc | Cell to cause to slice mapping, updated per slice | docs/agents/hub-scorecard.md |
| hub absolute channel | Fixed-gain bands for threshold consumers | app/features/audio/hub/ |
| consumer migration | Cubes bars, bass-ink and trio sheets read hub bands and hub.onsets | app/features/visualizers/ |

### Contracts (freeze before dependent work)

- **C1 hub gate-input bass** (TypeScript interface): Provisional until the S3 ablation. Hub snapshot gains gateBass: { sub, kick, lowEnd }, a read-only field for threshold consumers (dancer gate, cubes trigger, later bass-ink) whose feature is the one the ablation shows restores gate and hit-share cells: a fixed-scale band, a different smoothing, or lower latency. Written in place each frame with no allocation; existing normalized fields and their semantics unchanged
- **C2 scorecard cell** (JSON schema): scorecard.json is an array of { metric, track, visualizer, class, applicable, floor, stretch, prehub, value, spread, runs, source: offline or live, blocking, pass }, plus a header with targets version and the SHA-256 of each .beats.json; n/a cells have applicable false; missing tracks have value null and pass false with status unavailable
- **C3 scorecard commands** (CLI): npm run scorecard (offline, all WAVs), npm run scorecard:live -- --viz NAME (live cells, 4 runs), npm run scorecard:check (exit 1 listing cells when a blocking cell that passed at the latest baseline fails, when a live median worsens beyond the recorded spread, or when a .beats.json hash differs from the baseline)

### Data

Telemetry and raw runs stay in git-ignored .debug-out; .debug-in audio and tapped .beats.json stay local and uncommitted, so the real-track ratchet is a local discipline run before each merge; CI covers only the synthetic ratchet test. Committed: scorecard.json summary, baseline with sidecar hashes, findings doc.

### UX

No UI change except restored reactions: the dancer gate engages sooner, cubes fire on more beats. Developer UX: one command gives the full pass or fail table.

### Accessibility

No UI surface changes; existing e2e axe checks stay green.

### Security and privacy

Client-side only; no new network calls; audio files are not committed.

### Observability

Scorecard table and baseline diff per slice; existing DEV telemetry columns plus the abs bands added to debug:viz output.

### Rollout and rollback

One PR per slice, serialized, with Conventional Commit titles (S1 to S3 as test or chore except S3's DEV-only telemetry column as chore, fixes as fix). Each fix PR attaches scorecard:check output and its live cells, and commits the regenerated baseline. C1 is additive, so each consumer switch is revertible by reverting its PR; Cloudflare rollback covers production. Visual baselines regenerated in S9 are accepted only with a measured reaction cell that did not drop.

## Test strategy

- **Unit:** Specs beside each new module: scorecard aggregation, targets, ratchet compare, hub abs channel scaling and no-allocation, gate on abs input; keep 95 percent coverage
- **Integration:** Offline scorecard over the synthetic tracks runs in vitest as a ratchet test like scripts/ground-truth/alignment.test.ts; real tracks run locally since .debug-in is not committed
- **End-to-end:** npm run test:e2e after build for every rendering slice; S8 adds an order-independence spec that opens two hub-fed visualizers in both orders
- **Manual:** npm run dev with each real track on each hub-fed visualizer plus cubes and trio-color-wave after S4, S7 and at the end; watch the dancer and cubes, because numbers cannot show whether it looks right
- **Non-functional:** Bundle within .size-limit.json and Lighthouse budget; no per-frame allocation in the hub change; offline scorecard full run under 10 minutes

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Offline replay verdicts disagree with live telemetry | medium | high | S3 compares offline and live cells on the same tracks and records the run-to-run spread; live confirmation is attached to every fix PR; cube trigger is offline only after S4 extracts it into a pure function the hook also calls |
| K2 | Absolute scale does not explain the gate regressions (smoothing or onset timing does) | medium | medium | S3 cause isolation by replay before S4 is built; S4 scope follows the findings |
| K3 | Tempo fixes for syncopation-no-kick and dotted changes ripple to other tracks | medium | high | Ratchet blocks any drop; ablate:rhythm and probe:rhythm before code; S6 may be split if needed |
| K4 | Tapped ground truth on hard tracks (drifting-tempo, 6-8-time) is too noisy for 40 ms | medium | medium | Use tap calibration, tap twice and keep the run with lower self-disagreement; record tap spread in the findings |
| K5 | Migrating cubes bars, bass-ink and trio changes how they look | medium | medium | Visual baselines regenerated and reviewed; manual check in dev; reaction cells must not drop |
| K6 | Bundle budget mismatch (313.25 kB in run-status.md versus 334 kB in .size-limit.json) | low | low | .size-limit.json is the enforced budget; note the stale doc number in S3 |
| K7 | Stretch targets turn out unreachable without redesign | medium | low | Only floors block; stretch results are reported per cell and revisited at the S3 review and the S10 close |
| K8 | Real-track ratchet cannot run in CI because .debug-in is uncommitted | high | medium | Sidecar hashes in the baseline, unavailable never passes, synthetic ratchet test in vitest runs in CI |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Ground truth for six tracks: Tap .beats.json for high-bpm-dnb, low-bpm-rnb, 6-8-time, half-time-shuffle, drifting-tempo; write beatless no-beat truth; record tap spread |  | AC2 |  | R0 | M | .debug-in/ |
| S2 | Offline scorecard and ratchet: Offline cells for tracker, onsets and gate (stepBassGate on hub frames, decoded WAVs, track time) over every WAV; applicability matrix; floors and stretch in targets.ts; scorecard.json and table; scorecard:check with sidecar hashes and unavailable handling; synthetic ratchet vitest. Cube trigger and render stay live until S4 | S1 | AC1, AC3, AC4, AC5, AC9, AC12 | C2, C3 | R1 | L | scripts/scorecard/, package.json |
| S3 | Live cells, pre-hub reference and cause findings: Live wrapper (4 runs, 3-of-4 rule) for clip spread, lock spread, hit share, latency; DEV-only raw BassPulse column in debug:viz next to hub bass and replay of both through stepBassGate; pre-hub reference column from a worktree at the b449f56 first parent; commit baseline; findings doc with cause and owning slice per failing cell; user review of stretch targets, slice go or deferral, and the C1 feature | S2 | AC1, AC6, AC7, AC8, AC12 | C2, C3 | R1 | L | scripts/scorecard/live.ts, scripts/debug-viz/, docs/agents/hub-scorecard.md, docs/agents/hub-scorecard.baseline.json |
| S4 | Hub gate-input bass for dancer and cubes: Add C1 with the feature the S3 ablation picked; extract the cube trigger into a pure function the hook calls and add it to the offline scorecard; dancer gate and cubes read gateBass; meet gate-timing and hit-share floors on imyourgirl, summer2000 and drums-128 | S3 | AC6, AC8, AC12 | C1, C2 | R2 | M | app/features/audio/hub/, app/features/visualizers/dancing-character/, app/features/visualizers/cubes/ |
| S5 | Gate rule for slow-engaging tracks: Bring lonley (8.0 s) and syncopationbass (about 17 s) gate engagement within 4 s via replay:gate rule changes in bassGate and bassGateConfig, or defer with sign-off if a redesign is needed | S4 | AC6, AC12 |  | R2 | M | app/features/rhythm/bassGate.ts, app/features/rhythm/bassGateConfig.ts |
| S6 | Per-band onset retune: Bring onset F to 0.9 on no-kick-124 bass and bassline-kick-120 kick via sweep:onsets grids, without dropping any cell | S5 | AC5, AC12 |  | R2 | M | app/features/audio/hub/, app/features/rhythm/rhythmConfig.ts |
| S7 | Tempo follow-ups: Fix syncopation-no-kick wrong lock and the dotted 100 to 150 boundary per AC9, keep tempo within 2 percent and beatless unlocked; use ablate:rhythm and probe:rhythm first and defer with sign-off if the tracker needs a redesign | S6 | AC3, AC4, AC9, AC12 |  | R2 | L | app/features/rhythm/ |
| S8 | Dance clip-phase stability: Bring clip-phase and lock spread across fresh loads and re-select within AC7 by fixing the measured re-select phase cause, or defer with sign-off | S7 | AC7, AC12 |  | R2 | M | app/features/visualizers/dancing-character/ |
| S9 | Move private analysis onto the hub: Measure a reaction cell for cubes bars, bass-ink and trio sheets, then move them to hub bands, hub.onsets and gateBass; delete private analysis; accept regenerated visual baselines only with no cell drop | S4, S6, S8 | AC8, AC10, AC12 | C1 | R2 | L | app/features/visualizers/cubes/, app/features/visualizers/bass-ink/, app/features/visualizers/trio-color-wave/ |
| S10 | Order independence and close: Order-independence check in both orders; final full scorecard with every floor met or signed-off deferral; stretch results reported; update findings and results docs | S5, S7, S9 | AC1, AC11, AC12 | C2 | R1 | M | e2e/, docs/agents/hub-scorecard.md, docs/agents/rhythm-stability-results.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Does the offline replay match live telemetry closely enough to be the tuning loop, and at what tolerance? | implementer, answered in S3 | no |
| Q2 | Which fix slices proceed after the S3 findings review? | Trevor at the S3 review | no |
| Q4 | Are the stretch numbers (90 percent hit share, 10 percent false fires, 2 s gate, 30 ms plus a frame) right once the pre-hub column is in? | Trevor at the S3 review | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | C1 and S4 freeze an absolute band channel 'calibrated to BassPulse raw RMS (120 Hz low-pass)' before the cause is measured. Hub bands are the mean of log(1 + 30 * magnitude) frame energy divided by a running peak (audioHub.ts:177-185, hubConfig.ts:17), a different feature from BassPulse's filtered raw RMS, so a fixed gain cannot make the scales match. bassGateConfig.ts also learns the kick phase from BassPulse lag (0.11-0.21 beats) and its thresholds are rise-relative (BASS_GATE_ONSET_RISE 0.08), so smoothing, latency and log compression are as likely a cause as scale (K2). The scale cause is only an inference (brief line 34). gate-replay (gateReplay.ts) replays recorded columns, which hold hub low end only, so hub-era telemetry cannot be replayed on raw BassPulse and 'replay raw vs hub' has no recorded raw input. | Changed: C1 is now a provisional gateBass field whose feature (scale, smoothing or latency) the S3 ablation picks; S3 adds a DEV-only raw BassPulse column so both inputs can be replayed through stepBassGate. |
| F2 | high | AC2 and AC5 cannot be met as written. onset-sweep scores per-band F only against synthetic ground-truth tracks that carry labelled onsets (onsetSweepRunner.ts:23-33); tapped .beats.json tracks get only onset rates and alignment lift (onset-sweep.ts:93-94). The no-kick-124 and bassline-kick-120 failures are synthetic tracks, not .debug-in files. So AC2's 'appears in every scorecard metric' fails for the six tapped tracks, and beatless has no beat error (AC4) or reaction share (AC8). AC3 (2 percent bpm vs sidecar) is also ill-defined for drifting-tempo and 6-8-time, where a single sidecar bpm is not truth. | Changed: added an applicability matrix (D14, C2 class and applicable fields); AC2, AC3, AC4 and AC5 amended; drifting-tempo uses local bpm per 8-beat window; onset F only on labelled tracks. |
| F3 | high | Several target cells have no owning slice. AC6 for lonley (8.0 s) and syncopationbass (16.8-17.9 s) are gate-rule behavior that predates the hub, but S4's draft_paths are hub, dancing-character and cubes, and exclude app/features/rhythm/bassGate*.ts. AC7 (clip spread 0.199-0.53, lock spread) was measured before rhythm S6 and is a re-select phase problem, not a hub-bass one, yet only S3 (measure) and S4 (bass abs) reference it. Goal 'every cell to its target' and D4 therefore have uncovered cells, while the plan counts only 'covers_all_acs'. | Changed: added S5 gate-rule slice for lonley and syncopationbass and S8 clip-phase slice for AC7; findings doc assigns an owning slice per cell; deferral rule D11. |
| F4 | high | AC6 and AC8 are defined relative to 'pre-hub' values (0.3 s, 3.5 s, 30 of 61, 'latency no worse than pre-hub'), but D1 measures only the current branch, and the pre-hub figures come from older docs, measured under different harness and tolerance. Pre-hub reaction latency is not recorded anywhere in the plan. The '30 of 61' is a threshold-crossing count (presentation-audit.md:66-78) while AC8 says 'reaction fires on beats', so metric definitions differ. The regression targets are therefore unmeasurable and may be unreachable. | Changed: S3 runs the same scorecard on the pre-hub commit as a reference column (D8); hit share defined once in targets.ts and used in AC8 and the metrics; stretch targets above pre-hub (D9, D10). |
| F5 | high | The ratchet and AC1/AC12 assume deterministic verdicts, but live cells (clip spread p95, lock spread, reaction latency, AC11) come from a browser with 4 runs and a 'tolerance band'. A cell near its target flips between reruns, which would break 'rerunning gives the same pass or fail' (AC1) and make 'zero cells that pass at baseline fail' (success metric, D4) flap or mask real drops (K1 admits the masking). With a p95 over 4 runs the statistic is just the worst or second-worst sample. | Changed: only offline cells block; live cells pass at 3 of 4 runs and regress only beyond the S3 spread (D13); AC7 replaced p95 with a 3-of-4 rule. |
| F6 | medium | Slice ordering leaves interacting changes parallel. S4, S5 and S6 all depend only on S3 but couple: S5 retunes hub onsets and rhythmConfig, which feed the tracker (S6) and the gate's tempoLocked input (S4, AC6). Rebaselining after each merge is undefined: AC12 says 'passed before the slice' but the committed baseline is made once in S3, so S6 may be measured against a baseline that S4 and S5 have already moved. S4 and S5 both edit app/features/audio/hub/. | Changed: fix slices serialized S4 to S9; baseline regenerated and committed at each merge; AC12 compares against the latest merged baseline. |
| F7 | medium | S2 is sized M and called a 'headless deterministic replay of hub, gate, cube trigger and tracker', but the cube trigger and dancer bass path live in React hooks and three.js scene code (useCubesScene.ts:91-151, useDancingCharacterScene.ts:283-288, dancingCharacterScene.ts:396). Running them in node requires extracting logic or duplicating it, which risks the offline replay testing a copy (K1) and touches production code in a slice marked R1. The 'under 10 minutes' offline budget is unverified. The plan's own gaps (AC5, AC9 need tracker offline replays too) make it larger than M. | Changed: S2 scope lists offline cells (tracker, onsets, gate on hub frames) and is now L; cube-trigger extraction moved into S4 (R2). |
| F8 | medium | S7 (AC10 migration of cubes bars, bass-ink and trio sheets) is not a regression fix and conflicts with the 'no visual redesign' non-goal and D4. bass-ink currently reads raw BassPulse (useBassInkScene.ts:183,218); moving it onto the peak-normalized hub bands could create the same class of regression the plan is chasing. K5 mitigates by 'visual baselines regenerated and reviewed', which turns the e2e visual regression guard into an approval step. There is no pre-hub reaction cell for bass-ink and trio, so AC12 has nothing to protect them. | Changed: S9 measures a reaction cell per visualizer before moving it, bass-ink moves only onto the proven gateBass, and visual baselines are accepted only with no cell drop (D12). |
| F9 | medium | AC9 depends on 'the time set by rhythm-stability-followups AC6' and Q3 leaves that value as a non-blocking open question, though it is in a repo doc. The finding that the dotted 100 to 150 change 'never followed in 30 s' (findings:489-491) means S6 is probably tracker architecture work, which the non-goals forbid beyond a 'measured cause'. AC9 is untestable as written and S6 may be infeasible without breaking D4 (K3). | Changed: AC9 rewritten from rhythm-stability-followups AC6 (no time limit, boundary rule, 0.00 false changes) with an explicit deferral rule; Q3 removed. |
| F10 | medium | The ratchet depends on local, uncommitted data: .debug-in audio and Trevor's tapped .beats.json are not committed, so the committed baseline cannot be reproduced by CI or by anyone else, and scorecard:check behavior with missing tracks is unspecified (skip, fail or pass). Tap truth is operator-specific, so the baseline moves if the six sidecars are re-tapped (K4 even suggests taps are redone). The synthetic vitest ratchet only covers synthetic tracks. The goal 'make the scorecard a re-runnable no-regression check for later hub work' is therefore only locally true. | Changed: C2 header stores .beats.json hashes and targets version; missing tracks show unavailable and never pass; design.data says the real-track ratchet is local (K8). |

## Hand-off

A verified-diamond draft DAG with 10 task(s) and 3 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `0688af7a6cc53ab3`).

## Amendments after hand-off (Trevor, 2026-11-18, at the start of S4)
`plan.json` is hash-locked at revision 1 and is not edited; these decisions override it where they differ.
- **AC6's 4 s floor moves to S5.** No gate input alone opens the dancer's gate within 4 s of the lock except on
  `drums-128` (`docs/agents/hub-scorecard.md`, "C1: a third gate input"), so S4's gate acceptance is: on every kick
  track, the gate opens no later after the lock than the pre-hub reference (offline, with the live median reported).
  S4 still owns the hit share and latency floors of AC8 for `cubes` and `dancing-character`. S5 owns the 4 s floor and
  the 2 s stretch of AC6.
- **C1's shape** is `gateBass: { pulse, lowEnd }`, not `{ sub, kick, lowEnd }`: `pulse` is the linear RMS of the 120 Hz,
  24 dB/octave lowpass over the last 2048 samples (BassPulse's feature) at each worklet frame, read on frame time; `lowEnd`
  is the louder of the hub's `sub` and `kick` band energies before peak scaling. S4 first measures the two-gate input's
  false-open rate offline and picks two gates if its false opens on random bass stay within the current gate specs'
  bounds (6 of 300 patterns at 120 beats, 16 of 300 at 400 beats), otherwise the `BassPulse` feature alone.
- **S4's scope** also covers the worklet message (contract C3, `FeatureBatch` version 3, which carries the per-frame
  feature), `app/features/rhythm/rhythmProcessor.worklet.ts` and a new feature module beside it, and
  `scripts/scorecard/` (the false-open probe, the replay of the new input and the offline cube cells).
- **C1 picked (Trevor, 2026-11-18): the `BassPulse` feature alone**, read at worklet frame times. Measured with
  `npm run probe:gate-inputs` (300 random-bass patterns, beat clock locked): false opens at 120 and 400 beats were
  hub 2 and 19, `BassPulse` at frame times 5 and 23, pre-hub 5 and 27, two gates 6 and 37. The 400-beat bound of 16
  comes from level-domain specs and every input exceeds it on rendered audio, pre-hub included, so the comparison is
  against pre-hub: two gates opened 1.4 times as often as pre-hub, and the `BassPulse` feature less often. Seconds from
  the dancer's lock to the first opening, summed over the 16 kick tracks: hub 148.2, `BassPulse` at frame times 139.6,
  pre-hub 139.1, two gates 121.9.
- **`summer2000` is a recorded exception to S4's gate acceptance, owned by S5.** The frame-timed feature opens the gate
  7.52 s after the lock against pre-hub's 7.03 s (one kick missed through a read at most a batch older than the render
  time); S4 does not have to beat it. Every other kick track must open no later than pre-hub, within one render tick.
- **`bassline-kick-120`'s offline cube hit share is a second recorded exception to S4, owned by S5** (Trevor,
  2026-11-18). The cubes hit 0.51 of its beats within 50 ms against pre-hub's 0.78, because every hit shows one render
  tick (16.7 ms) later: the hub reads the feature at the end of the newest delivered worklet frame, which is up to one
  batch (2 frames, 21 ms) older than pre-hub's read at the render time. On a perfectly periodic track that tick moves
  most hits just past the window; its latency (50 ms against 33 ms) still passes, and the other 15 tracks' cube cells
  all pass. It is the same lag as S3's live finding that `cubes` reacts 8 to 12 ms later through the hub. Batches of one
  frame (`BATCH_FRAMES = 1`) fix it offline (0.95) but open `syncopationbass`'s gate 1.6 s later than pre-hub (19.78
  against 18.17 s after the lock) and double the worklet message rate, so S5, which owns the gate's pace, decides the
  batch size with both numbers.
- **C1's level is read at the render time, not carried in the frames** (Trevor chose option A, 2026-11-19, after S4's
  first live run). Live, the per-frame worklet feature was later than offline predicted: the cubes' latency averaged
  72.7 ms against 62.9 pre-hub (S3 60.5), the dancer's hit share 0.24 against 0.37 (`drums-128` 0, the gate learned a
  kick place 135 ms before the beat), and the gate opened 0.5 to 2.4 s later than pre-hub on the three drum tracks. The
  hub now reads `gateBass.pulse` from its own tap of the tracker's source (`GateBassTap`, `BassPulse`'s two filters and
  analyser), so the gate input is pre-hub's by construction; the worklet and `FeatureBatch` are back to version 2. The
  envelope (`GATE_BASS_BUMP`) also starts its followers at 0 as `BassPulse` does, rather than seeding them at the first
  level, which had moved the gate by up to 0.85 s. Offline, every gate and cube cell now equals pre-hub, which retires
  the `summer2000` and `bassline-kick-120` exceptions above; the live cells decide S4.
