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
- Formatting is Prettier's (`.prettierrc.json`): run `npm run format` rather than formatting by hand. It gives
  `app/features` and `app/components` 4-space indent and single quotes, and keeps the template-generated
  `app/root.tsx`/`app/routes.ts`/`app/routes/*` at 2 spaces and double quotes. Markdown is not run through Prettier
  (hand-wrapped at 120 columns, with tables), so match the surrounding doc.

## Pull request titles
- Titles are Conventional Commits, `type(scope)?!?: description`, with a lowercase type from `feat`, `fix`, `perf`,
  `refactor`, `build`, `chore`, `revert`, `style`, `docs`, `ci`, `test`. The scope is optional and free-form
  (`feat(audio): …`, `build(deps): …`). Write the description in the imperative, lowercase after the colon, with no
  trailing period; it is printed verbatim in the release notes.
- Pick the type by what the change does to the shipped site, not by which files it touches: a visible or behavioural
  addition is `feat`, a bug fix is `fix`, a speed or memory improvement is `perf`, internal cleanup is `refactor`, and
  dependency or build-tooling changes are `build`. Add `!` before the colon when users or developers must change
  something to keep working; that is always a major bump.
- `docs`, `ci` and `test` release nothing, so they may only touch files that don't ship (docs, workflows, specs,
  scripts). Changing `app/**`, `public/**`, the build config or the dependencies needs a releasing type, otherwise the
  `version` check fails.
- Don't edit `version` in `package.json` or `package-lock.json` yourself; the version bot commits `chore: set version to
  X.Y.Z` to your branch. If you amend or rebase, let the bot run again (or run
  `npx --yes --package=github:tpetrus/ci-workflows#v0.1.3 ci-tools release write-version <version>`). "Versioning and releases" in
  AGENTS.md has the full rules.

## Linting
- `npm run lint` runs ESLint with type-aware typescript-eslint rules, react-hooks (`exhaustive-deps` is an error) and
  jsx-a11y. It also enforces the named-exports rule and forbids app code importing from `e2e/`.
- Fix the finding rather than silencing it. When a disable is genuinely right, keep it to one line, name the rule and
  give the reason after `--`: `// eslint-disable-next-line <rule> -- <why>`. Don't turn rules off in `eslint.config.js`
  to get a change through.
- Async event handlers on JSX attributes are allowed (`no-misused-promises` has `checksVoidReturn.attributes` off), and
  unused parameters may be prefixed with `_`.

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
- Addons import from `three/addons/...` (three r186, pinned exactly). Don't upgrade three as part of another change.

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
- Theme tokens go in `app/app.css` (`@theme`); there is no Tailwind config file.
- Fonts are self-hosted (Inter from `@fontsource-variable/inter`, declared in `app/app.css` with `font-display: swap`).
  Don't add stylesheets or fonts from third-party origins: they block rendering on `/`, which Lighthouse gates.

## Errors and edge cases
- localStorage: only through `storage.ts`. Reads fall back to defaults and merge stored settings over them.
- Engine actions throw `Error`s with user-facing messages; UI shows them (`SourceChooser`'s `run()` helper).
- `catch {}` blocks say why swallowing is safe. Listener errors in the engine are logged, not rethrown.

## Testing
- Specs are co-located: `foo.ts` has `foo.test.ts(x)` beside it. The 95% coverage threshold (`npm run test:coverage`)
  covers every file under `app/`, so a new file needs a spec in the same change. Don't add `v8 ignore` comments or
  coverage excludes to get there.
- The default environment is node, which is fastest and right for pure maths and classes. A spec that needs the DOM
  starts with `// @vitest-environment jsdom`.
- Test classes and pure functions directly, with plain inputs and outputs. Only hooks and components need React;
  render them with Testing Library (`renderHook`, `render`), and use `renderWithProviders` when they need the audio or
  rhythm context.
- Prefer the shared fakes in `app/test/` (`fakeWebAudio`, `fakeMedia`, `fakeThree`, `fakeResizeObserver`,
  `fakeEngines`) over ad-hoc mocks, so every spec fakes the browser the same way. If a fake lacks a member, add it
  there rather than patching it locally. They install through `vi.stubGlobal`, which `setup.ts` undoes after each test.
- To fake the GPU, mock `three` with a dynamic import inside the factory, because `vi.mock` is hoisted above the
  imports: `vi.mock('three', async (importOriginal) => { const { threeFakes } = await import('~/test/fakeThree');
  return { ...(await importOriginal<typeof import('three')>()), ...threeFakes }; })`. Only the renderer and PMREM
  generator are replaced; the rest of three runs for real. Drive frames with `FakeRenderer.last.renderFrame(time)`.
- `userEvent` waits on timers, so it hangs under fake timers unless you pass
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`. Fake only the timers you need
  (`vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })`) so Testing Library's own polling keeps
  working, and wrap manual `vi.advanceTimersByTime` calls in `act`.
- Keep the specs honest about the contracts in architecture.md: assert that resources are freed (dispose, disconnect,
  listeners removed) as well as that the happy path works.

## End-to-end tests
- Playwright specs live in `e2e/` and run against the production build served by `wrangler dev` (`npm run build` first,
  then `npm run test:e2e`). Chromium gets a fake microphone that plays `e2e/fixtures/beat-120bpm.wav`
  (`npm run e2e:fixture` regenerates it from `app/features/rhythm/testSignals.ts`) and software WebGL (SwiftShader).
- Import `test` and `expect` from `./fixtures`, not from `@playwright/test`. The `problems` fixture fails a test on any
  page error, console error or "Too many active WebGL contexts" warning. Add to its allowlist only for noise the app
  can't fix, with a reason.
- Never hardcode the list of visualizers or their controls. Loop over `VISUALIZERS_UNDER_TEST` (from the app's
  `VISUALIZATIONS`), and derive control values from each input's own `min`/`max`/`step`, so a new visualizer is tested
  without touching `e2e/`.
- Locate elements by role and accessible name (`getByRole`, `getByLabelText`), not CSS classes. Wait with web-first
  assertions or `expect.poll`, never fixed sleeps. Software WebGL is slow, so the timeouts are generous; don't rely on
  retries, because a test that passes only on retry is flaky and must be fixed.
- Screen capture needs no stub: `--use-fake-ui-for-media-stream` makes the browser's own `getDisplayMedia` return the
  fake input device, so use `chooseScreenCapture`. To check that a scene is still rendering (especially right after a
  source change), use `trackRenderedFrames` + `expectSceneStillDrawing` (a draw-call counter) rather than a pixel
  read-back, which waits behind queued software-GL frames and can take many seconds.
- Leaks are checked by counting live WebGL contexts (`trackWebGLContexts`, `liveWebGLContexts`). A scene must release
  its context on unmount (`useThreeScene` calls `forceContextLoss()`). The landing page owns none: its title is an
  image.
- Accessibility: call `expectNoA11yViolations` (in `e2e/a11y.ts`) on new pages and dialogs. Serious and critical
  violations fail; fix them in the app rather than excluding rules.
- Visual regression (`e2e/visual.spec.ts`) screenshots UI only, with the canvas hidden or masked, against Linux
  baselines. It skips on Windows and macOS. To accept a deliberate change, run the "Update visual snapshots" workflow on
  your branch, review the images in the PR diff, then push a commit so the checks run again.
- Tag a test `@smoke` only if it needs no audio fixture and is safe against production; `npm run test:smoke` and the
  post-deploy workflow run exactly those.
- CI shards the suite automatically by test count (`e2e.yml`): the `e2e-plan` job runs `playwright test --list`, and
  starts `ceil(tests / TESTS_PER_SHARD)` parallel `e2e` jobs, capped at `MAX_SHARDS`. Adding a test or a visualizer
  needs no workflow edit and no change to the shard count. The single required check is `e2e-result`, whose name
  doesn't change with the shard count.
- Keep each test independent and short, and split a long scenario into several tests. Shards are balanced by test
  count, not duration, so the slowest test sets the floor for a shard's time and a very long test cannot be spread out.
- `e2e/` is its own TypeScript program (`e2e/tsconfig.json`), so its exports never show up as auto-imports in app code.
  Keep helpers there unexported unless another spec needs them.
