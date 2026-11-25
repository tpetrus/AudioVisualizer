# bass-ink-refine: frozen contracts

Frozen by the verified-diamond orchestrator before any worker started, from plan `bass-ink-refine` r1 (hash
`11ffc88fe66bea1b`), base `ead045f`. Workers implement these exactly; a change needs the orchestrator.

Every path below is under `app/features/visualizers/bass-ink/` unless it says otherwise. Nothing under
`app/features/audio/`, `app/features/rhythm/`, `app/lib/three/`, `app/hooks/`, `app/components/` or another visualizer
changes (AC7). Code follows `AGENTS.md`: named exports, no per-frame allocation, comments explain why.

## C1 framing (`framing.ts`, slice S1)

```ts
// Multiplier on bassInkSceneConfig.cloud.radius so a formation whose rest points have 95th-percentile radius
// `p95Radius` (unit-formation units, after the tilt) projects to `fill` times the viewport's smaller half-dimension
// for a camera at `cameraDistance` on the z axis with vertical field of view `fovDeg` and aspect width/height.
export function fitScale(p95Radius: number, cameraDistance: number, fovDeg: number, aspect: number, fill: number): number;
// Worst-case outward reach of a rim point at rest radius 1, in world units at a given uRadius, summing breathing,
// beat punch, swell (0 until S3 adds it), kick-wave max and spectrum amplitude from the config constants.
export function worstCaseExtent(radius: number, config?: typeof bassInkSceneConfig): number;
// 95th-percentile radius of a unit formation's points (sampled with writeFormation; allocation is fine, it runs on
// mount and on resize only, never per frame).
export function formationP95Radius(index: number, seed: number, sampleCount?: number): number;
```

- `InkCloud` gains `setRadius(worldRadius: number): void`, which sets `uRadius` (S1 owns that edit).
- The scene computes the fit on mount and on resize and calls `cloud.setRadius(...)` (also on a density rebuild). It
  may blend per-formation fits with the fade or use one fit for all formations; either is fine if AC1 passes for every
  formation index `0..FORMATION_COUNT-1`.
- The camera position, fov and `createOrbitView` are untouched. The hook test asserts the camera position is unchanged
  after a resize.
- Config: `bassInkSceneConfig.cloud.fill` (the target fill, a number around 0.85) is added; the stale "fills about 60
  percent" camera comment is corrected.

## C2 swellFromBump (`bassInkBass.ts`, slice S3)

```ts
export interface BassSwell { swell: number; glow: number }
// Pure and allocation-free. `lastGateBass` is the scene's existing GATE_BASS_BUMP-stepped gate bass (0..1 or so).
// Writes swell in 0..1 and glow in 0..1. Takes no lock, clock or bass-gate input.
export function swellFromBump(lastGateBass: number, out: BassSwell): void;
```

- AC3: with a gate pulse of the size `BassBump(GATE_BASS_BUMP)` produces on a kick, `swell > 0.3` within 3 frames of
  the pulse starting at 60 fps, with `clock.locked` false.
- Glow goes through `BrightnessMix` only (D14). `BrightnessMix` gains
  `requestBassGlow(glow: number, nowSeconds: number, intensity: number): void`: it grants on an upward crossing of an
  arm threshold and re-arms below a lower one (hysteresis), through the existing soft cap (`grantSoft`), so it shares
  the per-second cap with kick flashes and the governor's 3-per-second limit. The scene calls it right after
  `brightnessMix.update(...)` and reads `brightnessMix.level` as the frame's brightness.
- Swell is displacement only: it never changes alpha, size or color.

## C5 swell uniform (`../meshes/inkShaders.ts`, `inkCloud.ts`, slice S3)

- Per-frame uniform `uSwell` (0..1) set by `InkCloud.setSwell(value: number)`; a set-once constant uniform
  `uSwellAmp` from `bassInkSceneConfig.cloud.swellAmplitude`.
- Vertex shader: the radial scale becomes `... * (1.0 + uSwellAmp * uSwell)`, next to the breathing and punch terms.
- `swellAmplitude` is below `cloud.beatPunch` (0.09) per the plan, and is included in `worstCaseExtent`.
- Telemetry: the bass-ink probe in `useBassInkScene.ts` appends columns `swell` and `glow` at the end (after
  `sceneBuiltAt`); existing column order is unchanged because scorecard scripts read them by name.

## C3 control ids (`bassInkControls.ts`, slice S4)

New controls appended in a `Colors` section after the existing four, which do not change:

| key | type | default | notes |
|---|---|---|---|
| `colorA` | `color` | hex of palette 0's core | label "Core color" or similar |
| `colorB` | `color` | hex between core and edge of palette 0 | |
| `colorC` | `color` | hex of palette 0's edge | |
| `colorSpeed` | `range` | `0` min, `1` max, step `0.05`, default a small nonzero value | label says 0 is static |

The defaults are derived from `writePalette(0, ...)` once and written as hex literals (sRGB) in the control list.

## C4 bassInkColor (`bassInkColor.ts`, slice S4)

```ts
// Full-scale hue speed in cycles per second at colorSpeed 1 (bounded so hue cycling can never flash).
export const MAX_HUE_CYCLES_PER_SECOND: number; // about 0.2
// Phase in [0, 1), advanced by speed * MAX_HUE_CYCLES_PER_SECOND * dt; speed 0 leaves it unchanged.
export function advanceHuePhase(phase: number, speed: number, dt: number): number;
// Writes core and edge (linear RGB) in place into `out` from three preallocated THREE.Color (linear) and the phase:
// the three colors rotate around the gradient by the phase. No allocation.
export function writeCustomPalette(colors: readonly [THREE.Color, THREE.Color, THREE.Color], phase: number, out: PalettePair): void;
```

- The scene parses the hex control values into three preallocated `THREE.Color`s only when a value string changes
  (compare strings, no per-frame parse), then writes into `paletteTo` (and the shown pair when no fade runs); the
  `paletteFrom`/`paletteTo` transition fade stays. `writePalette(cue.paletteIndex, ...)` no longer drives the color.

## C6 depth uniforms (`../meshes/inkShaders.ts`, `inkCloud.ts`, slice S5)

- Constant uniforms `uDepthNear`, `uDepthFar` (view-space distances, from `bassInkSceneConfig.depth`), plus
  `uDepthFade` (0..1, how much the far point loses). A point's view depth `-mv.z` maps to `k = clamp((depth - near) /
  (far - near), 0, 1)`; size and alpha are multiplied by `1 - uDepthFade * k`, with `uDepthFade >= 0.5` (AC6).
- The same maths is exported as a pure TypeScript function `depthFade(depth, near, far, fade): number` in
  `../meshes/inkShaders.ts` so a unit test can check far/near <= 0.5; the GLSL must match it.
- Since the cloud is refit in S1, `near`/`far` follow the camera distance and the fitted radius (computed in
  `InkCloud.setRadius` or the scene), not fixed numbers that the fit can outgrow.
