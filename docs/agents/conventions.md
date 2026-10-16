# Conventions

How code in this repo is written. When in doubt, open the nearest similar file (the cubes and trio-color-wave visualizers
are the references) and match it.

## Files and naming
| Kind | Name | Example |
|---|---|---|
| React component | `PascalCase.tsx`, one component per file | `TrioColorWavePage.tsx`, `VisualizationCard.tsx` |
| Hook | `useCamelCase.ts` | `useCubesScene.ts`, `useLatestRef.ts` |
| Class owning resources | `camelCase.ts`, class in `PascalCase` | `cubeGrid.ts` → `CubeGrid` |
| Pure functions / config | `camelCase.ts` | `bands.ts`, `trioColorWaveConfig.ts` |
| Route module | `app/routes/camelCasePage.tsx` | `cubesPage.tsx` |
| Visualizer folder | `kebab-case`, same as its URL | `features/visualizers/trio-color-wave/` ↔ `/trio-color-wave` |
| Constants | `UPPER_SNAKE_CASE` at module level | `FFT_SIZE`, `MAX_BACKDROP_LIFT` |

Files belonging to one visualizer are prefixed with its name (`trioColorWaveControls.ts`, `trioColorWaveSheet.ts`); generic
helpers inside the folder are not (`spectrum.ts`, `bands.ts`).

- **Named exports only.** Exceptions: `app/root.tsx`, `app/routes.ts`, `app/routes/*` (React Router needs defaults).
- **Imports:** use `~/…` for anything outside the current feature folder, and `./…` within it. Use `import type` for
  type-only imports (`verbatimModuleSyntax` is on).
- Private helpers that a component needs only locally (e.g. `SourceCard` in `SourceChooser.tsx`) may live in the same
  file without being exported.
- Match the surrounding file's formatting: `app/features` and `app/components` use 4-space indent and single quotes;
  the template-generated `app/root.tsx`/`app/routes/*` use 2 spaces and double quotes.

## Comments
- Explain **why** (intent, constraints, the bug a line avoids), not what the code says. Write full sentences, placed above
  the code.
- Document units and ranges on numbers: `// seconds…`, `// 0..1`, `// world units`.
- Keep existing comments when moving or refactoring code; many encode tuning decisions from the original app.
- No commented-out code, no `TODO`s left behind without an explanation of what's missing.

## TypeScript
- `strict` is on. Don't use `any`, and avoid `!` non-null assertions by restructuring the code (early returns, holding
  a reference you know is set). The engine's `graph: AudioGraph | undefined` with required fields is the model: either a
  whole thing exists or nothing does.
- **Static tables:** `as const satisfies readonly X[]` keeps literal types and checks the shape (see
  `cubesControls.ts`). Derive types from data (`ControlValues<typeof cubesControls>`) rather than writing them twice.
- **Discriminated unions** over optional fields (`RangeControl | CheckboxControl | ColorControl`).
- Typed keys instead of strings where a key refers to other data (`lowKey: keyof TrioColorWaveControlValues`).
- No constructor parameter properties (`constructor(private x: T)`); declare the field and assign it.
- Typed arrays passed to Web Audio need a plain buffer: type fields as `Float32Array<ArrayBuffer>`/`Uint8Array<ArrayBuffer>`,
  or let TypeScript infer from `new Float32Array(n)`.
- Casts are allowed only where an API can't express the type, kept to one place and explained by a comment
  (`Object.fromEntries(...) as ControlValues<T>`).

## React
- **State only for UI.** Anything read per frame (control values, analyser, camera lock, callbacks) reaches the render
  loop through refs: `useLatestRef(value)` or `valuesRef` from `useControlValues`. Never store three.js objects, audio
  nodes or per-frame numbers in `useState`.
- **Every effect fully undoes itself** in its cleanup (StrictMode mounts twice in dev to prove it). Async work in an
  effect uses a `let cancelled = false` flag set to `true` in cleanup.
- **Don't sync state with effects.** Derive values during render (`modifiedCount`, `choosing = !canClose || showChooser`)
  and reset state in the event or action that caused the change (`SourceChooser` calls `onStarted()` after a successful
  capture), not in an effect watching other state.
- **Throttle high-frequency UI** (meters, stats) with an interval that sets one state object per tick. When an interval
  callback uses counters that are reset afterwards, read them before `setState`: updater functions run later.
- Stable callbacks: `useCallback` for functions returned from hooks (`setValue`, `resetView`); module-level constants for
  static data (`SLIDERS`, `VISUALIZATIONS`, control definitions).
- `useId()` for element ids. Real elements for interactions: `<button type="button">` for actions, `<Link>` for navigation,
  `<label htmlFor>` for inputs, and `aria-*`/`role` where the element alone isn't enough (`role="dialog"`, `role="alert"`).
- Browser-only APIs (`window`, `document`, `localStorage`, `navigator`) only inside effects, event handlers, or code that
  only runs after them. `index.html` is prerendered at build time.

## three.js
- **Use `useThreeScene`** for every scene; never create a `WebGLRenderer` elsewhere.
- **Free everything you create.** Classes that create GPU resources (`CubeGrid`, `PencilFlagsMesh`, `TrioColorWaveSheet`)
  have `dispose()` that calls `removeFromParent()` and disposes geometry and material; the scene's `dispose` calls them.
  Temporary scenes are disposed right after use (`disposeScene(room)` after building the PMREM map). Hide objects with
  `visible = false` rather than removing them if they still need disposing.
- **Zero allocations in `update()`.** Preallocate scratch objects as fields or setup locals (`dummy = new Object3D()`,
  `Color`, typed arrays) and mutate them. Write pure functions that fill an `out` buffer instead of returning a new array
  (`updateBandLevels(levels, …)`, `blur(values, kernel, out)`).
- Mark dynamic buffers `DynamicDrawUsage` and set `needsUpdate` after writing them. Set `frustumCulled = false` on meshes
  whose instances move outside the base geometry's bounds.
- **Pure numbers over objects** in sizing maths (`gridSizeForView(fov, distance, aspect)`), so orbiting or zooming can't
  change layout.
- Keep per-frame maths framerate-dependent as ported, for visual parity. If you switch to `delta`-based motion, do it
  deliberately and check how it looks.
- Imports from `three/examples/jsm/...` (three 0.141). Don't upgrade three as part of another change.

## Web Audio
- Never change the engine's graph from a visualizer beyond the analyser's `fftSize`/`smoothingTimeConstant`. For
  anything else, tap your own nodes from the analyser.
- Anything that taps nodes owns them: it remembers the `source` it connected to and disconnects in `dispose()`/on rebind,
  wrapping `source.disconnect(node)` in try/catch, because the old context may already be closed.
- Rebind inside the render loop on `analyser !== boundAnalyser`; keep visual state (heights, envelopes) across a rebind
  unless it's meaningless for the new source.
- Engine changes must keep the store contract (arrow-property getters, stable snapshots, `notify()` last). See
  architecture.md.

## Styling
- Tailwind utility classes in JSX by default. Repeated class strings become named constants (`buttonStyles.ts`).
- Use a CSS Module (`X.module.css`, camelCase class names) only for real stylesheet needs. Scope element selectors under
  the root class (`.panel button`) and mind specificity (`.panel .fieldReset`); CSS Modules only rename classes.
- Theme tokens go in `app/app.css` (`@theme`). `tailwind.config.js` is not used by Tailwind 4.

## Errors and edge cases
- localStorage: only through `storage.ts`. Reads fall back to defaults and merge stored settings over them.
- Engine actions throw `Error`s with user-facing messages; UI shows them (`SourceChooser`'s `run()` helper).
- `catch {}` blocks say why swallowing is safe. Listener errors in the engine are logged, not rethrown.
