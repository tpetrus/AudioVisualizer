# Audio engine music alignment research
> Double-diamond plan `audio-engine-alignment` revision 1 | status **final** | lane full | risk R2 | base e33224936a35 | updated 2026-11-13T15:26:28.215Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> <task>
> -research how we can make the audio engine work better
> </task>
> 
> <context>
> -currently the audio data processing isnt aligning well to music
> -we have done multiple passes to try and align it with our tracks in /debug-in, and improved it, but it still isnt aligning to audio the way youd expect a visualizer to
> </context>
> 
> <requirements>
> -research tweaks to existing data processing
> -research new data processors we can use
> -research additional hooks that will help us 'lock in' to specific audio data and visualize it
> </requirements>
> 
> <scope-and-non-goals>
> -this should not include accepting new audio sources, we will leave that alone
> </scope-and-non-goals>
> 
> <verification>
> -we have found the root cause of inconsistencies and issues with audio analysis
> -we have found solutions to these problems
> </verification>

## Problem

Visualizers do not track the music the way a listener expects: the beat pulse locks to the wrong tempo or drifts, hits are missed or fire on non-events, and motion follows loudness without telling musical parts apart. Several tuning passes against the debug tracks improved results but did not find the cause, because alignment itself (beat times, onset times, audio-to-pixel delay) has never been measured against ground truth, and analysis is split between a shared rhythm tracker and separate per-visualizer spectrum code that reads one shared, mutable analyser.

**Users:** People watching a visualizer react to their own music; The developer tuning analysis and building new visualizers

**Evidence:**
- User report: symptoms are wrong or drifting beat, misses or false hits, and flat non-musical motion, and they vary from visualizer to visualizer
- docs/agents/rhythm-stability-results.md: syncopation-no-kick holds 180 for a 135 track; lonley locked 187.5 for 140 in 2 of 3 plays with the gate opening after 9.1 s; syncopationbass rebuilds the grid 196 to 98 near 29 s. The wrong locks are 4:3 and 2:1 ratios of the true tempo
- Same doc: live lock takes about 5 s for tempo and 11-13 s for meter; offline tempo accuracy 66.7 to 83.3 percent; the bass gate opens on 4 of 5 random patterns; summer2000 clip repeat spread 0.463 against a 0.05 target
- audioEngine.ts creates the shared analyser with Web Audio defaults (smoothing 0.8, -100 to -30 dB); cubes sets smoothing 0.5, trio-color-wave sets -90 to -20 dB, bass-ink sets only fftSize, so what one visualizer reads depends on which was opened before it
- Rhythm features are posted in batches of 8 frames (80 ms) and analysis runs about 100 ms behind; baseLatency and outputLatency are displayed but never compensated
- devTelemetry.ts records bass from its own analyser (FFT 4096, smoothing 0), which is not the input BassPulse or the visualizers actually use
- Not measurable today: beat times against ground truth, onset timing, end-to-end audio-to-pixel latency
- Each visualizer computes its own bands (cubes bands.ts, bass-ink spectrumField.ts and motionClock.ts, trio-color-wave config); only BassPulse and the bass gate are shared

## Goals

- Name the root causes of misalignment with a measured verdict for each hypothesis, not a guess
- Make alignment measurable: beat-time error, onset hit and false-hit rate, and reaction delay per visualizer, on the debug tracks and on synthetic tracks with exact known times
- Build one shared audio analysis hub that computes every feature once (band energy, per-band onsets for kick, bass, snare and highs, beat and bar phase with confidence, section changes), time-stamped in audio time, from which each visualizer takes what it wants, so new visualizers do not re-derive analysis
- Put immediate hit reaction first: per-band onsets must work from the first second and without a tempo lock; the beat grid is an enhancement on top
- Fix the confirmed causes in the existing processing (analyser configuration, latency handling, tempo ratio errors, lock time)
- Evaluate new processors (onset detection per band, alternative tempo trackers, candidate libraries) against the same measurements
- Audit how each visualizer presents the analysis (smoothing, catch-up, thresholds), fix presentation-side lag separately from analysis-side error, and move visualizers onto the hub

## Non-goals

- Accepting new audio sources or changing the source picker
- Redesigning how any visualizer looks beyond its reaction timing and mapping
- Upgrading three.js or other pinned dependencies
- Server-side or offline pre-analysis of tracks for production use; everything stays live and client-side
- Adopting a library or model without a measured win over the hand-written pipeline

## Success metrics

- Every listed hypothesis has a verdict (confirmed, rejected, minor or not measurable with the reason) backed by a number from a recorded run
- All six debug tracks lock to the labelled tempo within 2 percent, with no 4:3 or 2:1 lock held past 10 s
- On synthetic tracks: median beat-time error within 20 ms and per-band onset F-measure at least 0.9 at 50 ms, also reported at 20 ms
- On tapped real tracks: beat error and tempo are reported next to the measured tap-noise floor; there is no onset F target on real tracks because they have no onset ground truth
- Harness click-track reaction offset within 30 ms plus one frame, with the display delay at 0 ms
- What a visualizer reads does not depend on which visualizer was opened before it
- No visualizer keeps private band-energy or onset derivation that the hub provides; raw-spectrum consumers keep their own analyser
- No regression on the tracks that pass today (imyourgirl, syncopationbass2, summer2000)

## Constraints

- Client-side only, Web Audio API; no server
- No per-frame allocation; logic outside React; named exports; reuse useAnalyser and useRhythm (AGENTS.md)
- Worklet stays a thin shell with analysis in pure modules
- Coverage stays at 95 percent; bundle budget in .size-limit.json is 329 kB total JS and 133 kB entry, raised only on purpose with the reason stated
- No DSP or ML dependency exists today; a new one needs a measured win. essentia.js is AGPL-3.0, which is a licensing constraint to weigh
- Uncommitted bass-ink work on feat/bass-ink touches per-visualizer analysis and must not be clobbered
- Debug tracks are local files; ground-truth annotations must be creatable without shipping the audio

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | synthetic click and drum tracks with exact known beat and per-band onset times, and the debug tracks with tapped beat sidecar files | the offline evaluation and the live harness summary are run on a track | each reports beat-time error in ms (median and p95), tempo ratio to the label and lock time for every track, per-band onset precision, recall and F-measure at 20 ms and 50 ms for synthetic tracks only, and the tap-noise floor (spread of repeated taps on a click track) beside every tapped-track figure |
| AC2 | the list of root-cause hypotheses (shared analyser state, smoothing, AGC, batching and latency, tempo ratio errors, slow lock, gate false opens, per-visualizer duplication, presentation lag) | the diagnosis slice is complete | a findings document gives each hypothesis a verdict with the measurement and track it came from, and ranks the confirmed causes by measured effect |
| AC3 | two visualizers that want different analyser settings | they are opened one after the other in either order | a unit test shows each consumer's node carries exactly the settings it declares and no consumer can change another's node or the engine's fixed tap, and an offline deterministic run gives band energy within 1 dB in both orders |
| AC4 | a click track with known click times played through the dev harness with the display delay at 0 ms | a visualizer's onset reaction is recorded from scene state | the median offset between click and reaction in track time is reported and is within 30 ms plus one animation frame, with the frame-quantisation allowance stated |
| AC5 | the six debug tracks and their labelled tempos | each is played live three times and evaluated offline | every play locks within 2 percent of the label with no 4:3 or 2:1 lock held past 10 s, the three currently passing tracks still pass, and median beat error is within 20 ms on the synthetic tracks |
| AC6 | a visualizer that needs band energy, band onsets, beat phase or beat confidence | it reads them from the shared analysis hub | the values carry audio-time stamps, are computed once for all consumers, onsets are available without a tempo lock, and every visualizer's private band-energy and onset derivation is replaced by hub reads, where each migration passes the migration check: click-track reaction offset not worse than its baseline by more than 10 ms and synthetic-drum onset F not lower. Visualizers that need a raw or fine spectrum keep a per-consumer analyser for that only |
| AC7 | every visualizer in the landing list | the presentation audit is complete | a table lists for each its analysis inputs, its smoothing and catch-up time constants and its measured reaction delay, and each delay above the stated target has a fix or a recorded reason |
| AC8 | a candidate processor or library | it is compared with the current pipeline on the AC1 measurements | it is adopted only if it wins by the stated margin, and the decision with its numbers, bundle cost and licence is recorded |
| AC9 | production capture, where the listener hears the source directly and the page cannot observe when sound reaches them | the timing slice is complete | the findings document gives a capture-delay estimate for tab capture and for an input device with the method used (loopback recording of a click against the captured stream), or states it could not be measured, and a user sync offset setting exists as the fallback; no production latency figure is claimed as guaranteed |
| AC10 | the hub and the reference migration are merged | a developer reads the add-visualizer skill, architecture and conventions docs | they describe the hub as the way to get audio features, with the snapshot fields and when a private analyser is still appropriate |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | What does the plan deliver? | A measured diagnosis first, then ordered fix slices; later slices stay conditional on what the measurements show | user | Earlier passes improved things without finding the cause |
| D2 | Does the audit cover only analysis, or also presentation? | Both: how the audio is analysed and how each visualizer presents it | user | Symptoms vary from visualizer to visualizer |
| D3 | Are new runtime dependencies allowed? | Only when the evaluation shows a clear win; the size budget is then raised on purpose | user | Hand-written DSP stays the default |
| D4 | Are new audio sources in scope? | No | user | Stated in the request |
| D5 | Is there one analyser configuration all visualizers share? | No. The engine leaves the shared analyser at defaults and visualizers overwrite fftSize, smoothing and dB range on it | repo-fact | audioEngine.ts, useCubesScene.ts, trioColorWaveConfig.ts, useBassInkScene.ts |
| D6 | What are the numeric targets? | Stricter than first proposed: tempo within 2 percent, median beat error within 20 ms, onset F-measure 0.9 at 50 ms, reaction offset within 30 ms after compensation | user | User chose the stricter targets; this may need more tracker work or a library, which D3 allows when measured |
| D7 | How is ground truth made? | Synthetic click and drum tracks with exact times, plus a dev-only tap-along tool that saves beat sidecars for the real debug tracks | user | Exact where it matters and cheap for real tracks |
| D8 | Which comes first, hit reaction or beat grid? | Hit reaction first; the beat grid is an enhancement on top | user | Onsets work from the first second and on music without a steady tempo |
| D9 | What is the end state for analysis code? | One solid audio analysis hub that visualizers take what they want from, so analysis is not reinvented per visualizer | user | Stated at the framing checkpoint |
| D10 | Does the app play the captured audio itself, so that AudioContext output latency applies to what the listener hears? | No in production: audioEngine.ts only feeds the captured stream into gain and analysers and never connects to context.destination. Only the dev file source (devFileSource.ts) plays through the destination. The listener hears the original source, so the delay to compensate is capture plus analysis delay, not outputLatency, and the dev harness has a different timing path from production | repo-fact | Search for destination connections in app/: only devFileSource.ts line 42 |
| D11 | Is a deliberate display delay (look-ahead) part of the design? | Only as a measured experiment with a default of 0 ms. Keep rule: adopt only if synthetic onset F rises by at least 0.05 or median beat error falls by at least a quarter, and the added delay is 80 ms or less; AC4 is always reported at 0 ms | planner assumption (confirm) | D8 puts immediate hit reaction first, and the capture delay already makes the picture late; adding more delay must earn its place |
| D12 | Where do the strict targets (20 ms beat error, onset F 0.9) apply? | As pass or fail gates on synthetic tracks, where ground truth is exact. Real tracks are reported with the tap-noise floor and gated on tempo and lock only | planner assumption (confirm) | Critic F1 and F5: taps are noisier than 20 ms and real tracks have no onset annotations, so a real-track gate could never be shown to pass or fail |
| D13 | Do the new hub bands replace the worklet's existing three-band flux? | No. The worklet already computes three-band flux (kick, mid, high) in a packed frame that the tracker, eval scripts, replay fixtures and tests consume. The hub bands and onset events are an additional output in a versioned message; the tracker's input is unchanged until S6 changes it on purpose | repo-fact | rhythmConfig.ts BAND_COUNT 3 and FRAME_STRIDE, per the critic's reading of the code |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Extend the existing worklet, RhythmTracker and eval scripts into a thin AudioHub (per-band onsets from the existing flux features, audio-time stamps, engine-owned analyser config) and migrate visualizers onto it, with no new dependency. | 5 | 3 | 2 | 3 | 4 | yes | 3.5 |
| O2 | robust | Build one worklet-side, audio-time-stamped feature pipeline (the hub) fed by an engine-owned fixed-config analysis tap, with an explicit latency model and a ground-truth regression suite that gates every later change. | 4 | 4 | 2 | 4 | 4 | yes | 3.6 |
| O3 | contrarian | Stop chasing causal low-latency analysis: render every visualizer on a fixed, calibrated display delay (about 80 ms) so onset picking and beat scoring can use a short look-ahead window, make per-band onsets the primary hub signal and derive the grid only from onset history. | 2 | 2 | 1 | 3 | 3 | yes | 2.05 |
| **O4** (chosen) | hybrid | O2's structure (measurement first, per-consumer analysers, one worklet-side time-stamped feature pipeline, a hub contract, gated migration) with O1's reuse of the existing worklet, tracker and scripts, and two things from O3: the corrected timing model (the app does not play the audio, so capture and analysis delay is what matters) and an optional look-ahead display delay kept as a measured experiment defaulting to 0. | 4 | 4 | 2 | 5 | 4 | yes | 3.75 |

## Decision

**O4**: O2's structure (measurement first, per-consumer analysers, one worklet-side time-stamped feature pipeline, a hub contract, gated migration) with O1's reuse of the existing worklet, tracker and scripts, and two things from O3: the corrected timing model (the app does not play the audio, so capture and analysis delay is what matters) and an optional look-ahead display delay kept as a measured experiment defaulting to 0.

O4 keeps O2's structural fixes and regression gate, which address why earlier passes did not converge, while reusing the existing worklet, tracker and scripts as O1 does. It takes O3's repository finding that the app never plays the audio, which makes outputLatency compensation (proposed by O1 and O2) wrong for production, and keeps O3's look-ahead only as an experiment because D8 asks for immediate reaction. O3 alone rewrites the tracker and commits to late visuals; O1 alone leaves the hub thin and the tempo fix without a fallback.

**Approach:**
- Measure first: synthetic click and drum generators, tapped beat sidecars, beat and per-band onset metrics in eval:rhythm and debug:summary, telemetry that records the signals visualizers actually read
- Run the baseline and write the findings document: one verdict per hypothesis, plus a per-visualizer presentation table
- Isolate analyser settings: each consumer gets its own AnalyserNode with declared settings; the engine no longer exposes a mutable shared one
- Per-band onsets (kick, bass, snare, highs) by spectral flux with adaptive threshold in the existing pure extractor, stamped in audio time, emitted with no tempo lock
- Timing model: stamp every frame with audio time, cut the 80 ms batch, model capture and analysis delay separately for production (no destination) and the dev harness (plays through destination), measure the click offset, and try a 0-80 ms look-ahead as an experiment
- Tempo: score metrical ratios (2:1, 4:3, 3:2) with a tempo prior on the onset-strength curve, shorten lock time, compare with at least one candidate library under the AC8 gate; the current tracker stays until the new path wins
- Hub: one preallocated snapshot per frame (band energy, band onsets, beat and bar phase, confidence, tempo, section change), read through one hook; migrate cubes first as the reference, then the other visualizers, then update the docs and the add-visualizer skill

## Design

Two stages. Stage one makes alignment measurable and produces a findings document with a verdict per hypothesis. Stage two fixes what the measurements confirm, in an order that puts hit reaction first, and ends with one AudioHub that every visualizer reads. The worklet stays the single place where audio is analysed at a fixed rate: it emits per-frame band energy and per-band onset events stamped with audio time. The main thread turns those into a preallocated snapshot each animation frame using a timing model, and the rhythm tracker consumes the same onset-strength curve. Visualizers that still need a raw spectrum get a private analyser with their own settings. Slices after the diagnosis are conditional: a hypothesis the baseline rejects drops its fix, recorded in the findings document.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| Synthetic track generator | Writes click and drum-pattern WAVs with exact beat and per-band onset times and matching sidecars, including 4:3 and 2:1 trap patterns, a no-kick pattern and several tempos | scripts/ground-truth/ |
| Tap-along tool | Dev-only harness mode that plays a debug track and saves tapped beats as a sidecar, with a constant tap-offset correction and a tap-noise floor estimated from a click track | dev-only module next to app/features/audio/devFileSource.ts, scripts/ |
| Alignment metrics | Pure functions: beat error median and p95, tempo ratio, lock time, onset precision, recall and F-measure at a tolerance | app/features/rhythm/eval/ |
| Harness instrumentation | Dev-only: records each visualizer's reaction value from scene state with track time, records the signals visualizers actually read, and offers an AGC bypass switch for ablations | app/features/audio/devTelemetry.ts and the debug harness scripts |
| Engine analysis tap | One engine-owned analyser with fixed configuration that nothing outside the engine may change; the rhythm worklet, the hub and telemetry attach to it; recreated by the engine for each new AudioContext | app/features/audio/audioEngine.ts |
| Analyser factory | Creates one AnalyserNode per consumer with declared settings; the owning consumer may change its own node's settings at runtime (trio-color-wave controls do); the engine recreates consumer nodes on source change and frees them on release, stable under StrictMode double-mount | app/features/audio/audioEngine.ts and its React binding |
| Band onset extractor | Additional worklet output: hub band energy and per-band onset events by log-magnitude spectral flux with an adaptive median threshold; a longer window for the low bands if 1024 points cannot separate kick from bass | app/features/rhythm/bandOnsets.ts, called by the worklet extractor |
| Timing model | Feature time to render time: window centre, hop, batch and capture delay; separate constants for production capture and the dev file source; optional display delay and user sync offset | app/features/audio/timingModel.ts |
| Tempo ratio scoring | Scores metrical-ratio rivals with a tempo prior on the onset-strength curve and shortens lock | app/features/rhythm/rhythmAnalyzer.ts and rhythmConfig.ts |
| AudioHub | Composes band energy, onsets, beat state and section change into one snapshot; owns no React state | app/features/audio/hub/ |
| useAudioHub | Thin hook returning the hub for a scene to read through a ref each frame | app/features/audio/hub/ |

### Contracts (freeze before dependent work)

- **C1 BeatSidecar** (file format): JSON next to a track: { track, tempo, beats: seconds[], onsets: { kick: seconds[], bass: seconds[], snare: seconds[], highs: seconds[] } optional, source: synthetic or tapped, tapOffsetMs }. Audio files stay local and gitignored; synthetic sidecars and generators are committed.
- **C2 EvalReport** (data shape): Per track: tempoRatio, lockSeconds, beatErrorMs { median, p95 }, onsets per band { precision, recall, f } at toleranceMs, reactionOffsetMs for click tracks. Printed by eval:rhythm and debug:summary and asserted by the synthetic regression specs.
- **C3 WorkletFeatureMessage** (message): Versioned batch message. The existing packed three-band frame the tracker consumes is unchanged. Added beside it: frameTime (audio-clock seconds of each frame's window centre), hub band energy per frame, and onset events { band, time, strength }. Replay fixtures and eval scripts are updated for the new version in the same slice. Batch size becomes a config value measured in S5.
- **C4 Analyser request** (API): Two parts. engine.getAnalyser() and useAnalyser() with no options keep returning the engine-owned tap, now with fixed settings that callers must not set (the tracker, hub, telemetry and source panel read it). useAnalyser(options: { fftSize, smoothingTimeConstant, minDecibels, maxDecibels }) returns a node owned by that consumer, which may change its own settings later; BassPulse and every visualizer that sets analyser properties move to an owned node. The engine recreates owned nodes when the source and its AudioContext change.
- **C5 AudioHubSnapshot** (API): Preallocated, updated in place by hub.update(renderTime): { time, bands: Float32Array (sub, kick, bass, lowMid, mid, highs), onsets: per-band { lastTime, strength, sinceSeconds, count }, beat: { phase, barPhase, tempo, confidence, locked }, section: { changeCount, lastChangeTime } }. Onset fields are valid without a tempo lock.
- **C6 TimingModel** (API): renderTime(audioNow) = audioNow - displayDelayMs - userSyncOffsetMs; featureDelay = window centre + hop + batch + captureDelay(source kind). captureDelay for the dev file source is measured in the harness and uses outputLatency there only. For production capture it is an estimate from a loopback recording, or zero with the user sync offset when it cannot be measured.

### Data

No persisted user data. Sidecars and synthetic generators live in the repository; debug audio stays local. An optional display delay setting, if adopted, goes through the existing storage module.

### UX

Viewers see no new controls unless the look-ahead experiment is adopted, in which case one sync offset control is added to the existing ControlPanel. The developer gets one documented hub to read from when building a visualizer.

### Accessibility

No new UI by default. Reaction changes must not introduce full-screen flashing faster than three per second; the presentation audit checks onset-driven effects against that.

### Security and privacy

All analysis stays in the browser. No audio or annotations leave the machine. No credentials involved.

### Observability

Dev telemetry CSV gains hub columns (band energy, onset events, beat confidence, feature and render time). debug:summary prints the EvalReport. The findings document records baseline and after numbers per slice.

### Rollout and rollback

One pull request per slice, each with before and after EvalReport numbers in the description. S1 and S2 change no shipped behaviour. The new tempo scoring sits beside the current tracker and replaces it only when the eval shows a win on all six tracks with no regression. Visualizers migrate one at a time, cubes first; each migration regenerates visual baselines if needed and is checked on the Cloudflare preview. Rollback is a Cloudflare deployment rollback followed by a revert pull request. The uncommitted bass-ink work is committed or merged before any slice touches bass-ink.

## Test strategy

- **Unit:** Vitest specs beside each pure module: metrics against hand-computed cases, band onsets against synthetic signals with known event times, timing model arithmetic, ratio scoring on trap patterns (4:3, 2:1, no kick), hub snapshot updated in place with no allocation, analyser factory isolation with the Web Audio fakes. Coverage stays at 95 percent.
- **Integration:** Synthetic regression suite in vitest runs the worklet extractor and tracker offline over generated tracks and asserts EvalReport thresholds, so later changes cannot regress alignment silently. eval:rhythm runs the same over the local debug tracks with sidecars.
- **End-to-end:** Existing Playwright suite stays green. One added check opens two visualizers in both orders and confirms each gets its declared analyser settings.
- **Manual:** debug:viz on each debug track three times before and after each slice, compared with debug:repeat; click track through the harness for the reaction offset; one check with real tab capture and one with an input device, since the harness timing path differs from production; watch each visualizer in npm run dev.
- **Non-functional:** No per-frame allocation in hub reads; worklet CPU measured before and after adding band onsets; bundle size checked with npm run size, and any raise is justified in the pull request.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Capture delay for tab audio and input devices is not exposed by any API and varies by browser and source, so the reaction offset measured in the dev harness (which plays through the destination) does not transfer to production | high | medium | Model the two paths separately; measure production capture with a click played in another tab and with an input device in S5; document the residual constant; keep the optional sync offset as the fallback |
| K2 | Hand-written tempo scoring does not reach 2 percent on all six tracks or 20 ms beat error | medium | medium | AC8 comparison against a candidate library in S6; onsets already give hit reaction without a lock, so a weaker grid degrades gracefully; targets revisited with the user using baseline numbers |
| K3 | Ratio prior and thresholds overfit the six debug tracks | medium | medium | Synthetic trap patterns at several tempos in the regression suite; ablate:rhythm on held-out tracks; prefer structural scoring to per-track constants |
| K4 | Bass-ink was tuned recently and reads a full spectrum; the session's starting git status listed modified bass-ink files and an untracked spectrumField.ts, while the critic found the tree clean with those changes committed. Migration can undo that tuning either way | medium | medium | Check git status at the start of S3 and S8 and land any uncommitted work first; bass-ink keeps its own analyser for the spectrum and migrates last; re-verify its motion and spectrum feel with debug:viz after migration |
| K5 | Tapped beats carry human timing error larger than the 20 ms target | high | medium | Estimate and remove the constant tap offset with a click track; use the median across the track; judge the 20 ms target on synthetic tracks and treat tapped tracks as a looser check |
| K6 | Per-consumer analysers and band onsets raise CPU on low-end machines, and new code pushes the bundle past 329 kB | low | medium | Visualizers move to hub features and drop private analysers where they can; measure worklet time; raise the budget only with the reason stated |
| K7 | Changing reaction timing alters how visualizers look and breaks visual baselines | medium | low | Regenerate baselines per migration through the existing workflow and review them in the diff |
| K8 | Changing the worklet message and frame layout breaks the tracker, replay fixtures and eval scripts, and regresses the three passing tracks | medium | high | Hub output is additive and the message is versioned; the tracker input stays byte-identical in S4, shown by the existing replay fixtures passing unchanged |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Alignment metrics and synthetic ground truth: Pure metric functions, synthetic click and drum generators with sidecars, and EvalReport output in eval:rhythm and debug:summary. No shipped behaviour changes. |  | AC1 | C1, C2 | R1 | M | scripts/ground-truth/, app/features/rhythm/eval/, scripts/ |
| S2 | Baseline and root-cause findings: Run the baseline on synthetic and debug tracks, test each hypothesis with ablations (analyser order dependence, smoothing, AGC, batching, ratio locks, lock time, gate false opens, duplication), and write the findings document with verdicts and ranking. Decides Q2 and confirms or drops later slices. | S1, S9 | AC2 | C2 | R0 | M | docs/agents/audio-alignment-findings.md, docs/agents/rhythm-stability-results.md |
| S3 | Fixed engine tap and per-consumer analysers: The engine tap gets fixed settings; a factory gives each consumer an owned node. Every current caller is moved or confirmed: rhythmTracker, BassPulse, devTelemetry, useAudioState, ActiveSourcePanel and the cubes, bass-ink, trio-color-wave and dancing-character pages. Owned nodes survive source changes and StrictMode double-mount. | S1 | AC3 | C4 | R2 | M | app/features/audio/audioEngine.ts, app/features/audio/, app/features/rhythm/rhythmTracker.ts, app/features/rhythm/bassPulse.ts, app/features/visualizers/cubes/, app/features/visualizers/bass-ink/, app/features/visualizers/trio-color-wave/, app/features/visualizers/dancing-character/, app/test/, e2e/ |
| S4 | Per-band onsets as an added worklet output: Hub band energy and kick, bass, snare and highs onset events stamped in audio time, emitted without a tempo lock, in a versioned message beside the unchanged tracker frame; replay fixtures and eval scripts updated; synthetic regression specs assert onset F. Starts after Q2 is decided. | S1, S2 | AC1, AC6 | C3 | R2 | L | app/features/rhythm/bandOnsets.ts, app/features/rhythm/rhythmProcessor.worklet.ts, app/features/rhythm/rhythmConfig.ts, app/features/rhythm/types.ts, scripts/rhythm-tools/, scripts/ |
| S5 | Timing model and reaction offset: Frame time stamps drive render-time reads, the batch delay is reduced, the harness click-track offset is brought within target at 0 ms display delay, production capture delay is estimated or declared unmeasurable with a user sync offset as fallback, and the look-ahead experiment is adopted or dropped by the D11 rule. | S4 | AC4, AC9 | C3, C6 | R2 | M | app/features/audio/timingModel.ts, app/features/audio/storage.ts, app/features/rhythm/rhythmTracker.ts, app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmConfig.ts, docs/agents/audio-alignment-findings.md |
| S6 | Tempo ratio scoring, lock time and candidate comparison: Metrical-ratio scoring with a tempo prior on the onset-strength curve, faster lock, a gate that does not open on scattered bass, and a recorded comparison with one candidate library under the adoption gate; the current tracker is replaced only on a measured win. | S5 | AC5, AC8 | C2 | R2 | L | app/features/rhythm/rhythmAnalyzer.ts, app/features/rhythm/rhythmConfig.ts, app/features/rhythm/bassPulse.ts, docs/agents/audio-alignment-findings.md |
| S7 | AudioHub contract, reference migration and docs: The hub snapshot and hook, cubes migrated off its private band code as the reference and passing the migration check, and the add-visualizer skill, architecture and conventions docs describing the hub. | S3, S5 | AC6, AC10 | C5, C6 | R2 | M | app/features/audio/hub/, app/features/visualizers/cubes/, docs/agents/architecture.md, docs/agents/conventions.md, .agents/skills/add-visualizer/SKILL.md |
| S8 | Migrate remaining visualizers and close the audit: Every other visualizer reads the hub for band energy and onsets, one pull request per visualizer, each passing the migration check; raw-spectrum consumers keep their owned analyser; each reaction delay above target from the audit is fixed or has a recorded reason. Bass-ink goes last. | S6, S7, S10 | AC6, AC7 | C5 | R2 | L | app/features/visualizers/, e2e/visual.spec.ts-snapshots/, docs/agents/audio-alignment-findings.md |
| S9 | Tap-along tool and harness instrumentation: Dev-only tap-along mode with tap-offset correction and tap-noise floor, tapped sidecars for the six debug tracks, per-visualizer reaction recording from scene state, telemetry of the signals visualizers read, and an AGC bypass switch for ablations. | S1 | AC1 | C1, C2 | R1 | M | app/features/audio/devTelemetry.ts, app/features/audio/devFileSource.ts, scripts/ |
| S10 | Presentation audit: For every visualizer in the landing list, record its analysis inputs, smoothing and catch-up time constants and its measured click-track reaction delay as the baseline for the migration check, and list the fixes. | S9 | AC7 | C2 | R0 | M | docs/agents/audio-alignment-findings.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | AGENTS.md and the results doc mention it.fails rhythm specs, but none exist in app/ or scripts/. Were they removed or renamed, and should the docs be corrected? | developer, during S2 | no |
| Q2 | Should the engine tap and the worklet sit before or after the automatic gain control? The worklet takes its input after it today. Decided from the AGC ablation in S2 and recorded before S4 starts; moving it implies retuning thresholds | S2 findings; a gate on S4 | no |
| Q3 | Which candidate library is compared in S6, given that essentia.js is AGPL-3.0? | developer, at the start of S6 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | The F-measure 0.9 target for kick and bass onsets 'on the tapped real tracks' (success_metrics) cannot be measured. C1 makes per-band onsets optional in the sidecar and the tap-along tool (D7) records beats only, so real tracks have no kick or bass onset ground truth. A beat tap is not a kick annotation, and syncopated or no-kick tracks have beats with no kick. A 50 ms tolerance is also looser than the 30 ms AC4 target and than the human tap error in K5, so the real-track F would reflect tap noise, not the detector. AC1 only requires reporting the figure, so nothing ever fails. | Changed: the onset F 0.9 gate applies to synthetic tracks only and is reported at 20 ms and 50 ms; real tracks are gated on tempo and lock and report beat error beside the tap-noise floor (AC1, success metrics, D12). |
| F2 | high | AC4 (reaction within 30 ms of the click) is measurable only for the analysis side in the dev harness, which plays through context.destination (devFileSource.ts:42). Production capture delay is not exposed (K1). The plan's measurement of it, 'a click played in another tab and with an input device' (S5), names no external reference. The page cannot observe when sound reached the user's ears, so the number cannot be produced. Per-frame rAF quantisation (about 16.7 ms at 60 fps, 33 ms at 30 fps) also consumes much of a 30 ms budget, and the reaction is probably read from scene state rather than displayed pixels. The criterion therefore passes in the harness while production stays unknown, and the plan's own risk (K1) is rated high. C6 captureDelay is a 'measured constant' with no measurement method. | Changed: AC4 is now the harness measurement at 0 ms display delay with a one-frame allowance; new AC9 covers production capture delay as an estimate with a stated loopback method or a declared gap plus a user sync offset. C6 states where each constant comes from. No production figure is guaranteed. |
| F3 | high | S3 and C4 break existing contracts that the plan does not list. engine.getAnalyser() is used by rhythmTracker.ts:84 (as the source-identity and context signal and as the worklet's input), devTelemetry.ts:213, useAudioState.ts, and the pages for Cubes, BassInk, TrioColorWave, DancingCharacter and ActiveSourcePanel. useAnalyser() is a useSyncExternalStore of that shared node. S3 draft_paths list only cubes, trio-color-wave and the audio folder. rhythmTracker.ts, BassPulse (which sets fftSize and filters off the shared node), the bass-ink and dancing-character pages and ActiveSourcePanel are omitted. 'The engine no longer exposes a mutable shared one' removes the node the tracker is attached to. The per-consumer node must also be re-created for every new AudioContext, because startSource creates a context per source, and be stable under StrictMode double-mount. Neither lifecycle is specified. C4 says 'settings applied once at creation', but trioColorWaveSheet.ts:66,105 changes fftSize and smoothing at runtime from user controls. | Changed: the engine keeps a fixed, engine-owned tap for the tracker, hub, telemetry and source panel, and a factory adds owned per-consumer nodes whose owner may change settings at runtime. C4 and S3 now name every caller, the recreate-on-source-change rule and StrictMode stability. |
| F4 | high | Slice sizes and ordering understate the work. S1 (L) packs the generators, a tap-along dev tool, the metrics library, eval and debug:summary changes and telemetry. S2 (M) is nine ablations plus a per-visualizer presentation audit (AC7) plus the findings document. Measuring per-visualizer reaction delay needs per-visualizer instrumentation, which S1 does not provide because it covers devTelemetry only. S8 (L) migrates every remaining visualizer, fixes audit findings and regenerates visual baselines. The ablations in S2 also need ways to bypass the AGC and per-consumer analysers, and S1 does not list them. S3 is a small, repo-fact fix (D5, decided_by repo-fact) and the isolation test needs no measurements, yet it is gated behind the full S2. S5 and S6 both edit rhythmAnalyzer.ts and rhythmConfig.ts and share only S4 as a dependency, so they will conflict if run in parallel. S4 needs S2's Q2 answer on whether the tap sits before or after the AGC, yet the worklet takes its input after the AGC today. | Changed: S1 split into S1 (metrics, generators) and S9 (tap tool, reaction recording, AGC bypass, telemetry); the audit moved to its own slice S10; S3 depends on S1 only; S6 now follows S5 so the two never edit the tracker in parallel; Q2 gates S4; docs moved to S7; S8 is one pull request per visualizer. |
| F5 | medium | The 20 ms median beat error target cannot be shown on real tracks as designed. The hop is 10 ms and the window is about 21 ms centred at FFT/2, so quantisation alone is up to ±5 ms and the window centre adds latency. Human tap error is larger than 20 ms (K5), and the click-offset correction only removes the constant part, not the variance. The plan defers judging 20 ms to synthetic tracks (K5) but the success_metrics and AC5 still read as a real-track target. The 2:1 and 4:3 trap patterns on synthetic tracks may also be easier than real music, which makes a pass on them weak evidence for K3. | Changed: 20 ms is a synthetic-track gate; tapped-track figures are reported with the tap-noise floor (AC1, AC5, D12). Synthetic patterns cover several tempos; K3 keeps held-out tracks. |
| F6 | medium | The plan treats the existing worklet as having no per-band onsets, but it already computes three-band flux (BAND_COUNT 3: kick, mid, high; rhythmConfig.ts:16) and a packed frame layout (FRAME_STRIDE) that the tracker, eval scripts, replay fixtures and tests consume. S4 splits this into kick, bass, snare and highs, with raw band energy and onset events added to the message (C3). That changes FRAME_STRIDE and the FrameBatch message, which cascades through rhythmAnalyzer, replay fixtures (scripts/rhythm-tools) and eval-rhythm. Moving the peak picking into the worklet also changes what tempo analysis sees if the 'same onset-strength curve' is reused. The plan lists none of this and the three passing tracks are at risk. Sub-100 Hz bass versus kick separation at 1024 FFT at 48 kHz (47 Hz bins) is also thin. | Changed: hub bands and onset events are an additional, versioned output; the tracker frame is unchanged in S4 and replay fixtures must pass unchanged (C3, D13, K8). S4 checks kick and bass separation and may use a longer window for low bands. |
| F7 | medium | The risk premise is stale. K4, Q-less constraints and the rollout assert uncommitted bass-ink analysis work, but the session git status shows only .gitignore and docs/plans/ changed, and the commit log has the bass-ink changes (8d43b34 'ripple the music's spectrum', e332249, 4ad69ed). spectrumField.ts is present and tracked. The conflict is therefore not with an uncommitted tree. It is with a freshly tuned design that reads a full spectrum. | Changed: K4 rewritten. The session-start status showed uncommitted bass-ink files, the critic saw a clean tree; S3 and S8 recheck git status, and bass-ink's feel is re-verified after migration. |
| F8 | medium | AC6 and the success metric 'no visualizer keeps private band or onset analysis that the hub already provides' conflict with the visualizers that need a full or fine spectrum. Bass-ink's spectrumField needs a per-bin spectrum, and trio-color-wave uses FFT 1024 to 4096 with user-set dB ranges. The hub offers six bands. AC6 also asks for 'equal or better measured alignment' per migrated visualizer but defines no measure, no threshold and no way to record a reaction for each one, so this clause cannot fail. The test is bundled with the documentation requirement, so it is not independently testable. | Changed: AC6 says raw-spectrum consumers keep an owned analyser and defines the migration check (offset within 10 ms of baseline, synthetic onset F not lower); docs are the separate AC10; S10 records the per-visualizer baselines. |
| F9 | medium | AC3 asks for 'identical telemetry for the same track in both orders'. Live play through the dev file source is not deterministic (AGC timing runs on a setInterval at 30 ms, the context clock starts at different times, worklet batching jitters), so the identical-telemetry check cannot be byte-exact and will either flake or be loosened silently. The unit test with Web Audio fakes proves the settings but not the behaviour, since the fakes do not model shared state. | Changed: AC3 now needs the unit assertion on node settings plus an offline deterministic run with band energy within 1 dB in both orders. |
| F10 | low | D11 (look-ahead display delay as an experiment) is a planner-assumption that sits inside S5 and AC4. Adding delay lowers apparent onset error against a causal estimate but increases the lag against what the listener hears, so the AC4 number can improve while the experience gets worse. The success criteria do not say what delay is acceptable. Any extra gate on pixel timing relative to the heard sound is unmeasurable in production (F2). | Changed: D11 has an explicit keep rule (F up 0.05 or beat error down a quarter, added delay 80 ms or less) and AC4 is always reported at 0 ms. |

## Hand-off

A verified-diamond draft DAG with 10 task(s) and 6 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `0af981b67fb281de`).
