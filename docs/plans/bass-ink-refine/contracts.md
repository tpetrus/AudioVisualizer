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
- Amended after the user's review (2026-11-25): the default was too zoomed in (top and bottom out of view), so `fill`
  is lowered until the whole cloud is in view at rest at 16:9; AC1's 0.80 bound is replaced by that measured fill, and
  the user's look review is the acceptance.

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

Amended after the user's review (2026-11-25): the three defaults are three clearly different hues (no longer palette
0), and a test asserts they are pairwise far apart. The edge still sits on `colorC` at rest.

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
- Amended after the user's review (2026-11-25): with fixed near/far, zooming out pushed every point past `far` and the
  whole cloud dimmed. `uDepthNear`/`uDepthFar` are now offsets from the cloud center's view depth (negative and
  positive, `-/+ radius * halfRange`), and the shader measures a point's depth relative to the center, so the fade is
  the same at any zoom. `depthFade(depth, near, far, fade)` is unchanged and is called with relative depths.

## Size budget (integration repair, 2026-11-25)

The total JS budget (339.25 kB) was exceeded by 342 B. Fix without raising the limit: the GLSL `//` comments, which ship
verbatim inside the shader strings, move into TypeScript comments by splitting each shader into named GLSL pieces
joined into `inkVertexShader`/`inkFragmentShader`, each piece with its why-comment above it. No comment is dropped.

## Second look review (2026-11-25)

The user asked that the whole object stay on screen by default even while it pulses, and that resting formations look
tighter and more solid.

- **C1 amended: fit to the pulse envelope, not the rest shape.** The fit now makes the formation's outermost rest point,
  pushed out by every pulse at the default control values (breathing, beat punch, swell, the kick-wave cap, the
  spectrum amplitude and the turbulence at full mid level), project within 0.95 of the viewport's smaller
  half-dimension, using real perspective (the nearest point is the largest). The absolute displacements (waves,
  spectrum, turbulence) do not scale with the radius, so the fit solves for the radius rather than multiplying.
  `worstCaseExtent` and `fitScale` may change shape to do this; the AC1 test asserts the worst-case projected extent of
  every formation is <= 0.95 at 16:9 and 4:3, and that the rest p95 still fills a stated floor.
- To keep the picture from shrinking too far, the absolute displacement amplitudes (`wave.amplitude`,
  `wave.maxDisplacement`, `spectrum.amplitude`) may be reduced by up to about 40 percent so the rest shape still fills
  at least about half of the smaller half-dimension.
- **Tighter rest shapes:** thinner formation shells and tubes (`bassInkConfig.formations`) and a calmer always-on
  turbulence (`turbulence.base`), so a formation reads as a solid shape when nothing pulses. The armillary AC2 tests
  stay green.

## Follow-ups (2026-11-26)

- **C2 superseded.** The measured gate bump sits at a median of 0.22 to 0.50 on every track, so the pure
  `swellFromBump` (floor 0.04, gain 3) held the swell near 1 instead of pulsing. It is replaced by
  `BassSwellShaper.step(lastGateBass, dt, out: BassSwell)` in `bassInkBass.ts`: the swell is the bump's rise above its
  own running level (rise 0.25 s, fall 0.05 s, offset 0.15, gain 1.8, from `bassInkSceneConfig.bass`). It is still
  lock-free, allocation-free and time-based, with glow equal to swell, and AC3 still holds. The framing worst case is
  unchanged because it already assumes a full swell.
- **D11 reversed by the user.** The palette transition fade is gone: the picked colors are written straight into the
  shown palette every frame, so a picker change shows at full strength on the next frame. `blendPalette` was removed.
- **BrightnessMix.** A core step that the soft cap turns down stays pending and is retried until it is granted, while
  kick flashes and bass glows hold back. It is dropped when tension falls below it or nothing can be granted (intensity
  0, a non-finite clock). Every increase still goes through `grantSoft` and the governor, so the 3-per-second bound is
  unchanged.

## Instant bass swell (2026-11-26, user request)

The beat lock takes a few seconds on most songs, and everything large waits for it (kick ripples, beat punch, kick
flashes), so the cloud barely reacts at first. The user asked for the swell to react the way the cubes do: instantly,
even if it is not always accurate.

- **Replaces the follow-up's shaper.** The swell and the glow are the bump itself, like `stepCubesBass`
  (`bump * bgPulse`): `swell = glow = clamp(lastGateBass, 0, 1)`, with NaN read as 0, no lock, no clock and no running
  level. `BassSwellShaper` and its rise, fall and offset constants go; a pure `swellFromBump(lastGateBass, out)` comes
  back with that mapping.
- `cloud.swellAmplitude` rises from 0.07 to 0.12, so the swell is clearly visible before the lock. The framing worst
  case already includes a full swell, so the fit keeps the whole cloud on screen. 0.15 was the target, but it put the
  torus's rest p95 fill at 0.39, under the 0.40 floor; 0.12 is the largest value that holds it (torus 0.4005, the other
  formations 0.42 to 0.43) at 16:9 and 4:3.
- The glow still goes through `BrightnessMix.requestBassGlow` and the shared soft cap, so the governor's 3-per-second
  bound is unchanged. No control and no settings-panel change.
