# New DJ set visualizer
> Double-diamond plan `dj-visualizer-ideas` revision 1 | status **final** | lane full | risk R1 | base f1a4ec34d230 | updated 2026-11-13T02:04:04.756Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> I want to plan out some new visualizations. Give me some ideas of some cool, one-of-a-kind animations we can use given all of the audio data available to us. This is intended to be used for DJ sets, so use that as context when coming up with ideas.  give me 5 ideas

## Problem

The app has three visualizers (cubes, trio-color-wave, dancing-character). None is built for a DJ set on a projector: across a room they read as small detail, and none uses the arc of a set (builds, drops, phrases, blends between tracks) even though the rhythm tracker already exposes kick/mid/high onsets, chroma, novelty, beat and bar phase, tempo confidence and song changes. DJs want a hands-off visual that feels made for the set and doesn't look like a generic spectrum bar.

**Users:** DJ playing a 4/4 electronic set who sets the visual up before the set and then leaves it alone; Audience watching a projector or big screen behind the DJ from across a room

**Evidence:**
- context-brief.md: RhythmState exposes bpm, beatPhase, barPhase, beatsPerBar, tempoConfidence, meterConfidence, bandOnsets[3], chroma[12], novelty, nextBeatTime, beatCount, downbeatCount, songChangeCount
- context-brief.md: three existing visualizers; only dancing-character uses the full rhythm stack, trio is analyser-only
- docs/agents/rhythm-stability-results.md (via brief): tempo can lock wrong at dotted ratios, octave changes rebuild the grid, a song change may not raise songChangeCount, and clip catch-up drifts for up to 8 s

## Goals

- Offer 5 distinct, one-of-a-kind visualizer concepts tuned for 4/4 DJ sets and pick one to build
- Build the chosen visualizer so it reads from across a room on a projector: bold shapes, high contrast, full-frame reactions
- React to the set's structure (kicks, builds, drops, song changes), not just the instantaneous spectrum
- Run fully automatically through a whole set, including transitions where the tempo lock is weak

## Non-goals

- Building more than one visualizer in this plan (the other concepts stay as alternatives for later runs)
- Live triggers, MIDI or keyboard performance controls
- A new fullscreen or hide-UI mode, or any change to the shared ControlPanel
- Changing the rhythm tracker, its worklet or rhythmConfig to fix its known weaknesses
- Upgrading three.js or adding a postprocessing or physics dependency

## Success metrics

- Holds 60 fps at 1080p on a mid-range laptop GPU through a 10-minute recording played with npm run debug:viz
- A full DJ mix played start to finish shows a visible change of look at each track change and each drop, with no stalls or visible jumps at transitions
- All CI gates pass with no budget raised beyond the new route chunk

## Constraints

- Follow AGENTS.md rules 1-7: named exports, logic in classes and pure functions, refs not state in the render loop, every resource disposed, no per-frame allocation, reuse useThreeScene, createOrbitView, disposeScene, useControlValues, ControlPanel, useAnalyser, useRhythm
- Follow .agents/skills/add-visualizer/SKILL.md and look like cubes and trio-color-wave
- three.js r186 pinned, addons only from three/addons; no new runtime dependency
- One WebGL canvas per route, released on leave; e2e fails on Too many active WebGL contexts
- Bundle budget in .size-limit.json (entry 133 kB gzip, total JS 320 kB gzip); new code must stay in the route chunk and out of the entry chunk, so no new constants in rhythmConfig
- Lighthouse budget on / unchanged; / must not load three.js
- 95% coverage over app/**; Linux visual baselines regenerated for the new card and settings panel
- Do not rely on bpm or barPhase early in a track or across transitions; gate beat-locked motion on tempoConfidence

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | an audio source has been chosen on / | the user opens the new visualizer from its landing card | the route renders exactly one canvas, its card appears on / with AVIF/WebP images, and the page logs no errors or WebGL-context warnings |
| AC2 | a 4/4 track is playing | bandOnsets[0] rises past the kick rise threshold on a frame (with the refractory interval and strength floor from bassInkConfig) | KickRing.update records that frame's time as the kick start and InkCloud.update uploads it in the same call, so a shockwave covering a large part of the frame starts on that frame (unit spec); readability across a room is a manual check |
| AC3 | tempoConfidence is below the visualizer's threshold (start of a track or mid-transition) | the scene would normally run beat- or bar-locked motion | it switches smoothly to onset- and energy-driven motion with no stall, jump or reset, and switches back once confidence returns; a unit spec on the pure mapping proves both directions |
| AC4 | a set is playing | songChangeCount increments, or the novelty and energy signals show a build followed by a drop | the look changes automatically (palette, mode or structure) without any user input, and a unit spec on the pure director proves the transitions |
| AC5 | the scene is running at any kick rate up to 200 BPM, including an active build and drop | any global-brightness term changes (flash, ripple brightening, core density gain, drop burst) | the summed large-area brightness increase is granted at most 3 times in any sliding 1-second window, proven by a spec that drives every brightness term with 200 BPM kick trains through a build and drop, and the intensity control scales it down or to 0 |
| AC6 | the user leaves the route, switches audio source or round-trips to it repeatedly | the scene unmounts | all GPU objects are disposed, analyser and rhythm taps are released and the WebGL context is freed, as checked by the existing e2e round-trip specs |
| AC7 | the change is ready | CI runs | format, lint, typecheck, coverage at 95%, build, size, Lighthouse and e2e (with regenerated visual baselines) all pass |
| AC8 | the default density on the reference projector laptop at 1080p | the cloud is at maximum tension (build peak) and during a drop burst | the debug-harness fps readout stays at or above 55 fps |
| AC9 | the existing ControlPanel in its default state | the page is shown fullscreen on a projector | nothing but the scene covers the frame beyond one corner, checked manually |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How should the plan handle the 5 requested ideas? | Lay out 5 distinct concepts as scored options; the user picks one, which gets the full plan and slices. The rest stay as alternatives for later runs. | user | One feature per plan; five visualizers would be five plans. |
| D2 | Where is the visualizer shown? | Projector or big screen behind the DJ, fullscreen, read from across a room. | user | Favors bold shapes, high contrast, little fine detail, no on-screen UI during the set. |
| D3 | Which music is it tuned for? | 4/4 electronic (house, techno, DnB): steady tempo, builds, drops, long blends. | user | Where the rhythm tracker is strongest. |
| D4 | How much does it run on its own? | Fully automatic; the settings panel is used only before the set, no live triggers. | user | The DJ is busy mixing. |
| D5 | Which existing visualizer is the pattern to copy? | cubes for beat, bass and downbeat wiring; trio-color-wave for analyser-only sampling | repo-fact | AGENTS.md names them as the reference implementations. |
| D6 | Is a photosensitivity limit in scope? | Yes: large-area flashes are capped at 3 per second with an intensity control | user | User confirmed the framing including the 3-per-second flash cap; a projector at a public event is the case WCAG 2.3.1 exists for. |
| D7 | Which visual direction should the concepts take? | Mixed: spread the 5 across abstract geometry, particles, landscapes and stylised scenes | user | Widest choice before picking one. |
| D8 | Which concept gets the build plan? | O4 Bass Ink | user | Best balance of wow factor, projector readability and confidence; the other four stay as alternatives for later runs. |
| D9 | How is the one-of-a-kind look checked, given particle clouds are a known VJ look? | A look-pass checkpoint at the end of S2: a screen recording of a build, drop and track change is reviewed by the user before S3 starts | planner assumption (confirm) | Distinctiveness rests on the interfering shockwaves and formation bursts, which only a human review can judge. |
| D10 | What drives build and drop detection? | A level-independent fast/slow energy ratio (as cubes uses for its probes), with novelty as confirmation only | planner assumption (confirm) | Novelty lags a build by seconds and stays high after a drop; raw RMS depends on master level and capture gain (critic F2). |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **O4** (chosen) | robust | Bass Ink: a cloud of about 100k glowing points hanging in the dark like ink in water. Every kick sends a spherical shockwave rippling out through the cloud, hats make the surface glitter, and chroma tints it to the key's mood. A build pulls the cloud into a tight, trembling core; the drop blows it outward into a new formation (sphere, torus, double helix, flat galaxy disc), and a song change picks the next formation and palette. | 4 | 3 | 3 | 5 | 5 | yes | 3.8 |
| O5 | experience | Ghost Lighting Rig: a virtual club stage seen from the dancefloor, with a truss of moving-head beams cutting through haze, laser fans and a pixel LED wall behind, run by an automatic lighting designer. Like a real LD it picks a cue per phrase: chases that step on each beat, tight beams that speed up and narrow through a build, a full fan-out and laser sheet on the drop, slow sweeping washes in a breakdown, and a new colour scheme for each track. | 4 | 2 | 2 | 5 | 5 | yes | 3.35 |
| O1 | minimal | Shockwave Wall: a full-frame mosaic of bold instanced slabs where every kick sends a shockwave ripple that punches tiles toward the camera, mids flip them, chroma sets the palette, and builds/drops/song changes re-pattern the whole wall (grid, radial rings, diagonal bars). | 5 | 4 | 4 | 3 | 5 | yes | 4.25 |
| O2 | experience | Night Drive: an endless low-poly road-and-horizon landscape the crowd rides through, where each track is a journey leg (songChangeCount picks the biome and time of day), builds darken and gather storm and fog, the drop breaks the sky open in a full-frame sunrise burst, and kicks slam the horizon glow and sun across half the screen. | 4 | 3 | 3 | 4 | 5 | yes | 3.65 |
| O3 | contrarian | TWO DECKS: the frame is split by a glowing, kick-shaken seam between two giant domain-warped colour fields, the outgoing track's key-colour and the incoming track's, and the seam sweeps across as chroma drifts, then the new field floods the screen and becomes the next 'outgoing' at the handover. | 4 | 3 | 4 | 4 | 5 | yes | 3.85 |

## Decision

**O4**: Bass Ink: a cloud of about 100k glowing points hanging in the dark like ink in water. Every kick sends a spherical shockwave rippling out through the cloud, hats make the surface glitter, and chroma tints it to the key's mood. A build pulls the cloud into a tight, trembling core; the drop blows it outward into a new formation (sphere, torus, double helix, flat galaxy disc), and a song change picks the next formation and palette.

The user chose Bass Ink. Shockwave Wall (O1) scores higher because it is cheaper and nearly all reuse, but the request asked for one-of-a-kind animations, and O1 is the least distinctive. Bass Ink keeps O1's robustness (it leans on bandOnsets, novelty and energy, and gates beat lock on tempoConfidence), puts almost all motion on the GPU, and makes kicks, drops and track changes unmistakable from across a room.

**Approach:**
- Render one THREE.Points with a custom ShaderMaterial. Rest positions live in a static BufferAttribute built once per formation, and all motion is computed in the vertex shader from uniforms, so the CPU writes only a handful of floats per frame.
- Kick shockwaves: a ring buffer of the last 8 kick start times and strengths in a uniform array (bandOnsets[0] rising edge). The shader displaces each point by a decaying radial wave per entry, so overlapping kicks interfere instead of resetting.
- Hats (bandOnsets[2]) drive a per-point sparkle term from a hashed point id; mids (bandOnsets[1]) drive curl-noise turbulence amplitude.
- A pure SetDirector reads novelty, a slow RMS energy envelope from the analyser and songChangeCount, and outputs a tension value 0..1 (build) plus a drop event. Tension shrinks the formation radius and raises the jitter; a drop cross-fades the rest positions to the next formation over one bar (or 2 s when tempoConfidence is low).
- Beat lock is optional: when tempoConfidence passes the threshold, a slow breathing scale follows barPhase; below it the breathing runs on its own clock, eased so it never jumps.
- A pure FlashLimiter caps large-area brightness boosts at 3 per second and scales them by the intensity control.

## Design

A new visualizer at /bass-ink built like cubes: a thin route module, a page, a scene hook that wires useThreeScene, useAnalyser and useRhythm, and framework-free pieces underneath. One THREE.Points with a custom ShaderMaterial holds two ping-pong rest-position attributes (A and B, chosen by a uniform) and a per-point id; the vertex shader computes kick shockwaves (displacement only), curl-noise turbulence, tension squeeze, breathing and the formation cross-fade from uniforms. Pure modules decide everything the music implies: a level-independent energy ratio, a confidence-gated motion clock, a SetDirector for build, drop and track-change cues with coalescing, a KickRing with a defined onset rule, and a BrightnessGovernor that every global-brightness term goes through. Point size and alpha scale down with tension so a squeezed core neither saturates to white nor blows the fill rate.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| energyEnvelope | Pure: RMS into fast and slow envelopes and their ratio, so build and drop cues do not depend on master level or capture gain | app/features/visualizers/bass-ink/energyEnvelope.ts |
| motionClock | Pure: blends barPhase-locked breathing with a free-running clock by a smoothstep weight on tempoConfidence with hysteresis, phase-continuous both ways | app/features/visualizers/bass-ink/motionClock.ts |
| SetDirector | Pure state machine GROOVE, BUILD, DROP, AFTERGLOW driven by the energy ratio, confirmed by novelty; coalesces a songChangeCount increment near a drop into one transition; pre-picks the next formation at build start | app/features/visualizers/bass-ink/setDirector.ts |
| BrightnessGovernor | Pure: sliding 1-second window allowing at most 3 large-area brightness increases across all terms (flash, ripple brightening, core gain, drop burst), scaled by intensity | app/features/visualizers/bass-ink/brightnessGovernor.ts |
| kickRing | Pure: onset rule on the decaying bandOnsets[0] envelope (rise delta, refractory interval, strength floor) into a ring of 8 kick start times and strengths in a preallocated Float32Array | app/features/visualizers/bass-ink/kickRing.ts |
| formations | Pure generators writing sphere, torus, double helix and disc positions into a given Float32Array range from a seed, so a formation can be generated in chunks over several frames | app/features/visualizers/bass-ink/formations.ts |
| chromaPalette | Pure: smoothed dominant pitch class with a hysteresis margin and minimum dwell; the palette changes only at a director track-change transition, never continuously | app/features/visualizers/bass-ink/chromaPalette.ts |
| InkCloud | Class owning the Points geometry, ping-pong attributes, ShaderMaterial and uniforms; chunked next-formation fill, update and dispose; clamps gl_PointSize to the renderer range | app/features/visualizers/bass-ink/inkCloud.ts |
| inkShaders | GLSL strings: shockwave displacement sum (clamped), curl noise, sparkle from hashed id, soft points with size and alpha scaled by tension | app/features/visualizers/meshes/inkShaders.ts |
| useBassInkScene, BassInkPage, bassInkControls, bassInkConfig | Lifecycle wiring through refs, controls (flash intensity, density, turbulence, camera drift), every tunable constant, and a registerTelemetryProbe for director phase, tension, energy ratio and brightness grants | app/features/visualizers/bass-ink/ |
| Route and card | Route module, route table entry, landing card entry and card images | app/routes/bass-ink.tsx, app/routes.ts, app/features/landing/visualizations.ts, public/visualization-images/ |

### Contracts (freeze before dependent work)

- **C1 SetDirector** (module interface): new SetDirector(config); update(state: RhythmState, energy: EnergyEnvelope, nowSeconds: number): DirectorCue. DirectorCue is one mutable object reused every frame: phase (groove, build, drop, afterglow), tension 0..1, dropAt (seconds or -1), formationIndex, nextFormationIndex (picked at build start), paletteIndex, transitionStart, transitionSeconds (fixed 2 s, not bar-relative, so it looks the same across genres). Build enters on a rising energy ratio confirmed by novelty; drop fires on an energy-ratio surge after a build. A songChangeCount increment within coalesceSeconds of a drop or build merges into that transition; a new transition during a fade restarts from the current blend.
- **C2 BrightnessGovernor** (module interface): new BrightnessGovernor(maxPerSecond = 3); request(strength: number, nowSeconds: number, intensity: number): number returns the allowed brightness increase, using a sliding 1-second window of grant times, and 0 when the window is full or intensity is 0. Every global-brightness term in the scene calls it; ripples displace without brightening.
- **C3 motionClock** (module interface): createMotionClock(config); advance(clock, state: RhythmState, dtSeconds): number returns a continuous breathing phase 0..1; the beat-lock weight follows tempoConfidence with enter and exit thresholds and never resets the phase.
- **C4 InkCloud** (class interface): new InkCloud(pointCount, seed, maxPointSize); readonly object: Points; prepareFormation(index, seed) fills the inactive ping-pong attribute in chunks across subsequent update calls; beginTransition(startSeconds, seconds) cross-fades to it by uniform and swaps the active side at the end; a new target during a fade copies the current blend into the inactive side first, so nothing jumps; update(cue: DirectorCue, breathing: number, kicks: KickRing, palette: PalettePair, brightness: number, timeSeconds: number): void; dispose(): void. Never reallocates an attribute.

### Data

No persisted data beyond the existing control storage, which also carries the density value e2e seeds low. All per-frame buffers (kick ring, envelopes, palette colours) are preallocated; formation attributes are ping-pong buffers filled in chunks, never reallocated.

### UX

Fullscreen dark scene with a slowly drifting orbit camera (createOrbitView, camera lock respected). Kicks ripple the cloud; hats glitter; a build squeezes the cloud into a dense trembling core; the drop bursts it into the next formation; a song change moves to the next formation and palette. The settings panel is the existing ControlPanel, used before the set.

### Accessibility

All global-brightness terms go through the BrightnessGovernor (at most 3 increases per sliding second, WCAG 2.3.1); ripples displace without brightening, and additive gain is normalised by tension so a dense core does not saturate. The flash intensity control goes to 0 while geometry still reacts. The settings panel keeps the existing ControlPanel semantics, so axe checks hold.

### Security and privacy

No new data leaves the browser; audio stays in the existing Web Audio graph.

### Observability

Add Bass Ink to the debug harness flow (npm run debug:viz --viz bass-ink) so director phases, tension and flash grants can be recorded against real mixes, following docs/agents/debug-harness.md.

### Rollout and rollback

A new route and card ship together in one PR as a feat release; rolling back is reverting the PR or a Cloudflare rollback. No flag is needed because the route is only reached from its card.

## Test strategy

- **Unit:** Co-located vitest specs for every pure module. SetDirector is driven by scripted sequences and by RhythmState-plus-energy traces captured from 2-3 reference mixes (saved as small fixtures in S1), covering build, drop, afterglow, a song change coalesced with a drop, and a restarted transition. motionClock in both directions across the confidence thresholds with no phase jump. A BrightnessGovernor spec plus a scene-level spec that sums every brightness driver over 200 BPM kick trains through a build and drop, with no window holding more than 3 grants. kickRing rise delta, refractory interval, floor and wraparound. chromaPalette with noisy and hovering chroma (no flicker). formations chunked fill matches a one-shot fill. InkCloud with the shared three.js renderer fake: no attribute reallocation, overlapping prepareFormation and beginTransition do not jump, dispose frees everything. Keeps coverage at 95%.
- **Integration:** Page spec with renderWithProviders and the injected engine and tracker fakes: the page renders the canvas host and ControlPanel, controls update refs not state, unmount disposes the cloud and releases taps.
- **End-to-end:** Existing Playwright specs pick up the new entry from visualizations.ts. The e2e run seeds a low density through the existing control storage. The visual snapshot frame is fixed (idle cloud, tension 0, fixed seed, fixed time uniform, zero kicks); if software rasterisation flakes, the route gets a looser per-snapshot threshold rather than a skip. Regenerate Linux baselines with the Update visual snapshots workflow.
- **Manual:** npm run dev with Stereo Mix on a real 4/4 DJ mix: watch a build, a drop and a long blend; check the console for WebGL warnings; check it on a projector from across a room with the panel in its default state (AC9). The S2 look-pass screen recording goes to the user for review (D9).
- **Non-functional:** AC8: the debug-harness fps readout at maximum tension and during a drop burst at 1080p on the reference laptop, at or above 55 fps at the default density. npm run size within budget with the code in the route chunk; npm run lighthouse unchanged on /.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Software WebGL in e2e is slow with a large point count, and additive soft sprites can flake visual snapshots | medium | medium | e2e seeds a low density through control storage; the snapshot frame is fixed; a looser per-route snapshot threshold is the fallback |
| K2 | Build and drop detection misjudges some tracks | medium | medium | Level-independent energy ratio with novelty as confirmation, tuned against captured reference-mix traces with a measurable S3 target |
| K3 | A track change with no novelty crossing (dotted-ratio change) is not detected, so the look does not change at that track change | medium | low | Not detected by design; the next drop still changes the formation. Coalescing only prevents double transitions when a drop and a song change coincide |
| K4 | Scattered bass opens kick onsets and floods the screen with ripples | low | medium | The kick ring has a minimum interval and strength floor; ripple amplitude is bounded by the shader sum clamp |
| K5 | The look reads as a generic particle cloud | medium | medium | A dev-time look pass in S2 focuses on the interfering shockwaves and formation bursts before baselines are taken |
| K6 | Fill-rate collapse at the build peak, when 100k additive sprites are squeezed into a small core | medium | high | Point size and alpha scale down with tension, gl_PointSize is clamped, and AC8 gates S2 on measured fps at maximum tension |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Signal traces and pure set logic: Capture RhythmState and energy traces from 2-3 reference mixes with the offline rhythm pipeline, then ship the framework-free modules that decide everything the music implies, with specs that replay those traces |  | AC2, AC3, AC4, AC5 | C1, C2, C3 | R1 | M | app/features/visualizers/bass-ink/setDirector.ts, app/features/visualizers/bass-ink/motionClock.ts, app/features/visualizers/bass-ink/brightnessGovernor.ts, app/features/visualizers/bass-ink/kickRing.ts, app/features/visualizers/bass-ink/energyEnvelope.ts, app/features/visualizers/bass-ink/chromaPalette.ts, app/features/visualizers/bass-ink/formations.ts, app/features/visualizers/bass-ink/bassInkConfig.ts, app/features/visualizers/bass-ink/fixtures/ |
| S2 | Ink cloud scene, route, card and telemetry: Render the cloud with ping-pong formations and kick shockwaves, wire it to S1, add controls, telemetry probe, route, landing card and images; exit when AC8 fps holds at maximum tension and the user has reviewed the look-pass recording | S1 | AC1, AC2, AC5, AC6, AC8, AC9 | C4 | R1 | M | app/features/visualizers/bass-ink/inkCloud.ts, app/features/visualizers/meshes/inkShaders.ts, app/features/visualizers/bass-ink/useBassInkScene.ts, app/features/visualizers/bass-ink/BassInkPage.tsx, app/features/visualizers/bass-ink/bassInkControls.ts, app/routes/bass-ink.tsx, app/routes.ts, app/features/landing/visualizations.ts, public/visualization-images/ |
| S3 | Tune on real mixes and pass CI: Tune bassInkConfig with the debug harness on the reference mixes until drops are flagged within 2 s of their labelled times in at least 80 percent of cases, then seed e2e density, regenerate visual baselines and pass every gate | S2 | AC3, AC4, AC7 | C1 | R1 | M | app/features/visualizers/bass-ink/bassInkConfig.ts, e2e/visualizers.ts, e2e/visual.spec.ts-snapshots/, docs/agents/debug-harness.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | What default point count holds AC8 on the target projector laptop? | implementer, measured as the S2 exit gate | no |
| Q2 | Which 2-3 DJ mixes (local WAVs with labelled drop times) are the reference set for traces and tuning? | user, before S1 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | songChangeCount and novelty are not independent signals, which undermines AC4, C1 and K3. In app/features/rhythm/rhythmAnalyzer.ts (applyBoundary, lines 261-267) a soft boundary (novelty >= NOVELTY_THRESHOLD = 1) increments songChangeCount, and boundary.ts line 36 says novelty fires on 'big section changes' as well as DJ blends. So a drop or breakdown can bump songChangeCount, and the SetDirector would see a drop and a song change for the same event (two formation and palette advances, or a double transition). K3's 'novelty spike' fallback is the same trigger, so it does not cover the real miss case (dotted-ratio change with no novelty crossing). The success metric 'visible change at each track change' cannot be separated from 'change at each section change'. | Changed: C1 now coalesces a songChangeCount increment near a drop or build into one transition and restarts from the current blend on overlap, with a spec; K3 restated honestly as not detected. |
| F2 | high | Build and drop detection (AC4, K2, SetDirector) rests on novelty plus an analyser RMS envelope, and neither fits. Novelty compares the last 6 s against the previous 30 s (NOVELTY_RECENT_SECONDS, NOVELTY_PREVIOUS_SECONDS) and decays slowly (NOVELTY_DISPLAY_DECAY 0.995 per hop), so it lags a build by seconds and stays high after the drop. 'Rising novelty' is a poor build cue and 'novelty falling' a late drop cue. The energy input is raw time-domain RMS from the analyser, which depends on the DJ's master level, the Stereo Mix gain and the pre-gain. Thresholds tuned in S3 on files played through debug:viz will not transfer to live capture. AC4 is proven only by scripted RhythmState sequences, which pass by construction, so a detector that is wrong on real music still passes CI. | Changed: build and drop run on a level-independent fast/slow energy ratio with novelty as confirmation (D10); S1 captures reference-mix traces as spec fixtures; S3 has a measurable drop-detection target. |
| F3 | high | AC5 and D6 (WCAG 2.3.1) are only enforced for the term that goes through FlashLimiter (C2). In a 100k-point additive cloud, large-area luminance also changes through paths the limiter never sees: a ripple on every kick (up to about 3.3 per second at 200 BPM, deliberately ungated, see FlashLimiter responsibility), the build squeeze into a dense core (additive overdraw saturates toward white), the drop burst, and hat sparkle. The unit test proves only that the limiter grants at most 3 per second, not that the rendered frame obeys the cap. C2 is also inconsistent: the contract default is 1/3 s, the component text says 334 ms. At exactly 1/3 s a closed one-second window can hold 4 grants. | Changed: C2 is a BrightnessGovernor with a sliding 1-second window that every global-brightness term goes through; ripples displace only; additive gain normalised by tension; AC5 now requires a scene-level spec summing all brightness drivers at 200 BPM through a build and drop. |
| F4 | high | Fill-rate risk sits exactly at the build peak. 100k additive soft sprites squeezed into a 'tight, trembling core' (tension shrinks formation radius) multiply per-pixel overdraw in a small area at 1080p on a projector laptop. The 60 fps metric is not an AC, Q1 (default point count) is marked non-blocking, and K1 only considers software WebGL in e2e. Point size is also device-dependent (hardware point-size caps, devicePixelRatio), which affects 'bold shapes' across a room. | Changed: point size and alpha scale with tension, gl_PointSize clamped; new AC8 fps at maximum tension gates S2; risk K6 added. |
| F5 | medium | Formation transitions are underspecified, against AC4 'no stall or visible jump'. The design holds two rest attributes (current and next) yet says buffers are 'rewritten in place at a drop or song change'. Generating 100k torus or helix points on the main thread and uploading about 1.2 MB the frame the drop hits causes a hitch at the most important moment. K3's mitigation advances the formation on every drop, so a drop followed by a song change (see F1) overwrites 'next' mid cross-fade, which pops. How next becomes current after the fade (copy, ping-pong, uniform swap) is not stated in C4. | Changed: C4 specifies ping-pong attributes chosen by a uniform, chunked pre-generation from build start, and a copy-current-blend rule for a retarget mid-fade, with InkCloud specs. |
| F6 | medium | AC2 ('starts on that frame', 'visible across a room') is not observable as written, and kick detection is underspecified. bandOnsets[0] is a decaying envelope, not a pulse (rhythmAnalyzer.ts line 385: max(prev * 0.9, strength) per 10 ms hop), so 'rising edge' needs a rise threshold, a refractory interval and a strength floor. K4 mentions a minimum interval and strength floor, but kickRing's responsibility and the test strategy do not define them, and they do not exist in bassInkConfig. At low fps, or in a backgrounded or software-rendered tab, several onsets collapse into one sample. | Changed: AC2 reworded to a testable KickRing and InkCloud rule; kickRing defines rise delta, refractory interval and strength floor in bassInkConfig. |
| F7 | medium | Slice order freezes C1-C3 in S1 before any real signal is observed, while S3 (size S) is expected to 'tune on recorded DJ mixes'. F1 and F2 show tuning is likely to change structure, not just thresholds, which reopens S1 modules and specs after the scene exists. The plan names no reference mixes, and the debug harness needs a local music folder. S3 also bundles open-ended tuning with a baseline regeneration that runs through a CI workflow. The telemetry probe for 'director phases, tension and flash grants' is a registerTelemetryProbe call inside the scene hook (as in cubes/useCubesScene.ts), i.e. an S2 change, but S3's draft_paths list only the docs file. | Changed: S1 starts with trace capture; telemetry probe moved into S2; S3 has an exit criterion and is size M; reference mixes are Q2. |
| F8 | medium | The e2e and visual-baseline path is hand-waved. K1 says 'the e2e fixture keeps the default low enough' and 'the scene clamps the count by renderer capabilities', but nothing in the plan says how the test run gets a low point count (software GL cannot be reliably detected from capabilities; no query param or stored control value is specified). e2e/visual.spec.ts pauses the page clock for deterministic frames, so the scene must produce a stable frame with a fixed seed and zero kicks. A 100k-point additive soft-sprite frame on software rasterisation is a likely source of cross-machine pixel flake, and the plan has no tolerance or fallback. | Changed: e2e seeds a low density through existing control storage (e2e/visualizers.ts in S3), the snapshot frame is fixed, and a looser per-route threshold is the named fallback. |
| F9 | medium | Key planner-assumption defaults are untested: the 8-slot kick ring (kicks sustain visible waves only while they are in the shader sum), 'one bar or 2 s' as the transition length (one bar is about 1.4 s at 174 BPM and about 2.7 s at 90 BPM, so the look differs by genre), and 'a sustained chroma shift advances the palette' (C chromaPalette) as a second song-change fallback. Chroma is smoothed and normalised per frame (rhythmAnalyzer.ts lines 394-396), so in minimal techno or sustained-bass house it will hover and flip dominant pitch class, and in long blends it moves slowly. The result is either palette flicker or no change. | Changed: transition length fixed at 2 s; chroma hysteresis margin and dwell in bassInkConfig with a noisy-chroma spec; palette changes only at track-change transitions. |
| F10 | low | Fit gap: the stated users are a DJ who leaves it alone and an audience across a room (D2 says fullscreen, no on-screen UI), yet the non-goals exclude any fullscreen or hide-UI mode and the success metrics are projector-based. The plan relies on whatever the existing page and ControlPanel already offer, without checking that the route is presentable on a projector. The decision rationale also overrides its own scoring (O1 scores 4.25 against O4's 3.8) because 'one-of-a-kind' was asked for, while K5 admits that 'particle clouds are a known VJ look'. Distinctiveness is therefore carried by a dev-time look pass with no acceptance check. | Changed: AC9 manual projector check with the default panel; D9 records the distinctiveness bet with a user-reviewed look-pass recording at the end of S2. |

## Hand-off

A verified-diamond draft DAG with 3 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `55177a05e2235636`).
