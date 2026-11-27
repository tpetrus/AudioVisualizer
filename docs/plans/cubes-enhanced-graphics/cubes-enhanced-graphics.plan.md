# Cubes enhanced graphics
> Double-diamond plan `cubes-enhanced-graphics` revision 1 | status **final** | lane full | risk R1 | base c03849a0890f | updated 2026-11-27T14:11:13.688Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> Similar to how we added enhanced graphics to the dancing-character, I also want to add enhanced graphics to the cubes visualization. Ideate ways to enhance this visualization

## Problem

The cubes visualizer is one InstancedMesh of glass MeshPhysicalMaterial cubes lit by a RoomEnvironment and three lights, rendered with a plain renderer.render and no post-processing. It looks flat next to what the dancer's planned enhanced mode will offer, and its beat reactions are limited to scale, colour, a bass bump and a background pulse. Users who want a richer show have no opt-in upgrade.

**Users:** Listeners who open /cubes with an audio source and want a more spectacular, music-driven scene; Users on mid-range laptops with integrated graphics who must keep a smooth frame rate

**Evidence:**
- app/features/visualizers/cubes/useCubesScene.ts:49-224 plain render, RoomEnvironment and PMREM at 0.3, key/fill/ambient lights
- app/features/visualizers/cubes/cubeGrid.ts:38-82 single InstancedMesh, MeshPhysicalMaterial
- docs/plans/dancer-enhanced-graphics/dancer-enhanced-graphics.plan.md app-wide enhanced toggle, off by default, lazy EnhancedLook
- app/features/visualizers/bass-ink/bassInkPost.ts the only post stack in the app

## Goals

- An opt-in enhanced cubes look that is a clear visual upgrade: post-processing, richer lighting and materials, and new audio-driven elements
- Enhanced mode exposed exactly like the dancer's enhanced graphics (one app-wide toggle, off by default)
- Enhanced mode holds 60 fps on integrated graphics at 1080p
- Basic mode unchanged in look, cost and bundle

## Non-goals

- Changing the basic cubes look or its controls' behaviour
- Implementing the dancer's enhanced mode (only sharing its toggle)
- Upgrading three.js or adding a post-processing library outside three/addons
- Per-device automatic quality detection or multi-level presets
- Changing the rhythm or analyser DSP
- Enhancing other visualizers

## Success metrics

- Enhanced median fps at least 60 and p5 at least 50 over 60 s of playback on an integrated-GPU laptop at 1080p (PerformanceStats)
- cubes.out reaction delay median within one frame (16.7 ms) of basic mode (debug:viz)
- Initial Total JS stays within the .size-limit.json budget; enhanced code ships in a lazy chunk
- Zero new console errors or WebGL context warnings in e2e

## Constraints

- three.js r186 pinned; effects only from three/addons (AGENTS.md:59)
- No allocation per frame; every GPU resource disposed; effects return cleanup (AGENTS.md:118-120)
- Logic in classes and pure functions; scene reads changing values through refs (AGENTS.md:112-117)
- Reuse useThreeScene (its render hook for post), createOrbitView, disposeScene, useControlValues and ControlPanel
- Total JS gzip budget 348.5 kB (.size-limit.json:22); Lighthouse budget on / only
- e2e runs software WebGL, CPU-bound, one worker; fixtures fail on WebGL context warnings (e2e/fixtures.ts:30)
- 95% coverage over app/**; new cubes controls change the settings-panel visual baseline

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | enhanced graphics is off (the default) | the user opens /cubes | the scene renders as today, the existing cubes visual baseline is unchanged and no enhanced chunk is requested |
| AC2 | enhanced graphics is on | the user opens /cubes with audio playing | the enhanced look renders from a lazily loaded chunk with post-processing and at least one new audio-driven element; the canvas is not blank or washed out (a pixel-statistics check plus one enhanced visual baseline); no console errors |
| AC3 | enhanced graphics is on, on the reference integrated-GPU laptop at 1080p, with the basic-mode fps recorded first on the same device | a 128 BPM track plays for 60 s | PerformanceStats reports median fps of at least 60 and p5 of at least 50 |
| AC4 | the user is on /cubes | the enhanced toggle is flipped either way | the look swaps in place on the same canvas and WebGL context (no new canvas or context), without a reload, keeping the camera pose, and logs no warnings |
| AC5 | enhanced graphics is on | the user leaves /cubes or the scene is rebuilt | every enhanced GPU resource (render targets, passes, geometries, materials, textures) is disposed, checked by unit tests and the e2e round-trip context test |
| AC6 | enhanced graphics is on and a kick track plays | debug:viz records cubes telemetry and PerformanceStats records frame times in both modes | the cubes.out envelope median is within 16.7 ms of basic mode (an envelope regression check, not render latency) and the enhanced frame-time p95 is at most 20 ms |
| AC7 | the production build | npm run size runs | the entry chunk stays within its 133 kB line, the Total JS line (which counts lazy chunks) passes, with any limit raise made in the same PR with its reason, the enhanced code sits in its own lazy chunk, and the post addons are shared with bass-ink rather than duplicated |
| AC8 | enhanced graphics is on and the OS requests reduced motion | the scene runs | camera motion and full-screen flashes from the enhanced look are disabled or damped, while the rest of the enhanced look stays |
| AC9 | enhanced graphics is on | no audio source is chosen, the audio is silent, the bar phase is not locked, or the source is switched mid-session | the scene keeps rendering without errors: beat- and bar-driven terms fall to zero amplitude and band-driven terms follow the levels |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | What should enhanced graphics for Cubes optimize for? | A bigger visual upgrade: new elements (environment, particles, camera moves, new beat reactions) are in scope, not only polish of the existing look. | user | User chose the bigger upgrade over same-identity polish. |
| D2 | How is the enhanced mode exposed? | The same way the dancing-character's enhanced graphics are exposed, for consistency across visualizers. | user | Consistency with the dancer. |
| D3 | What is the performance floor? | Enhanced mode holds 60 fps on integrated graphics of a mid laptop at 1080p; the basic mode is unchanged. | user | Keeps the visualizer usable on common hardware. |
| D4 | What exact toggle does the dancer use? | One app-wide setting in localStorage (key audioVisualizer.enhancedGraphics), off by default, that loads an enhanced module lazily and rebuilds the scene through useThreeScene. | repo-fact | docs/plans/dancer-enhanced-graphics plan D1/D2; the dancer code is not built yet. |
| D5 | Who builds the shared toggle if the dancer has not shipped it yet? | One shared app-wide toggle for all visualizers; whichever plan lands first builds it as a shared module, the other reuses it. | user | User chose one shared toggle in round 2. |
| D6 | Which new elements are in emphasis? | All four: glow and post FX, environment (floor, fog, backdrop), motion and camera (beat-synced moves, grid waves, shattering), and particles. | user | User selected all four in round 2; options must weigh them against the 60 fps floor. |
| D7 | Is the framing confirmed? | Yes, as recorded in problem, goals, non-goals and ACs. | user | Full-lane checkpoint. |
| D8 | Where do the shared store, hook and toggle UI live? | Exactly where the dancer plan puts them: app/features/settings/enhancedGraphicsStore.ts and useEnhancedGraphics.ts, with its signatures and its toggle UI. If cubes lands first, S1 builds that module and that UI as the dancer plan specifies, so there is one store and one surface. | repo-fact | docs/plans/dancer-enhanced-graphics plan.json (critic F1). |
| D9 | Rebuild the scene or swap in place on toggle? | Swap in place: useCubesScene holds the current look in a ref, and SceneHandle.render (read per frame, useThreeScene.ts:106) delegates to it. useThreeScene is unchanged, with no new renderer, context or camera reset. | planner assumption (confirm) | Delivers the no-gap swap and keeps the camera pose (critic F2). |
| D10 | Reference device and fps cut list | The reference device is the user's own integrated-GPU laptop at 1080p. A miss on AC3 is cut in this order: particle count, shatter term, composer pixel ratio 1, quarter-resolution bloom, opaque emissive material. | planner assumption (confirm) | Pre-agreed cuts make each slice's AC3 re-check actionable (critic F4). |
| D11 | How do camera moves coexist with OrbitControls? | The motion is applied to a scene-root group that holds the grid, floor and particles, never to camera.position, so orbit state, reset view and the view-changed flag are untouched. | planner assumption (confirm) | Critic F7. |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | A lazy cubesEnhanced chunk reusing the shared app-wide toggle adds one bloom post pass, a fog/floor backdrop and one instanced spark-particle burst on kicks, leaving basic code paths untouched. | 5 | 4 | 4 | 3 | 5 | yes | 4.25 |
| O2 | robust | A lazily loaded CubesEnhancedLook class owns a budgeted post stack (bloom, vignette), env and floor, a single instanced particle pool and beat-driven grid waves, driven by a pure CubesFxState and gated by one shared app-wide toggle with an AbortSignal-guarded rebuild, idempotent disposal and a reduced-motion damper. | 4 | 3 | 2 | 4 | 5 | yes | 3.45 |
| O3 | experience | A lazy EnhancedCubesLook that swaps in on the shared toggle with no reload or visible gap, adds bloom, a reflective floor with fog, grid-wave and beat-kick camera moves plus a pooled spark layer, with a graceful fallback and reduced-motion damping. | 4 | 3 | 2 | 5 | 5 | yes | 3.6 |
| O4 | contrarian | Break the assumption that enhanced means adding layers on top of the glass look: swap the costly transparent glass for opaque emissive cubes in enhanced mode, spend the recovered fill-rate on one half-res bloom plus GPU-driven shader effects (no CPU particles, no extra passes). | 3 | 3 | 3 | 3 | 5 | yes | 3.2 |
| **O5** (chosen) | hybrid | O2's structure (shared toggle, AbortSignal loader, pure CubesFxState, idempotent dispose) with O3's no-gap swap, load-failure fallback and enhanced-only controls, and O4's GPU-side effects (vertex-shader grid waves and shatter, shader-driven particles) so the upgrade covers glow, environment, motion and particles inside the 60 fps budget. Glass stays unless measurement forces O4's opaque emissive material. | 4 | 4 | 2 | 5 | 5 | yes | 3.85 |

## Decision

**O5**: O2's structure (shared toggle, AbortSignal loader, pure CubesFxState, idempotent dispose) with O3's no-gap swap, load-failure fallback and enhanced-only controls, and O4's GPU-side effects (vertex-shader grid waves and shatter, shader-driven particles) so the upgrade covers glow, environment, motion and particles inside the 60 fps budget. Glass stays unless measurement forces O4's opaque emissive material.

O1 scores highest on cost but delivers only bloom, a floor and sparks: no grid waves, shatter or camera moves, so it misses the bigger upgrade (D1) and the four-way emphasis (D6). O5 keeps O1's bassInkPost-based post stack and lazy chunk, adds O2's testable pure state and abort/dispose discipline, O3's seamless swap and failure fallback, and O4's GPU-side effects. That reaches every emphasis area at near-zero CPU cost, with a measurement gate that falls back to O4's opaque material if glass misses 60 fps.

**Approach:**
- Shared toggle from the dancer plan (D4/D5): build app-wide useEnhancedGraphics if it is absent, reuse it otherwise.
- useCubesScene takes an additive enhanced option. When it is on, loadCubesEnhanced(signal) dynamic-imports the lazy chunk while the basic look keeps rendering, then swaps. Late loads are aborted; a failed load keeps the basic look and shows one role=status notice.
- CubesEnhancedLook (class) owns an EffectComposer with RenderPass, a half-resolution UnrealBloomPass and OutputPass (the bassInkPost pattern) through the SceneHandle.render hook. It also owns a dark glossy floor, exponential fog and a backdrop gradient.
- A pure CubesFxState maps band levels, the cubesBass flash and beat phase from useRhythm to uniforms: wave phase, shatter amount, bloom strength, particle emit and camera nudge. Values are preallocated and clamped, and the reduced-motion factor zeroes camera and flash terms.
- GPU effects: a cloned enhanced cube material with an onBeforeCompile vertex term for grid ripples and a bass-drop shatter offset. One THREE.Points layer is positioned in its vertex shader from seed, time and the bass uniform. No per-cube CPU work and no per-frame allocation.
- Camera: a beat-synced dolly and orbit drift layered on createOrbitView, off under prefers-reduced-motion.
- An enhanced-only ControlPanel group (Glow, Particles, Camera motion) shows only when enhanced is on, so the default settings-panel baseline is unchanged.
- A measurement gate on an integrated GPU after the post and environment slice: if AC3 fails with glass, swap the enhanced cube material to O4's opaque emissive variant before adding more effects.

## Design

Basic cubes stays on its current path. When the shared enhanced flag is on, useCubesScene lazy-loads a cubes/enhanced chunk and swaps a CubesEnhancedLook in place: the SceneHandle.render hook delegates to the look held in a ref, on the same renderer and context. The look owns a bloom post stack (EffectComposer, RenderPass, half-res UnrealBloomPass, OutputPass using the renderer's existing tone mapping and output colour space, with enhanced-only light constants retuned), a floor, fog and backdrop, a material it applies to the grid through a narrow CubeGrid API with GPU wave and shatter terms, a shader-driven particle layer, and beat motion on a scene-root group. A pure CubesFxState turns analyser, cubesBass and useRhythm signals (nullable phases) into uniforms through refs, with the reduced-motion damper built in from S2. Each slice re-checks AC3 on the reference device against D10's cut list.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| useEnhancedGraphics | Shared flag and hook, localStorage audioVisualizer.enhancedGraphics, default off, cross-tab storage event | app/features/enhanced/enhancedGraphics.ts |
| loadCubesEnhanced | AbortSignal dynamic import with an ok/failed result | app/features/visualizers/cubes/enhanced/loadCubesEnhanced.ts |
| CubesEnhancedLook | Owns all enhanced GPU resources; update, render, resize, setReducedMotion, idempotent dispose | app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts |
| cubesFxState | Pure mapping of audio frame to preallocated uniforms with a reduced-motion damper | app/features/visualizers/cubes/enhanced/cubesFxState.ts |
| cubesEnhancedShaders | GLSL chunks for grid wave, shatter and particles | app/features/visualizers/cubes/enhanced/cubesEnhancedShaders.ts |
| useCubesScene / CubesPage | Read the flag, pass the additive enhanced option, keep basic rendering during load, show the failure notice | app/features/visualizers/cubes/ |

### Contracts (freeze before dependent work)

- **C1 useEnhancedGraphics** (shared hook): The dancer plan's app/features/settings/enhancedGraphicsStore.ts and useEnhancedGraphics.ts, with its exact signatures, key audioVisualizer.enhancedGraphics and default false. Built by S1 only if absent, unchanged otherwise.
- **C2 loadCubesEnhanced** (module loader): loadCubesEnhanced(signal: AbortSignal): Promise<{ ok: true; Look: typeof CubesEnhancedLook } | { ok: false }>; never rejects; resolves ok:false on abort or import failure.
- **C3 CubesEnhancedLook** (class API): new CubesEnhancedLook({ renderer, scene, camera, reducedMotion }); attach(grid: CubeGrid): void (re-called after every grid rebuild in resize); update(frame: CubesFxFrame, dt: number): void; render(): void; resize(w: number, h: number): void; setReducedMotion(b: boolean): void; dispose(): void (idempotent, frees passes, render targets, geometries, materials and textures, and detaches from the grid restoring its own material).
- **C4 CubesFxFrame** (data type): { bands: Float32Array | null; bassFlash: number; beatPhase: number | null; barPhase: number | null; barLocked: boolean; dt: number }; cubesFxState.step(frame, reducedMotion, out) writes into a preallocated uniforms object; null phases or barLocked false give zero beat and bar amplitude.
- **C5 useCubesScene enhanced option** (hook option): useCubesScene({ ..., enhanced: boolean }) additive; false keeps today's render (no composer); toggling swaps the look in place through a ref, with no useThreeScene rebuild.
- **C6 CubeGrid material hook** (class API): CubeGrid.setMaterialOverride(material: Material | null): void; null restores the grid's own glass material. The basic path never calls it.

### Data

One localStorage boolean (shared). No other persisted data; enhanced controls use useControlValues like the existing ones.

### UX

The toggle is the dancer plan's shared setting and surface (D8). On /cubes, flipping it on keeps the basic look until the chunk arrives, then swaps on the same canvas. Flipping it off swaps back at once, and the camera pose is kept. An Enhanced control group (Glow, Particles, Camera motion) appears only while enhanced is on. A failed load keeps the basic look and shows a short role=status notice beside the cubes control panel.

### Accessibility

prefers-reduced-motion (matchMedia, live) zeroes camera moves and clamps bloom spikes and shatter so no full-screen flashes occur (AC8). The notice is role=status; new controls use the existing accessible ControlPanel.

### Security and privacy

No new data, network or permissions; only a same-origin lazy chunk.

### Observability

PerformanceStats fps in dev; debug:viz cubes telemetry compares reaction delay between modes; one console.warn (not error) on a failed chunk load.

### Rollout and rollback

Ships off by default behind the shared toggle; rollback is turning the flag off or reverting the PR. Visual baselines for the default mode stay unchanged.

## Test strategy

- **Unit:** cubesFxState: clamps, the reduced-motion damper, null phases and barLocked false give zero amplitude, no allocation (same output object). loadCubesEnhanced: resolves ok:false on abort and on import failure. CubesEnhancedLook with mocked addons (the bassInkPost.test.ts pattern): attach and re-attach after a grid rebuild, and dispose once and idempotently. CubeGrid.setMaterialOverride sets and restores the material. The store and hook follow the dancer plan's tests. Shader chunks get uniform-shape and compile smoke tests, not text snapshots. Keep 95% coverage.
- **Integration:** useCubesScene with the fake renderer: enhanced=false never constructs a composer or calls setMaterialOverride. A toggle round trip keeps one renderer and restores the glass material. A resize with enhanced on re-attaches without stale meshes. With the flag off, the settings panel matches today's and the hidden enhanced controls do not affect basic mode. The failed-load notice renders as role=status.
- **End-to-end:** A new spec seeds localStorage enhanced=true. /cubes renders one canvas that is not blank (pixel statistics), with one enhanced visual baseline. A toggle round trip keeps the same canvas and context count. A viewport resize, a source switch and a route round trip release the context. The lazy chunk is requested only when enabled. No console errors or WebGL warnings. Existing default-mode baselines are unchanged.
- **Manual:** npm run dev on the reference laptop at 1080p. Record basic fps first, then after each slice record 60 s of a 128 BPM track with PerformanceStats (median 60, p5 50, frame-time p95 at most 20 ms). Also check an unlocked camera drag during playback, OS reduced motion, silence and no source.
- **Non-functional:** npm run size in S1 records the gzip total and the delta, checks the entry and Total JS lines, and confirms the post addons share a chunk with bass-ink. debug:viz --viz cubes compares the envelope in both modes. Lighthouse on / is unaffected.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Bloom over transparent glass with 1800+ instances misses 60 fps on integrated GPUs | medium | high | Record basic fps first, then re-check AC3 after every slice. Run the opaque-emissive spike in S2 so the glass-or-opaque choice rests on a measurement, and apply D10's cut list on any miss. |
| K2 | The composer adds render latency that the cubes.out envelope probe cannot see | medium | medium | AC6 adds a frame-time p95 check in both modes; no afterimage pass; bloom driven from the same frame's bass flash. |
| K3 | Shared toggle ownership races with the dancer plan (both build it) | medium | low | C1 is the dancer plan's exact path, signatures and UI (D8); S1 checks main first and reuses the module if present. |
| K4 | onBeforeCompile shader patches break silently or are hard to cover | low | medium | GLSL as pure strings with uniform and compile smoke tests; three r186 pinned; e2e catches compile errors as console errors and blank output through pixel statistics. |
| K5 | Swapping looks leaks resources or a WebGL context | low | high | In-place swap on one context (D9), idempotent dispose, AbortSignal for late loads, attach() after grid rebuilds, e2e toggle, resize and route round trips. |
| K6 | Software-WebGL e2e slows or times out with post enabled | medium | low | Only one new spec enables enhanced; the existing suite runs in default mode. |
| K7 | The composer and OutputPass change colour handling, washing out the hand-tuned glass look | medium | medium | The S1 colour-pipeline decision: OutputPass uses the renderer's existing tone mapping and colour space, with enhanced-only light constants; an enhanced visual baseline and a pixel check. |
| K8 | The new chunk pushes Total JS over its 348.5 kB line | medium | low | Measure in S1 and raise the limit in the same PR with its reason, per AGENTS.md; share the post addons with bass-ink. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Shared toggle, in-place lazy swap and bloom post: Build or reuse the dancer plan's store, hook and toggle UI. Add the enhanced option and in-place swap to useCubesScene, and loadCubesEnhanced with abort and the failure notice. Build a CubesEnhancedLook skeleton with half-res bloom and the colour-pipeline decision. Record basic fps on the reference device and the size delta. Add the e2e spec. |  | AC1, AC4, AC5, AC7 | C1, C2, C3, C5 | R1 | M | app/features/settings/enhancedGraphicsStore.ts, app/features/settings/useEnhancedGraphics.ts, app/features/visualizers/cubes/enhanced/loadCubesEnhanced.ts, app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts, app/features/visualizers/cubes/useCubesScene.ts, app/features/visualizers/cubes/CubesPage.tsx, e2e/cubes-enhanced.spec.ts, .size-limit.json |
| S2 | Fx state with reduced motion, environment and material spike: Add the pure cubesFxState with nullable phases and the reduced-motion damper. Add the floor, fog and backdrop, and drive bloom from the bass flash. Spike glass against opaque emissive on the reference device, and decide using AC3 and AC6. | S1 | AC2, AC3, AC6, AC8, AC9 | C3, C4 | R1 | M | app/features/visualizers/cubes/enhanced/cubesFxState.ts, app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts |
| S3 | GPU grid waves and shatter: Add CubeGrid.setMaterialOverride, and attach() from resize. Apply the enhanced material with onBeforeCompile wave and shatter terms driven by CubesFxState uniforms. Re-check AC3. | S2 | AC2, AC3, AC5, AC9 | C3, C4, C6 | R1 | M | app/features/visualizers/cubes/cubeGrid.ts, app/features/visualizers/cubes/enhanced/cubesEnhancedShaders.ts, app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts |
| S4 | Shader-driven particles: Add one THREE.Points layer positioned in its vertex shader from seed, time and the bass uniform, with a fixed buffer and no per-frame allocation. Re-check AC3 and apply D10's cuts on a miss. | S3 | AC2, AC3 | C3, C4 | R1 | S | app/features/visualizers/cubes/enhanced/cubesEnhancedShaders.ts, app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts |
| S5 | Beat motion and enhanced controls: Add the beat-synced dolly and drift on a scene-root group (D11), and the enhanced-only Glow, Particles and Camera motion controls. Test the panel unchanged with the flag off and an unlocked camera drag. Run the final full measurement. | S4 | AC2, AC3, AC6, AC8 | C3, C4 | R1 | M | app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts, app/features/visualizers/cubes/enhanced/cubesFxState.ts, app/features/visualizers/cubes/cubesControls.ts |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q2 | Confirm the reference integrated-GPU laptop (D10 assumes the user's own) before S2's measurement. | user, before S2 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | C1, K3 and D5 claim the shared toggle is 'identical to the dancer plan', but the dancer plan (docs/plans/dancer-enhanced-graphics/dancer-enhanced-graphics.plan.json) puts the store and hook in app/features/settings/ (enhancedGraphicsStore.ts, useEnhancedGraphics.ts), with several signatures in its options (boolean vs [boolean, setter]). This plan creates app/features/enhanced/enhancedGraphics.ts. If cubes lands first there are two stores on one localStorage key. The dancer plan also hides the toggle UI in production behind ENHANCED_GRAPHICS_UI until its S3, and Q1 (where the toggle lives) is non-blocking. So if cubes lands first, AC2 and AC4 ('the user flips the toggle') have no UI surface in production. | Changed: C1 and D8 adopt the dancer plan's app/features/settings path, signatures and toggle UI. S1 builds exactly that if absent, so there is one store and one surface. Q1 removed, since D8 settles it. |
| F2 | high | The swap mechanism contradicts itself. useThreeScene (app/hooks/useThreeScene.ts:49-125) builds once; its effect deps are [containerRef, antialias] and setup is read through a ref. A toggle rebuild therefore needs a new dep (the dancer plan abuses antialias), but app/hooks/useThreeScene.ts is not in any slice's draft_paths. A rebuild also makes a new renderer, canvas and context, and rebuilds the PMREM environment and orbit view. That is incompatible with 'keeps rendering the basic look while the chunk loads, then swaps, with no blank frame' and loses camera pose and the reset-view state. The alternative, mutating the returned handle.render in place (read per frame at :106), is not what C5, AC4 or the K5 mitigation describe. | Changed: D9 picks an in-place swap through a ref behind SceneHandle.render. useThreeScene is unchanged. AC4 and C5 now say same canvas and context, and e2e asserts the context count. |
| F3 | high | Hidden coupling to CubeGrid. C3 passes `grid` to the look's constructor and promises to 'restore the grid material', but useCubesScene's resize() (useCubesScene.ts:167-179) disposes the grid and builds a new CubeGrid on any window-size change that alters rows or columns. The look would then hold a disposed grid and a cloned onBeforeCompile material whose instances are gone. CubeGrid.material is private (cubeGrid.ts:44) and cubeGrid.ts is in no draft_paths. The wave and shatter terms also layer on top of instance matrices computed on the CPU each frame (cubeGrid.ts:96-122), and the clone's uniforms and program cache key are unspecified. | Changed: C6 CubeGrid.setMaterialOverride, and C3 attach(grid) re-called after resize rebuilds. cubeGrid.ts is in S3, with unit, integration and e2e resize tests. |
| F4 | high | The 60 fps floor (AC3, D3) is the riskiest requirement, but the plan does not de-risk it. The only gate sits after S2 (bloom, floor, fog). S3 (shader waves, shatter, particles) and S4 (camera) add cost with no fallback, because the opaque-emissive switch is defined 'before S3' and quality tiers are a non-goal. AC3 is manual, and its reference device (Q2) is non-blocking. No basic-mode fps baseline on that device is required, though the glass is already 1800+ double-sided transparent clearcoat instances (cubeGrid.ts:59-70). useThreeScene caps pixel ratio at 2, so the composer may run at 2x on HiDPI. O4 itself notes that 'overdraw is the dominant cost' is unverified. | Changed: AC3 needs basic fps recorded first, and every slice re-checks AC3. D10 sets the reference device and the cut list. The opaque spike moves into S2. Q2 confirmation is due before S2; it is non-blocking because D10 gives a default. |
| F5 | medium | AC6 and K2 cannot detect the risk they name. The debug:viz 'cubes.out' probe is registered in useCubesScene.update and reports bass.pulse (useCubesScene.ts:101-108), a CPU-side envelope value. Adding a composer in the render path does not change it, so AC6 passes trivially in enhanced mode while giving false assurance about visual latency. A 16.7 ms tolerance is also small against run-to-run noise (p95 59-74 ms in the brief). | Changed: AC6 is reworded as an envelope regression check plus a frame-time p95 check in both modes; K2 updated. |
| F6 | medium | AC7 and the success metric treat the lazy chunk as outside the budget ('initial Total JS stays within budget'). But .size-limit.json:19-22 defines Total JS as every chunk in build/client/assets/*.js, including lazy ones. The new chunk (look, shaders, controls, store, loader) counts in full. The brief records no current headroom, and recent commits already had to raise the limit. No slice edits .size-limit.json, although AGENTS.md:189-195 requires budget changes in the same PR. It is also unconfirmed that the EffectComposer, UnrealBloomPass and OutputPass addons dedupe with the bass-ink chunk. | Changed: AC7 splits the entry and Total JS lines and allows a same-PR limit raise with its reason. S1 measures the delta and checks addon sharing; .size-limit.json is added to S1; K8 added. |
| F7 | medium | The camera dolly and orbit drift are 'layered on createOrbitView' with no mechanism. OrbitControls owns camera.position and recomputes it on update() (app/lib/three/orbitView.ts:25-45). A nudge written directly to the camera is overwritten or snapped whenever the user drags or zooms. The nudge also counts toward the 0.5 'view changed' threshold (orbitView.ts:5, 39-44), which can flip the reset-view button on by itself. reset() restores the default position while the nudge continues. When the camera is unlocked, behaviour is untested. | Changed: D11 applies motion to a scene-root group, never camera.position. S5 tests an unlocked drag. |
| F8 | medium | The audio-frame contract and edge cases are thin. C4 types beatPhase and barPhase as number, but the hub snapshot has barPhase: number \| undefined and a barLocked flag (app/features/audio/hub/types.ts:27-42). Waves and shatter keyed on a phase that is undefined, or on silence, a paused source, or analyser undefined (useCubesScene.ts:126), have no defined behaviour. All ACs assume audio playing, and there is no AC for silence, source change mid-session, or load failure beyond a notice with no test named for it. | Changed: C4 phases are nullable with barLocked, and zero amplitude is the fallback. AC9 covers no source, silence, an unlocked bar and a source switch, with tests including the failed-load notice. |
| F9 | medium | AC2 says only 'the enhanced look renders ... with no console errors', and the e2e spec asserts one canvas and no errors. A silently black or washed-out canvas would pass. The existing look was hand-tuned for direct renderer output (LIGHT_SCALE, DISPLAY_GAMMA, ENVIRONMENT_INTENSITY in useCubesScene.ts:19-30), and the composer plus OutputPass changes tone-mapping and colour handling for transparent, non-depth-writing glass and a flashing background. The plan reduces this to 'tuning needed'. K4's GLSL string snapshots only freeze text and prove nothing about rendering. | Changed: AC2 adds pixel statistics and an enhanced visual baseline. The colour pipeline is decided in S1 (K7). GLSL tests are uniform and compile smoke tests. |
| F10 | low | Slice ordering leaves gaps. Bloom follows the bass flash from S2, but reduced-motion damping (AC8) only arrives in S4, so S2 and S3 can ship flash behaviour without it. S3 bundles onBeforeCompile material cloning, a shatter term, a particle shader and two re-measurements in one 'M' slice. The enhanced-only controls (S4) create a conditional ControlPanel path and a static CubesControlValues type (cubesControls.ts) that appear nowhere in the tests, and the failure notice placement in CubesPage is unspecified. | Changed: the reduced-motion damper moves to S2. S3 is split into waves and shatter (S3) and particles (S4); camera and controls are S5, with a default-panel-unchanged test. |

## Hand-off

A verified-diamond draft DAG with 5 task(s) and 6 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `02221feb97bc7b17`).
