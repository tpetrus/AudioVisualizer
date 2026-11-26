# Enhanced graphics mode for the dancing character
> Double-diamond plan `dancer-enhanced-graphics` revision 1 | status **final** | lane full | risk R2 | base c33f30915f60 | updated 2026-11-26T19:42:34.331Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> from origin/main, plan the following: <task>
> -add support for an 'enhanced graphics' version of the dancing-character visualization
> </task>
> 
> <context>
> -Right now, we are optimizing for low-quality laptops and computers. This is fine, but we should let users that want a prettier looking visualization with solid setups to get a more impressive experience
> </context>
> 
> <requirements>
> -We should offer a more visually-stunning option for those with more memory, CPU, and GPU power
> -This can include high-quality skyboxes, reflective surfaces, complex textures, and whatever else would enhance a visualization
> -By default, it will be turned off, but the setting should be easily accessible and viewable so people know it exists quickly.  We should also store their selection in cookies so it stays enabled between sessions
> </requirements>
> 
> <scope-and-non-goals>
> -don't fundamentally change any visualizations structurally. it should simply enhance what we already have with better textures, lighting, etc
> </scope-and-non-goals>

## Problem

The dancing-character visualizer is tuned for low-end laptops (no antialias, no shadows, no tone mapping, flat colour background, simple lights). Users with capable machines have no way to opt into a richer look, and nobody can discover that such an option exists.

**Users:** Users on capable desktops or gaming laptops who want a more impressive dancer scene; Users on low-end laptops who must keep today's performance unchanged by default

**Evidence:**
- useDancingCharacterScene calls useThreeScene with defaults: antialias off, pixel ratio capped at 2 (context brief)
- dancingCharacterScene.ts sets no shadows or tone mapping; club owns a flat #07080f background and matching fog
- No persisted app-wide setting exists; storage.ts uses localStorage audioVisualizer.* keys

## Goals

- An app-wide Enhanced graphics preference, off by default, persisted in localStorage across sessions
- The preference is visible on the landing page and in the dancing-character control panel
- When on, the dancing character renders with richer lighting, shadows, environment reflections, a reflective floor, an HQ sky/backdrop and better textures and antialiasing, without structural scene changes
- A non-binding capability hint and a slow-frame-rate notice help users choose sensibly

## Non-goals

- Structural changes to any visualization (choreography, layout, reactions to audio, controls other than the new toggle)
- Enhanced modes for visualizers other than dancing-character in this plan (the preference is app-wide so they can opt in later)
- Automatically enabling or disabling enhanced mode
- Cookies or any server-side storage
- Upgrading three.js or adding non-addon rendering dependencies

## Success metrics

- Standard mode is byte-for-byte unchanged in rendering setup and its GLB/JS download for users who never opt in (enhanced code and assets lazy-loaded)
- Enhanced toggle discoverable from the landing page without opening a visualizer
- Bundle-size and Lighthouse budgets pass, or any increase is justified in the PR
- Toggling enhanced mode on and off repeatedly leaks no WebGL contexts or GPU resources (e2e context count stable)

## Constraints

- three.js r186 pinned; only three/addons may be used
- Named exports, logic outside React, no React state in the render loop, every GPU resource disposed, no per-frame allocation (AGENTS.md rules)
- Use useThreeScene, disposeScene, useControlValues/ControlPanel; follow the cubes RoomEnvironment+PMREM pattern
- Changing antialias rebuilds the renderer via useThreeScene deps; the e2e fixture fails on too many WebGL contexts
- 95% coverage over app/**; visual baselines for the settings panel and landing page will change and need the Update visual snapshots workflow
- .size-limit.json Total JS counts lazy chunks; new assets must be credited in assets/CREDITS.md with compatible licenses (CC0 preferred)
- Asset bytes for enhanced mode are only fetched when enhanced mode is on

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | a first-time visitor with empty localStorage | they open / and then /dancing-character | Enhanced graphics shows as off on the landing page and in the control panel, and the scene renders exactly as today with no enhanced assets requested |
| AC2 | a visitor on the landing page | they look at the page without scrolling past the cards header | an Enhanced graphics toggle with a short description is visible and operable by keyboard and screen reader (accessible name and state) |
| AC3 | the user turns Enhanced graphics on (landing page or control panel) | they reload or return in a new session | the setting is still on, read from localStorage key audioVisualizer.enhancedGraphics, and both surfaces show the same state |
| AC4 | Enhanced graphics is on | the dancing character scene renders | it uses antialiasing, AgX or neutral tone mapping on lit materials only (LED tiles, seams and beam cones stay toneMapped false and keep their colours), soft shadows from the key light cast by every loaded character onto a ShadowMaterial catcher just above the LED floor, a PMREM environment lighting the character and frame, a low-opacity glass reflection layer over the tiles that lets the LED pattern show through, and a dark sky dome (fog false) whose horizon matches the fog colour; existing club meshes, character, dances, camera and audio reactions are unchanged |
| AC5 | the dancing character page is open | the user toggles Enhanced graphics on and off five times, including while enhanced assets are still loading | the scene switches mode without a page reload, the camera pose is kept, the e2e WebGL context count stays within the fixture limit, any asset that finishes loading after teardown is disposed, and the console shows no errors or context warnings |
| AC6 | the browser exposes WebGL2 with MAX_TEXTURE_SIZE of at least 8192, and the optional signals (deviceMemory of at least 8, hardwareConcurrency of at least 8, unmasked renderer not software) pass wherever they are available | the user sees the toggle while it is off | a small 'your device can likely handle this' hint appears; it never changes the setting, it is absent when a required signal fails, and the probe runs after idle and releases its context so the landing page has zero live WebGL contexts |
| AC7 | Enhanced graphics is on and, after a warm-up that restarts on every rebuild and asset swap, the frame rate stays below the threshold over the window while the tab is visible (frames with a capped-out dt are ignored) | the window elapses | a dismissible notice, shown inside the fullscreen wrapper so it is visible in fullscreen, offers to switch back to standard; the setting changes only if the user accepts, and after dismissal it does not reappear for the rest of the page visit, even across rebuilds |
| AC8 | localStorage is unavailable or holds an invalid value | the app reads the preference | it falls back to off without throwing, matching storage.ts error handling |
| AC9 | Enhanced graphics is on and the enhanced module or an enhanced asset fails to load | the failure happens | the scene keeps rendering the standard look, the toggle status reads 'Could not load enhanced assets, using standard', one console warning is logged, and the stored preference stays on |
| AC10 | the app is open in two tabs | the preference is changed in one tab | the other tab's toggles reflect the new value via the storage event |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Scope of the setting | App-wide Enhanced graphics preference, surfaced on the landing page and in the visualizer control panel; only dancing-character consumes it initially, others may opt in later. | user |  |
| D2 | Persistence mechanism | localStorage instead of a cookie (same persistence across sessions, nothing sent with requests, matches existing app storage). | user |  |
| D3 | Capability detection | Default stays off; show a non-binding 'your device can likely handle this' hint when a capability heuristic passes. | user |  |
| D4 | Behavior when enhanced mode is slow | After sustained low frame rate, show a dismissible notice offering to switch back; never change the setting without the user. | user |  |
| D5 | Framing confirmation | Problem, goals, non-goals and ACs confirmed as written. | user |  |
| D6 | Enhanced backdrop style | Richer dark club: keep the night-club mood with a high-res dark environment (haze, light shafts, dusky or starry sky dome), not a photographic daylight skybox. | user |  |
| D7 | Extra download budget for enhanced mode | Up to about 30 MB, fetched only when enhanced mode is on (allows 4K HDR environment and high-res PBR textures). | user |  |
| D8 | Where persistence lives | Extend the existing localStorage pattern in app/features/audio/storage.ts style with key audioVisualizer.enhancedGraphics; no cookie code. | repo-fact | storage.ts is the only persistence and swallows storage errors |
| D9 | Toggle mode-switch mechanism | A toggle rebuilds the scene through useThreeScene (antialias dep); EnhancedLook only disposes what it created (no restore), takes an AbortSignal, and the camera pose is kept in a ref across the rebuild. | planner assumption (confirm) | Critic F4: the rebuild already frees renderer state |
| D10 | Asset format and size | 2K RGBE HDR for lighting (PMREM), 4K LDR sky texture for the dome, PBR floor maps at 2K; every file under 20 MiB (Workers caps a single asset at 25 MiB); the total stays under about 30 MB. | planner assumption (confirm) | Critic F8: per-file Workers limit and decode stall |
| D11 | Rollout of the visible toggle | The store and toggle ship in S1 but the toggle UI is behind a constant (ENHANCED_GRAPHICS_UI) that is on in dev and turned on for production in S3, once the enhanced look is complete. | planner assumption (confirm) | Critic F6: avoid a misleading control |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Add a tiny shared enhancedGraphics store (localStorage + useSyncExternalStore), one toggle on landing page and in the dancer panel, and a lazily imported enhanced module that applies tone mapping, shadows, PMREM env, reflective floor and HDR backdrop to the existing scene; antialias flips via useThreeScene deps. | 4 | 3 | 4 | 3 | 4 | yes | 3.6 |
| O2 | robust | A validated, subscribable app-wide preference store plus a lazily imported EnhancedLook module that a rebuilt-on-toggle dancer scene applies and fully disposes, with pure capability and frame-rate classes and a guaranteed fall-back to standard on any load failure. | 4 | 4 | 2 | 3 | 4 | yes | 3.45 |
| O3 | experience | One shared, accessible Enhanced graphics switch (landing page and control panel) backed by a tiny external store, with explicit loading, failure, hint and slow-FPS states so toggling never looks broken or surprising. | 4 | 3 | 3 | 5 | 4 | yes | 3.7 |
| **O4** (chosen) | hybrid | Hybrid of O2 and O3: O2's validated subscribable store, restore-on-dispose EnhancedLook lazy module and fall-back-on-failure, with O3's single shared accessible toggle, aria-live loading/error status, standard look kept until enhanced assets are ready, and non-modal slow-FPS notice. Sources: O2 (store, EnhancedLook, pure capability and FrameRateMonitor classes), O3 (toggle component, states, no-blank swap). | 4 | 4 | 3 | 5 | 4 | yes | 3.95 |

## Decision

**O4**: Hybrid of O2 and O3: O2's validated subscribable store, restore-on-dispose EnhancedLook lazy module and fall-back-on-failure, with O3's single shared accessible toggle, aria-live loading/error status, standard look kept until enhanced assets are ready, and non-modal slow-FPS notice. Sources: O2 (store, EnhancedLook, pure capability and FrameRateMonitor classes), O3 (toggle component, states, no-blank swap).

O4 keeps O2's restore-on-dispose and failure fallback, which protect AC5 and AC8, and adds O3's loading, error, hint and notice states, which the discoverability and slow-FPS decisions (D1, D3, D4) need. That costs about M, between O1 and O2. O1 is cheaper but leaves the loading and failure states undefined with a 30 MB asset budget.

**Approach:**
- enhancedGraphicsStore in app/features/settings/: get/set/subscribe over localStorage audioVisualizer.enhancedGraphics, strict 'true'/'false' parse, errors swallowed, same-tab listeners plus the storage event; useEnhancedGraphics via useSyncExternalStore.
- Shared EnhancedGraphicsToggle (role=switch, aria-checked, visible On/Off, aria-describedby description, optional hint, aria-live status) in the landing header above the cards and as a row at the top of the dancer ControlPanel, outside valuesRef and the control table.
- useDancingCharacterScene passes antialias: enhanced to useThreeScene (existing rebuild path with forceContextLoss); setup dynamically imports enhanced/dancingCharacterEnhanced only when on, behind a cancelled flag.
- EnhancedLook.apply(ctx) sets ACES tone mapping and sRGB output, PCFSoft shadows from the key light onto the floor, a PMREM environment (RoomEnvironment immediately, then a lazy dark-club HDR when loaded), a Reflector-based floor overlay, a dark sky dome with stars and haze, and anisotropic or PBR textures; it records every mutated property and restores and frees it in dispose().
- Standard look renders first; enhanced assets swap in when loaded. On import or asset failure: log once, keep standard, show an error status, do not change the stored preference.
- Pure detectCapability(probe) drives the hint; FrameRateMonitor (fixed ring buffer, sustained window, warm-up ignored) drives a dismissible once-per-visit SlowFrameNotice whose accept calls setEnhancedGraphics(false).

## Design

An app-wide enhanced-graphics preference (localStorage, off by default) is read through a subscribable store by a shared toggle on the landing page and in a new optional header slot of the dancer's ControlPanel. When it is on, the dancer scene is rebuilt with antialias, and an EnhancedLook layer is lazily applied on top of the unchanged club, character and dances: tone mapping on lit materials only, a shadow catcher, a PMREM environment, a low-opacity glass reflection layer, a dark sky dome and upgraded character materials. Turning it off rebuilds the standard scene exactly as today.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| enhancedGraphicsStore | read/write/subscribe the boolean preference | app/features/settings/enhancedGraphicsStore.ts |
| useEnhancedGraphics | React binding via useSyncExternalStore | app/features/settings/useEnhancedGraphics.ts |
| EnhancedGraphicsToggle | accessible switch with description, hint and status | app/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle.tsx |
| EnhancedLook | apply and restore all enhanced renderer and scene changes; owns its GPU resources | app/features/visualizers/dancing-character/enhanced/dancingCharacterEnhanced.ts |
| enhanced assets | dark-club HDR, floor PBR textures, credited | app/features/visualizers/dancing-character/assets/enhanced/ |
| detectCapability | pure non-binding hint heuristic | app/features/settings/capability.ts |
| FrameRateMonitor + SlowFrameNotice | sustained low-FPS detection and dismissible offer | app/features/settings/frameRateMonitor.ts, app/features/settings/SlowFrameNotice.tsx |

### Contracts (freeze before dependent work)

- **C1 enhancedGraphicsStore** (module API): getEnhancedGraphics(): boolean (false on missing, invalid or unavailable storage); setEnhancedGraphics(on: boolean): void (writes 'true'/'false', notifies listeners, swallows storage errors); subscribeEnhancedGraphics(cb): () => void (also fires on the window storage event for the key); key audioVisualizer.enhancedGraphics
- **C2 EnhancedLook** (class API): createEnhancedLook(ctx: { renderer, scene, club, keyLight, framing, signal: AbortSignal, onStatus(status: 'loading'|'ready'|'error') }): EnhancedLook; apply(): void sets renderer tone mapping and shadow map, marks club tile, seam and cone materials toneMapped false, adds the shadow catcher, glass reflection layer (half-resolution Reflector, resolution from config) and sky dome, and starts asset loads; onModelChanged(model): void sets castShadow, envMapIntensity and texture anisotropy on the new character's materials and fits the key light's shadow camera to framing, and is called from setCharacter for every load; dispose(): void frees every env map, render target, texture, geometry and material it created, including assets that resolve after abort; it does not restore renderer state because the toggle rebuilds the renderer
- **C3 detectCapability** (pure function): detectCapability(probe: { webgl2: boolean; maxTextureSize: number; renderer?: string; deviceMemory?: number; hardwareConcurrency?: number }): boolean; required: webgl2 and maxTextureSize at least 8192; optional fields fail the check only when present and below threshold (deviceMemory under 8, hardwareConcurrency under 8, renderer matching SwiftShader or llvmpipe). probeCapability() creates a canvas-less context after requestIdleCallback, reads the fields and calls WEBGL_lose_context
- **C4 FrameRateMonitor** (class API): new FrameRateMonitor({ thresholdFps, windowMs, warmupMs, maxDtMs }); sample(dtMs, hidden): boolean returns true once when the average over the window stays below the threshold after warm-up, ignoring hidden frames and dt above maxDtMs; restartWarmup() is called on every rebuild and asset swap; fixed-size buffer, no per-frame allocation. Dismissal state lives in a module flag for the page visit
- **C5 ControlPanel header slot** (component prop): ControlPanel accepts optional header?: ReactNode rendered above the sections; default none, so other visualizers render unchanged

### Data

One localStorage key, audioVisualizer.enhancedGraphics, values 'true' or 'false'. No cookies, nothing sent to a server.

### UX

The landing header shows a labelled switch 'Enhanced graphics' with the description 'Richer lighting, reflections and sky for the dancing character. Needs a strong GPU; downloads up to about 30 MB.' The same component sits in the dancer ControlPanel's header slot. While it is off and the heuristic passes, it shows 'Your device can likely handle this'. Status text: Loading enhanced assets / Enhanced graphics on / Could not load enhanced assets, using standard. The slow-FPS notice is non-modal, inside the fullscreen wrapper, with Switch to standard and Dismiss. The camera pose is kept across the toggle; the dance restarts.

### Accessibility

role=switch with aria-checked, accessible name and aria-describedby; status via aria-live polite; the notice uses role=status and never steals focus; all keyboard operable; axe checks in e2e stay clean.

### Security and privacy

Stores only a boolean in localStorage; no tracking, no cookie, no network beyond same-origin static assets. The capability probe reads the WebGL renderer string locally and never sends it anywhere.

### Observability

Console warning once on enhanced import or asset failure (no errors, so e2e fixtures stay green); the existing PerformanceStats toggle lets users and devs see FPS in enhanced mode.

### Rollout and rollback

Ships off by default and, until S3, with the toggle UI hidden in production behind ENHANCED_GRAPHICS_UI, so no user sees an incomplete feature. Each slice is merged in order and is independently verifiable in dev. Rollback is a Cloudflare rollback or reverting the PR; a stored 'true' with the code reverted is ignored.

## Test strategy

- **Unit:** Store parse, fallback, subscribe and storage event; detectCapability matrix (required versus optional fields, SwiftShader, masked renderer); probe releases its context; FrameRateMonitor warm-up, restartWarmup, hidden and dt cap, once-only; EnhancedLook against the fake renderer: tile/seam/cone toneMapped false, onModelChanged on two successive models, dispose frees everything created, and an HDR load resolving after abort is disposed; parse the committed HDR header (dimensions) and assert every enhanced asset file is under 20 MiB; toggle component (jsdom) for role, state, hint and status; ControlPanel header slot default none.
- **Integration:** DancingCharacterPage with injected engine and tracker: toggling rebuilds the scene with antialias and keeps the camera pose; the enhanced module import failing keeps standard, shows the error status and leaves the stored value on.
- **End-to-end:** New spec: landing toggle visible and keyboard operable, and the landing page leaves zero live WebGL contexts after the probe; the state persists across reload and matches the panel; with the real enhanced assets, enabling enhanced mode renders a non-blank canvas with no console errors; toggling on and off five times (once mid-load) keeps the WebGL context count within the fixture limit; standard mode requests no enhanced asset URLs (network listener). No production test seam for reduced assets. Update the visual baselines for the landing page and the dancer settings panel only.
- **Manual:** npm run dev on a strong GPU and a weak laptop: side-by-side checklist (LED floor colours unchanged, beam cone intensity unchanged, dark-club mood kept, dancer shadow present for every character), measure the HDR decode stall and GPU memory, check the hint and the slow notice in windowed and fullscreen modes, console clean.
- **Non-functional:** npm run size after S2 and after S3 (Total JS budget; justify lazy-chunk growth in the PR); npm run lighthouse on / (the store and toggle import no three.js; the probe runs after idle); enhanced assets total at most about 30 MB and each file under 20 MiB.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Rebuilding the renderer on toggle reloads the character and may briefly exceed the WebGL context limit on rapid toggling | medium | medium | Reuse useThreeScene teardown with forceContextLoss; debounce toggle-driven rebuilds; e2e toggle loop asserts the context count |
| K2 | Shadows, the half-resolution reflector and HDR make SwiftShader e2e slow or flaky | high | medium | 2K HDR, reflector and shadow map sizes from config, a single enhanced e2e spec with generous timeouts, no production test seam |
| K3 | Enhanced code leaks into the landing or standard dancer bundle, growing the entry or Lighthouse cost | medium | medium | Store and toggle import no three.js; EnhancedLook only via dynamic import; check with npm run size and a network assertion |
| K4 | Enhanced look changes the club's deliberate mood or alters audio reactions | medium | medium | EnhancedLook only layers lighting, environment, floor and backdrop; tint and fog keep config colours; manual side-by-side review |
| K5 | Async enhanced loads finishing after teardown leak GPU memory | medium | high | AbortSignal in C2, dispose on late resolve, a unit test that resolves the HDR after abort |
| K6 | Licensing of HQ assets | low | high | CC0 only (for example Poly Haven), sha256 and source in CREDITS.md |
| K7 | An enhanced asset exceeds the Workers 25 MiB per-file limit or stalls the main thread while decoding | medium | high | D10 formats, a unit test asserting each file is under 20 MiB, standard look keeps rendering while assets decode, a measured stall in the manual test |
| K8 | rAF throttling (hidden tab, 30 Hz battery modes, 50 Hz displays) or rebuild hitches false-trigger the slow notice | medium | low | C4 ignores hidden frames and capped dt, restarts warm-up on rebuild and asset swap; thresholds tuned under Q1 |
| K9 | Repository grows by up to about 30 MB of binary assets | high | low | Commit assets once in S3, prefer 2K where 4K adds no visible gain, record sha256 in CREDITS.md |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Preference store, shared toggle and panel slot: Persisted app-wide preference, cross-tab sync, accessible toggle on the landing page and in a new ControlPanel header slot, UI behind ENHANCED_GRAPHICS_UI (on in dev); enhanced on switches antialias and keeps the camera pose |  | AC1, AC2, AC3, AC8, AC10 | C1, C5 | R1 | M | app/features/settings/enhancedGraphicsStore.ts, app/features/settings/useEnhancedGraphics.ts, app/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle.tsx, app/components/ControlPanel/ControlPanel.tsx, app/features/landing/, app/features/visualizers/dancing-character/DancingCharacterPage.tsx, app/features/visualizers/dancing-character/useDancingCharacterScene.ts, e2e/enhanced-graphics.spec.ts |
| S2 | EnhancedLook core rendering: Lazy EnhancedLook with tone mapping on lit materials only, shadow catcher and per-model shadows via onModelChanged, RoomEnvironment PMREM, glass reflection layer, abort-safe dispose; toggle loop leak-free; npm run size checked | S1 | AC4, AC5 | C2 | R2 | M | app/features/visualizers/dancing-character/enhanced/dancingCharacterEnhanced.ts, app/features/visualizers/dancing-character/useDancingCharacterScene.ts, app/features/visualizers/dancing-character/dancingCharacterScene.ts, app/features/visualizers/dancing-character/dancingCharacterClub.ts |
| S3 | HQ assets, sky dome, status states and launch: Lazy 2K HDR, 4K sky dome with stars and haze, PBR floor maps, loading/ready/error status and failure fallback, credits and size checks; standard mode requests none of them; turn ENHANCED_GRAPHICS_UI on for production | S2 | AC1, AC4, AC9 | C2 | R2 | L | app/features/visualizers/dancing-character/assets/enhanced/, app/features/visualizers/dancing-character/assets/CREDITS.md, app/features/visualizers/dancing-character/enhanced/, app/features/settings/ |
| S4 | Capability hint: Pure detectCapability and the hint text on the toggle while off | S1 | AC6 | C3 | R1 | S | app/features/settings/capability.ts, app/components/EnhancedGraphicsToggle/ |
| S5 | Slow frame-rate notice: FrameRateMonitor in the dancer loop and a dismissible once-per-visit SlowFrameNotice inside the fullscreen wrapper | S2 | AC7 | C4 | R1 | S | app/features/settings/frameRateMonitor.ts, app/features/settings/SlowFrameNotice.tsx, app/features/visualizers/dancing-character/useDancingCharacterScene.ts |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Exact thresholds for the capability hint and the slow-FPS notice (e.g. 45 fps over 5 s after a 3 s warm-up) | implementer, tuned in manual testing | no |
| Q2 | Which CC0 dark HDR and floor texture set best fits the club look | Trevor Petrus, reviewing candidates from the implementer | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | AC4 and S2 promise soft shadows onto the floor and a reflective floor, but the real floor (dancingCharacterClub.ts) is an InstancedMesh of MeshBasicMaterial LED tiles recoloured every frame, over a MeshBasicMaterial seams plane. Unlit materials never receive shadows, so the shadow requirement cannot be met on the existing floor. A Reflector 'overlay' on top of the tiles either hides the LED pattern (a structural change, which the non-goals forbid) or z-fights with it. Reflector also re-renders the whole scene a second time per frame, including the per-frame instanceColor upload and additive cones, which doubles the cost on exactly the machines the slow-FPS notice (AC7) is meant to protect. The plan names the clash only as risk K4 and Q2 and never decides how the floors coexist. | Changed: AC4 and C2 now use a ShadowMaterial catcher above the LED tiles and a low-opacity, half-resolution glass reflection layer that lets the tiles show through; existing tile meshes are only marked toneMapped false. The reflector cost is accepted for an opt-in strong-machine mode, and the slow notice covers weak machines. |
| F2 | high | C2 createEnhancedLook({renderer, scene, club, keyLight}) has no hook for the character model. The model loads asynchronously and again on every character change (useDancingCharacterScene loadCharacter -> character.setCharacter, which clones materials). Nothing in C2 sets castShadow on the new SkinnedMesh, fits the key light's shadow camera to the model framing (dancingCharacterFraming), or applies envMapIntensity or anisotropic or PBR texture upgrades to the new materials. The plan says S2 edits dancingCharacterScene.ts but the contract does not carry it. Result: the dancer casts no shadow, or only the first character does, and 'better textures' (AC4 goal) silently never reach the character. | Changed: C2 adds onModelChanged(model), called from setCharacter for every load, which sets castShadow, envMapIntensity and anisotropy and fits the shadow camera to the framing; S2 unit tests cover two successive models. |
| F3 | high | Tone mapping is applied renderer-wide, so ACES also affects the MeshBasicMaterial LED tiles, the additive beam cones, the frame and any untoned material. The club's saturated rainbow floor and flashes are the signature look. ACES desaturates and compresses highlights, and a PMREM environment lights the MeshStandardMaterial frame and the character, changing the 'deliberate mood'. K4 says only 'tint and fog keep config colours' plus manual review. The sky dome also needs fog:false and must replace the shared background/fog colour (dancingCharacterConfig background and fog share one colour), which the plan does not specify. Without a rule, AC4's 'club layout and audio reactions unchanged' fails in practice. | Changed: AC4 and C2 use AgX or neutral tone mapping with tiles, seams and cones toneMapped false; the dome has fog false and its horizon matches the fog colour; the manual checklist covers LED colours and cone intensity. |
| F4 | medium | The design is internally inconsistent about what a toggle does. The mode switch is a full useThreeScene rebuild (antialias dep): renderer.dispose, forceContextLoss, disposeScene and a new renderer, scene and character. That already frees everything, so C2's 'record and restore every mutated renderer/scene property' (K5 mitigation, S2 size M, S3 size L) is dead weight for the toggle path, and K5's 'leaves tone mapping on after toggling off' cannot happen because the renderer is new. The real leak risks are different. Async work that outlives teardown (HDR fetch, decode, PMREM finishing after the abort signal) is not covered by the cancelled flag alone, because loaders cannot be aborted. Also, the rebuild loses the user's dragged camera pose and restarts the dance, and may flash the overlay. Tests and effort are aimed at the wrong risk. | Changed: D9 and C2 drop restore-on-dispose and keep dispose-created with an AbortSignal; AC5 and the unit tests cover a late HDR resolve; the camera pose is kept across the rebuild. |
| F5 | high | The toggle needs to be 'a row at the top of the dancer ControlPanel, outside valuesRef and the control table', but ControlPanel (app/components/ControlPanel/ControlPanel.tsx) is shared by every visualizer and takes only definitions and a fixed set of props. No slot or prop exists, and no ControlPanel path appears in any slice's draft_paths. Changing it touches all visualizers' tests and their settings-panel visual baselines, contradicting the plan's claim that only the landing and dancer baselines change. The panel is also hidden during fullscreen (`hidden={fullscreenActive}`), as is anything outside the fullscreen wrapper, so the SlowFrameNotice (AC7) is never seen when a user runs the dancer fullscreen, which is the typical case for a showcase mode. | Changed: new contract C5 (an optional ControlPanel header slot, default none, so other baselines stay unchanged) added to S1 draft_paths; the slow notice is placed inside the fullscreen wrapper (AC7). |
| F6 | high | S1 ships a user-visible toggle with the description 'Richer lighting, reflections and sky ... downloads up to about 30 MB' while 'enhanced on only switches antialias'. The rollout says each slice is independently shippable, but S1 alone delivers a misleading control and AC1/AC2/AC3 pass vacuously. S4 and S5 depend on different slices (S1, S2), and S5 (FrameRateMonitor in the loop) also needs the enhanced scene to exist. Nothing says the toggle is hidden or flagged until S3 lands, and the status states and failure fallback (loading, error, 'Could not load', unchanged stored value) appear in no acceptance criterion, only in S3's objective. | Changed: D11 puts the toggle UI behind ENHANCED_GRAPHICS_UI until S3; added AC9 for the load and failure states and AC10 for cross-tab sync. |
| F7 | medium | AC6 and C3 conflict. AC6 says the hint passes on thresholds 'where available' for deviceMemory and hardwareConcurrency, but C3 returns false when any required field is unknown. deviceMemory exists only in Chromium, and WEBGL_debug_renderer_info is masked in Firefox and Safari, so the hint would effectively never show outside Chromium, or the 'software renderer' check is blind. The probe itself needs a throwaway WebGL context on the landing page (which currently loads no three.js and sits under Lighthouse), and in e2e a context counted by the fixture that is not forceContextLoss'ed. The plan does not say how the probe context is created and released, or that it runs on idle without hurting Lighthouse. Maximum texture size of 'high' is not defined either (Q1 defers thresholds). | Changed: AC6 and C3 now agree (webgl2 and maxTextureSize of at least 8192 are required; the optional fields fail only when present); the probe runs after idle, needs no canvas, calls WEBGL_lose_context, and e2e asserts zero live contexts on the landing page. |
| F8 | medium | D7 (about 30 MB, '4K HDR environment and high-res PBR textures') is decided as a download budget, but the plan never checks that it fits delivery and runtime. wrangler.jsonc serves build/client via Workers static assets, and Cloudflare caps a single asset at 25 MiB. A 4K .hdr from the usual CC0 sources is commonly in that range, so one file can break the deploy. A 4096x2048 float HDR plus PMREM is tens of MB of GPU memory and a long main-thread RGBE decode that stalls the animation loop for the very users who 'have solid setups' but share a tab with audio capture. Repo size also grows by up to 30 MB of binary per commit. K6 covers licence only. None of this is in K1-K6 or the non-functional tests. | Changed: D10 sets formats and caps each file under 20 MiB; K7 and a unit size test added; the decode stall is measured manually and the standard look keeps rendering during the load. |
| F9 | medium | AC7 is not reliably testable or correct as written. FrameRateMonitor averages dt from the animation loop, but rAF is throttled to a fraction when the tab is hidden, on battery-saver 30 Hz modes and on 30/50 Hz displays, and delta is huge after tab return, so a fixed 'below threshold' fires falsely (K-risk noted only for SwiftShader in O3, not carried into the plan's risks). The warm-up also has to cover the renderer rebuild plus the lazy HDR swap (shader compile and PMREM hitches), or the notice fires on every first enable. The monitor also resets on each rebuild but the once-per-visit dismissal flag does not, with no AC for that interplay. AC4 and the 'no console errors' part of AC5 are likewise asserted only through a fake renderer and mocked import, so nothing proves a real enhanced frame renders. | Changed: C4 ignores hidden frames and capped dt and restarts warm-up on every rebuild and asset swap; dismissal persists for the visit; an e2e smoke renders a real enhanced frame. |
| F10 | low | Test strategy relies on 'enhanced assets may be served at reduced size via the module's asset map' in e2e. That puts a test seam in production code and means the e2e never exercises the real asset path or the HDR parser against the committed file, so a corrupt or wrongly encoded HDR passes CI and fails only for users. The size and Lighthouse checks also never touch the lazy enhanced chunk's real RGBELoader and Reflector additions beyond 'justify in the PR'; the Total JS limit is 339.25 kB gzip and a hard fail at the end of S3 would be a late surprise. | Changed: the reduced-asset seam is removed; e2e uses the real assets; a unit test parses the committed HDR header and checks the file sizes; npm run size runs after S2. |

## Hand-off

A verified-diamond draft DAG with 5 task(s) and 5 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `ee1b24f732238502`).
