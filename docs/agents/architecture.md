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
`app/features/`. Landing cards are data (`VISUALIZATIONS` in `features/landing/LandingPage.tsx`).

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
  `PerformanceStats` overlay. Its CSS module scopes element selectors under `.panel`.

## 6. Build and deploy
- `react-router build` produces `build/client` (static SPA, `index.html` prerendered) and a `build/server` used only during
  the build. `wrangler.jsonc` serves `build/client` with `not_found_handling: "single-page-application"`, so deep links
  load `index.html`.
- Static files in `public/` are served from `/` (e.g. `/fonts/x.json`, `/visualization-images/cubes.png`). Never write
  `/public/...` in a URL.
