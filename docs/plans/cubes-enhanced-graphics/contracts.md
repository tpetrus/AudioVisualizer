# Cubes enhanced graphics: frozen contracts

Frozen by the verified-diamond orchestrator before any worker starts. Workers implement these exactly; a change to
anything here goes back to the orchestrator. Source: `cubes-enhanced-graphics.plan.json` r1 (hash `02221feb97bc7b17`),
C1 to C6. Decisions D9 to D11 and the answers below were confirmed by Trevor Petrus on 2026-11-27.

Base: `origin/main` 68fcb93, which already has the dancer's enhanced graphics (PR #160). Plan base c03849a predates it.

## Settled with the user on 2026-11-27

- The shared store, hook, toggle and `ControlPanel` `header` slot from the dancer are reused unchanged, except for the
  one additive prop in C1b.
- The cubes panel shows the shared toggle in its `header`, like the dancer. The cubes settings-panel baseline therefore
  changes (regenerated with the "Update visual snapshots" workflow); AC1's "unchanged" applies to the scene and to the
  panel's controls with the flag off.
- The dancer's slow-frame notice (`FrameRateMonitor`, `SlowFrameNotice`) is reused on /cubes while enhanced is on.
- AC3 and AC6 (fps, frame-time p95, debug:viz envelope) are measured by the user on the reference laptop at the end;
  D10's cut list applies on a miss. Workers do not claim them.
- Risk is R2 (shared component prop, size budget): one PR, human merge.

## C1 shared preference (reused, unchanged)

`app/features/settings/enhancedGraphicsStore.ts` (`ENHANCED_GRAPHICS_KEY`, `getEnhancedGraphics`,
`setEnhancedGraphics`, `subscribeEnhancedGraphics`) and `app/features/settings/useEnhancedGraphics.ts`
(`useEnhancedGraphics(): boolean`), as in `docs/plans/dancer-enhanced-graphics/contracts.md` C1. Not edited.

## C1b EnhancedGraphicsToggle description prop (`app/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle.tsx`)

```ts
export interface EnhancedGraphicsToggleProps {
    status?: EnhancedGraphicsStatus;
    className?: string;
    // Replaces the visible description (the aria-describedby text). Absent: ENHANCED_GRAPHICS_STRINGS.description, so
    // the landing page and the dancer render exactly as today.
    description?: string;
}
```

Cubes passes `CUBES_ENHANCED_STRINGS.description` from `app/features/visualizers/cubes/cubesEnhancedStrings.ts`
(eager, no three.js import): `'Glow, a glossy floor, particles, grid waves and beat-synced motion for the cubes. Needs a
strong GPU; downloads nothing extra.'` The status lines stay the shared ones.

## C2 loadCubesEnhanced (`app/features/visualizers/cubes/enhanced/loadCubesEnhanced.ts`)

```ts
export type CubesEnhancedModule = typeof import('./CubesEnhancedLook');
export type LoadCubesEnhancedResult = { ok: true; Look: CubesEnhancedModule['CubesEnhancedLook'] } | { ok: false };
export function loadCubesEnhanced(
    signal: AbortSignal,
    importer?: () => Promise<CubesEnhancedModule>, // default () => import('./CubesEnhancedLook'); for tests only
): Promise<LoadCubesEnhancedResult>;
```

Never rejects. Resolves `{ ok: false }` when `signal` is already aborted, aborts before the import settles, or the import
fails (one `console.warn`, not an error, on an import failure; none on abort). It is the only importer of
`CubesEnhancedLook`, so the look, its shaders and the post addons land in a lazy chunk.

## C3 CubesEnhancedLook (`app/features/visualizers/cubes/enhanced/CubesEnhancedLook.ts`)

```ts
export interface CubesLights {
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
}
export interface CubesEnhancedLookOptions {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    lights: CubesLights;
    size: SceneSize; // CSS pixels, as useThreeScene reports them
    reducedMotion: boolean;
}
export interface CubesEnhancedSettings {
    glow: number; // 0..1, the Glow control
    particles: number; // 0..1, the Particles control; 0 hides the particle layer
    cameraMotion: number; // 0..1, the Camera motion control
    restingColor: THREE.Color; // the hook's preallocated colors, read only
    raisedColor: THREE.Color;
}
export class CubesEnhancedLook {
    constructor(options: CubesEnhancedLookOptions);
    attach(grid: CubeGrid): void; // applies its material via grid.setMaterialOverride; re-called after every rebuild
    update(frame: CubesFxFrame, settings: Readonly<CubesEnhancedSettings>): void; // once per frame, before render
    render(): void; // draws the frame through its composer
    resize(width: number, height: number): void; // CSS pixels
    setReducedMotion(reduced: boolean): void;
    dispose(): void;
}
```

- Refinements of plan C3: `lights` and `size` are added to the options (the look retunes the lights for its colour
  pipeline and sizes its composer); `update` takes `settings` instead of `dt` (dt is `frame.dt`).
- The constructor saves every scene, renderer and light property it changes (`scene.background`, `scene.fog`,
  `scene.environmentIntensity`, renderer tone mapping and exposure, light intensities and colours) and `dispose()` puts
  them back, so the basic look renders exactly as before after a round trip. It adds its own objects under one
  scene-root group (D11: motion moves that group, never `camera.position`) and the grid stays where the hook put it;
  `attach` moves the grid's mesh into the group and `dispose` moves it back to the scene.
- `dispose()` is idempotent. It frees the composer, every pass and render target, its geometries, materials and
  textures, removes its objects, calls `grid.setMaterialOverride(null)` on the attached grid (harmless if a resize already
  disposed that grid) and restores the saved state. Every method is a no-op after `dispose()`.
- Post (the `bassInkPost.ts` pattern, same addons so the chunk is shared): EffectComposer, RenderPass, UnrealBloomPass at
  half resolution, OutputPass. The composer runs on every renderer, software too, so e2e exercises it. The output pass
  uses the renderer's tone mapping and output colour space.
- Tunables live in `app/features/visualizers/cubes/enhanced/cubesEnhancedConfig.ts`.
- No allocation in `update` or `render`.

## C4 CubesFxFrame and CubesFxState (`app/features/visualizers/cubes/enhanced/cubesFxState.ts`)

```ts
export interface CubesFxFrame {
    bands: Float32Array | null; // the cubes' band levels (0..1), null when no analyser is bound
    bassFlash: number; // 0..1, the cubesBass pulse the basic look uses for its background flash
    beatPhase: number | null; // hub beat phase while hub.snapshot.beat.locked, else null
    barPhase: number | null; // hub bar phase while hub.snapshot.beat.barLocked, else null
    barLocked: boolean;
    dt: number; // seconds, clamped by the state to 0..0.1
}
export interface CubesFxUniforms {
    time: number; // seconds of accumulated dt
    bloomStrength: number; // >= 0, already scaled by settings.glow by the look (the state outputs the 0..1 drive)
    bassFlash: number; // 0..1; capped by the reduced-motion damper
    waveAmplitude: number; // 0..1; 0 when beatPhase is null
    wavePhase: number; // radians; holds its value while beatPhase is null
    shatter: number; // 0..1, a bass-drop impulse that decays; capped by the reduced-motion damper
    particleEmit: number; // 0..1, follows bass and band energy
    motionDolly: number; // -1..1; 0 under reduced motion or with barPhase null
    motionDrift: number; // -1..1; 0 under reduced motion
}
export function createCubesFxUniforms(): CubesFxUniforms; // all zeros
export class CubesFxState {
    step(frame: Readonly<CubesFxFrame>, reducedMotion: boolean, out: CubesFxUniforms): void; // writes out in place
    reset(): void;
}
```

Every output is finite and clamped to its range for any input, including NaN. Null phases or `barLocked` false give
zero beat and bar amplitude; band terms follow the levels (null bands read as silence). `step` never allocates.

## C5 useCubesScene enhanced option (`app/features/visualizers/cubes/useCubesScene.ts`)

```ts
interface CubesSceneOptions {
    // ...today's options, unchanged...
    valuesRef: { readonly current: CubesEnhancedControlValues }; // the superset, see C7
    enhanced: boolean;
    onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void; // undefined in basic mode
    onSlowFrames?: () => void; // once per warm-up cycle while the enhanced look runs slowly; never in basic mode
}
```

- `useThreeScene` is called exactly as today (no `antialias` dep, no rebuild on toggle). The handle always has a
  `render` that calls `look.render()` when a look is active and otherwise `renderer.render(scene, camera)`.
- Turning on: status `'loading'`, the basic look keeps rendering while `loadCubesEnhanced` runs with its own
  AbortController (also aborted by the scene's `signal`). On `ok` while still wanted: construct the look, `attach` the
  current grid, status `'ready'`. On `ok: false` while still wanted: status `'error'`, basic look stays; the stored
  preference is never changed by the scene.
- Turning off: abort any pending load, `dispose()` the look, status `undefined`. Turning on again builds a new look.
- `resize` re-calls `look.attach(grid)` after rebuilding the grid, and `look.resize(width, height)` on every resize.
- `prefers-reduced-motion: reduce` is read through `matchMedia` and followed live (`change` listener removed on
  dispose); it is passed to the look's constructor and `setReducedMotion`.
- A `FrameRateMonitor(SLOW_FRAME_OPTIONS)` samples frames only while a look is active; `restartWarmup()` on every
  status change.
- The CubesFxFrame is filled from preallocated state per C4; the band array is the hook's `levels`.

## C6 CubeGrid material hook (`app/features/visualizers/cubes/cubeGrid.ts`)

```ts
public setMaterialOverride(material: THREE.Material | null): void; // null restores the grid's own glass material
```

Sets `mesh.material`. The grid never disposes an override (its owner does); `dispose()` still frees only its own
material. Calling it after `dispose()` is harmless. The basic path never calls it.

## C7 Enhanced controls (`app/features/visualizers/cubes/cubesControls.ts`)

```ts
export const cubesControls; // unchanged, so the default panel and its type stay as today
export const cubesEnhancedControls = [
    ...cubesControls,
    { section: 'Enhanced', key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { section: 'Enhanced', key: 'particles', label: 'Particles', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { section: 'Enhanced', key: 'cameraMotion', label: 'Camera motion', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
] as const satisfies readonly ControlDefinition[];
export type CubesEnhancedControlValues = ControlValues<typeof cubesEnhancedControls>;
```

`CubesPage` holds `useControlValues(cubesEnhancedControls)` and gives the panel
`definitions={enhanced ? cubesEnhancedControls : cubesControls}`, so with the flag off the panel shows exactly today's
controls. `header={<EnhancedGraphicsToggle status={enhancedStatus} description={CUBES_ENHANCED_STRINGS.description} />}`.
The slow-frame notice is wired exactly as in `DancingCharacterPage` (an always-mounted `role="status"` region inside the
fullscreen wrapper).

## Tests and budgets

- e2e: `e2e/cubes-enhanced.spec.ts` seeds `audioVisualizer.enhancedGraphics=true`. It checks pixel statistics on the
  canvas (`expectCanvasRendering` plus a not-washed-out check), one canvas and stable WebGL context count across a
  toggle round trip, resize and route round trip, that the lazy chunk is requested only when enabled, and no console
  errors. The "one enhanced visual baseline" is the cubes settings panel with enhanced on (canvas hidden, as in
  `visual.spec.ts`), because the canvas itself is animated.
- `npm run size`: Entry JS stays within 133 kB. If Total JS (360 kB) is exceeded, the limit is raised in
  `.size-limit.json` in this PR with the reason in the PR description. The post addons must come from the same chunk as
  bass-ink's (check `build/client/assets`).

## Type file (`app/features/visualizers/cubes/enhanced/cubesEnhancedTypes.ts`, orchestrator-owned)

The interfaces of C3 and C4 (`CubesLights`, `CubesEnhancedLookOptions`, `CubesEnhancedSettings`, `CubesFxFrame`,
`CubesFxUniforms`, `CubesEnhancedLookApi`, `CubeGridLike`, `CubesEnhancedLookConstructor`) live here, type-only, so the
eager hook imports them without pulling in the lazy chunk. `CubesEnhancedLook` implements `CubesEnhancedLookApi`;
`cubesFxState.ts` re-exports the two C4 types. The orchestrator committed stubs of `CubesEnhancedLook.ts` and
`cubesFxState.ts` with these shapes so tasks A and B can run in parallel.

## Ownership (one owner per file)

| Task | Owns |
|---|---|
| A (S1 hook side) | `EnhancedGraphicsToggle.tsx` and spec (C1b only), `cubes/cubeGrid.ts` and spec (C6 only), `cubes/cubesEnhancedStrings.ts`, `cubes/cubesControls.ts` and spec, `cubes/enhanced/loadCubesEnhanced.ts` and spec, `cubes/useCubesScene.ts`, `cubes/CubesPage.tsx` and their specs, `e2e/cubes-enhanced.spec.ts` |
| B (S1 look side to S5) | `cubes/enhanced/CubesEnhancedLook.ts`, `cubesFxState.ts`, `cubesEnhancedConfig.ts`, `cubesEnhancedShaders.ts` and their specs |
| Orchestrator | this file, `cubesEnhancedTypes.ts`, `.size-limit.json`, `docs/agents/architecture.md`, integration, the PR |
