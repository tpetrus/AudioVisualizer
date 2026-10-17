# Architecture

How the parts fit together and the contracts between them. The reasons matter: most of these designs exist to avoid a
specific bug (stale values in render loops, leaked WebGL contexts, leaked audio nodes, a UI that doesn't update).

## Overview
```
 AudioEngine (plain TS singleton)          React (UI + lifecycles)               three.js (per visualizer)
 ───────────────────────────────          ───────────────────────               ─────────────────────────
 capture → GainNode → AnalyserNode ──▶ useAnalyser() ──▶ visualizer page ──▶ use<Name>Scene(containerRef, …)
 AGC timer, storage, listeners      ◀── engine actions (useAudio())             └─ useThreeScene(setup)
        │ notify()                                                                    setup → { camera, update,
        └──────────────▶ useSyncExternalStore re-renders subscribers                          resize, dispose }
```

## 1. Audio: `app/features/audio/`

### `AudioEngine` (`audioEngine.ts`): framework-free
Captures audio and owns the Web Audio graph. It has **no React imports**, so it can be tested on its own and outlives
re-renders. One instance per page load: `export const audioEngine = new AudioEngine()`.

- **Graph:** `MediaStreamSource → GainNode → AnalyserNode` (what visualizers read), plus two peak meters (raw input and
  normalized output). `AudioGraph` (`types.ts`) has only required fields; the engine holds `AudioGraph | undefined`. A
  graph exists completely or not at all.
- **Source switching:** `connect()` builds the new graph first, then tears down the old one, then notifies once.
  Subscribers go from the old analyser straight to the new one and never see `undefined` mid-switch (seeing it would
  unmount scenes or trip the guard).
- **AGC:** `updateGain()` runs every 30 ms and steers the gain toward `NormalizeSettings.targetPeak`.
- **Persistence:** all localStorage access goes through `storage.ts` (`read`/`write` helpers with the only try/catch;
  storage keys are unchanged from the Angular app).

### The external-store contract (engine → React)
The engine is a tiny observable store made for `useSyncExternalStore`:
```ts
private readonly listeners = new Set<() => void>();
readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
public getAnalyser = () => this.graph?.analyser;          // snapshot getters are arrow properties
public getIsCapturing = () => this.graph !== undefined;
private notify() { /* calls a copy of listeners; logs (doesn't rethrow) listener errors */ }
```
Rules:
- `subscribe` and every snapshot getter are **arrow-function properties**, so `this` survives being passed as a bare
  callback (`useSyncExternalStore(engine.subscribe, engine.getAnalyser)`).
- **A getter returns the same reference until the value changes.** Return the stored object, never a fresh copy:
  `getNormalizeOptions = () => this.normalizeSettings`. Updates replace the object
  (`this.normalizeSettings = { ...old, ...changes }`). A new object per call makes React re-render forever.
- **Mutators follow the order: update state → persist → side effects → `notify()` last.** Forgetting to update the cached
  field or to call `notify()` is the classic bug (the UI won't change).
- Fast-changing values (meter levels, latency) are **not** in the store. Poll them on a timer (`useLevelMeter`,
  `PerformanceStats`).

### React bindings
| File | Purpose |
|---|---|
| `audioEngineContext.ts` | `AudioEngineContext` + `useAudio()` (throws outside the provider) |
| `AudioProvider.tsx` | provides the singleton; optional `engine` prop for tests/fakes. Mounted in `root.tsx` |
| `useAudioState.ts` | `useAnalyser`, `useCapturing`, `useNormalize`, `useNormalizeOptions`, each `useSyncExternalStore(engine.subscribe, engine.getX, engine.getX)` |
| `useLevelMeter.ts` | polls the meters every 100 ms while a source is capturing; detects silence |

**Reading vs acting:** read state through the hooks above (re-renders on change); call actions on `useAudio()` directly
(`engine.startScreenCapture()`, `engine.setNormalize(…)`). Actions `notify()`, which updates the readers.

### Guard: `RequireAudio.tsx`
Wraps visualizer routes via the layout route `app/routes/requireAudioLayout.tsx`. It starts as `'ok'` if already
capturing; otherwise it calls `engine.resumeSavedSource()` once on mount (a saved input device reopens silently if mic
permission is already granted) and either renders the children or `<Navigate to="/" replace />`. It checks **on mount
only**: it must not subscribe to capture state, or a source switch would redirect. It uses a `cancelled` flag in the
effect cleanup.

### Source dialog: `components/`
`AudioSourceDialog` (modal shell: backdrop, Escape, can't close until capturing) → `SourceChooser` (screen/device,
owns busy/error/device state, calls `onStarted()` after success) or `ActiveSourcePanel` (meter, normalize switch,
`NormalizeSettings` sliders, `SilenceWarning`). Shared Tailwind button classes are in `buttonStyles.ts`.

## 2. Routing: `app/routes.ts`
```ts
index("routes/landingPage.tsx"),
layout("routes/requireAudioLayout.tsx", [          // visualizers need audio
  route('/cubes', "routes/cubesPage.tsx"),
  route('/trio-color-wave', "routes/trioColorWavePage.tsx"),
]),
```
Route modules are thin: `meta()` + a default-exported component that renders the feature page. All logic lives in
`app/features/`. Landing cards are data (`VISUALIZATIONS` in `features/landing/visualizations.ts`). The end-to-end tests
import the same list, which is why it lives in its own module.

SPA mode (`ssr: false`): `index.html` is prerendered at build time, so module-level code and `useState` initializers
must not touch `window`/`document` unguarded. Browser-only work goes in effects or event handlers.

## 3. Scenes: `useThreeScene` (`app/hooks/useThreeScene.ts`)
One hook owns everything every three.js scene needs; a visualizer supplies only its content.
```ts
useThreeScene(containerRef, setup, { antialias? });
// setup({ scene, renderer, size, signal }) => { camera, update?(time, delta), resize?(size), dispose?() }
```
- **The hook owns:** renderer creation (pixel ratio capped at 2), sizing from the container (not the window), a
  `ResizeObserver`, the `renderer.setAnimationLoop` loop, and teardown in reverse order: stop loop → disconnect observer →
  abort `signal` → `handle.dispose()` → `disposeScene(scene)` → `renderer.dispose()` → `forceContextLoss()` → remove the canvas.
- **The visualizer owns:** its camera (settings differ per scene), its content, per-frame `update`, extra `resize` work,
  and `dispose` for anything `disposeScene` can't reach (orbit controls, audio nodes, mesh classes).
- `setup` runs **once**; the hook reads it through a ref so inline setup functions don't rebuild the scene.
- `signal` is aborted on teardown; async work in setup (font loading) checks `signal.aborted` before touching the scene.
- `antialias` is constructor-only, hence an option rather than something set in setup.
- Containers need a real size: visualizers use `fixed inset-0`, the landing title `h-[300px] w-full`.

Helpers in `app/lib/three/`:
- `disposeScene(scene)`: frees geometries, materials (incl. arrays and their textures), `InstancedMesh` buffers,
  `scene.environment` and texture backgrounds.
- `createOrbitView(camera, domElement, { locked, onViewChanged })` → `{ setLocked, reset, dispose }`. **Position the
  camera before calling it**: that position becomes the reset target. `onViewChanged` only fires when "moved" flips.

## 4. Visualizer anatomy (`app/features/visualizers/<name>/`)
| File | Role |
|---|---|
| `<Name>Page.tsx` | page: `useAnalyser`, `useControlValues(defs)`, `cameraLocked`/`viewChanged` state, container div, `<ControlPanel>` |
| `use<Name>Scene.ts` | builds the scene with `useThreeScene`; takes plain values, mirrors them with `useLatestRef`; returns `{ resetView }` |
| `<name>Controls.ts` | control definitions `as const satisfies readonly ControlDefinition[]` + `ControlValues` type |
| `<name>Config.ts` | tuning constants and static tables (optional) |
| pure-maths modules | e.g. `bands.ts`, `spectrum.ts`: no three.js, no React, buffers passed in |
| resource classes | e.g. `CubeGrid`, `BassPulse`, `TrioColorWaveSheet`: own GPU objects and/or audio nodes, expose `update()` + `dispose()` |

**Audio binding happens inside the render loop**, not in an effect: `update()` compares `analyserRef.current` with the
analyser it last bound (`boundAnalyser`) and rebinds when it changes (re-tap analysers, reallocate buffers). This keeps the
scene alive across source switches with no cross-effect plumbing. If the analyser is momentarily absent, `update` skips
the audio part and keeps rendering.

**Shared analyser:** the engine's analyser is shared. A visualizer may set its `fftSize`/`smoothingTimeConstant` when it
binds (cubes does), but anything needing different settings or filtering taps its **own** nodes from it
(`source.connect(myAnalyser)`) and disconnects them on rebind and on dispose (`TrioColorWaveSheet`, `BassPulse`).

## 5. Controls: `app/components/ControlPanel/`
- `controls.ts`: a discriminated union `RangeControl | CheckboxControl | ColorControl` (`key`, `label`, `section`, `default`,
  optional `shownWhen` = key of a checkbox), the mapped type `ControlValues<T>` (typed values object), and the pure helpers
  `defaultValues`, `isModified`, `isShown`, `groupBySection`.
- `useControlValues(definitions)` → `{ values, valuesRef, setValue, resetAll }`. `values` drives the panel; `valuesRef`
  is read by the render loop. Updates are immutable.
- `ControlPanel` is presentational: definitions + values + callbacks (`onChange`, `onResetAll`, `cameraLocked`,
  `onCameraLockedChange`, `viewChanged`, `onResetView`). It also hosts the "Audio settings" dialog and the
  `PerformanceStats` and `RhythmStats` overlays. Its CSS module scopes element selectors under `.panel`.

## 6. Rhythm: `app/features/rhythm/`

Detects tempo, beat phase, 3-vs-4 meter and song changes from the engine's analyser, so visualizers can pulse on the
beat, accent beat 1 and re-randomize on a new song. Pure DSP (no ML), about 5 ms of CPU per second of audio.

```
AudioEngine analyser ─▶ AudioWorkletNode (rhythmProcessor.worklet.ts: OnsetExtractor, ~100 frames/s)
                              │ port.postMessage(batch of 8 packed frames)
                              ▼
 RhythmTracker.onMessage ─▶ RhythmAnalyzer ─▶ TempoTracker → BeatTracker → MeterEstimator
                              │                       BoundaryDetector (silence / novelty / tempo jump)
                              ▼
                       tracker.state (mutated in place)      tracker.subscribe (meter flip, song change only)
```

- **Pure modules** (`fft`, `onsetExtractor`, `tempo`, `beatTracker`, `meter`, `boundary`, `rhythmAnalyzer`,
  `rhythmConfig`): no Web Audio, DOM or React; buffers are passed in; they are driven by feature frames and times in
  seconds, never a wall clock, so they run in Node and in tests. All tuning constants are in `rhythmConfig.ts`.
- **`RhythmTracker`** (`rhythmTracker.ts`) is the only owner of browser resources, framework-free like `AudioEngine`
  (`export const rhythmTracker`). Its constructor touches no browser API (index.html is prerendered); `start(engine)` and
  `dispose()` are called by `RhythmProvider`'s effect. It subscribes to the engine and, whenever `engine.getAnalyser()`
  changes, creates an `AudioWorkletNode` in the analyser's context and taps it with `analyser.connect(node)`. The
  engine's graph is never altered. The worklet module is added once per `AudioContext`, and a generation counter stops
  a slow `addModule` from attaching a stale node after a quick source switch or StrictMode's double mount. Unbinding
  disconnects the node in try/catch (the old context may be closed) and removes the port listener.
- The worklet is loaded with Vite's `?worker&url` import. `npm run build` emits it into `build/client/assets/`; in dev
  Vite serves it as a module. The worklet global scope has no `window`; `sampleRate` and `currentFrame` are globals there.

### `state` versus the store
| | `tracker.state` | store (`subscribe`, `getBeatsPerBar`, `getSongChangeCount`) |
|---|---|---|
| Changes | many times a second | rarely (meter flips, song change) |
| Read by | render loops, polling overlays | React components via `useBeatsPerBar()` / `useSongChangeCount()` |
| Shape | one preallocated mutable object, same reference forever | stable primitives, `notify()` last |

`state` holds `bpm`, `beatPhase` (0..1, or `undefined` until a beat is found), `barPhase` (0..1, or `undefined` while the meter is unsure), `beatsPerBar` (`3 | 4 | undefined` = unsure), `tempoConfidence`,
`meterConfidence`, `bandOnsets` (kick, mid, high), `chroma`, `novelty`, `nextBeatTime` (AudioContext seconds) and three
counters. Never copy these into `useState`.

### Reading phase every frame
Analysis runs about 100 ms behind the audio, so a stored phase would always be late. Call
`tracker.updatePhase()` once per animation frame (it defaults to the bound context's `currentTime`). It extrapolates from
the newest declared beat and period, then writes `beatPhase`, `barPhase`, `nextBeatTime`, `beatCount` and
`downbeatCount`. It is O(1) and allocates nothing. While the meter is unsure `barPhase` is `undefined` (check it
before use) and `downbeatCount` does not advance. The tracker also calls it after each message, so the counters advance even if no
visualizer is mounted.

### The counters pattern
`beatCount`, `downbeatCount` and `songChangeCount` only ever increase, across resets too. A render loop keeps the last
value it saw and compares: `if (state.downbeatCount !== seen) { seen = state.downbeatCount; /* it happened */ }`. No
events, listeners or allocation. Initialise `seen` from the current value when the scene is built so a mounting
visualizer does not fire for a past beat. Gate on `state.beatsPerBar !== undefined && state.meterConfidence >=
METER_VISUAL_CONFIDENCE` before treating a downbeat as real.

### Reset semantics
- **Hard reset** (clears everything, increments `songChangeCount`): raw RMS below the floor for more than 1 s, or the
  engine's analyser changes after something was analysed. An `undefined` analyser only stops the analysis; the last state
  stays readable.
- **Soft reset** (keeps 20% of the accumulated evidence, increments `songChangeCount`): the last 6 s of band energy and
  chroma differ strongly from the previous 30 s, or the tempo estimate stays more than 5% away from the reference tempo
  for 3 s (half and double tempo do not count). Cheap when it fires falsely, for example on a chorus.
- **Always**: everything the meter learned has a ~20 s half-life, so an undetected change heals by itself. A rebuilt beat
  grid (tempo jump, octave change) also shrinks the meter's evidence, without counting as a song change.

### How a visualizer consumes it
Call `useRhythm()` in the page and pass the tracker into `use<Name>Scene` (a stable instance, so no `useLatestRef`). In
`update()`: `rhythm.updatePhase()`, then read `rhythm.state` and compare counters. See `useCubesScene.ts` (downbeat
accent). Use `useBeatsPerBar()` / `useSongChangeCount()` only for UI that should re-render on those changes. The debug
overlay `components/RhythmStats/RhythmStats.tsx` (checkbox "Show rhythm stats" in the control panel) polls `state` every
100 ms like `PerformanceStats`.

## 7. Build and deploy
- `react-router build` produces `build/client` (static SPA, `index.html` prerendered) and a `build/server` used only during
  the build. `wrangler.jsonc` serves `build/client` with `not_found_handling: "single-page-application"`, so deep links
  load `index.html`.
- Static files in `public/` are served from `/` (e.g. `/fonts/x.json`, `/visualization-images/cubes.png`). Never write
  `/public/...` in a URL.
- Cloudflare Workers Builds is connected to the GitHub repo. A push to `main` builds and deploys production; a PR branch
  builds and deploys a preview (`wrangler preview`, which needs the empty `previews` block in `wrangler.jsonc`) and
  posts its URL on the PR. GitHub Actions never deploys: it runs the checks in `AGENTS.md` ("CI and deploys") and, after
  each production deploy, the `@smoke` tests against the live site (`smoke.yml`, triggered by Cloudflare's
  "Workers Builds" check run on `main`).
