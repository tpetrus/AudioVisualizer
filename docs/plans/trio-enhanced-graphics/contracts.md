# Trio enhanced graphics: frozen contracts

Frozen by the orchestrator before any worker started, against `origin/main` at `68fcb93` (the plan was written at
`c03849a`, one fetch behind; the plan's constraints say to build on `68fcb93`). Plan: `trio-enhanced-graphics.plan.json`
revision 1, hash `9c4ea884145c23db`. Workers may not change anything in this file or in the files it names as frozen;
a needed change is an escalation.

## What S0 found on origin/main (D6, Q1)
- The toggle API is as the plan assumed: `getEnhancedGraphics`, `subscribeEnhancedGraphics`, `setEnhancedGraphics` in
  `app/features/settings/enhancedGraphicsStore.ts` and `useEnhancedGraphics()`. The default is **off**.
- The trio panel does **not** get the switch automatically. A page passes
  `header={<EnhancedGraphicsToggle status={...} />}` to `ControlPanel`, with `status: 'loading' | 'ready' | 'error' |
  undefined`. AC5 needs the switch on the trio page, so the trio page renders it. **Deviation from AC1:** the trio
  settings-panel baseline therefore gains the switch row; the 3D scene itself (toggle off) is unchanged. The landing
  switch's description names the dancer only and `docs/agents/architecture.md` says to reword it when a second
  visualizer joins, so the landing baseline changes too. Both are regenerated with the "Update visual snapshots"
  workflow.
- The dancer rebuilds its scene on a toggle (`{ antialias: enhanced }`). The trio deliberately does **not** (plan F3,
  AC5): its toggle subscription lives inside `setup`, never in React state or the `useThreeScene` deps.
- The rhythm input on origin/main is the tracker instance (`rhythm: RhythmTracker`, "stable, read without a ref"), not
  a state ref. C5 is adapted to that.
- Baseline size: total JS 359 kB gzip of a 360 kB limit; entry 126.24 of 133 kB; CSS 6.19 of 6.25 kB.

## C1 mode gate (frozen, done): `app/features/visualizers/trio-color-wave/trioLookMode.ts`
`resolveTrioLookMode(enhanced, software): 'standard' | 'enhanced'`; `isHardwareForced()` reads
`window[FORCE_HARDWARE_FLAG] === true` with `FORCE_HARDWARE_FLAG = '__audioVisualizerE2EForceHardware'`. In setup:
`software = isSoftwareRenderer(renderer) && !isHardwareForced()`.

## C2 look API (frozen): `enhanced/trioEnhancedTypes.ts`
`TrioEnhancedLookOptions`, `TrioEnhancedLook` (`render(dtSeconds)`, `setSize(size)`, `setMix(0..1)`, `dispose()`) and
`CreateTrioEnhancedLook`. The lazy module is `enhanced/trioEnhancedLook.ts` and exports
`createTrioEnhancedLook: CreateTrioEnhancedLook`. The hook loads it only with
`import('./enhanced/trioEnhancedLook')`.

Hook transitions (owned by the hook, task TC):
- States `standard`, `loading`, `enhanced`, `fading-out`. The desired mode is
  `resolveTrioLookMode(getEnhancedGraphics(), software)`, re-read on every `subscribeEnhancedGraphics` notification.
- standard -> loading: start the import. loading -> enhanced: create the look, `setMix(0)`, then ramp mix to 1 over
  `FADE_SECONDS = 0.25` driven by the frame delta. Off during loading: a cancel flag; the resolved module is never used
  (no look is created). If it was created, it is disposed and never attached.
- enhanced -> fading-out: ramp mix to 0 over 0.25 s, then `dispose()` and go to standard. On during fading-out: ramp
  back up on the same handle (no second look).
- Import or create failure: `console.warn` once per failure, go to standard, report `'error'`; the next off-to-on
  toggle retries.
- `webglcontextlost` on `renderer.domElement`: dispose the look, go to standard (listener removed on teardown).
- Teardown (scene dispose): unsubscribe, cancel any load, dispose any look, remove listeners.
- `render` is always set on the handle and branches: a live look (`enhanced`/`fading-out`) draws with
  `look.render(dtSeconds)`, otherwise `renderer.render(scene, camera)`. `resize` calls `look.setSize`.
- Status callback `onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void`, called on changes only,
  never per frame: `undefined` in standard (preference off or software renderer, and from the start of a fade-out),
  `'loading'` while the import runs, `'ready'` from the moment the look is created, `'error'` after a failure until the
  next toggle.
- Reduced motion: the hook owns `matchMedia('(prefers-reduced-motion: reduce)')` (guarded when `matchMedia` is
  missing, then `{ matches: false }`) and passes the live `MediaQueryList` as `reducedMotion`; the look reads
  `.matches` each frame, so a mid-session change applies without a subscription of its own.

Look behavior (owned by the look, task TB):
- Per sheet, a denser `PencilFlagsMesh` (D9) built once, with HDR shaders from `enhanced/` through C6. It is fed each
  frame by interpolating the standard sheet's `heightAttribute.array` (and built from its `instanceColor`), placed at
  the standard mesh's position. Standard meshes: visible with opacity uniform scaled by `1 - mix` while mix < 1, hidden
  at mix 1; restored (visible, original opacity) on dispose.
- The HDR fragment writes linear color with an emissive gain above 1 (glowStrength), a height-based rim and the accent
  pulse; no tone mapping in the shader. `EffectComposer` with `RenderPass`, `UnrealBloomPass` at half resolution and
  `OutputPass`, as in `bass-ink/bassInkPost.ts`. glowStrength 0 disables the bloom pass. Bloom strength scales with mix.
- A gradient backdrop with depth falloff (depth slider), one `Points` draw of drifting dust (dust slider), and a pooled
  shockwave ring fired by the accent's `triggered`. Under reduced motion the shockwave and dust drift are off and the
  pulse is damped. Everything allocated at creation; nothing per frame.
- Rhythm: when `rhythm` is given, `render` calls `rhythm.updatePhase()` and reads `rhythm.state.beatCount` and
  `rhythm.state.bandOnsets[0]` into the accent.

## C2a accent (frozen signature): `enhanced/trioAccent.ts`
`createTrioAccent(): TrioAccentState` and `stepTrioAccent(state, input: TrioAccentInput): void` with the types in
`trioEnhancedTypes.ts`. A trigger is a new beat (`beatCount` above the last seen) or a rising edge of `bassOnset` over a
threshold; it is accepted only when `sinceTrigger >= 1/3` s (at most 3 per second). On acceptance `pulse` jumps to its
peak in the same step (peak = cap * intensity, times a reduced-motion factor below 1), then decays exponentially by dt.
Constants live in `enhanced/trioEnhancedConfig.ts`.

## C3 shared software check (frozen, done): `app/lib/three/renderBudget.ts`
`isSoftwareRenderer` and `rendererContext`; `bass-ink/renderBudget.ts` re-exports `isSoftwareRenderer`, unchanged.

## C4 Look controls (frozen, done): `trioLookControls.ts`
`trioLookControls` (glowStrength 0..3, accentIntensity 0..1, depth 0..1, dust 0..1), `trioAllControls` (standard
then Look) and their value types. The page calls `useControlValues(trioAllControls)` and passes `trioAllControls` to
`ControlPanel` only while the status is `'ready'`, else `trioColorWaveControls`. ControlPanel is unchanged.

## C5 rhythm input (frozen)
`useTrioColorWaveScene` gains optional `rhythm?: RhythmTracker` and `onEnhancedStatus?`; its `valuesRef` becomes
`{ readonly current: TrioAllControlValues }`. The page passes `useRhythm()`. The standard path ignores `rhythm`.

## C6 pencil shader option (frozen, done): `meshes/pencilFlagsMesh.ts`
An optional last constructor argument `PencilShaderOptions { vertexShader?, fragmentShader?, uniforms? }`. Omitted,
the mesh is exactly as before.
