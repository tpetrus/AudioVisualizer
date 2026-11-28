# Trio color wave enhanced graphics
> Double-diamond plan `trio-enhanced-graphics` revision 1 | status **final** | lane full | risk R1 | base c03849a0890f | updated 2026-11-27T14:09:26.949Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> Similar to how we added enhanced graphics to the dancing-character, I also want to add enhanced graphics to the trio color wave visualization. Ideate ways to enhance this visualization

## Problem

The trio color wave draws three sheets of flat, unlit instanced pencil bars (RawShaderMaterial, opacity 0.8) on a plain background. Its ACES tone mapping likely has no effect, since RawShaderMaterial skips three's tone-mapping chunks. It has no glow, depth, atmosphere or rhythm-driven accents. The app-wide Enhanced graphics toggle (on origin/main, from the dancer work) gives users a richer look on capable machines, but the trio ignores it.

**Users:** Viewers watching the trio color wave on a desktop GPU who turned Enhanced graphics on; Viewers on weak or software-rendered GPUs who need the current look to stay fast

**Evidence:**
- context-brief.md: trioColorWaveSheet.ts, pencilFlagsMesh.ts and fragment.ts:9 show unlit vColor output
- context-brief.md: bass-ink/bassInkPost.ts is the repo's working bloom and afterimage pipeline, with a software bypass
- User: origin/main already has the enhanced graphics toggle

## Goals

- When Enhanced graphics is on, the trio renders a clearly richer look: HDR glow, depth or atmosphere, finer geometry and rhythm-driven accents
- With the toggle off, or on a software renderer, the trio looks and performs exactly as today
- Switching the toggle on the trio page takes effect without a reload and leaks nothing
- Reuse the existing toggle, the bass-ink post-processing pattern, useThreeScene and useRhythm instead of new infrastructure

## Non-goals

- Changing the existing enhanced graphics toggle's contract, storage key or landing-page UI
- Changing the standard (toggle off) trio look, its controls' meaning or its audio analysis path
- Enhancing any other visualizer
- Upgrading three.js or adding non-three runtime dependencies
- Heavy downloaded assets (HDRs, textures over a few hundred kB)

## Success metrics

- On the user's desktop GPU in npm run dev at 1080p and DPR 2, enhanced mode keeps p5 frame time under 17 ms in PerformanceStats over a 60 s track
- Total JS growth at or under 6 kB gzip, enhanced code in a lazy chunk
- Lighthouse on / and the existing e2e suite stay green with no new console errors or WebGL-context warnings
- The user judges the enhanced look a clear upgrade from the PR's side-by-side screenshots

## Constraints

- Plan against origin/main (68fcb93 or later), which holds the enhanced graphics toggle; implementation starts by pulling main
- three.js r186 pinned; addons from three/addons
- Named exports, logic outside React, no React state in the render loop, no per-frame allocation, every GPU resource disposed (AGENTS.md rules 1-5)
- 95% coverage over app/**; specs beside files
- Software-WebGL e2e and Lighthouse (SwiftShader) must keep passing; enhanced mode falls back on software renderers
- A deliberate UI change needs regenerated visual baselines through the Update visual snapshots workflow
- Budget raises go in the same PR with the reason

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | Enhanced graphics is off | the user opens /trio-color-wave | the scene renders the current look and no enhanced chunk is requested. The trio settings-panel visual baseline matches origin/main's baseline as read in S0. |
| AC2 | Enhanced graphics is on and the renderer is hardware | the trio plays audio | the bars glow (bloom on HDR linear colours, with ACES and sRGB applied once by OutputPass) and show the depth backdrop and the denser bars. The PR attaches standard and enhanced screenshots of the same moment, with renderer.info render calls and programs recorded for both. |
| AC3 | Enhanced graphics is on | a beat or bass onset that passes the accent's re-trigger gate (at most 3 per second) arrives from the rhythm tracker or bass level | the pulse rises in that same frame's update, with peak amplitude capped and scaled by the accent intensity control. Under prefers-reduced-motion the pulse is damped and the shockwave and dust drift are off. |
| AC4 | Enhanced graphics is on and isSoftwareRenderer is true (CI, Lighthouse) | the trio renders | it uses the standard render path with no composer, and the e2e and Lighthouse checks pass unchanged |
| AC5 | the trio page is open | the user toggles Enhanced graphics on and off five times | the look switches without a reload, and the useThreeScene effect runs once across all toggles, so the camera pose is kept. Toggling during a crossfade or while the chunk loads leaves one look at most. On a hardware run, renderer.info.memory and programs return to their pre-toggle values. The forced-enhanced e2e spec sees one canvas, the context count within the fixture limit and no console errors. |
| AC6 | Enhanced graphics is on | the user opens the trio control panel | a Look section offers glowStrength, accentIntensity, depth and dust sliders, merged in by the page only in enhanced hardware mode and read through valuesRef. ControlPanel is unchanged, and the values persist with the other trio control values. |
| AC7 | a production build | npm run size runs | the enhanced trio code sits in a lazily loaded chunk. Total JS growth stays at or under 6 kB gzip, measured after S1 and again after S4. The budget in .size-limit.json is raised in the same PR by exactly the measured amount, with the reason stated. |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Opt-in toggle or replace the current look? | Use the enhanced graphics toggle already on origin/main. | user | The user confirmed origin/main holds it; local main (c03849a) is one fetch behind. |
| D2 | Which enhancement directions matter? | All four: lighting and glow, more audio reactivity, atmosphere and depth, geometry detail. | user | User selected every direction. |
| D3 | Must the current trio color wave identity stay recognisable? | Free to reinvent. | user | User allows a bigger visual change in enhanced mode. |
| D4 | Acceptable bundle and performance cost? | Modest; raise the size budget if justified in the PR. | user | Matches how recent PRs raised the JS budget with a stated reason. |
| D5 | What happens with enhanced on but a software renderer? | Fall back to the current look, as bass-ink bypasses its glow. | user | Keeps CI, Lighthouse and weak machines fast. |
| D6 | Which API does the toggle expose? | Assume the dancer plan's contract: getEnhancedGraphics, subscribeEnhancedGraphics and useEnhancedGraphics in app/features/settings, and the ControlPanel header prop. Slice S1 verifies it against origin/main and adapts. | planner assumption (confirm) | The local checkout cannot read origin/main; the untracked dancer plan defines these names. |
| D7 | Where does post-processing come from? | Follow bass-ink: EffectComposer, UnrealBloomPass and OutputPass from three/addons through the useThreeScene render hook, with isSoftwareRenderer from bass-ink/renderBudget.ts (moved to a shared place if it is imported from two features). | repo-fact | bassInkPost.ts is the only working composer and already passes the budgets. |
| D8 | How is the enhanced path tested in CI, where WebGL is software? | C1 takes an override that only e2e sets: an init script sets a window flag that makes the software check report hardware. One e2e spec forces enhanced mode at a small canvas under SwiftShader. A recorded hardware run of renderer.info before and after five toggles backs AC5. | planner assumption (confirm) | Critic F1: otherwise the toggle e2e passes vacuously. App code never imports e2e; it only reads a flag. |
| D9 | How are denser bars achieved without touching the audio path? | The lazy look builds its own denser PencilFlagsMesh per sheet, fed by interpolating the existing sheet's height and colour arrays, and hides the standard sheet mesh while enhanced. Each sheet's AnalyserNode and its FFT mapping are unchanged. | planner assumption (confirm) | Critic F2: keeps the non-goal that the audio analysis path is unchanged, and needs no rebuild on toggle. |
| D10 | How does the Look section appear only in enhanced mode? | A second definitions array (trioLookControls) that the page appends when the mode is enhanced. ControlPanel and isShown are untouched. | planner assumption (confirm) | Critic F6: avoids changing the shared ControlPanel contract. |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | When Enhanced graphics is on (hardware only), lazily load one module that adds a bass-ink-style bloom composer, an HDR gain on bar colors via a uniform, and a beat-driven glow pulse, with Look sliders; everything else stays unchanged. | 5 | 4 | 4 | 3 | 5 | yes | 4.25 |
| O2 | robust | A lazily loaded TrioEnhancedLook module owns an HDR shader variant, bloom composer, depth fog backdrop and a beat shockwave, wired through one lifecycle handle that is built and fully disposed on every toggle change, with a shared software-renderer gate. | 4 | 4 | 2 | 3 | 5 | yes | 3.55 |
| O3 | experience | A lazy enhanced trio look (bloom, HDR emissive bars, fog-like depth backdrop, beat shockwave) that crossfades in and out on toggle, keeps camera pose, and shows a clear Look section whose sliders always have visible effect. | 4 | 3 | 3 | 5 | 5 | yes | 3.8 |
| O4 | contrarian | Skip the EffectComposer: make the trio's enhanced look a shader-only variant (additive halo quads, inline ACES, depth fog, beat-pulse uniform), breaking the assumption that glow requires a post-processing pass. | 3 | 4 | 4 | 2 | 5 | no | 3.5 |
| **O5** (chosen) | hybrid | Hybrid of O2, O3 and O4. O2 supplies the structure: a pure mode decision, a shared software gate, one lazy look handle with a cancel flag and a single dispose, and an untouched standard shader. O3 supplies the experience: HDR bars with bloom, a depth backdrop with dust, a beat shockwave capped for flashing, a short crossfade, reduced motion and silent failure fallback. O4 adds finer geometry: higher bar density in enhanced mode. | 4 | 4 | 2 | 5 | 5 | yes | 3.85 |

## Decision

**O5**: Hybrid of O2, O3 and O4. O2 supplies the structure: a pure mode decision, a shared software gate, one lazy look handle with a cancel flag and a single dispose, and an untouched standard shader. O3 supplies the experience: HDR bars with bloom, a depth backdrop with dust, a beat shockwave capped for flashing, a short crossfade, reduced motion and silent failure fallback. O4 adds finer geometry: higher bar density in enhanced mode.

O1 scores highest because it is cheapest, but it drops geometry detail and gives only fog for depth. The user chose all four enhancement directions (D2) and allowed a reinvented look (D3), and the success metric is a clear upgrade. O5 keeps O1's bass-ink reuse and adds O2's provable lifecycle (cancel flag, single dispose, pure mode gate) for AC5. It also adds O3's accent, motion and failure states, and O4's denser geometry. O4 alone was rejected: halo quads only approximate bloom (AC2). O3 alone leaves the lifecycle race unspecified.

**Approach:**
- S1: pull origin/main and verify the toggle API (D6); move isSoftwareRenderer to app/lib/three/renderBudget.ts with a bass-ink re-export; add the pure resolveTrioLookMode(enhanced, software).
- The scene hook subscribes to the toggle and, in enhanced mode only, dynamic-imports createTrioEnhancedLook. A cancel flag disposes a look that resolves after toggle-off. It attaches through the useThreeScene render hook without rebuilding the renderer, so the camera pose is kept.
- Enhanced look: a new HDR fragment variant of the pencil bars (emissive gain over 1, standard fragment untouched), EffectComposer with RenderPass, UnrealBloomPass at half resolution and OutputPass (ACES), as in bassInkPost.ts.
- Depth: a gradient backdrop plane with fog falloff and one Points draw of drifting dust, both preallocated.
- Rhythm accent: the beat or bass onset from useRhythm and analyser refs, read in the frame loop, sets a pulse and a pooled shockwave-ring uniform the same frame. Accent slider scales it, with a minimum re-trigger interval (no more than 3 flashes per second). Under prefers-reduced-motion the shockwave and dust drift are off.
- Geometry detail: enhanced mode raises the bar instance density and adds a height-based emissive rim in the HDR shader; buffers are sized once at build time.
- Look section (Glow, Accent, Depth, Dust) appears in trioColorWaveControls only in enhanced hardware mode, read through valuesRef. A 250 ms crossfade of bloom and backdrop on toggle. If the lazy chunk fails, one console warning and the standard look stays.

## Design

The trio keeps its current render path as the standard look. setup returns one stable render() that branches on a mode held in a ref. The toggle subscription lives in that ref, never in the useThreeScene deps or the antialias option, so the renderer is never rebuilt. In enhanced mode, resolved inside setup from the toggle and isSoftwareRenderer (or the e2e override), the hook lazy-loads createTrioEnhancedLook. That look builds denser HDR bar meshes fed by the sheets' height arrays (standard sheets hidden), a backdrop, dust, a shockwave ring and a bass-ink-style bloom composer. A small state machine (standard, loading, enhanced, fading-out) governs transitions.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| renderBudget | Shared isSoftwareRenderer | app/lib/three/renderBudget.ts |
| trioLookMode | Pure mode resolution | app/features/visualizers/trio-color-wave/trioLookMode.ts |
| trioEnhancedLook | Enhanced resources and per-frame update, single dispose | app/features/visualizers/trio-color-wave/enhanced/trioEnhancedLook.ts |
| trioAccent | Pure pulse envelope: attack, decay, minimum re-trigger interval | app/features/visualizers/trio-color-wave/enhanced/trioAccent.ts |
| HDR pencil fragment | Emissive gain, rim, pulse uniforms | app/features/visualizers/meshes/shaders/hdrFragment.ts |

### Contracts (freeze before dependent work)

- **C1 resolveTrioLookMode** (pure function): resolveTrioLookMode(enhanced: boolean, software: boolean): 'standard' | 'enhanced', which is enhanced only when enhanced is true and software is false. software comes from isSoftwareRenderer(renderer) unless the e2e-only window flag forces hardware (D8). It is evaluated inside setup, after the renderer exists and before any import.
- **C2 createTrioEnhancedLook** (module API (lazy chunk)): createTrioEnhancedLook({ renderer, scene, camera, sheets, valuesRef, rhythmRef, reducedMotionQuery }) returns { render(dtSeconds): void; setSize(w, h): void; setMix(0..1): void; dispose(): void }. It builds a denser PencilFlagsMesh per sheet fed by the sheet's height and colour arrays, and hides the standard meshes while active. The HDR fragment writes linear colour; OutputPass alone applies ACES and sRGB. dispose frees everything it created, unhides the standard meshes and is idempotent. The hook's transitions: standard to loading (import), then enhanced; enhanced to fading-out (250 ms) and then dispose. Toggling on during fading-out reverses the fade on the same handle. Toggling off during loading sets a cancel flag, and the resolved look is disposed and never attached. A failed import returns to standard, warns once, and retries on the next off-to-on toggle. On webglcontextlost the look is disposed and the mode goes to standard.
- **C3 isSoftwareRenderer (shared)** (module API): isSoftwareRenderer(renderer): boolean moves unchanged to app/lib/three/renderBudget.ts; bass-ink/renderBudget.ts re-exports it
- **C4 Look control keys** (control config): trioLookControls (a separate definitions array, appended by the page only in enhanced mode) adds glowStrength (0 to 3), accentIntensity (0 to 1), depth (0 to 1) and dust (0 to 1). Values persist with the other trio control values. Standard-mode keys, defaults and ControlPanel are unchanged.
- **C5 Trio scene rhythm input** (hook option): useTrioColorWaveScene gains an optional rhythmRef (the useRhythm tracker state ref), passed by the trio page the way BassInkPage and DancingCharacterPage do. The standard path ignores it.

### Data

No new persisted data. The toggle's existing localStorage key is reused unchanged. Look slider values follow useControlValues like the other trio controls.

### UX

The toggle comes from origin/main's shared control (no new UI for it). Switching crossfades over 250 ms, and the camera is kept. The Look section appears only when enhanced is active. On a software renderer the trio shows the standard look and no Look section. A chunk-load failure keeps the standard look and logs one warning.

### Accessibility

trioAccent caps the pulse rate (3 per second) and the peak amplitude. Under prefers-reduced-motion, read through a subscribed matchMedia query so a mid-session change applies, the glow pulse is damped to a gentle level and the shockwave and dust drift are off. Sliders reuse ControlPanel's labelled inputs.

### Security and privacy

None: client-side rendering only, no new network or storage.

### Observability

One console.warn on chunk-load failure. The dev PerformanceStats overlay shows frame rate for the 60 fps check.

### Rollout and rollback

Behind the existing Enhanced graphics toggle, default per origin/main. Rollback is toggling off or reverting the PR; the standard path is unchanged.

## Test strategy

- **Unit:** trioLookMode truth table including the e2e override. trioAccent: gate, same-frame rise, amplitude cap and reduced-motion damping, each tested separately. trioEnhancedLook with the app/test three fakes: build, five toggle cycles dispose every created resource, double dispose is safe, standard meshes are unhidden. The hook's state machine: toggle-off during loading disposes the late look; toggle-on during fading-out reuses the handle; import failure goes to standard, warns once and retries on the next toggle; context loss disposes. trioLookControls is appended only in enhanced mode.
- **Integration:** useTrioColorWaveScene with injected tracker and the fake renderer: render hook attached only in enhanced hardware mode, camera pose unchanged across toggles.
- **End-to-end:** The existing suite passes on the standard path. A new trio spec uses the e2e-only flag to force enhanced mode at a small canvas, toggles five times and asserts one canvas, the context count within the fixture limit and no console errors. Visual baselines are regenerated through the Update visual snapshots workflow when the panel changes.
- **Manual:** On the user's hardware GPU in npm run dev, compare standard and enhanced with a real track and attach the screenshots to the PR. Record renderer.info memory and programs before and after five toggles. Check p5 frame time under 17 ms at 1080p, DPR 2; beats visibly accent; reduced motion damps the pulse; no WebGL warnings.
- **Non-functional:** npm run size: enhanced code in a lazy chunk, total JS raised only by the measured amount with the reason in the PR. npm run lighthouse stays within budget.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | The toggle API on origin/main differs from the dancer plan's names (D6) | medium | medium | S0 reads origin/main and adapts names before any code that depends on the toggle |
| K2 | Bloom plus denser bars miss 60 fps at DPR 2 | medium | medium | Half-resolution bloom, density set once from config, and the Glow slider set to 0 skips the bloom pass |
| K3 | A late lazy import or a toggle during the crossfade leaks GPU resources | medium | high | Cancel flag plus idempotent dispose (C2), unit test resolving the import after toggle-off, and an e2e five-toggle spec |
| K4 | Passing bars through the linear composer changes hue, brightness and 0.8-alpha blending even at glow 0 | high | medium | The HDR fragment writes linear colour, and OutputPass owns ACES and sRGB. An S1 exit check reviews the enhanced palette at glow 0 and accent 0 as a deliberate look. |
| K5 | Bundle growth exceeds the about 6 kB target | low | medium | Composer addons are already bundled for bass-ink and should dedupe; keep enhanced code in the lazy chunk and measure each slice |
| K6 | The e2e-only override flag could be set in production by anyone | low | low | It only enables a rendering path any user can already enable with the toggle. Name it clearly and document it in the e2e fixtures. |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Mode gate, lazy look lifecycle and bloom: Add resolveTrioLookMode with the e2e override, the stable branching render, the lazy look state machine with cancel, retry and dispose, the linear HDR bar fragment and the bloom composer. Measure the chunk size. Exit check: the enhanced palette at glow 0 is reviewed. | S0 | AC1, AC4, AC5, AC7 | C1, C2, C3 | R1 | M | app/features/visualizers/trio-color-wave/trioLookMode.ts, app/features/visualizers/trio-color-wave/enhanced/trioEnhancedLook.ts, app/features/visualizers/meshes/shaders/hdrFragment.ts, app/features/visualizers/trio-color-wave/useTrioColorWaveScene.ts, e2e/fixtures.ts, e2e/ |
| S2 | Depth backdrop, dust and Look controls: Add the gradient fog backdrop, the dust points and trioLookControls (glowStrength, depth, dust), appended by the page in enhanced mode. | S1 | AC2, AC6 | C2, C4 | R1 | M | app/features/visualizers/trio-color-wave/enhanced/, app/features/visualizers/trio-color-wave/trioLookControls.ts, app/features/visualizers/trio-color-wave/TrioColorWavePage.tsx |
| S3 | Rhythm accent and shockwave: Wire rhythmRef from the trio page into the hook (C5). Add the pure accent envelope with gate, amplitude cap and subscribed reduced motion, driving the pulse and a pooled shockwave ring, plus the accentIntensity slider. | S2 | AC3, AC6 | C2, C4, C5 | R1 | M | app/features/visualizers/trio-color-wave/enhanced/trioAccent.ts, app/features/visualizers/trio-color-wave/enhanced/trioEnhancedLook.ts, app/features/visualizers/trio-color-wave/TrioColorWavePage.tsx, app/features/visualizers/trio-color-wave/useTrioColorWaveScene.ts |
| S4 | Geometry detail, crossfade, fallback and budget: Add the denser enhanced bar meshes fed by the sheets' arrays (D9), the emissive rim and the 250 ms crossfade with interruption rules. Rerun the five-toggle checks after the crossfade, measure and raise the size budget, and regenerate the baselines. | S3 | AC2, AC5, AC7 | C2 | R1 | M | app/features/visualizers/trio-color-wave/enhanced/, .size-limit.json, e2e/visual.spec.ts-snapshots/ |
| S0 | Verify origin/main toggle and share the software gate: Pull origin/main and read the toggle's real API, default and panel integration, then adapt names in this plan's wiring (D6, Q1). Note the trio panel baseline state for AC1. Move isSoftwareRenderer to app/lib/three/renderBudget.ts with a bass-ink re-export and no behaviour change. |  | AC4 | C3 | R1 | S | app/lib/three/renderBudget.ts, app/features/visualizers/bass-ink/renderBudget.ts |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Is the toggle's default on origin/main off, and does the trio panel get the shared header row automatically? | implementer in S1 (read origin/main) | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | blocker | AC5, AC2, AC3 and the K3 mitigation cannot be exercised by any CI check. The e2e suite runs on software WebGL, so AC4/C1 forces the standard path there. The 'five-toggle e2e spec' in test_strategy.e2e therefore never builds a composer, render target or shader, and passes vacuously. Leak, late-import race and crossfade behaviour are covered only by unit tests against app/test three fakes, which do not execute GL, shader compilation or real dispose semantics. K3 is rated high impact, yet its real-GPU evidence is a manual dev check. | Changed: D8 adds an e2e-only hardware override in C1. A forced-enhanced e2e spec backs AC5, plus a recorded hardware renderer.info run; AC5 is reworded. |
| F2 | high | The design contradicts itself on geometry density and the 'no rebuild' toggle. Overview and S4 say enhanced mode raises bar instance density with 'buffers sized once at build time', but PencilFlagsMesh sizes its offsets, colors, heights and tips in the constructor from numDepth/numWidth. TrioColorWaveSheet also maps those columns to FFT bins and owns its own AnalyserNode. A live toggle without rebuilding the renderer therefore needs either a second, denser mesh and sheet set or rebuilding the sheets. 'Restores the sheets' standard material' (C2) does not cover this. The non-goal 'audio analysis path unchanged' and the 'exactly as today' goal are at risk, and the brief flags that analyser changes need the audio-presentation audit recheck. Standard-mode instance buffers, or a doubled instance count, are also unaccounted for in the GPU and per-frame CPU cost (K2). | Changed: D9 adds a denser PencilFlagsMesh inside the lazy look, fed by the sheets' arrays, with the standard meshes hidden. Analysers are untouched. In C2 and S4. |
| F3 | high | The hook-level lifecycle is unspecified where it matters. useThreeScene reads handle.render once per frame from the handle object returned by setup, and tears down the renderer if antialias changes. The plan says the composer attaches 'through the render hook without rebuilding the renderer' on a live toggle, but the existing hook has no way to swap handle.render after setup other than mutating the returned object or a stable render function that branches. S1 touches useTrioColorWaveScene.ts only. The enhanced toggle is subscribed outside the hook. 'Camera pose kept' (AC5) holds only if the toggle never reaches the antialias dep. The dancer plan (D6) switches antialias via these deps, and the plan does not say the trio must not. | Changed: a stable render() branching on a mode ref, with the toggle never in the useThreeScene deps or antialias. AC5 now requires the effect to run once. |
| F4 | high | Colour and blending will change when bars pass through the composer, and the plan treats HDR as a gain multiplier only. The pencil shader is a RawShaderMaterial writing raw vColor with no colour-space or tone-mapping chunks (fragment.ts:9). RenderPass writes it to a linear half-float target and OutputPass then applies ACES and the sRGB conversion. The result is a different hue and brightness even at gain 1, and the 0.8 alpha blending order changes. bassInkPost.ts:74-77 documents this exact 'blends in linear light vs after sRGB' jump. O2 mentioned manual in-shader tone mapping, but O5 and C2 drop it. K4 rates the blend problem low impact with 'tuned in dev' as the only mitigation. Since D3 allows a reinvented look this is not a blocker, but the tone-mapping assumption in the problem statement is unverified. | Changed: the HDR fragment writes linear colour and OutputPass alone owns ACES and sRGB. S1 has a palette exit check; K4 is raised to high/medium. |
| F5 | high | The rhythm source is not wired on the trio. useRhythm/rhythmRef is used only by BassInkPage and DancingCharacterPage; the trio hook's options are analyser, valuesRef, cameraLocked and onViewChanged. AC3 needs a tracker (or bass level) into the scene. The plan lists no change to the trio page component or the hook options, and S3's draft_paths include only enhanced/*. 'Within one frame of the tracker state changing' also conflicts with the minimum re-trigger interval that caps flashes at 3 per second. The plan does not say which wins, and the audit's reaction-delay figures apply to any analyser tap. | Changed: new C5 rhythmRef hook option, and the page file is in S3. AC3 is reworded so a gated onset rises in the same frame. |
| F6 | medium | C4 'Look section shown only when enhanced' has no mechanism. trioColorWaveControls is a static const array and ControlPanel filters definitions by isShown(definition, values), which depends on control values and not on the global toggle or the software gate. Options are: a hidden mode value, a different definitions array per mode, or an isShown extension. Each changes the TrioColorWaveControlValues type and defaults, and so the shared ControlPanel contract. Hidden values still persist, so a user's Look values reappear later. The key list in C4 (glow, accent, depth, dust) also differs from AC6 (glow strength, accent intensity). | Changed: D10 makes trioLookControls a second array appended by the page. Keys are aligned in AC6 and C4, and values persist. |
| F7 | medium | Slice order and sizing do not match the dependency risk. S1 carries toggle verification (an unreadable origin/main, D6), a cross-feature move of renderBudget with a bass-ink re-export, the mode gate, the lazy lifecycle with cancel and dispose, the HDR shader and the composer, and is sized M. It produces no visible enhanced look to review until bloom works. D6 and K1 ('impact low') are planner-assumption and the whole wiring depends on the toggle API, and the plan targets a base (68fcb93) that nobody has read. If the API differs, C1, C2 wiring and all of S1 change. AC5 is attached to S1 but crossfade, the thing that makes toggling racy, lands in S4. | Changed: new S0 verifies origin/main and moves renderBudget. K1 impact is medium, and AC5 is now on S1 and S4 with a final recheck. |
| F8 | medium | Several acceptance criteria are not testable as written. AC1 hedges with 'apart from any toggle row the shared toggle adds' and AC7 with 'raised by the measured amount'. AC2 ('visibly different in a dev screenshot') and the 60 fps metric have no pass/fail threshold or tool. The size metric of about 6 kB gzip, the stated budget for bloom wiring, backdrop, dust, shockwave, crossfade, reduced motion, dense geometry and two shaders, is unmeasured because headroom is unknown (brief). Visual baselines will also move for every visualizer if the shared toggle row is on origin/main. The plan does not say whether that is already merged in baselines. | Changed: AC1 is pinned to origin/main's baseline. AC2 requires screenshots plus renderer.info, fps uses a p5 frame-time threshold, and size is measured after S1 and S4. |
| F9 | medium | Failure and race handling has gaps. (1) Chunk-load failure 'keeps the standard look and logs one warning', but the toggle UI is shared and stays on, which is the 'toggle appears on with no effect' risk that O3 named and O5 dropped. There is no retry and no state. (2) A toggle during the 250 ms crossfade is in K3, but C2 has setMix with no defined behaviour for interruption: a dispose mid-fade, or a re-enable mid-fade creating a second composer. (3) WebGL context loss, which the lazy composer's render targets are vulnerable to, is not considered. (4) The software gate reads isSoftwareRenderer(renderer) only after the renderer exists, so resolveTrioLookMode runs inside setup, not before any import, and the dancer toggle's subscription timing is unknown. | Changed: C2 defines the state machine, the fade interruption, the failure retry on the next toggle and disposal on context loss. |
| F10 | low | The accessibility claim is thinner than stated. 'No more than 3 flashes per second (WCAG 2.3.1)' is a frequency cap only. 2.3.1 also concerns the flash area and luminance change, and a full-bar bloom pulse plus a shockwave across three large sheets can cover a large share of the screen. Only prefers-reduced-motion switches off shockwave and dust, while the glow pulse, the main flash source, stays. The reduced-motion flag is read once at creation (C2 takes reducedMotion as a plain value), so a mid-session OS change is ignored. | Changed: reduced motion also damps the glow pulse, the amplitude is capped, and the media query is subscribed. |

## Hand-off

A verified-diamond draft DAG with 5 task(s) and 5 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `9c4ea884145c23db`).
