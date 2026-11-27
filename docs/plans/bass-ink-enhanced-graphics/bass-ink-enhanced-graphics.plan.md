# Bass ink enhanced graphics
> Double-diamond plan `bass-ink-enhanced-graphics` revision 1 | status **final** | lane full | risk R2 | base c03849a0890f | updated 2026-11-27T18:45:38.623Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> we want to enhance the bass-ink visualization with support for the enhanced graphics. This can include any sort of additions that will make it visualy more stunning.  Branch from origin/main so you can see the shared toggle for enhanced graphics.  The goal here is to make bass-ink as visually stunning as possible, without losing the core of what the visualization does

## Problem

bass-ink is a tempo-breathing point cloud that reforms on drops, flashes on kicks and sprays on bass hits, drawn through a fixed trails and bloom composer. The shared enhanced-graphics toggle (on origin/main, not yet in the local checkout) lets visualizers offer a richer look, but bass-ink does not opt in, so users who turn it on see nothing new here.

**Users:** Viewers who turn on enhanced graphics on a capable machine and want bass-ink to look as stunning as possible; Viewers on standard mode or software renderers, who must see bass-ink exactly as today

**Evidence:**
- context-brief.md: no enhanced or quality reference under app/ in this checkout; local main c03849a behind origin/main bd71db4
- docs/plans/cubes-, trio-, dancer-enhanced-graphics: the agreed pattern (lazy chunk, toggle off unchanged, in-place swap, software fallback, reduced-motion damping)
- bassInkPost.ts and docs/plans/bass-ink-post/contracts.md: existing composer and flash-safety rule

## Goals

- With enhanced graphics on, bass-ink looks markedly richer (depth, glow, colour and texture) while staying recognisably the same piece: same formations, palette family and bass, kick and drop reactions
- In both modes, the camera rotates gradually on a tilted orbit whose speed rises smoothly with the combined level of the three trio-color-wave bands (bass, mids, highs)
- Enhanced mode holds about 60 fps at 1080p on a mid-range or integrated laptop GPU
- Toggle off, and any software renderer, keep today's render path and passes; the only standard-mode change is the camera rotation

## Non-goals

- Changing bass-ink's standard look beyond the camera rotation: controls defaults, formations, director and reaction timing stay
- Changing the shared enhanced-graphics toggle, its storage or other visualizers' behaviour (trio-color-wave output must not change if band code is shared)
- New audio analysis or rhythm-tracker changes; the rotation reuses trio-color-wave's band split and everything else reuses existing bass, kick and drop signals
- Upgrading three.js or adding non-three dependencies
- Making post effects follow the music in ways that add flashes (flash-safety rule stays)

## Success metrics

- Side-by-side review in npm run dev: enhanced is judged clearly more stunning and still recognisably bass-ink
- Enhanced median frame time at or under about 16.7 ms at 1080p on the reference laptop GPU
- scorecard:check passes and bass-ink reaction cells from debug:viz are unchanged within noise with enhanced off
- Total JS gzip growth small and justified; entry chunk and Lighthouse on / unchanged

## Constraints

- Follow the toggle contract as it exists on origin/main; implementation branches from origin/main
- Enhanced code lives in a lazily loaded chunk; toggling swaps in place through the render hook, keeping the camera
- No per-frame allocation; every GPU resource disposed; StrictMode double-mount safe
- Flash safety (contracts.md:39): post strengths do not follow the music; at most 3 flashes per second as granted by BrightnessMix
- Software renderers keep the plain path (bassInkPost.ts:78) even with enhanced on
- Telemetry probe columns are append-only (devTelemetry.ts:51)
- three.js r186 pinned; addons from three/addons; bundle budget raise in the same PR with a reason
- prefers-reduced-motion damps the rotation and any added motion

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | enhanced graphics is off (or never set) | the user opens /bass-ink | the scene renders through today's path with today's passes; apart from the camera rotation the look is unchanged, and the bass-ink standard visual baseline is regenerated only for the rotation |
| AC2 | enhanced graphics is on and a real GPU | the user opens /bass-ink | telemetry enhancedActive is 1, the enhanced passes are enabled and the enhanced shader define is set; before and after screenshots on a real GPU show the richer look, and formations, kick flashes, bass sprays and drop reforms still occur at the same moments as in standard mode |
| AC3 | bass-ink is open in either mode with the camera locked (the default) and music playing | the combined level of the three bands (bass, mids, highs, from a trio-like split with trio's default edges) rises | the camera orbits the formation on a tilted path with angular speed scaled by the Camera drift control, increasing monotonically with the smoothed combined level, never reversing or jumping, and at a slow floor speed in silence; at Camera drift 0 it does not orbit |
| AC4 | bass-ink is open | the user flips the enhanced toggle either way | the look switches in place without a reload, the camera pose is kept, no WebGL context is lost or leaked and no console error is logged |
| AC5 | a software renderer (SwiftShader) with enhanced on | bass-ink renders | it uses the standard plain path, with no enhanced passes built, and logs no error |
| AC6 | prefers-reduced-motion is set (read with matchMedia, live), in either mode | music plays | the camera auto-orbit is stopped and enhanced mode adds no extra motion |
| AC7 | enhanced is on | a loud passage with dense kicks plays | no post-processing strength, radius or threshold follows the music, and flash count stays within the BrightnessMix limit of 3 per second |
| AC8 | enhanced is on at 1080p on the user's reference laptop GPU | a dense passage plays for 60 s | the dev telemetry median frame time is at or under about 16.7 ms (an automatic render-scale step-down may engage, never a pass swap), and leaving the visualizer frees every GPU resource it built |
| AC9 | the enhanced work is merged | CI runs | format, lint, typecheck, test:coverage at 95%, build, size (any raise justified), e2e and scorecard:check pass |
| AC10 | the auto-orbit is running | the user unlocks the camera, drags, relocks or presses reset view | as in the dancer: while unlocked the orbit controls own the camera and the auto-orbit does not advance; relocking or reset view returns to the default pose with the orbit angle zeroed; the view-changed flag is not tripped by the auto-orbit |
| AC11 | trio's stateless band helpers are moved to a shared module | trio-color-wave runs | its output under a golden test and its existing unit tests are unchanged |
| AC12 | enhanced is off | bass-ink builds its point materials and composer | the standard shader program and default uniforms are identical to today's (unit-tested), so the enhanced code never reaches the standard path |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How far may enhanced change the look? | Same piece, richer, plus a gradual tilted rotation that speeds up with loudness | user | Keep the core; add one signature motion |
| D2 | Performance target | About 60 fps at 1080p on a mid-range laptop GPU | user | Usable for most users |
| D3 | May the JS budget rise? | Yes, small and justified, with enhanced code lazy-loaded | user | Landing cost stays flat |
| D4 | Where does bass-ink post live today? | bassInkPost.ts: RenderPass, AfterimagePass, UnrealBloomPass, OutputPass, software bypass | repo-fact | context-brief.md |
| D5 | Is the rotation enhanced-only? | No: both modes | user | User chose both modes; standard baseline changes for the rotation only |
| D6 | What rotates and how does it coexist with orbit controls? | The camera, as in the dancer (dancingCharacterScene.ts:428-434, 481): the scene writes a tilted orbit pose only while the camera is locked (the default); unlocked hands the camera to the orbit controls and pauses the orbit; reset and relock zero the angle | user | User chose the camera and pointed to the dancer; the pattern leaves the shared orbitView untouched |
| D7 | What drives rotation speed? | A trio-like split of bass-ink's own spectrum into bass, mids and highs with trio's default edges, its stateless helpers broken out into reusable shared code; the combined value, smoothed and rate-limited, maps to speed between a floor and a cap | user | User: trio-like, and break it out into reusable code if possible |
| D8 | Branching | The implementation session branches from origin/main to get the toggle; this planning session only read the local checkout | user | Request says branch from origin/main; toggle API to be confirmed there |
| D9 | Risk class | R2 | planner assumption (confirm) | Standard-mode motion changes and trio band code may be shared across visualizers |
| D10 | How does the rotation relate to Camera drift? | Camera drift scales the orbit speed; drift 0 means no orbit | user | Keeps the still-view promise without a new control |
| D11 | Reduced motion | Auto-orbit stopped, read live with matchMedia, passed into the orbit step | planner assumption (confirm) | Matches the dancer, which does not rotate under reduced motion; one testable outcome |
| D12 | How does the toggle swap? | Enhanced passes and shader variants are built once after the lazy load and toggled with enabled flags and a define; freed only on scene dispose | planner assumption (confirm) | bassInkPost.ts:74-77 forbids switching render paths; avoids hitches and double frees |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Add a small pure camera-orbit module fed by a shared trio band-level helper, plus one lazy enhanced chunk that only swaps bloom/afterimage config and adds a static depth/colour-grade pass inside the existing composer. | 5 | 4 | 4 | 3 | 5 | yes | 4.25 |
| O2 | robust | Extract a pure shared band-level function and a pure, unit-tested orbit controller (angle integration, never reverses), wire it into the camera in both modes, and add a lazily loaded enhanced post/shading chunk behind a strict fail-safe boundary with static, music-independent post strengths. | 5 | 4 | 3 | 4 | 5 | yes | 4.2 |
| O3 | experience | A viewer-first enhanced look (depth haze, soft-sprite glow, colour grading, light streak on kicks) that never strobes, plus a camera orbit that eases in and out so loudness feels like momentum, not a jolt, and every control still behaves as expected. | 4 | 3 | 2 | 5 | 5 | yes | 3.6 |
| **O4** (chosen) | hybrid | O2's structure (shared pure bandLevels with a golden trio test, pure integrated orbit, lazy enhanced chunk with cancel-safe swap and fail-safe fallback) carrying O3's enhanced look (depth fade and size attenuation, soft round-sprite glow, static colour grade and vignette, fixed second bloom) and O3's drag pause and resume, without O3's kick streak. | 5 | 4 | 2 | 5 | 5 | yes | 4.15 |

## Decision

**O4**: O2's structure (shared pure bandLevels with a golden trio test, pure integrated orbit, lazy enhanced chunk with cancel-safe swap and fail-safe fallback) carrying O3's enhanced look (depth fade and size attenuation, soft round-sprite glow, static colour grade and vignette, fixed second bloom) and O3's drag pause and resume, without O3's kick streak.

O4 takes O2's fail-safe structure and O3's richer look, and drops O3's kick streak, which would put music-driven light against the flash-safety rule. It scores below O1 and O2 on effort, but the request asks for bass-ink to be as visually stunning as possible, and O1's static grading alone does not deliver that (ux 3).

**Approach:**
- Sources: O2 for module boundaries, race, dispose and golden-test discipline; O3 for the visual layers and orbit feel; O1 for reusing the existing composer instead of a second one.
- Extract trio's band split into app/features/visualizers/shared/bandLevels.ts, writing into a preallocated out object; trio imports it and a golden-output test proves trio unchanged.
- orbitRotation.ts (pure, standard chunk): combined = bass + mids + highs, smoothed (slow attack, slower release), speed = floor + (cap - floor) * smoothstep(combined), angle += speed * clamped dt; reduced motion pins speed to the floor; drag pauses about 1.5 s then resumes from the current angle; lock stops; reset zeroes.
- useBassInkScene applies the angle as an azimuth offset on a fixed tilt over the OrbitControls pose and camera drift, with preallocated vectors, in both modes.
- Enhanced on and not software: dynamic import of enhanced/bassInkEnhanced.ts, which adds point-shader uniforms (depth fade, size attenuation, soft sprite) and fixed-strength grade, vignette and second bloom passes into the existing BassInkPost composer; strengths are constants, never audio-driven.
- Toggle swap through the render hook keeps the camera; build first, then switch, then dispose; a late import after unmount or toggle-off is discarded; failure keeps standard with one console.warn.
- Telemetry appends orbitAngle, orbitSpeed and enhancedActive at the end; size budget raised with a reason; standard baseline regenerated for rotation; enhanced gets its own baseline only if CI renders it (software renderers do not).

## Design

Two independent additions. (1) A camera auto-orbit in both modes, following the dancer: while the camera is locked, the scene writes a tilted orbit pose whose angular speed comes from a trio-like three-band split of bass-ink's own spectrum (combined level, smoothed and rate-limited), scaled by Camera drift; unlocked hands the camera to the orbit controls. (2) An enhanced look, lazily loaded when the shared toggle is on and the renderer is a real GPU: shader variants for depth fade, size attenuation and soft sprites, plus fixed-strength grade, vignette and second-bloom passes, all built once inside the existing BassInkPost composer and switched with flags.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| bandLevels | Trio's stateless helpers (log spectrum sampling, blur, peak-normalised level) shared with trio, plus a bass-ink three-band reader on one analyser | app/features/visualizers/shared/bandLevels.ts |
| bassInkOrbit | Combined level to slewed speed to integrated angle, dancer-style | app/features/visualizers/bass-ink/bassInkOrbit.ts |
| bassInkEnhanced | Enhanced shader defines, uniforms and static passes, built once, enabled by flag | app/features/visualizers/bass-ink/enhanced/bassInkEnhanced.ts |
| useBassInkScene / bassInkPost | Wiring, lock gating, reduced motion, render-scale step-down, software gate, telemetry | app/features/visualizers/bass-ink/ |

### Contracts (freeze before dependent work)

- **C1 bandLevels** (pure functions): Trio's stateless helpers (sampleLogSpectrum, blur kernel, peak-normalised level step) move to shared/bandLevels.ts and trio imports them with identical output (golden test). A bass-ink reader readBandLevels(spectrum, binHz, edges, state, out) fills a preallocated {bass, mids, highs, combined} from one analyser with trio's default edges, no allocation.
- **C2 bassInkOrbit** (pure module): orbitAngularSpeed(combined, driftSetting, prev, dt, reducedMotion): number in [0, cap], eased toward floor + (cap - floor) * smoothstep(combined) times driftSetting, with a max change per second as in dancingCharacterOrbit.ts; 0 when drift is 0 or reduced motion. The scene integrates azimuth only while locked, writes the camera on a fixed tilt, and resetOrbit() zeroes azimuth and speed. Constants in bassInkSceneConfig.orbit, including a max per-frame angular step to bound trail smear.
- **C3 bassInkEnhanced** (lazy module): Frozen in S0 against the real origin/main toggle. Planned: loadBassInkEnhanced(): Promise<{ build(post, materials): EnhancedHandle }>; EnhancedHandle { setEnabled(on): void; setRenderScale(s): void; setSize(size): void; dispose(): void }. Built once; setEnabled flips pass enabled flags and the shader define; no value follows the music; dispose idempotent and only on scene dispose.
- **C4 telemetry columns** (dev telemetry): Frozen in S0: the bass-ink probe appends, in this order, orbitAngle, orbitSpeed, enhancedActive, renderScale at the end; existing columns unchanged.

### Data

Reads the shared enhanced-graphics setting from origin/main's store (path and hook recorded in S0); no new storage.

### UX

Standard: same look; with the camera locked (default) a slow tilted orbit that quickens as the music fills, scaled by Camera drift. Enhanced: deeper, softer, graded ink with glow and haze. Toggle switches instantly in place. Unlocking hands the camera to the user, as in the dancer.

### Accessibility

prefers-reduced-motion (live matchMedia) stops the auto-orbit and enhanced adds no motion; flash safety kept (static post strengths, BrightnessMix cap of 3 per second).

### Security and privacy

No new data, network or storage.

### Observability

Append-only telemetry columns (C4); one console.warn on enhanced load or build failure; debug:viz baseline for bass-ink recorded in S0 and compared in S5.

### Rollout and rollback

One PR off origin/main, titled feat(bass-ink). Enhanced is opt-in by the existing toggle and off by default; the auto-orbit ships to everyone but Camera drift 0 or unlocking stops it. Rollback by Cloudflare rollback or revert.

## Test strategy

- **Unit:** bandLevels golden test against trio's current output, and readBandLevels on synthetic spectra; orbitAngularSpeed: monotonic in combined, slew and rate limit, 0 at drift 0 and under reduced motion, mid-play reduced-motion change; azimuth advances only while locked, reset zeroes it, view-changed flag untouched; bassInkEnhanced build once, setEnabled on, off, on with trails off and on in between without double free; standard shader program and uniforms identical with enhanced off (AC12); late import after unmount discarded.
- **Integration:** useBassInkScene with injected engine and tracker: toggle flips keep the camera pose and allocate nothing per frame; software flag skips the chunk; lock and unlock hand-over.
- **End-to-end:** Existing specs pass; a spec flips the enhanced toggle on /bass-ink and checks no errors and context release; the visual spec freezes the orbit (reduced-motion emulation, which stops it) so the bass-ink baseline stays deterministic; regenerate it only if the frozen standard frame changed.
- **Manual:** npm run dev on a real GPU: before and after screenshots standard versus enhanced; formations, kick flashes, sprays and drops still read; orbit at cap speed with default trails for smear; quiet and loud tracks; unlock, drag, relock, reset, drift 0; reduced motion.
- **Non-functional:** Dev telemetry median frame time at 1080p on the user's reference laptop GPU, at or under 16.7 ms, with the render-scale step-down; npm run size with a justified raise; Lighthouse on / unchanged; debug:viz and scorecard:check against the S0 baseline.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | The toggle API on origin/main differs from the plans read here | medium | medium | S0 reads the real store and hook on origin/main and freezes C3 and C4 before any wiring |
| K2 | Enhanced layers exceed 16.7 ms on integrated GPUs | medium | medium | Half-resolution extra passes, measure in S4, drop the second bloom first if over budget |
| K3 | Auto-orbit conflicts with orbit controls | low | medium | Dancer pattern: write the camera only while locked; unit-test hand-over and reset |
| K4 | Extracting the band split changes trio output | low | high | Golden test written before the extraction (S1) |
| K5 | Camera motion changes pointCount, fit or swing paths and thus debug:viz cells | medium | medium | Record a debug:viz baseline in S0; compare in S5 and explain any moved cell |
| K6 | Depth fade or soft sprites blur formations so the core reads less clearly | medium | medium | Fixed, conservative constants; side-by-side manual review in S4 |
| K7 | Screen-space trails smear the whole cloud at cap orbit speed | medium | medium | Cap the per-frame angular step; manual check at cap speed with default trails in S2; tune in Q1 |
| K8 | The enhanced look is not stunning enough for the request | medium | medium | S4 requires before and after real-GPU screenshots reviewed by the user before S5; extra layers can be added within the frame budget |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Shared band helpers: Move trio's stateless band helpers to a shared module with a golden test, and add bass-ink's three-band reader | S0 | AC11 | C1 | R2 | S | app/features/visualizers/shared/bandLevels.ts, app/features/visualizers/shared/bandLevels.test.ts, app/features/visualizers/trio-color-wave/ |
| S2 | Loudness-driven camera orbit: Dancer-style orbit while locked, scaled by Camera drift, reduced motion live, reset and relock, smear cap | S1 | AC1, AC3, AC6, AC10 | C2, C4 | R2 | M | app/features/visualizers/bass-ink/bassInkOrbit.ts, app/features/visualizers/bass-ink/bassInkOrbit.test.ts, app/features/visualizers/bass-ink/useBassInkScene.ts, app/features/visualizers/bass-ink/bassInkSceneConfig.ts |
| S3 | Enhanced toggle wiring and lazy build: Read the shared toggle, lazy-load the chunk on real GPUs, build once and flip flags, cancel-safe load, failure fallback, standard program unchanged | S0, S2 | AC4, AC5, AC12 | C3, C4 | R2 | M | app/features/visualizers/bass-ink/enhanced/bassInkEnhanced.ts, app/features/visualizers/bass-ink/bassInkPost.ts, app/features/visualizers/bass-ink/useBassInkScene.ts |
| S4 | Enhanced look: Depth fade, size attenuation, soft sprites as shader variants; static grade, vignette and second bloom; render-scale step-down; real-GPU screenshots and frame time | S3 | AC2, AC7, AC8 | C3 | R2 | L | app/features/visualizers/bass-ink/enhanced/, app/features/visualizers/bass-ink/inkCloud.ts, app/features/visualizers/bass-ink/dustField.ts |
| S5 | Budgets, baselines and checks: Size budget raise with reason, e2e toggle spec, deterministic visual baseline, scorecard and debug:viz against S0, full CI pass | S2, S4 | AC1, AC9 | C4 | R2 | S | .size-limit.json, e2e/ |
| S0 | Verify toggle and baselines: On a branch from origin/main, record the real enhanced toggle store path and hook signature, freeze C3 and C4, and record a bass-ink debug:viz baseline and frame time |  | AC9 | C3, C4 | R1 | S | docs/plans/bass-ink-enhanced-graphics/contracts.md |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Orbit floor, cap, tilt and max per-frame step values, checked for trail smear at cap speed | implementer, tuned with the user in npm run dev | no |
| Q2 | Does CI render the enhanced look at all (software WebGL), or only the standard baseline? | implementer in S5 | no |
| Q3 | Which laptop GPU is the AC8 reference device? | user, before S4 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | C1 describes trio's band split as a pure function over one spectrum (bandLevels(spectrum, binHz, edges, out)). In the repo it is not. Each TrioColorWaveSheet creates its own AnalyserNode (trioColorWaveSheet.ts:63-69) with a per-band fftSize (1024, 2048 and 4096 in trioColorWaveConfig.ts), minDecibels and smoothing. Band edges come from user sliders (values[lowKey], values[highKey], line 110). The level is a stateful peak-normalised value (PEAK_DECAY, gain at lines 117-120). bass-ink has one analyser and none of those sliders. So S1 either needs three extra analysers in bass-ink (this contradicts the non-goal 'no new audio analysis' and adds per-frame cost) or the 'trio split' is silently approximated. The AC11 golden test would then prove nothing about what bass-ink computes, and AC3 ('split as trio-color-wave splits them') cannot be verified. | User chose trio-like: stateless trio helpers move to a shared module (C1, AC11 golden test); bass-ink reads three bands from its one analyser with trio's default edges. No new analysers. D7, AC3 reworded. |
| F2 | high | D6, C2 and AC10 assume a camera orbit that composes with OrbitControls, drag, lock and reset. The shared createOrbitView (app/lib/three/orbitView.ts) exposes only setLocked, reset and dispose. It has no dragging state and no per-frame update hook. OrbitControls re-derives its spherical state from camera.position on every update, so an external yaw offset gets absorbed into the controls. onViewChanged compares camera.position to the default, so an auto-moving camera would make the 'view changed' flag and the reset button misreport. reset() only restores default position and target, not the plan's yaw offset. The existing code deliberately rotates the cloud object, not the camera, 'to keep the orbit's reset position' (useBassInkScene.ts:496). C2's `dragging` flag and 'after controls update' (K3) have no source. Fixing this in orbitView would touch three other visualizers. | User pointed to the dancer: camera written only while locked, unlocked hands it to orbit controls, reset and relock zero the angle; shared orbitView untouched. D6, AC10, C2 rewritten. |
| F3 | high | The new rotation is forced on every standard-mode user and overlaps the existing motion: drift += cameraDrift*driftSpeed (line 497), viewSwing, and cloud.object.rotation (line 501). The code states that 'a still view stays still' at cameraDrift 0 (line 499). AC3 requires a floor drift in silence. AC10 only says 'the existing camera drift control still works'. Unresolved: does drift 0 disable the auto-orbit, do the two add, and does a user who set drift to 0 now see motion with no control to stop it? Camera lock is the only off switch, and it also blocks dragging. This is the one change that reaches the whole standard audience, and it is called 'the only standard-mode change'. | User chose: Camera drift scales the orbit, drift 0 means no orbit (D10, AC3). |
| F4 | high | Slice order and contract freezing are weak. C3 (attach(post, materials)) depends on the unverified origin/main toggle (K1) and on BassInkPost internals. Yet S3 'starts by reading the real store' and C3 is already marked frozen. S2 and S3 both edit useBassInkScene.ts, and C4 is split across S2, S3 and S5, with `enhancedActive` appended after the orbit columns. S4 edits the shared shaders in inkCloud.ts and dustField.ts. Uniform or shader changes there reach the standard path and software renderers, and nothing tests that toggle-off output is unchanged (AC1 only covers the rotation). | Added S0 to verify the toggle and freeze C3 and C4 with column order; S3 depends on S2 so edits are serial; shader variants via a define; AC12 tests the standard program is unchanged. |
| F5 | medium | The afterimage trails are screen-space and default to 0.4 (bassInkControls). A continuously rotating view, fastest in loud music, smears the whole cloud into arcs, and enhanced mode adds a second bloom on top. The plan evaluates neither the smear nor the legibility of formations and sprays under rotation. K6 only covers the depth fade. Spray is emitted in the cloud's local space (useBassInkScene.ts:505-508), so a rotating group changes where bursts appear on screen. | Max per-frame angular step in C2, manual cap-speed smear check in S2, K7 and Q1. |
| F6 | medium | AC2 ('shows the enhanced layers (richer shading, depth and extra post)') and the success metric 'judged clearly more stunning' have no observable check. AC8's 'mid-range laptop GPU' is undefined and cannot run in CI, since CI uses SwiftShader (Q2 admits enhanced may not render there at all). K2's fallback ('drop the second bloom first') is a manual decision, not a runtime guard. The request is 'as visually stunning as possible', yet O4 is a static fog, grade, vignette and second bloom plus soft sprites. It reads closer to O1 than to a stunning result, and the plan cannot show it clears the bar. | AC2 made observable (telemetry, pass flags, define, screenshots); AC8 uses dev telemetry on the user's reference GPU (Q3) with an automatic render-scale step-down; K8 for the stunning bar. |
| F7 | medium | AC4 and C3 say toggling swaps passes in place with no context loss. bassInkPost.ts:74-77 states 'never switch the render path on a slider change', and the afterimage is reallocated when trails return (lines 86-94). Adding or removing composer passes and half-res targets at runtime means new shader compiles and render-target allocation on the toggle frame (a hitch). Late-resolving imports and the existing trails re-creation add race paths. 'Dispose restores the standard uniforms' is hard to verify with the fake renderer used in the unit tests. | Build once and flip enabled flags (D12, C3); test toggle with trails off and on in between. |
| F8 | medium | AC1 plans to regenerate the bass-ink standard baseline 'only for the rotation'. A yaw integrated over elapsed time makes any screenshot time-dependent. In CI (silent, SwiftShader) the angle at capture would be the floor speed times load time, which makes the snapshot flaky. The plan does not say how the angle is frozen for the visual spec. e2e/visual.spec.ts iterates VISUALIZERS_UNDER_TEST, so bass-ink is likely covered. | Visual spec freezes the orbit through reduced-motion emulation, which stops it (AC6), so the baseline is deterministic. |
| F9 | low | AC6 ends with 'damped to a slow, level-independent drift or stopped', which is two outcomes, so it is not testable. The plan does not say how prefers-reduced-motion is read, whether it is live (matchMedia change) or fixed at mount, or whether it reaches the pure orbit module. | AC6 now one outcome: stopped; read live with matchMedia and passed to C2 (D11). |
| F10 | medium | The riskiest assumptions are D8/K1 (the toggle API is as planned, rated medium likelihood but never checked even though origin/main is one fetch away) and 'the orbit's reaction cells are unchanged' (K5, rated low). K5 is plausible for audio-side signals, but the pointCount, fit and swing code read the camera. D9's R2 is honest, but the dependence on F1's wrong premise makes S1 and AC11 the weakest-grounded parts of the plan. | Cannot run git in planning; S0 verifies the toggle on origin/main first and records a debug:viz baseline; K5 raised to medium. |

## Hand-off

A verified-diamond draft DAG with 6 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `a98c8ec26e31f70a`).
