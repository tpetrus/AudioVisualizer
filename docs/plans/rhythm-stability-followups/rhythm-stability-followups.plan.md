# Rhythm stability outstanding outcomes
> Double-diamond plan `rhythm-stability-followups` revision 1 | status **final** | lane full | risk R2 | base 6bccc895447c | updated 2026-11-06T19:13:35.200Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> I want to plan out further research/implementation of the last claude session.  The last agent made an outcomes list and I want to plan out the work for the outstanding items/outcomes

## Problem

The rhythm stability work shipped with AC4, AC5 and AC10 only partly met and with known costs. Three of six reference tracks still lock or hold a tempo at the dotted 4/3 ratio, which also causes per-play dance speed differences; grid rebuilds remain on some tracks; the bass gate opens late on loosely placed bass and has lost its protection against scattered bass; clip position differs between plays; a real song change at a dotted ratio can go unnoticed; and double time ignores the dance speed limit.

**Users:** Visitors watching a visualizer react to constant-tempo music, who expect no apparent speed changes and the same dance every play; Trevor, tuning the tracker with the debug harness and judging results by ear; Future visualizers that build on the shared rhythm surface (BassPulse, bass gate, tracker state)

**Evidence:**
- docs/agents/rhythm-stability-results.md: per-track table, acceptance status, known costs, refine-next list
- lonley locks 187.5 instead of 140 in 2 of 3 plays; syncopationbass locks 196 and sees a rival at 130.7; syncopation-no-kick holds 180 instead of 135 for the whole track
- boundary.ts:131-135 skips dotted ratios with no time limit; boundary.test.ts:211-213 asserts that behavior
- bassGate.test.ts:154 records scattered bass opening the gate with it.fails
- Clip spread p95 fails on 3 of 4 repeat runs (0.199 to 0.533 against a 0.05 target)

## Goals

- Publish the true tempo from the first lock on tracks with a kick, without weakening the steadiness already won
- Make dance speed and bar position repeat between plays of one clip
- Close the partly-met outcomes AC4, AC5 and AC10 from the previous plan, or record measured evidence for why one cannot be closed
- Pay down the known costs: dotted-ratio song change, unpinned state.bpm, scattered bass opening the gate, uncapped double time
- Give syncopation-no-kick a ranked list of testable causes that a builder can try, as a stretch goal
- Keep every change measurable: repeatable offline and live tooling, committed rather than temporary

## Non-goals

- Faster first response: tempo lock near 5 s and meter lock at 11 to 13 s may stay, or lengthen slightly, because steadiness wins over speed
- Rewriting the tempo tracker around a new algorithm or a machine-learned model
- General meter accuracy work beyond what clip spread on the reference tracks needs
- Building a labeled public dataset; the six reference tracks stay the measure
- Reviewing how visualizers other than dancing-character look
- Upgrading three.js or changing the audio capture path

## Success metrics

- Tempo within 1% of reference, or its octave, from first lock on 8 of 8 fresh plays of lonley and syncopationbass, and 100% within 1% on imyourgirl, syncopationbass2 and summer2000 (syncopation-no-kick is stretch)
- First tempo publish within 10 s of sound on tie tracks and within 0.5 s of today on tracks without a tie; meter lock later by no more than the deferral
- 0 grid rebuilds on all 5 kick-bearing tracks, unless the rebuild follows a real song change
- Mandatory: the scattered-bass seeds never open the gate. Target: it opens within 4 s of lock on all 5 kick-bearing tracks, recorded as met or open per track
- debug:repeat clip spread p95 at or below 0.05 on imyourgirl and summer2000, fresh and re-select, measured from 1 s after the latest first meter lock among the compared plays
- False song changes per file stay at 0.00 in eval:rhythm

## Constraints

- Rhythm DSP stays framework-free, pure, allocation-free per frame, with tuning constants in rhythmConfig.ts or bassGateConfig.ts (AGENTS.md rules 2 and 5)
- 95% coverage; every spec beside its file; it.fails records known weaknesses and must be removed when fixed
- Compare any rhythm change on all six tracks live; offline results misled more than once (rhythm-stability-results.md)
- Reference audio is not in the repository, so live-audio checks can only run on Trevor's machine and CI can only run spec-level checks
- Bundle is 312.26 kB against a 312.5 kB limit; growth needs a stated reason in the same PR
- Each change ships as its own Conventional Commit PR; every push to main is a production deploy

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the offline ablation and gate replay techniques and the known tooling bugs | a builder runs the committed scripts on a WAV or a recording | ablation overrides one rhythmConfig constant deterministically through a scripts-only esbuild plugin, with no app bundle change; gate replay reproduces recorded opening times; eval:rhythm prints a stability metric; verdicts no longer fail on rounding (0.99 < 0.99); CSVs write Infinity as Infinity |
| AC2 | lonley and syncopationbass, played fresh 8 times each with debug:viz | the tempo first locks | the published bpm is within 1% of reference, or its octave, from the first lock on 8 of 8 plays, first publish meets the deferral ceiling, and imyourgirl, syncopationbass2 and summer2000 stay at 100% within 1%; if the S4 probe is negative this is recorded open instead |
| AC3 | the ranked causes for syncopation-no-kick | each is tested with rawBpm telemetry or ablation | the outcome of each is recorded in rhythm-stability-results.md; reaching 135 within 1% is a stretch outcome that does not block the plan, and no other track regresses from any change kept |
| AC4 | a tracker that corrects a wrong lock of 187.5 to 140 | normalizeOctave folds the corrected tempo | the dance runs at the same timeScale as a play that locked on 140 first, shown by a spec in dancingCharacterSync.test.ts and by lonley's timeScale across plays |
| AC5 | syncopationbass and lonley | the tempo moves by exactly an octave, or a track plays through with no song change | the grid is kept across the octave move (spec in beatTracker.test.ts), recorded grid rebuilds are 0, and the rebuild near 9 s is explained in the results doc |
| AC6 | a real song change at a dotted ratio such as 90 to 120 or 100 to 150 | the new tempo holds at confidence 0.5 or above for the longer jump time | the boundary detector reports a soft boundary and songChangeCount rises when the old pulse's support has collapsed, while a dotted passage, or the held tempo correcting from 187.5 to 140 at 30 s with the old pulse still present, raises nothing, and eval:rhythm false song changes stay 0.00; if the probe shows these cannot be separated, nothing is raised and AC6 is recorded open |
| AC7 | the state.bpm change in rhythmAnalyzer.ts | it is reverted to publish the beat period | a dedicated spec fails |
| AC8 | the bass gate on real and random bass | the scattered-bass seeds run in bassGate.test.ts, and all 5 kick-bearing tracks play | mandatory: the seeds no longer open the gate and the it.fails marker is removed, with no track losing its gate; target: it opens within 4 s of lock and stays open, recorded as met or open per track, starting with lonley |
| AC9 | imyourgirl and summer2000, 4 plays each, fresh and re-select | debug:repeat compares them from 1 s after the latest first meter lock among the compared plays | clip spread p95 is at or below 0.05, or for summer2000 the row is recorded as open with the meter measurement; errors of 0.5 beat or more resolve by one crossfade with no sustained speed change, and a spec covers meterLocked toggling and re-lock |
| AC10 | the slider's half time and on the beat steps and any tempo, locked or unknown | computeDanceTiming chooses the speed | the implied dance rate never exceeds MAX_DANCE_BPM (with the release share), the steps stay on the beat, the 2x step and double-time branch are gone, a spec covers both steps and calm at the extremes, and the settings-panel baseline is regenerated |
| AC11 | each slice | its PR is opened | format, lint, typecheck, coverage, build, size and e2e pass; any budget growth is stated in the PR; six-track live results are posted for slices that change the clock |
| AC12 | the plan's end | the last slice merges or is dropped | rhythm-stability-results.md shows each outcome's final state, measured values and anything left open |
| AC13 | committed derived fixtures from the reference tracks | CI runs the unit tests | the tie-break and gate rule replay on them deterministically, and reverting either rule fails a spec; no audio is committed and each fixture passes the repository's max-file-size check |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | What does the plan cover? | All outstanding items, ordered in phases, each independently shippable and droppable. | user | Nothing is lost and later slices can be dropped. |
| D2 | Which wins when they conflict? | Steady over quick: no apparent tempo change and a repeatable dance, even with a slower lock or song-change response. | user | Matches the goal of the previous session. |
| D3 | How is syncopation-no-kick treated? | Stretch goal. The planner researches potential causes that the builder can attempt; it does not block other slices or the acceptance of AC4. | user | The track is loosely structured and has no kick. |
| D4 | Does double time respect the speed limit? | Cap it. | user | There is only so fast a person dances. |
| D5 | What does capping do to the double time option? | normalizeOctave folds to 80..160, so 2x is always at least 160 and always over the 140 limit; a capped double time can never run while locked. | repo-fact | dancingCharacterConfig.ts:54-62, dancingCharacterSync.ts:101-105 |
| D6 | How does the dance speed cap apply? | The goal is that the character never dances faster than a person would. No setting, locked or not, exceeds MAX_DANCE_BPM: on the beat falls to half time over the limit, with the existing release hysteresis. The tempo-unknown rate is capped at MAX_DANCE_BPM / NATIVE_BPM, about 0.97 of the clip's native 144 BPM, so the default calm rate slows slightly. | user | User: limit the speed to how fast a human would dance; if double time causes weirdness, keep it within the same limits. |
| D7 | What happens to the top step of the Dance speed slider? | Remove the 2x step: the slider offers half time and on the beat, and the double-time branch of the sync code goes with it. A new settings-panel visual baseline is needed. | user | With the cap, 2x would be identical to 1x while locked. |
| D8 | How does the clip reach the right beat at meter lock? | A short crossfade to the correct beat replaces the long capped nudge for errors of 0.5 beat or more. It fires at the first meter lock of a song (per songChangeCount) and again on a meter re-lock if the error is still at least 0.5 beat. Smaller errors keep the nudge. | user | Removes the 11% apparent speed change; fits steady over quick. |
| D9 | How strict are the success targets? | Pass or fail as stated in success_metrics. Meter work stays out of scope; if summer2000 clip spread cannot pass without it, record the measurement and leave that row open. | user | User confirmed the framing with its numbers and non-goals. |
| D10 | What are the candidate causes for syncopation-no-kick holding 180 instead of 135? | Untested, ranked. Already ruled out by ablation: faster-pulse takeover, TEMPO_SWITCH_ESTIMATES, history length, double-lag weight, comb partials. Step zero: read rawBpm and tempoConfidence per estimate, because everything below depends on which case applies. (A) Self-locking hold: isSyncopationRatio(135, 180) is true, so a true 135 needs confidence 0.5 and 32 straight estimates (tempo.ts:315-331), and a close rival lowers its own confidence through the margin term. TEMPO_SYNCOPATION_* was not among the ablated constants. (B) No subdivision test: 180 and 135 both sit on the same 16th grid at about 11.1 frames, 180 as 3 of them and 135 as 4. correlation[] already covers lags under minLag, but peakNear clamps to minLag (30 frames), so straight 8ths at 22.2 frames are never consulted. Comparing L/2 against L/3 support could reject a ternary-looking 180. (C) No bar-repeat test: a 3-3-3-3-4 pattern repeats at 16 sixteenths, 177.8 frames, which is 4 x 44.4 but 5.33 x 33.3. Comparing correlation at 4L for the two rivals could break the tie, and it needs no kick. (D) Band mix: ONSET_BAND_WEIGHTS was never ablated; per-band sums let a dotted bass outweigh straight hats. Per-band autocorrelation would test it. (E) Frame-grid bias: 44.44 frames splits its peak across two lags more than 33.33 does (tempo.ts:125 records this effect), eating into the 17% prior advantage 135 has. Interpolated peak height would test it. (F) Early decision: first lock at confidence 0.2 from 3 s of history, too short to see a bar; deferring a first lock while a dotted rival is close fits steady over quick and also serves lonley. | planner assumption (confirm) | From reading tempo.ts, rhythmConfig.ts and rhythmAnalyzer.ts, no run. Published work supports tracking several metrical levels with periods that are multiples of one another (Lartillot and Grandjean, SMC 2019) and tatum-based comb scoring (Audacity MIR docs, ISMIR 2006 and 2013); no source covered the 4/3 error directly. |
| D11 | If no gate rule meets both the 4 s target and scatter rejection, which wins? | Scatter rejection; lonley's opening time is recorded as open. | planner assumption (confirm) | Follows from steady over quick (D2); stray pulses are more visible than a late gate. |
| D12 | How does the boundary detector tell a real dotted-ratio song change from the tracker correcting itself? | By whether the old pulse is still there. In a correction both pulses stay in the music, so the autocorrelation at the old lag keeps its support and the detector re-seeds its reference with no boundary. In a song change the old lag's support collapses, and a boundary is raised. If the probe shows this cannot separate them, no boundary wins and AC6 is recorded open. | planner assumption (confirm) | Re-seeding on every adoption, as the critic suggested, would hide the real changes AC6 asks for. A false song change resets the dance locks, so steady over quick (D2) decides the fallback. |
| D13 | What does dropping a slice mean for what depends on it? | A dropped dependency counts as satisfied and its outcome is recorded as open in the results doc. If the probe in S4 is negative, S11 is dropped or re-scoped with Trevor, and S6, S8 and S7 proceed. | planner assumption (confirm) | Keeps D1: every slice is droppable. |
| D14 | What is lonley's true tempo? | 140 BPM, confirmed by Trevor. | user | Removes the risk of tuning the tie-break to a wrong target. |
| D15 | Is derived data from the reference tracks committed? | Yes: small telemetry CSVs and onset envelopes, no audio, as fixtures for deterministic regression specs in CI. | user | The audio is not in the repository, so CI otherwise cannot catch a wrong-lock regression. |
| D16 | How long may a first lock be deferred? | TEMPO_TIE_MAX_DEFER_S starts at 5 s, so first publish is within about 10 s of sound; expiry publishes the current winner. The probe may lower it. | planner assumption (confirm) | Long enough for 4L of most tempos to fit in the history; bounded so steady over quick cannot erode the first response unnoticed. |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Break the 4/3 tie inside TempoTracker by deferring first lock until a bar-repeat comparison picks one of the two dotted rivals, and make the bass gate count on-place hit rate over a window, so loose real bass opens it and random bass does not. | 5 | 3 | 3 | 3 | 4 | yes | 3.7 |
| O2 | robust | Defer first publish while a dotted rival is close and settle it with a two-evidence vote (bar-repeat at 4L plus a kick-only autocorrelation), and replace the gate's fixed on-place window with a Rayleigh phase-concentration test so loose real bass opens it and scattered bass cannot. | 3 | 3 | 2 | 4 | 3 | yes | 2.95 |
| O3 | contrarian | Stop trying to make the tempo tracker pick between 4/3 rivals: hold the first publish until a kick-only onset interval test (a separate side-channel in the analyzer) names the pulse, and replace the gate's evidence counting with a phase-concentration test that random bass cannot pass. | 2 | 2 | 2 | 3 | 3 | yes | 2.25 |
| **O4** (chosen) | hybrid | Measure before building. Commit the tools, probe which evidence really separates the rivals on all six tracks, then ship the smallest rule that passes: a bounded deferred first lock settled by bar repeat (from O1 and O2), adding a kick-only vote (from O2 and O3) only if the probe shows bar repeat is not enough. The gate rule is chosen the same way, by replay over recordings among on-place rate (O1), phase concentration (O2, O3) and bar-to-bar comparison. | 4 | 4 | 3 | 4 | 4 | yes | 3.8 |

## Decision

**O4**: Measure before building. Commit the tools, probe which evidence really separates the rivals on all six tracks, then ship the smallest rule that passes: a bounded deferred first lock settled by bar repeat (from O1 and O2), adding a kick-only vote (from O2 and O3) only if the probe shows bar repeat is not enough. The gate rule is chosen the same way, by replay over recordings among on-place rate (O1), phase concentration (O2, O3) and bar-to-bar comparison.

O1 has the right size, but its tie-break compares the lag both rivals share, and its on-place rate is the family the results doc found too near chance. O2 and O3 commit to a new kick path and a gate model before anything is measured, and offline results already misled this work. O4 keeps O1's size where the data allows and escalates to O2's evidence only on a measured need.

**Approach:**
- Tooling first: ablation, gate replay, stability metric, verdict and CSV fixes, plus raw tempo and rival columns in telemetry
- Probe, in a results table: per track, correlation at 4L and 8L of each rival, kick-only autocorrelation at each rival, per-band sums, and raw tempo over time
- Bar-repeat tie-break with deferred first lock inside TempoTracker, compared at each rival's own 4L and 8L rather than at the lag they share (3 x 44.4 equals 4 x 33.3 frames, which cannot separate them)
- Kick-only evidence is added only if the probe shows bar repeat misses lonley, because it changes a data path and spends bundle budget
- Gate candidates compete in replay; the winner replaces the evidence rule, keeping the clock-driven bump
- Remaining slices are small and independent: octave fold, grid keep, dotted boundary, state.bpm pin, speed cap, crossfade

## Design

Ten independently shippable slices. Tools and a probe come first, so each rhythm rule is chosen on evidence from all six tracks. The tie-break comes next because it removes the trigger for the octave fold bug and most rebuilds, and because the dotted boundary timer would otherwise report a corrected wrong lock as a song change. Every rule stays a pure function with constants in the config files.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| rhythm-ablate, gate-replay, probe | Committed offline tools; telemetry gains raw tempo and top rival; derived fixtures | scripts/ |
| TempoTracker first-lock tie-break | While a dotted rival is within TEMPO_TIE_MARGIN and no tempo is held, hold unknown up to TEMPO_TIE_MAX_DEFER_S, then pick by bar repeat at each rival's own 4L and 8L using interpolated peak height (8L matters for a tracker on the double octave, such as 196 against 130.7). Expiry locks the current winner. Reset on keepRecent and reset. | app/features/rhythm/tempo.ts |
| BeatTracker octave keep | setTempo keeps the grid when the new period is an exact octave of the old one, halving or doubling instead of rebuilding | app/features/rhythm/beatTracker.ts |
| BoundaryDetector dotted timer | Per D12: at a dotted rival held TEMPO_DOTTED_JUMP_SECONDS at confidence 0.5 or above, raise a soft boundary only when the old pulse's support collapsed; otherwise re-seed the reference with no boundary | app/features/rhythm/boundary.ts |
| Gate place rule | Winner from replay, bar-to-bar repeat tried first; bump stays driven by the beat clock | app/features/rhythm/bassGate.ts |
| computeDanceTiming | Universal speed cap, double-time branch removed, octave re-seed after a dotted correction, crossfade request per D8 | app/features/visualizers/dancing-character/dancingCharacterSync.ts |
| Scene crossfade | Runs the requested crossfade on the AnimationMixer in the same frame as computeDanceTiming, reusing preallocated actions | app/features/visualizers/dancing-character/dancingCharacterScene.ts |

### Contracts (freeze before dependent work)

- **C1 Deferred first lock** (behavior): TempoTracker.bpm stays 0 while a first-lock tie is open, at most TEMPO_TIE_MAX_DEFER_S (D16); rawBpm and confidence keep updating; state.bpm reads 0 and visualizers show the calm state. BoundaryDetector.pushTempo is not fed during the deferral, so its reference is seeded from the decided tempo.
- **C2 Rhythm tool CLIs** (cli): npm run ablate:rhythm -- <wav> --set NAME=VALUE (esbuild onLoad plugin in scripts/, no change in app/), npm run replay:gate -- <telemetry.csv> --rule NAME, and npm run probe:rhythm -- <dir>; telemetry CSV gains rawBpm and rivalBpm columns; dev only, nothing ships, and npm run size shows no change.
- **C3 Dotted soft boundary** (behavior): Per D12, pushTempo reports BOUNDARY_SOFT for a dotted-ratio tempo held TEMPO_DOTTED_JUMP_SECONDS at confidence 0.5 or above only when the old pulse's support collapsed; it replaces the assertion at boundary.test.ts:211-213. TempoTracker exposes the support at the held lag as a read-only value.
- **C4 Bass gate state** (module): BassGateState fields change with the chosen rule; stepBassGate's signature and return value, and the BassPulse surface in architecture.md section 6, do not.
- **C5 Dance timing result** (module): The implied rate never exceeds MAX_DANCE_BPM; STEP_MULTIPLES becomes half and one, and the danceSpeed control's max becomes 1; DanceTimingResult gains a crossfadeToPhase value, negative when there is none, recomputed every call and consumed in the same frame, so nothing is left pending while the page is hidden; no allocation.

### Data

No persistent data. Reference tempos and audio stay in git-ignored .debug-in.

### UX

The Dance speed slider loses its 2x step (half time and on the beat remain). Ambiguous tracks show the calm sway slightly longer before locking. At meter lock the dancer may blend once to the right beat instead of running 11% off for up to 8 s.

### Accessibility

No new controls. The crossfade is a brief blend and adds no flash; reduced-motion defaults are unaffected.

### Security and privacy

All client side; no new data leaves the browser. Tools read local files only.

### Observability

Telemetry raw tempo and rival columns, debug:summary and debug:repeat; results doc updated per slice.

### Rollout and rollback

One PR per slice with a Conventional Commit title; check on the Cloudflare preview. Clock-changing slices post six-track live results in the PR before merge. New rules stay constant-tunable. Roll back by reverting the PR or with wrangler rollback: a failing smoke run after merge, or any six-track regression found after deploy, triggers it. A dropped dependency counts as satisfied (D13).

## Test strategy

- **Unit:** Specs beside each file: synthetic dotted rivals for the tie-break including deadline and reset; octave grid keep; dotted boundary times, including a correction at 30 s raising nothing; state.bpm pin that fails when reverted; speed cap at extreme tempos for each step and calm; scattered seeds without it.fails; meterLocked toggling and re-lock for the crossfade; deterministic regressions over the derived fixtures (AC13).
- **Integration:** rhythmAnalyzer.test.ts feeds synthetic envelopes through tie-break, beat tracker and boundary together, including a corrected first lock raising no song change.
- **End-to-end:** npm run test:e2e after each rendering slice; existing fixtures catch errors, context leaks and console warnings.
- **Manual:** debug:viz on all six tracks for clock-changing slices, 8 fresh plays of lonley and syncopationbass for AC2, 4 plays fresh and re-select for AC9; look at the crossfade and calm wait in npm run dev. Live plays remain a smoke check, since unexplained differences between plays exist; fixtures carry the regression duty, without the AGC and block timing.
- **Non-functional:** npm run size against the 312.5 kB limit, reduced first by dropping dead code; 60 fps check on cubes and trio-color-wave; no per-frame allocation in the new code.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Bar repeat does not separate the rivals on lonley | medium | high | The probe shows this before any rule ships; escalate to a kick-only vote, which has a bundle cost. |
| K2 | Six reference tracks overfit the thresholds | medium | medium | Prefer ratio comparisons between rivals over absolute constants; keep eval:rhythm and synthetic specs as guards; a deadline always falls back to today's behavior. |
| K3 | 4 s after lock holds about 9 kicks, too few for any beat-level statistic to separate 32-41% on-place from the 20% chance rate | high | medium | S8 starts with a feasibility check in replay and tries bar-to-bar repeat first, which uses different information. Scatter rejection is mandatory; lonley's opening time stays recorded as open if needed (D11, Q2). |
| K4 | The dotted timer reports a tracker correction or a long dotted passage as a song change | medium | high | D12 requires the old pulse's support to collapse; S7 ships after the tie-break and S5, with a six-track false-boundary check; eval:rhythm must stay at 0.00; fallback is no boundary. |
| K5 | summer2000's reference is 127.5 by comb and 129 by metronome, 1.2% apart, more than the 1% test | low | medium | lonley is confirmed (D14). summer2000 is not a tie track, so it does not drive tuning; Trevor settles it before its AC2 row is judged (Q1). |
| K6 | Bundle budget has 0.24 kB of headroom | high | low | Measure per slice; a raise goes in the same PR with its reason, as AGENTS.md requires. |
| K7 | The crossfade reads as a jump on the dancer | medium | medium | Blend time is a constant; judged by eye in npm run dev; the capped nudge stays for small errors. |
| K8 | Fixtures omit the AGC and block timing, so they may pass where live fails | medium | medium | Fixtures guard regressions only; acceptance stays live on all six tracks. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Commit telemetry columns, probe, ablation and fixtures: Raw tempo and rival telemetry, ablation by scripts-only plugin, the probe tool and derived fixtures from the six tracks. |  | AC1, AC11, AC13 | C2 | R1 | M | scripts/debug-visualizer/, scripts/rhythm-ablate.ts, scripts/rhythm-probe.ts, scripts/fixtures/rhythm/, package.json |
| S2 | Pin state.bpm with a dedicated spec: A spec that fails if state.bpm publishes the beat period again. |  | AC7, AC11 |  | R0 | S | app/features/rhythm/rhythmAnalyzer.test.ts |
| S3 | Cap every dance speed and remove the 2x step: Apply the limit to every setting and the calm rate, remove the 2x step and the double-time branch and its specs, regenerate the panel baseline. |  | AC10, AC11 | C5 | R1 | S | app/features/visualizers/dancing-character/dancingCharacterSync.ts, app/features/visualizers/dancing-character/dancingCharacterConfig.ts, app/features/visualizers/dancing-character/dancingCharacterControls.ts, app/features/visualizers/dancing-character/dancingCharacterSync.test.ts, app/features/visualizers/dancing-character/dancingCharacterControls.test.ts, e2e/visual.spec.ts-snapshots/ |
| S4 | Run the evidence probe and hold a stop or go: Write the evidence table for all six tracks to the results doc, including which case of D10 applies on syncopation-no-kick and old-pulse support for D12, then decide S11's rule with Trevor. | S1 | AC2, AC11 |  | R0 | S | docs/agents/rhythm-stability-results.md |
| S5 | Test the syncopation-no-kick causes (stretch): Work through causes A to F of D10 with raw tempo telemetry and ablation; keep a fix only if no track regresses; record each outcome. | S11 | AC3, AC11 |  | R2 | M | app/features/rhythm/tempo.ts, app/features/rhythm/rhythmConfig.ts, docs/agents/rhythm-stability-results.md |
| S6 | Keep the octave and the grid across corrections: Re-seed the octave after a dotted correction, keep the grid on an exact octave move, and explain the rebuild near 9 s. | S4 | AC4, AC5, AC11 |  | R2 | M | app/features/rhythm/beatTracker.ts, app/features/rhythm/beatTracker.test.ts, app/features/visualizers/dancing-character/dancingCharacterSync.ts, app/features/visualizers/dancing-character/dancingCharacterSync.test.ts |
| S7 | Report song changes at dotted ratios: Give dotted ratios a longer, confidence-gated jump time, with the old-pulse test of D12, then re-run the six-track false-boundary check. | S4, S5, S11 | AC6, AC11 | C3 | R2 | S | app/features/rhythm/boundary.ts, app/features/rhythm/boundary.test.ts, app/features/rhythm/rhythmConfig.ts |
| S8 | Choose and ship the bass gate place rule: Check feasibility in replay on lonley first; compare bar-to-bar repeat, then phase concentration and on-place rate; ship the winner and remove it.fails. | S4, S12 | AC8, AC11, AC13 | C4 | R2 | M | app/features/rhythm/bassGate.ts, app/features/rhythm/bassGate.test.ts, app/features/rhythm/bassGateConfig.ts |
| S9 | Crossfade whole-beat clip errors at meter lock: Blend once to the right beat, keeping the nudge for small errors, then measure clip spread. | S3, S6 | AC9, AC11 | C5 | R2 | M | app/features/visualizers/dancing-character/dancingCharacterSync.ts, app/features/visualizers/dancing-character/dancingCharacterScene.ts, app/features/visualizers/dancing-character/dancingCharacterSync.test.ts |
| S10 | Record the final results: Update rhythm-stability-results.md and rhythm-findings.md with final states, measurements and what stays open, including any dropped slice. | S2, S3, S4, S5, S6, S7, S8, S9, S11, S12 | AC12 |  | R0 | S | docs/agents/rhythm-stability-results.md |
| S11 | Ship the first-lock tie-break: Bar-repeat deferred first lock chosen in S4, with the kick vote only if S4 demands it and Trevor agrees. A negative probe drops or re-scopes this slice. | S4 | AC2, AC11, AC13 | C1 | R2 | L | app/features/rhythm/tempo.ts, app/features/rhythm/tempo.test.ts, app/features/rhythm/rhythmConfig.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmAnalyzer.test.ts |
| S12 | Commit gate replay and fix the reports: Gate replay, the eval stability metric, verdict rounding and the Infinity CSV fix. | S1 | AC1, AC11 | C2 | R1 | M | scripts/gate-replay.ts, scripts/eval-rhythm.ts, scripts/debug-visualizer/ |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Is summer2000 127.5 or 129 BPM? The two are 1.2% apart, more than the 1% test. lonley is confirmed at 140. | Trevor, before judging summer2000's AC2 row | no |
| Q2 | If replay shows no gate rule both opens within 4 s on lonley and rejects scatter, is a later opening acceptable? Plan default: yes, scatter rejection wins. | Trevor, at S8 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | AC8 and the third success metric demand both 'gate opens within 4 s of lock on all 5 kick tracks' and 'scattered seeds stay closed', while D11, Q2 and K3 (likelihood high) already expect these to conflict. The results doc (rhythm-stability-results.md section 4) says lonley's 32-41% on-place rate is too near the 20% chance rate for a constant to separate, and that penalties, leak, window 0.15 and open score 3 were all tried and rejected. Roughly 9 kicks in 4 s cannot separate 35% from 20% by any beat-level statistic, whether on-place rate (O1) or Rayleigh R (O2/O3). S8 lists these as replay candidates, so it is likely to re-run rejected work. The only candidate that uses different information is bar-to-bar repeat, which the doc names as the lead, and it is listed last. | Changed the plan: AC8 and the metric are two-tier, S8 starts with a feasibility check and tries bar-to-bar repeat first. |
| F2 | high | D5 shows that normalizeOctave folds to 80..160 and 2x is therefore always over 140. D6 halves 'until it fits', so 2x resolves to 1x for every locked tempo up to 140 and to 0.5x above it. dancingCharacterSync.ts:173-177 today halves only when the chosen step is 1. After S3 the slider's top step is identical to the step below it. D7 (planner-assumption) leaves the slider unchanged and says to 'revisit if it reads as broken', so the plan ships a dead control and the AC10 spec for '2x, 1x and calm' pins the equivalence in place. The barsPerLoop < 1 double-time branch (lines 187-195) becomes unreachable while locked. That is dead code under the 95% coverage rule, and S9 will touch the same branch for the crossfade. | Asked Trevor: remove the 2x step (D7). S3 deletes the branch; D6 gives the calm cap as about 0.97. |
| F3 | high | C3/S7 (K4) make a dotted rival held for TEMPO_DOTTED_JUMP_SECONDS at confidence 0.5 or more raise BOUNDARY_SOFT. The only exemption is 'the held tempo corrected at first lock'. The tracker still self-corrects later (a dotted hold needs 32 estimates, tempo.ts:315-331), and S5 may add more late corrections. On syncopation-no-kick (holds 180 for the whole track) or syncopationbass (rival 130.7), a late correction of 180 to 135 would be reported as a song change. That bumps songChangeCount, runs keepOnlyRecent (rhythmAnalyzer.ts:249-258), resets the dance lock, octave and gate (dancingCharacterSync.ts:141-146), and restarts the stability the plan is protecting. eval:rhythm only counts false changes on whole files and cannot see a missed true dotted change, so the 0.00 guard covers only half of AC6. S7 depends only on S4, not on S5. | Changed the plan with a different fix: re-seeding on every adoption would hide real changes, so D12 and C3 test whether the old pulse's support collapsed. S7 now depends on S5, with a false-boundary recheck and a spec for a correction at 30 s. |
| F4 | high | C1 and the tie-break component leave TEMPO_TIE_MAX_DEFER_S without a value (O1 had about 3 s, O2 had 8 s). bpm 0 for that long stacks on a 5 s lock and an 11-13 s meter lock, and the beat grid, meter, bass gate and dance lock are all gated on a published tempo. The success metrics and AC8 measure 'after lock', and AC9 measures 'after meter lock', so none of them measures the added delay. O1's risk 'deferral can interact with boundary detection at song start' was dropped in O4 without a replacement, and C1 does not say what boundary.pushTempo receives while deferred. D2 permits slower, but an unbounded budget lets the slice trade away the first-response experience unnoticed. | Changed the plan: D16 sets the ceiling, metrics measure first publish and meter lock, C1 specifies pushTempo during deferral. |
| F5 | high | S4 (size L, R2) bundles the probe, the tie-break and a conditional escalation to a kick-only vote. The escalation changes the pushFrame signature, adds a data path, and spends bundle headroom of 0.24 kB (K1, K6). AC2, the other success metrics and slices S5-S8 all hang on S4, and nothing says what happens if the probe shows bar repeat does not separate lonley (K1 is medium likelihood and high impact). There is no checkpoint for Trevor between probe and build. S6 (octave re-seed, grid keep) and S8 are needed even when no tie-break works, because corrections still occur, so their dependency on S4 looks like ordering convenience. | Changed the plan: S4 is now the probe with a stop or go, S11 the implementation, D13 the negative branch; S6 and S8 depend only on the probe. |
| F6 | medium | AC2, AC4 (timeScale across plays), AC5 (rebuilds 0), AC8, AC9 and most success metrics can only be checked live on Trevor's machine. The audio is not in the repo, so CI proves only synthetic specs. '4 of 4 fresh plays' is weak evidence for a fault seen in 2 of 3 plays. A tracker that still fails one play in three passes 4 of 4 about 20% of the time. The plays also differ for reasons the doc calls unexplained (frame timing, the 9 s rebuild). There is no stored evidence for a reviewer other than a PR comment. | Changed the plan: Trevor agreed to commit derived fixtures (D15, AC13), and the live gate rose to 8 plays. |
| F7 | medium | D8/C5/S9 make the crossfade 'once at meter lock' as a one-shot field on DanceTimingResult. The results doc (section 5) says summer2000 re-locks the meter a beat apart after its break near 23 s, and computeDanceTiming has enter and exit thresholds, so meterLocked can toggle several times per song. Nothing defines a per-song latch, and nothing defines what happens when the one-shot is not consumed (the visualizer is hidden, or the frame is dropped). The previous session chose the capped nudge so the dancer 'never jumps' (doc line 151), and K7 is only 'judged by eye'. Also, the doc says the clip already converges to within 0.01 of the bar after meter lock, so the 0.199-0.533 p95 spread is caused by the catch-up window. AC9's 'after meter lock' window must be pinned to when the metric starts, or the crossfade may not change what debug:repeat reports. | Changed the plan: D8 defines the latch and 0.5 beat threshold, C5 the same-frame consumption, AC9 the window start and toggling spec. |
| F8 | medium | The probe in S4 and K5 rest on references that are weak. Q1 (lonley 140 and summer2000 127.5 or 129) is marked non-blocking, but the tie-break and AC2 tune directly against lonley's 140, and the doc says lonley's reference 'has not been confirmed by ear'. If lonley's truth is 187.5 or something else, S4, S6 and AC4 are built on the wrong target. D10's candidates A-F are 'from reading, no run', and D10's claim that the 4L comparison is decisive for a 3-3-3-3-4 pattern is untested. S5's whole premise (a ranked list) is unverified. | Asked Trevor: lonley is confirmed at 140 (D14). summer2000 stays open in Q1 and does not drive tuning. D10 stays explicitly untested; S4 records which case applies. |
| F9 | medium | AC1 says ablation 'overrides one rhythmConfig constant deterministically' via an env map (C2, O2), but rhythmConfig.ts exports compile-time constants consumed by ES imports. The plan does not say how an override works without production-code hooks. A hook inside app code would ship in the bundle (0.24 kB headroom) or break the pure-config rule (AGENTS.md rules 2 and 5), while a build-time define or alias in scripts/ is fine. S1 also holds seven tool deliverables as one M slice, although S4 needs only the probe and the telemetry columns, and the telemetry column change touches the debug harness that live checks rely on. | Changed the plan: C2 names the scripts-only plugin with a size check, and S1 was split with S12. |
| F10 | low | D1 says every slice can be dropped alone, but S10 depends on S5 (a stretch slice), S9 depends on S3 and S6, and the dependency graph does not say what a dropped dependency means. S10 does not list S3, S4 or S6 either. AC12 is therefore unreachable if S5 is dropped, and risk classes are inconsistent: S4 and S8 change the clock at R2, while the gate change that ships a visible behavior to production on every push to main has no rollback trigger beyond 'smoke run fails'. | Changed the plan: D13 defines a dropped dependency, S10 lists every slice, rollout has a regression trigger. |

## Hand-off

A verified-diamond draft DAG with 12 task(s) and 5 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `2b41adbdc3b28a5c`).
