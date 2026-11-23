# Rhythm tracker plan D11
> Double-diamond plan `rhythm-tracker-d11` revision 1 | status **final** | lane full | risk R2 | base ee7687560dff | updated 2026-11-23T03:55:46.189Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> Feature: Rhythm tracker plan (the work deferred under D11)
> 
> Context. AudioVisualizer's rhythm tracker (app/features/rhythm/: tempo estimation in tempo.ts, beat grid in beatTracker.ts, the orchestration in rhythmAnalyzer.ts, song changes in boundary.ts, meter in meter.ts, constants in rhythmConfig.ts) feeds every visualizer through the audio hub. The hub plans (audio-engine-alignment, hub-regressions, hub-followups) are finished. Every remaining scorecard failure belongs to the tracker. On 2026-11-22, Trevor decided this work is its own plan, made in a fresh double-diamond session ("Review decisions" in docs/agents/hub-scorecard.md). Plan it on main after PR #126 (the follow-up drain) merges.
> 
> Failing offline cells (npm run scorecard, targets v9):
> 
> | Cell | Track | Value | Target |
> | beat.errorMedianMs | summer2000 | 153 ms | 40 |
> | beat.errorMedianMs | low-bpm-rnb | 183 ms | 40 |
> | beat.errorMedianMs, tempo.maxErrorAfterLock | 6-8-time | never locks | 40 ms, 0.020 |
> | tempo.falseSongChanges | 6-8-time | 1 | 0 |
> | tempo.beatlessNeverLocks | beatless | locks (1) | 0 |
> | ac9.dottedChangeCounted | dotted 100→150 scenario | 0 | 1 |
> | onset.f50.kick / .bass | bassline-kick-120 | 0.81 / 0.77 | 0.90 |
> | gate.secondsAfterLock | half-time-shuffle, lonley, summer2000, low-bpm-rnb | 7.2, 10.8, 6.1, never | 4 s |
> 
> Also deferred: AC7 (dance-clip consistency across plays) on syncopation-no-kick, 6-8-time, high-bpm-dnb, low-bpm-rnb and syncopationbass; and syncopation-no-kick's first lock (AC5 of the audio-alignment plan). Known weaknesses with no packet yet: a 3/4 click at 180 BPM reads as 90, high-bpm-dnb first locks at 115, and the grid moves abruptly when it re-aligns.
> 
> Diagnosed causes so far.
> - summer2000 (hub-scorecard.md, "Why the tracker's beat misses summer2000"): the tempo is right (127.66 bpm, ratio 1.001), but the grid locks about half a beat off the taps from 8 s to 18.5 s, then drifts toward them without settling. The kicks are on the taps. The cause is the first phase: an onset corrects a beat only within BEAT_WINDOW_FRACTION (0.2 beat, about 94 ms here), and the phase is searched again only after BEAT_LOST_BEATS (8) beats with no onset, which this track's dense onsets never allow. No single constant fixes it (ablation table in that section). The candidates are different phase evidence (weigh the kick band), keeping several phase guesses, or a re-search that doesn't wait for the onsets to stop.
> - low-bpm-rnb: needs a beat tracker that keeps several phase hypotheses (see "Causes" in hub-scorecard.md). This is probably the same design as summer2000.
> - half-time-shuffle's gate: the tracker counts the shuffle's 169 bpm subdivision, not its 83 bpm beat. Fixing it needs either the right beat level or a gate that searches bar lengths. Both are redesigns.
> - beatless: needs a model of whether a beat is present at all.
> - The dotted 100→150 change (3/2): never followed within 30 s, while 4/3 and octave changes are. One attempt was shelved; see "3/2 tempo changes: shelved" in docs/agents/audio-alignment-findings.md.
> - Follow-ups moved into this plan:
>   - FU-S6-three-halves-change: the shelved 3/2 attempt itself.
>   - FU-boundary-dotted: BoundaryDetector can swallow a sustained dotted change forever.
>   - FU-dotted-leaky: a leaky challenger counter for weak dotted rivals. It was tried and only works together with a working 3/2 rule.
>   - FU-polyrhythm-grid-spec: pin the tracker on a 3:2 polyrhythm grid before any 3/2 or bar-evidence change.
> 
>   Their full packets are in the verified-diamond followups.json, marked "ejected to the D11 tracker plan".
> 
> Constraints.
> - Every tracker change affects every visualizer and track. Judge it on the full npm run scorecard plus npm run scorecard:check (blocking cells that pass must not get worse), plus sweep:gate false opens.
> - Some specs use it.fails to record known tracker weaknesses. Fixing one makes its spec fail until .fails is removed.
> - The committed tapped truth (.debug-in/*.beats.json) is checked by hash and can't be recreated. The audio itself is local and never committed.
> - The bundle is at 338.04 of 338.5 kB total JS, so a bigger tracker needs a budget decision.
> - Live cells need npm run scorecard:live from the main checkout, which takes about 45 s per run. Machine load has skewed results before.
> - Repo rules are in AGENTS.md: logic outside React, no allocation per frame, named exports.
> 
> Tools already available: eval:rhythm --alignment, ablate:rhythm --set, sweep:onsets, probe:rhythm, ground-truth, scorecard, scorecard:check, scorecard:live, sweep:gate, replay:gate. To get the per-beat error over time (which ablate:rhythm doesn't print), use detectFromPcm with loadWithOverrides (scripts/rhythm-tools/ablatePlugin.ts). The summer2000 diagnosis did this from a scratch script.
> 
> Open questions for the plan.
> 1. Is one beat-tracker redesign (several phase hypotheses, or different phase evidence) the shared fix for summer2000, low-bpm-rnb, half-time-shuffle and 6-8-time? Or are these separate problems?
> 2. Does the 3/2 change belong in this plan, or in a separate tempo-change plan?
> 3. Is a beat-presence model (beatless) in scope?
> 4. Which cells are required and which are stretch? Trevor's 2026-11-22 review accepted some cells as measured.
> 5. What is the budget for added code and CPU in the worklet?

## Problem

The beat tracker gets the tempo right on summer2000 and low-bpm-rnb but sits off the beat, for two different reasons. On summer2000 (153 ms median beat error, target 40) the first alignment settles about half a beat off. The existing phase check never moves the grid back: it is BeatTracker's decayed 16-bin histogram of the unweighted onset sum, which needs PHASE_SHIFT_RATIO 1.15 for PHASE_SHIFT_BEATS 4. Why it stays silent there is not yet measured. On low-bpm-rnb (183 ms) the phase check does move the grid onto the beat at 16 s. The per-beat correction then pulls each beat onto a kick a sixteenth early, the period shrinks, and the grid slides back within 5 s. The phase check cannot see that slide, because its evidence turns with the grid. Visualizers that read the beat place are off, and the dancer's bass gate opens late (6.1 s, and never on low-bpm-rnb, target 4 s). Nearby failures (6-8-time, half-time-shuffle, beatless, the 3/2 dotted change, bassline-kick-120 onsets) are separate problems handled as stretch.

**Users:** Trevor, the developer, judges tracker changes on the scorecard; listeners watching any visualizer, whose visuals follow tracker.state beat phase

**Evidence:**
- docs/agents/hub-scorecard.md:995-1023 (summer2000): tempo ratio 1.001, phase 170 to 230 ms off from the lock to 18.5 s. The kicks are on the taps. No single rhythmConfig override fixes it
- docs/agents/hub-scorecard.md:497-504 (low-bpm-rnb): the phase check moves the grid onto the tapped beat at 16 s. The per-beat correction then slides it back onto an early kick (1.88 kick onsets a beat, period 0.729 against 0.737). Band weights, the phase ratio and minimum shift, the window, a distance-weighted peak and gains were all tried, and none moved it
- app/features/rhythm/beatTracker.ts:20-37: the existing phase check (PHASE_BINS 16, PHASE_DECAY 0.95, PHASE_MIN_SHIFT 0.25, PHASE_SHIFT_RATIO 1.15, PHASE_SHIFT_BEATS 4, PHASE_MIN_BEATS 8). Phase moves do not bump gridEpoch and are counted in phaseShiftCount
- rhythmAnalyzer.ts:161-165: a gridEpoch change shrinks the meter's downbeat evidence (METER_GRID_RESET_KEEP)

## Goals

- Bring summer2000 beat.errorMedianMs to 40 ms or less (required)
- Make one bounded attempt at low-bpm-rnb's slide, to 40 ms or less. If it misses, record it and re-plan it, without blocking the rest
- Make no blocking cell that passes worse, add no sweep:gate false opens, keep gate.secondsAfterLock from getting worse, and stay within the size and CPU budget
- Sequence the stretch work (beat presence, 3:2 spec then the 3/2 change, bar-level beat for 6-8 and half-time) so each part ships or reverts on its own

## Non-goals

- Changing the scorecard targets (v9) or the tapped .beats.json truth. The baseline is rewritten only to record improvements, after AC3 passes, in its own commit
- Hub, visualizer, bassGate or dance-clip code changes. The gate's seconds are reported, not tuned, here
- A finer low-end spectrum for bassline-kick-120 bass onsets (a separate onset project, reported only)
- Upgrading three.js or moving the tracker into the worklet
- Re-opening cells Trevor accepted as measured on 2026-11-22

## Success metrics

- summer2000 beat.errorMedianMs is at most 40 (required)
- low-bpm-rnb beat.errorMedianMs is at most 40, or a recorded miss with a re-plan note
- scorecard:check exits 0; sweep:gate false opens are not above main; gate.secondsAfterLock is not worse on any track
- Total JS is at most 341.5 kB; the tracker's time per frame is at most 1.25 times main, measured interleaved in one session
- Phase moves on synthetic sparse noise and equal eighths are not above main's rate

## Constraints

- Every tracker change is judged on the full npm run scorecard, plus npm run scorecard:check and sweep:gate false opens
- it.fails specs that start passing must have .fails removed in the same change
- .debug-in/*.beats.json are hash-checked and cannot be recreated; the audio stays local
- Total JS budget may grow by at most 3 kB (to 341.5 kB), raised in the same PR with the reason
- Tracker CPU may grow by at most 25 percent. The tracker (RhythmAnalyzer, BeatTracker) runs on the main thread, not in the worklet, so the cap applies there
- Live cells need scorecard:live from the main checkout, run one at a time on an idle machine
- AGENTS.md: logic outside React, no allocation per frame, named exports, comments that explain why
- tracker.state contract fields lastBeatTime, periodSeconds, beatCount and gridEpoch keep their meaning for rhythmAnalyzer, the hub and the dancer's gate

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the main checkout with .debug-in audio and the summer2000 slice merged | npm run scorecard runs | beat.errorMedianMs on summer2000 is at most 40 ms |
| AC2 | the low-bpm-rnb slide slice has been attempted | npm run scorecard runs | beat.errorMedianMs on low-bpm-rnb is at most 40 ms and the slice merges; otherwise the slice is not merged, and its trace and the reason are recorded in hub-scorecard.md as a re-plan item |
| AC3 | the current baseline docs/agents/hub-scorecard.baseline.json | npm run scorecard:check and npm run sweep:gate run after each tracker slice | scorecard:check exits 0, no .beats.json hash changed, and sweep:gate false opens are not above main. The PR also has a numeric diff of every gate.secondsAfterLock cell against the baseline JSON. On tracks that pass today, a cell may not go from pass to fail or rise by more than 0.5 s. On tracks already failing (summer2000, low-bpm-rnb, half-time-shuffle, lonley), a rise is accepted under D9 and reported with the trace's gate open time. The tracks named in the request as failing or weak (syncopation-no-kick, 6-8-time, syncopationbass, high-bpm-dnb) get beat error and first lock no worse than main |
| AC4 | a production build and the bench | npm run size runs, and bench:tracker times main and the branch interleaved in one session | total JS is at most 341.5 kB, with any limit change stated in the PR, and the branch's median time per frame is at most 1.25 times main's |
| AC5 | the changed BeatTracker | the unit specs and npm run test:e2e run | a phase move leaves gridEpoch unchanged and increments phaseShiftCount, beatCount never decreases, lastBeatTime and periodSeconds keep their meaning, the existing beatTracker.test.ts epoch specs pass unchanged, coverage stays at 95 percent or more, and e2e passes |
| AC6 | a synthetic 3:2 polyrhythm ground-truth track | its new spec runs before any 3/2 or bar-evidence change | the tracker's current beat level and tempo on that grid are pinned by a passing spec |
| AC7 | the stretch beat-presence slice is attempted, after confirming which lock tempo.beatlessNeverLocks measures | npm run scorecard runs | tempo.beatlessNeverLocks is 0 with no kick track's first lock later by more than 0.5 s, or the slice is reverted and the result recorded |
| AC8 | the stretch 3/2 slice is attempted after AC6 | npm run scorecard runs | ac9.dottedChangeCounted is 1 with tempo.falseSongChanges not higher on any track and the AC6 spec still passing, or the slice is shelved with the measurement recorded |
| AC9 | the plan's slices are done | docs/agents/hub-scorecard.md and rhythm-stability-results.md are read | each failing cell in the request (6-8-time, half-time-shuffle, lonley, bassline-kick-120, dance-clip consistency across plays, the syncopation-no-kick first lock) has its before and after value and a status of fixed, stretch-open, re-plan or accepted |
| AC10 | S2's 16-seed harness (120 s at 120 BPM) for sparse noise and equal eighths, fed with a stated kick-stream model (the low-band share of each synthetic onset, plus a kick-only-noise variant), main's move counts recorded under it, a wrong-first-phase synthetic that fails on main, and octave changes, 1 percent period moves, tempo changes and song boundaries | the beatTracker specs run with the kick stream fed | phase moves on noise and eighths are not above main's recorded counts. The wrong-first-phase grid moves onto the beat within the winning-streak length the slice sets (phaseWins and phaseBeats as consecutive winning beats), and on summer2000 the first move lands before the latest move time S1 records for AC1. Rival and evidence state reset on octave and boundary changes and on a period move above the rival's tolerance |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Does the 3/2 dotted change belong in this plan? | Yes, as a later phase after the beat-phase redesign, with the 3:2 polyrhythm grid spec first. The dotted cell is stretch. | user | Keeps the four followups together without blocking the phase fix on a shelved, risky rule |
| D2 | Is a beat-presence model in scope? | In scope as a stretch slice, not required to close the plan | user | beatless is one cell; a presence gate risks lock time on weak-kick tracks |
| D3 | Which cells are required? | Required: summer2000 beat.errorMedianMs at most 40, plus no regression (scorecard:check, sweep:gate, gate seconds not worse). low-bpm-rnb gets one bounded attempt; a miss is recorded and re-planned. gate.secondsAfterLock is reported, not required. Everything else is stretch. | user | Trevor's first-round answer, refined after the critic showed two different causes and that the gate's seconds depend on bassGate relearning |
| D4 | What is the budget for code and CPU? | Total JS may grow by up to 3 kB (limit 341.5 kB, raised in the same PR with the reason). Tracker CPU per frame may grow by at most 25 percent, measured offline. | user | Leaves room for several phase hypotheses |
| D5 | Where does the CPU cap apply? | To the main-thread RhythmAnalyzer and BeatTracker, because they run there (rhythmTracker.ts:150). The worklet only computes band onsets. | repo-fact | Scout brief: the AudioWorklet is rhythmProcessor.worklet.ts; the tracker classes run on the main thread |
| D6 | Is there one shared fix for summer2000, low-bpm-rnb, half-time-shuffle and 6-8-time? | No single shared fix. summer2000 is a wrong first phase that the existing phase check does not move. low-bpm-rnb is a per-beat correction slide that the phase check cannot see. half-time-shuffle (beat level) and 6-8-time (meter and lock) are separate again. Each gets its own slice. | repo-fact | hub-scorecard.md:497-504 and 995-1023, beatTracker.ts:20-37; the critic's F2 and F3, checked by the lead |
| D7 | Where do the followup packets come from? | They are outside the repo (verified-diamond state). FU-polyrhythm-grid-spec appears nowhere in the repo, so the plan restates each followup from audio-alignment-findings.md:527-537 and rhythm-stability-results.md:94. | repo-fact | Scout brief, Unknowns |
| D8 | What if the low-bpm-rnb slice misses 40 ms? | Do not merge it. Ship summer2000 alone, record the trace and the reason, and re-plan low-bpm-rnb separately | user | Keeps the plan from stalling on its hardest track |
| D9 | Is the gate seconds cell required? | No. Beat error is the exit rule; gate.secondsAfterLock must not get worse and is reported with its cause | user | The gate's relearning after a grid move is bassGate behavior, and bassGate is a non-goal here |
| D10 | Does a phase move bump gridEpoch? | No. A phase move keeps the beat numbering and counts in phaseShiftCount, as checkPhase does today. Only a numbering break bumps the epoch | repo-fact | beatTracker.ts and its epoch specs; an epoch change shrinks the meter's evidence (rhythmAnalyzer.ts:161-165) |
| D11 | Does a runtime enable flag ship? | No permanent flag. New behavior is ablatable through rhythmConfig constants during tuning. The defaults that reproduce main are checked only on committed synthetic specs, and the .debug-in comparison is a local scorecard JSON diff. Rollback is a PR revert | planner assumption (confirm) | Critic F6: CI has no .debug-in audio, and dead branches cost bundle margin |
| D12 | How is CPU measured? | bench:tracker runs main and the branch interleaved in one process and session (median of N runs). No committed machine-specific baseline | planner assumption (confirm) | Critic F10: Windows machine load has skewed results before |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Keep the single-hypothesis PLL but add a decayed, kick-weighted phase histogram folded on the current period, and re-run the existing phase search every few beats against it (not only after 8 onset-free beats), with hysteresis. | 3 | 3 | 5 | 3 | 4 | yes | 3.5 |
| O2 | robust | Add a preallocated phase-evidence bank to BeatTracker: a kick-weighted, leaky phase histogram over the beat period whose top few peaks are scored as hypotheses, and move the grid only on sustained evidence, bumping gridEpoch. | 4 | 3 | 3 | 4 | 4 | yes | 3.55 |
| O3 | contrarian | Stop treating phase as something the PLL must track onset by onset; every beat, score all phases against the last ~12 beats of onset history with a comb, and move the grid when a rival phase clearly wins, leaving the PLL as the fine tracker. | 4 | 3 | 4 | 3 | 4 | yes | 3.6 |
| O4 | hybrid | Measure first, then add a stateless phase comb (from O3) over the onset history BeatTracker already keeps, with O2's incumbent-versus-challenger hysteresis and a kick term used only inside the comb. A config switch reproduces today's tracker exactly, so every step is ablatable and revertible. The stretch slices reuse the comb's contrast (beat presence) and bar-length scoring (6-8, half-time), and 3/2 comes after the polyrhythm spec. | 2 | 2 | 3 | 3 | 4 | yes | 2.55 |
| **O5** (chosen) | hybrid | Diagnose the existing phase check first, then make two separate, small fixes. summer2000: give the existing phase bins kick-weighted evidence, or loosen their gate, whichever the trace shows blocks them. low-bpm-rnb: a bounded second phase hypothesis anchored on the tempo period, which does not turn with the grid, so it can see and veto the slide. Stretch slices follow in order. | 5 | 4 | 4 | 3 | 4 | yes | 4.15 |

## Decision

**O5**: Diagnose the existing phase check first, then make two separate, small fixes. summer2000: give the existing phase bins kick-weighted evidence, or loosen their gate, whichever the trace shows blocks them. low-bpm-rnb: a bounded second phase hypothesis anchored on the tempo period, which does not turn with the grid, so it can see and veto the slide. Stretch slices follow in order.

O5 starts from the phase check BeatTracker already has (critic F2), keeps gridEpoch semantics (F1), and splits summer2000's wrong first phase from low-bpm-rnb's slide (F3), with the exit rule Trevor chose. O1 to O4 all assumed a single-hypothesis tracker with a shared cause, which the code and hub-scorecard.md contradict.

**Approach:**
- S1 trace: per-beat error against the taps, plus checkPhase bins, best place, ratio and consecutive wins, the correction's chosen peak, the period, phaseShiftCount and the gate's open time. Run on summer2000 and low-bpm-rnb before any design constant is fixed. bench:tracker times main and the branch interleaved
- S2 specs: a 3:2 polyrhythm pin (AC6), and it.fails synthetics for a wrong first phase on a dense track and for an early syncopated kick slide
- S3 summer2000: feed a low-band (kick) flux into the existing phase bins next to the summed onset. push(time, onset, kick?) gets an optional third argument, with BeatTracker holding no new ring. If S1 shows the bins already favor the kicks, change the gate (PHASE_MIN_BEATS, PHASE_SHIFT_BEATS) instead. Pre-registered grid of at most 12 points; take the first point that meets AC1 with AC3 and AC10 green
- S4 low-bpm-rnb: a rival phase accumulator folded on absolute time modulo the tempo period (not relative to the grid), so a slide shows up as the grid drifting away from a stable rival. The correction's peak choice is vetoed when it moves the grid away from a sustained rival, and the period follow is damped while they disagree. One bounded attempt; merge only if AC2 passes
- No gridEpoch bump on any phase move (D10). Each slice is ablatable through rhythmConfig constants; rollback is a PR revert (D11)
- S5 closes the required cells: live dancer and cubes check, it.fails removal, findings docs
- Stretch, one PR each: S6 beat presence (confirm which lock beatlessNeverLocks measures; if it is the tempo lock, the slice lives in tempo.ts); S7 the 3/2 rule with FU-boundary-dotted and FU-dotted-leaky after AC6; S8 bar-level beat for 6-8 and half-time

## Design

Diagnose first, then make two separate small fixes, then do the stretch work. S1 adds a beat trace that prints, per beat: error against the taps; the phase check's bins, best place, ratio, phaseWins and phaseBeats (with each reset); the correction's chosen peak; the period; phaseShiftCount; and the gate's open time. It also adds an interleaved CPU bench, and records the summer2000 block, the latest first-move time that still allows AC1, and the fixed, ordered constant grid for S3. S2 pins a 3:2 polyrhythm grid. After S1, it adds the 16-seed noise and eighths harness with a kick-stream model, plus synthetics that reproduce the traced block (shown failing on main before it.fails is committed). S3 fixes summer2000 inside the existing checkPhase. Either it adds kick evidence (the peak-normalized band-0 term, on top of its existing onset weight), or it changes the winning-streak gate, whichever S1 shows is the block. S4 attempts low-bpm-rnb's slide, only if S1's trace shows the rival evidence stays on the taps through the slide window. The rival is folded relative to an anchor: the grid's phase at the last phase move or octave change, with the period held at the anchor. It clears when the period estimate moves more than BEAT_RIVAL_PERIOD_TOLERANCE (1 percent), and on octave and boundary changes. While a sustained rival disagrees with the grid, the correction may not pull the grid away from it, and the period follow is damped. S4 merges only if AC2 passes (D8). No phase move bumps gridEpoch (D10). S5 closes the required cells. S6 to S8 are stretch.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| Beat trace tool | Per-beat error and phase-check internals, correction peak, period and gate open time over time, with --set overrides through loadWithOverrides | scripts/rhythm-tools/beatTrace.ts (npm run trace:beats) |
| Tracker CPU bench | Interleaved main-versus-branch time per frame of RhythmAnalyzer plus BeatTracker, median of N runs in one session | scripts/rhythm-tools/benchTracker.ts (npm run bench:tracker) |
| BeatTracker | Kick-weighted phase bins or a loosened gate (S3); rival accumulator on absolute time with the slide veto and damped period (S4); all state preallocated and reset on octave, tempo and boundary changes | app/features/rhythm/beatTracker.ts |
| RhythmAnalyzer | Passes the low-band flux of each frame to beat.push; ONSET_BAND_WEIGHTS unchanged | app/features/rhythm/rhythmAnalyzer.ts |
| rhythmConfig | New named constants: BEAT_PHASE_KICK_WEIGHT, BEAT_RIVAL_DECAY, BEAT_RIVAL_MARGIN, BEAT_RIVAL_PERIOD_DAMP; the PHASE_* constants move here so ablate:rhythm can override them | app/features/rhythm/rhythmConfig.ts |

### Contracts (freeze before dependent work)

- **C1 tracker.state beat contract** (internal API): lastBeatTime, periodSeconds, beatCount and gridEpoch keep today's meaning. A phase move (checkPhase today, or the S4 veto) never bumps gridEpoch and increments phaseShiftCount. beatCount never decreases. Only a numbering break (a realign after lost beats, or a song change) bumps gridEpoch, as today. Hub, dancer gate, cubes and meter need no change, and the existing beatTracker.test.ts epoch specs pass unchanged.
- **C2 BeatTracker.push signature** (internal API): push(time: number, onset: number, kick?: number): boolean. kick is the same peak-normalized band-0 term RhythmAnalyzer already uses in the onset (flux[0] / fluxPeak[0], rhythmAnalyzer.ts:147-155). BEAT_PHASE_KICK_WEIGHT is added on top of ONSET_BAND_WEIGHTS[0], in the phase bins only. When kick is omitted it counts as 0 and the result is identical to main. There is no new history ring: kick is folded per frame into the O(PHASE_BINS) bins and, in S4, the rival accumulator.
- **C3 Tracker constants** (config): Named exports in rhythmConfig.ts (BEAT_PHASE_KICK_WEIGHT, BEAT_RIVAL_DECAY, BEAT_RIVAL_MARGIN, BEAT_RIVAL_PERIOD_DAMP, BEAT_RIVAL_PERIOD_TOLERANCE, and the PHASE_* constants moved from beatTracker.ts), overridable with ablate:rhythm --set and trace:beats --set. At the defaults that reproduce main (kick weight 0, rival off), committed synthetic specs show output identical to main. The .debug-in check is a local scorecard JSON diff. No runtime flag ships.
- **C4 Trace and bench CLIs** (dev CLI): npm run trace:beats -- <wav> [--set NAME=VALUE]... prints one row per beat: time, error ms versus the nearest tap, phase bin best place, ratio, wins, chosen peak offset, period, phaseShiftCount, gridEpoch, and the gate open time. npm run bench:tracker -- [--dir <folder>] [--runs N] times main (from a git worktree build or a stored bundle built in the same session) and the branch interleaved, and prints the median ratio. It is advisory, not a CI gate. Both print usage with no args, and both are dev only.

### Data

No persisted app data. The tapped .beats.json are read-only. The scorecard baseline is rewritten only after AC3 passes, in its own commit, to record improvements.

### UX

No UI change. On summer2000 the grid settles on the kicks a few beats after enough phase evidence. On low-bpm-rnb it stops sliding onto the early kick. A phase move is one grid jump, as today (slewing is Q2).

### Accessibility

No change: no UI surface.

### Security and privacy

No change: client-side only, and no audio leaves the machine or the repo.

### Observability

trace:beats, the scorecard cells, and the existing debug:viz telemetry, which already records gridEpoch and phaseShiftCount (rhythmAnalyzer.telemetry.test.ts:51).

### Rollout and rollback

One PR per slice. S1, S2 and S5 are test or docs titles when nothing ships, and S3, S4 and S6 to S8 are fix(rhythm). Every tracker PR runs scorecard, scorecard:check, sweep:gate and bench:tracker, lists the before and after of every changed cell, and gets checked on the Cloudflare preview. S3 merges once AC1, AC3, AC4, AC5 and AC10 hold. S4 merges only if AC2 also holds; otherwise its findings are committed as docs and the branch is dropped. The baseline is rewritten after merge, in its own commit. Rollback is a PR revert. Any size-limit raise (at most 341.5 kB) goes in the PR that needs it, with the reason.

## Test strategy

- **Unit:** beatTracker.test.ts: the wrong-first-phase dense synthetic moves within 8 beats of PHASE_MIN_BEATS (S2's it.fails flips in S3). The early-kick slide synthetic holds the beat (S4). Sparse noise and equal eighths over 16 seeds give move counts not above 63 and 15. Rival and evidence state reset on octave, tempo and boundary changes. Phase moves keep gridEpoch and bump phaseShiftCount. push without kick is identical to main. Coverage stays at 95 percent or more.
- **Integration:** Offline: npm run scorecard, then scorecard:check (exit 0, no hash change), sweep:gate (false opens not above main, gate seconds not worse), eval:rhythm --alignment, sweep:onsets, and trace:beats on summer2000, low-bpm-rnb and the passing tracks. scripts/ground-truth polyrhythm spec (AC6). A local scorecard JSON diff at the main-reproducing defaults.
- **End-to-end:** npm run test:e2e after build: every visualizer renders, no console errors, contexts released.
- **Manual:** npm run dev and debug:viz on summer2000 and low-bpm-rnb with the dancer and cubes. scorecard:live for the dancer from the main checkout, one run at a time on an idle machine, repeating outliers.
- **Non-functional:** npm run size at most 341.5 kB total JS. bench:tracker median ratio at most 1.25, measured interleaved. No per-frame allocation: all new state is in preallocated Float32Arrays, checked by review.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | The new constants overfit the two failing tracks and move passing ones | medium | high | S1 fixes the grid (at most 12 points) and its order before S3 runs. Take the first point meeting AC1 with AC3 and AC10 green, and require the named weak tracks no worse than main (AC3). The whole grid's results go in the PR. |
| K2 | On low-bpm-rnb the rival accumulator also follows the early kick, or the veto holds a wrong grid through a real tempo change | high | medium | S4 starts only if S1's trace shows the anchored rival stays on the taps through the slide window. It is one bounded attempt with the exit rule D8, plus resets and a 1 percent period-move spec (AC10). The dotted and octave scenario cells are in scorecard:check. |
| K3 | Kick-weighted phase bins change phase moves on every track, moving dancer and cube timings or the gate seconds on passing tracks | medium | medium | AC3 also checks that gate seconds are not worse, plus the AC10 noise and eighths bounds and scorecard:live for the dancer before merge. |
| K4 | Total JS passes 341.5 kB or CPU passes 1.25x | low | medium | No new history ring, and O(PHASE_BINS) work per frame. The dev tools are not shipped. Run size in every PR. |
| K5 | Live-cell results are skewed by machine load | medium | low | Live cells are advisory. Run them one at a time on an idle machine and repeat any outlier. |
| K6 | S1 shows summer2000's phase check is blocked by something other than evidence or its gate (for example the correction pulling against it, as on low-bpm-rnb) | medium | medium | S3 then reuses S4's rival-veto design for summer2000, and S4 is pulled forward. The finding is recorded before any constant is set. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Beat trace and interleaved tracker bench: Dev tools that print the per-beat error and the phase check's internals (bins, ratio, phaseWins and phaseBeats with resets, chosen peak, period, gate open time), plus an interleaved main-versus-branch CPU bench. Run them on summer2000 and low-bpm-rnb. Record why the phase check stays silent on summer2000, the latest first-move time for AC1, whether an anchored rival stays on the taps on low-bpm-rnb, and S3's fixed ordered constant grid. No app behavior change; AGENTS.md changes only to add the two commands to its table |  | AC4, AC10 | C4 | R0 | S | scripts/rhythm-tools/beatTrace.ts, scripts/rhythm-tools/benchTracker.ts, package.json, docs/agents/debug-harness.md, docs/agents/hub-scorecard.md, AGENTS.md |
| S2 | Pin 3:2 polyrhythm grid and wrong-first-phase case: A synthetic 3:2 polyrhythm ground-truth spec pins today's beat level and tempo (FU-polyrhythm-grid-spec). After S1: a 16-seed noise and eighths harness with a stated kick-stream model, with main's move counts recorded, plus it.fails synthetics that reproduce the traced summer2000 block and the early-kick slide, each shown failing on main first | S1 | AC6, AC10 |  | R0 | S | scripts/ground-truth/, app/features/rhythm/beatTracker.test.ts |
| S3 | summer2000: kick-weighted phase check: Add the optional kick argument, and feed kick-weighted evidence to the existing phase bins, or loosen their gate if S1 shows evidence is not the block. Pick constants from a pre-registered grid so summer2000 is at most 40 ms with no regression, and the wrong-first-phase it.fails flips | S1, S2 | AC1, AC3, AC4, AC5, AC10 | C1, C2, C3 | R2 | M | app/features/rhythm/beatTracker.ts, app/features/rhythm/beatTracker.test.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmConfig.ts, .size-limit.json |
| S4 | low-bpm-rnb: rival phase veto against the slide: Only if S1's trace supports it: a rival accumulator anchored on the grid's phase at the last move or octave change, with the period held and a clear on a period move above 1 percent and on octave or boundary changes. It vetoes correction pulls away from a sustained rival and damps the period follow. It merges only if low-bpm-rnb is at most 40 ms with no regression; otherwise the findings are recorded and the branch is dropped | S1, S3 | AC2, AC3, AC4, AC5, AC10 | C1, C3 | R2 | M | app/features/rhythm/beatTracker.ts, app/features/rhythm/beatTracker.test.ts, app/features/rhythm/rhythmConfig.ts, docs/agents/hub-scorecard.md |
| S5 | Close required cells: live check and findings: After S3 is merged and S4 is either merged or recorded as dropped: run scorecard:live for the dancer and cubes, remove it.fails markers that now pass, rewrite the baseline in its own commit after AC3, and record before and after for every failing cell. Each later stretch slice rewrites the baseline itself, in its own commit after its AC3 passes, and appends its cells to the same docs | S3, S4 | AC9 | C1 | R1 | S | docs/agents/hub-scorecard.md, docs/agents/rhythm-stability-results.md, docs/agents/hub-scorecard.live.json, docs/agents/hub-scorecard.baseline.json |
| S6 | Stretch: beat presence: First answer Q3 (which lock beatlessNeverLocks measures). Then block that lock while a presence signal that exists before the lock stays below a floor. Candidates are tempo.ts autocorrelation contrast, or an align-time sum, chosen after Q3; the phase bins only exist after alignment. The goal is that beatless never locks, with no kick track's first lock later by more than 0.5 s. Otherwise revert and record | S3 | AC7, AC3 | C3 | R2 | L | app/features/rhythm/tempo.ts, app/features/rhythm/beatTracker.ts, app/features/rhythm/rhythmConfig.ts |
| S7 | Stretch: 3/2 tempo change with dotted followups: Revisit the shelved 3/2 rule (FU-S6-three-halves-change) with FU-boundary-dotted and FU-dotted-leaky, using phase evidence to tell a stopped beat from a 3:2 layer, while the S2 polyrhythm spec stays green. Ship it, or shelve it with the measurement | S2, S3 | AC8, AC3 | C1, C3 | R2 | L | app/features/rhythm/tempo.ts, app/features/rhythm/boundary.ts, app/features/rhythm/rhythmAnalyzer.ts, docs/agents/audio-alignment-findings.md |
| S8 | Stretch: bar-level beat for 6-8 and half-time: Score bar lengths of 2, 3 and 4 beats to pick the beat level on 6-8-time and half-time-shuffle (and check the 3/4 at 180 it.fails), then report lonley, onset f50, dance-clip consistency and the syncopation-no-kick first lock | S3 | AC9, AC3 | C3 | R2 | L | app/features/rhythm/meter.ts, app/features/rhythm/beatTracker.ts, app/features/rhythm/rhythmAnalyzer.test.ts, docs/agents/rhythm-stability-results.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | After S3 and S4, does low-bpm-rnb need its own multi-hypothesis tracker plan? Settled by AC2's outcome under D8 | Trevor | no |
| Q2 | Should a phase move be slewed over one or two beats to soften the known abrupt re-align? | implementer of S3, confirmed by Trevor | no |
| Q3 | Does tempo.beatlessNeverLocks measure the tempo lock or the beat grid's lock (scripts/scorecard measures.everLocked)? This decides whether S6 lives in tempo.ts or beatTracker.ts | implementer of S6 | no |

## Critic pre-mortem

Passes: 2. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F3 | high | S4's core mechanism is not well-defined. The rival accumulator is 'folded on absolute time modulo the tempo period'. tempoPeriod comes from tempo.update() and is re-set through beat.setTempo() on every tempo update (rhythmAnalyzer.ts:156-160). The phase of a fixed absolute time t under modulo T moves by about t*dT/T^2, so at t=60 s and a 0.5 percent period change the whole fold shifts by about 0.4 beat, and the bins mean nothing across any estimate change. Only an octave or a large reinit is a 'tempo change' in AC10, so small drifts would silently corrupt the rival, or force a clear on every update, which removes the memory the veto needs. A fold relative to a fixed anchor time and a held period is a different design that the plan does not specify. On low-bpm-rnb the lock itself is a 162 to 81 halving, and changeOctave (beatTracker.ts:155-166) clears the bins right then, so the rival starts empty exactly when the grid is placed on the beat. The rival's evidence is also the same onset sum that the doc says band weights, window and gains could not separate. K2 rates the miss as high likelihood, so the design as written is likely to be a bounded miss. | Changed the plan. The S4 rival is anchored on the grid's phase at the last move or octave change, with the period held. It clears on a period move above BEAT_RIVAL_PERIOD_TOLERANCE (1 percent) and on octave or boundary changes, and AC10 has a 1 percent period-move spec. S4 starts only if S1's trace shows the anchored rival stays on the taps through the slide window. It is otherwise a recorded miss under D8. |
| F5 | high | AC3 and the goals say gate.secondsAfterLock must not get worse on any track, while D9 says the gate is reported and not required. In scripts/scorecard/targets.ts:152-163 the cell is blocking:true with floor 4. scorecard:check only fails a blocking pass-to-fail change, so 'not worse' is not enforced for the tracks already failing (summer2000 at 6.1 s, half-time-shuffle 7.2, lonley 10.8) or for a passing track that gets slower but stays under 4 s. Conversely, a phase move after the dancer's lock makes the gate relearn its place on the tracker's beat, so the cell may well get worse on summer2000, and the plan then blocks S3 on a cell the tracker does not own. The two statements cannot both be gates. | Changed the plan. AC3 now requires a numeric diff of every gate cell against the baseline. Passing tracks may not go from pass to fail or rise by more than 0.5 s. A rise on tracks already failing is accepted and reported with the trace's gate open time (D9). |
| F7 | medium | K1's guard is weaker than stated. The 'pre-registered grid, first point meeting AC1 with AC3 and AC10 green' selects on summer2000 itself. The held-out tracks are tracks that already pass, which can only show no regression, not that the constants generalise. A 'first point' rule also depends on the order of the grid, which is not fixed. The failure mode is that the kick weight is tuned until summer2000 clears 40 ms, with no check on any other failing or syncopated track (syncopation-no-kick, 6-8-time, syncopationbass, high-bpm-dnb first lock). | Changed the plan. S1 fixes the grid and its order before S3. AC3 now requires the named weak tracks (syncopation-no-kick, 6-8-time, syncopationbass, high-bpm-dnb) no worse than main, and the whole grid goes in the PR (K1). |
| F9 | high | AC10's noise and eighths bounds (63 and 15) can pass vacuously and have no harness. The existing phase specs in app/features/rhythm/beatTracker.test.ts drive the envelope only, through push(time, onset), and the 16-seed noise figures are quoted in a comment at beatTracker.ts:28-31, not in a spec (no seed loop exists in beatTracker.test.ts). C2 says a missing kick counts as 0 and gives output identical to main, so a noise or eighths synthetic that does not feed a kick stream cannot show any difference from the S3 change. The bound has to be measured with a kick stream that is correlated with the noise and the eighths the way real low-band flux is, and the plan does not say how that stream is built. AC10's 'moves within 8 beats of reaching PHASE_MIN_BEATS' is also ill-defined (see F14). | Changed the plan. S2 adds the 16-seed harness with a stated kick-stream model and records main's counts under it. AC10's bounds apply to the kick-fed runs. |
| F11 | high | S2's it.fails synthetic for a wrong first phase on a dense track will likely pass on main, which makes vitest fail the it.fails. beatTracker.test.ts:396-412 and 425-436 show that checkPhase already moves an off-beat start with envelope-only drive. Reproducing summer2000 needs the mechanism that blocks the check on real audio, and S1 has not found it yet. S2 has no depends_on S1, so the synthetic is written before the cause is known. The AC10 latency claim on that synthetic is only as good as its likeness to the real block. | Changed the plan. S2 now depends on S1. Its synthetics reproduce the traced mechanism and are shown failing on main before it.fails is committed. |
| F14 | medium | In checkPhase (beatTracker.ts:332-339) phaseBeats is reset to 0 on any beat where the rival does not win, the same as phaseWins. So PHASE_MIN_BEATS (8) is really a run of 8 consecutive winning beats, not 'beats of evidence' as the comment and AC10 say. On a dense track a single beat where the grid's own 3-bin window ties or wins restarts the count, which is a possible reason for the silence on summer2000 that the plan does not list. It also makes AC10's 'within 8 beats of reaching PHASE_MIN_BEATS' ambiguous, and 'loosening PHASE_MIN_BEATS' in S3 changes a streak length, not an evidence minimum. With a 20-beat memory and a median over the post-lock beats, AC1 also needs the move early (the doc's diagnosis ends near 30 s), so the move latency on the real track matters, not only on the synthetic. | Changed the plan. The trace prints phaseWins and phaseBeats with each reset. AC10 is worded in terms of the winning streak. S1 records the latest first-move time on summer2000 that still allows AC1, and S3 must meet it. |
| F12 | medium | C2 says the 'low-band flux' goes straight into the bins, but the onset it is added to is normalised: rhythmAnalyzer.ts:147-155 divides each band's flux by its own decaying peak, because raw flux is a per-bin mean and the kick band is narrow. A raw kick flux would put the kick weight on a different scale per track and per loudness, which makes BEAT_PHASE_KICK_WEIGHT a per-track tuning constant. The kick already contributes ONSET_BAND_WEIGHTS[0] times its normalised flux to the onset, so the extra term double-counts it. C2's signature gives no definition. | Changed the plan. C2 defines kick as the peak-normalized band-0 term (flux[0] / fluxPeak[0]), with BEAT_PHASE_KICK_WEIGHT added on top of ONSET_BAND_WEIGHTS[0] in the phase bins only. |
| F13 | medium | S5 depends_on S3 and S4, and S5 holds the AC9 documentation and the baseline rewrite for the required cells. S4 is expected to miss (K2 high likelihood, D8 says drop the branch), so the chain stops at a slice that is not merged. S6 to S8 depend only on S3, so they can ship before S5 closes, and each then rewrites the baseline or records cells without a closing slice. | Changed the plan. S5 runs once S3 is merged and S4 is either merged or recorded as dropped. Each later stretch slice owns its own baseline rewrite and docs entry. |
| F15 | low | S6 uses the phase evidence's peak over mean as the presence floor. That evidence (phaseBins) is only filled after BeatTracker is aligned (beatTracker.ts:190-194), so it cannot gate the first lock without moving the check ahead of align(). If beatlessNeverLocks measures the tempo lock, the bins do not exist at all there. Q3 and the S6 text allow tempo.ts but still name the phase evidence as the signal. | Changed the plan. S6's presence signal must exist before the lock (tempo.ts autocorrelation contrast, or an align-time sum), chosen after Q3. |
| F16 | low | The plan's text is stale in places. The observability note says phaseShiftCount is added to the telemetry columns in S1, but it is already read by the dancing-character scene and the telemetry spec (rhythmAnalyzer.telemetry.test.ts:51, useDancingCharacterScene.ts), and S1's draft paths list no telemetry file. S1 also lists AGENTS.md as an edit while being 'no app behavior change'. | Changed the plan. The observability note now cites the existing phaseShiftCount telemetry, and S1 states that AGENTS.md changes only for the commands table. |

## Hand-off

A verified-diamond draft DAG with 8 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `8e1ac569095fe66c`).
