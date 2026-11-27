# Bass ink enhanced graphics: frozen contracts

Frozen by the verified-diamond orchestrator (task S0) before any worker starts. Workers implement these exactly; a
change to anything here goes back to the orchestrator. Source: `bass-ink-enhanced-graphics.plan.json` r1 (hash
`a98c8ec26e31f70a`), C1 to C4, decisions D1 to D12.

Base: `origin/main` bd71db4, which has the shared toggle (PR #160) and the bass-ink disc flow (PR #164). The plan's base
c03849a predates both; its line references to `useBassInkScene.ts` are stale, the behavior they describe is not.

## What the shared toggle on origin/main is (K1, verified)

- Store `app/features/settings/enhancedGraphicsStore.ts` and `useEnhancedGraphics(): boolean`
  (`app/features/settings/useEnhancedGraphics.ts`); see `docs/plans/dancer-enhanced-graphics/contracts.md` C1. Reused,
  not edited.
- `EnhancedGraphicsToggle` (`status?: 'loading' | 'ready' | 'error'`, `className?`) rendered in `ControlPanel`'s
  `header` slot, as the dancer page does. Reused, not edited.
- `useThreeScene` passes `signal: AbortSignal` (aborted on teardown) to `setup`. The dancer rebuilds the scene on a
  toggle because antialias is a constructor setting. Bass ink needs no antialias (points and post), so it does not pass
  `{ antialias }` and switches in place (D12): no rebuild, no new context.

## Orchestrator refinements of the plan (recorded, not re-planned)

- R-a (C1): the band level the orbit uses is the band's mean, not its peak-balanced max. Trio's balance rescales every
  band so its recent peak maps to a fixed level (half-life about 2 s), so its output says little about loudness and the
  orbit would run at one speed for any music above the floor. The balance step still moves to the shared module for
  trio; bass ink reads unbalanced levels.
- R-b (AC10): the plan's "drag pauses about 1.5 s then resumes" is dropped. A locked camera cannot be dragged, and
  while unlocked the orbit does not advance (D6, AC10), so there is no drag to pause for.
- R-c (shared toggle): the landing description still names only the dancer. Rewording it, or adding a per-visualizer
  description, collides with the open cubes and trio branches, and the plan rules out changing the toggle. Bass ink
  shows the shared toggle unchanged; the reword is a recorded follow-up.
- R-d (C3): the shader variant is a shader swap plus a define. Standard shader strings stay byte-identical (AC12); the
  enhanced GLSL lives only in the lazy chunk.

## Shared seams (done by the orchestrator, on the branch before dispatch)

- `InkCloud`, `DustField` and `SprayPool` expose `readonly material: THREE.ShaderMaterial` (was private). Nothing else
  about them changes.
- `BassInkPost.setExtraPasses(passes: readonly Pass[]): void`: the given passes are kept in the composer right before
  the output pass, in order, also when the composer is built later and after the afterimage is replaced. Replacing
  removes the old ones from the composer without freeing them; the caller owns, enables, sizes and frees them. A no-op
  after `dispose()`. Never drawn on a software renderer (no composer).

## C1 bandLevels (`app/features/visualizers/shared/bandLevels.ts`)

```ts
// Moved verbatim from trio-color-wave/spectrum.ts (same names, same maths, same comments).
export function sampleLogSpectrum(spectrum: Uint8Array, binHz: number, lowHz: number, highHz: number, out: Float32Array): void;
export function createKernel(sigma: number): Float32Array;
export function blur(values: Float32Array, kernel: Float32Array, out: Float32Array): void;
// Trio's peak-balance step, split out of TrioColorWaveSheet.update with identical arithmetic:
// peak = max(frameMax, prevPeak * decay); gain = target / max(peak, floor).
export function stepPeak(frameMax: number, prevPeak: number, decay: number): number;
export function balanceGain(peak: number, target: number, floor: number): number;

// A three-band reader over one analyser's byte spectrum, trio-like (D7, R-a).
export interface BandEdges { bassLow: number; bassHigh: number; midsHigh: number; highsHigh: number } // Hz
export interface BandLevels { bass: number; mids: number; highs: number; combined: number }        // each 0..1
export interface BandLevelState { /* preallocated columns, blurred buffer and one kernel per band */ }
// `columns` log-spaced samples per band; each band's blur is trio's blurColumns (bass 7, mids 3, highs 1.5) scaled by
// columns / 256, so the smoothing covers the same share of the band.
export function createBandLevelState(columns: number): BandLevelState;
// Samples bass (bassLow..bassHigh), mids (bassHigh..midsHigh) and highs (midsHigh..highsHigh) with sampleLogSpectrum,
// blurs each, and writes each band's mean / 255 into `out`, with combined = (bass + mids + highs) / 3. Allocates
// nothing. An empty spectrum, binHz <= 0 or non-finite input writes zeros.
export function readBandLevels(spectrum: Uint8Array, binHz: number, edges: BandEdges, state: BandLevelState, out: BandLevels): void;
```

- `trio-color-wave/spectrum.ts` and its spec move to `shared/` (the spec becomes part of `bandLevels.test.ts`);
  `trioColorWaveSheet.ts` and `bass-ink/spectrumField.ts` import from `~/features/visualizers/shared/bandLevels`.
- AC11: a golden test, written and passing against today's trio code before the move, records
  `TrioColorWaveSheet.update` output (bar heights, `peak`, `frameLevel`, `balancedLevel`) over a fixed sequence of
  synthetic spectra; it passes unchanged after the move. Existing trio specs pass unchanged.

## C2 bassInkOrbit (`app/features/visualizers/bass-ink/bassInkOrbit.ts`)

Constants live in `bassInkSceneConfig.orbit`: `bandEdges` (equal to trio's control defaults bassLow, bassHigh,
midsHigh, highsHigh, checked by a spec), `columns`, `attackSeconds`, `releaseSeconds` (release slower than attack),
`levelLow`, `levelHigh` (the combined range mapped by smoothstep), `floorSpeed`, `capSpeed` (rad/s, floor > 0),
`slewRate` (1/s), `maxChangePerSecond` (rad/s^2), `maxStepPerFrame` (rad), `tilt` (rad, the orbit axis's lean from
vertical).

```ts
// Follows the raw combined level, attack and release as followLevel does; a non-finite raw counts as 0. 0..1.
export function smoothCombined(prev: number, raw: number, dt: number): number;
// rad/s, never negative. 0 when reducedMotion or driftSetting <= 0 (the camera stops where it is). Otherwise eases
// (slewRate) toward driftSetting * (floor + (cap - floor) * smoothstep((combined - levelLow) / (levelHigh - levelLow)))
// and is rate limited by maxChangePerSecond, as dancingCharacterOrbit.ts does. Monotonic in combined.
export function orbitAngularSpeed(combined: number, driftSetting: number, prev: number, dt: number, reducedMotion: boolean): number;
// angle + min(speed * dt, maxStepPerFrame), wrapped to [0, 2π). Never decreases except by the wrap.
export function stepOrbitAngle(angle: number, speed: number, dt: number): number;
// Writes the camera position: (0, 0, distance) rotated by `azimuth` about the axis (0, cos tilt, sin tilt). At
// azimuth 0 it is exactly (0, 0, distance), today's pose, so the default view and Reset view are unchanged.
export function writeOrbitPose(out: THREE.Vector3, azimuth: number, tilt: number, distance: number): void;
```

Scene rules (useBassInkScene), in both modes:
- Band levels are read from the scene's existing analyser and spectrum (no new analyser, D7).
- While locked: speed and angle advance, the camera is written with `writeOrbitPose` and looks at the origin. While
  unlocked nothing is written and nothing advances; the orbit controls own the camera.
- The unlocked-to-locked edge and Reset view both run one `resetCamera`: `orbit.reset()` then angle and speed to 0 and
  the pose at azimuth 0 (the dancer's pattern). The auto-orbit never calls into the orbit controls, so the view-changed
  flag is untouched by it.
- Reduced motion is read with `matchMedia('(prefers-reduced-motion: reduce)')` and its `change` event (listener
  removed in dispose; a missing `matchMedia` reads as false) and passed to `orbitAngularSpeed`.
- The existing cloud drift and section swing stay exactly as they are; the orbit is the camera's own motion on top.
- The cloud stays on screen at the orbit's highest view elevation: a framing spec covers the tilt the orbit adds.

## C3 bassInkEnhanced (`app/features/visualizers/bass-ink/enhanced/bassInkEnhanced.ts`, lazy only)

Only ever reached through `import('./enhanced/bassInkEnhanced')` from `useBassInkScene`, only when the preference is on
and the renderer is not software.

```ts
export interface BassInkMaterials {
    shell: THREE.ShaderMaterial; core: THREE.ShaderMaterial; dust: THREE.ShaderMaterial; spray: THREE.ShaderMaterial;
}
export interface BassInkEnhancedContext { renderer: THREE.WebGLRenderer; post: BassInkPost; size: SceneSize }
export interface BassInkEnhancedHandle {
    readonly enabled: boolean;
    readonly renderScale: number; // 1, or the step-down level in use
    setEnabled(on: boolean): void; // idempotent, cheap when unchanged (called every frame)
    setGlow(glow: number): void; // BI-F4: the Glow control, 0..1 (non-finite = 0), called every frame while wanted
    setMaterials(materials: BassInkMaterials): void; // after a density rebuild; applies the current state to them
    setSize(size: SceneSize): void;
    step(frameSeconds: number): void; // frame-time-only render-scale step-down; acts only while enabled
    dispose(): void; // idempotent
}
export function buildBassInkEnhanced(ctx: BassInkEnhancedContext, materials: BassInkMaterials): BassInkEnhancedHandle;
```

- Built once per scene; every pass, render target and uniform it needs is created in `buildBassInkEnhanced`, which
  hands its passes to `post.setExtraPasses` (disabled until `setEnabled(true)`).
- `setEnabled(true)`: each material's `vertexShader`/`fragmentShader` are swapped to the enhanced variants, the define
  `BASS_INK_ENHANCED` is set, `needsUpdate = true`, and the extra passes are enabled. `setEnabled(false)`: the exact
  standard strings are put back (those the material had when attached), the define removed, `needsUpdate = true`, the
  passes disabled. three.js caches programs by source and defines, so flipping back and forth recompiles nothing.
- Extra uniforms the variants need are added to the materials' uniform objects on attach, named `uEnh*`; standard
  uniforms keep their values. Every enhanced value is a constant in `enhanced/bassInkEnhancedConfig.ts`; no value
  follows the music (AC7). `uBrightness` stays the only global brightness input; kick flashes, sprays and drops keep
  their timing because the variants read the same uniforms.
- Look (O4): stronger depth fade with size attenuation, a soft glowing sprite (hot core, wide halo), a static color
  grade and vignette pass and a fixed-strength second bloom at reduced resolution. No kick streak.
- Render scale: levels 1, 0.75, 0.5 applied to the enhanced passes' internal resolution only (never the renderer's
  pixel ratio, never a pass swap). Steps down one level when the median frame time over a full window
  (preallocated ring) exceeds the budget, then waits a fresh window; never steps up within a scene.
- `dispose()`: restores the standard shaders on the materials it holds, calls `post.setExtraPasses([])`, frees every
  pass and target it built. Called only from the scene's dispose, before `post.dispose()`.

Hook side (useBassInkScene, BassInkPage):
- The page reads `useEnhancedGraphics()` and passes `enhanced` to the hook, and renders `<EnhancedGraphicsToggle
  status={enhancedStatus} />` in `ControlPanel`'s `header`. The hook takes `enhanced: boolean` (read through a ref) and
  `onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void`, called only on change.
- Wanted = enhanced and not software. The first frame that wants it starts one import (status `'loading'`). On
  resolve: discarded if `signal.aborted`; else built with the current materials and enabled per the current wish
  (status `'ready'` while wanted). Import or build failure: one `console.warn`, status `'error'`, standard look stays,
  no retry until the preference goes off and on again. Not wanted: `setEnabled(false)`, status `undefined`. A software
  renderer never imports the chunk; its status stays `undefined`.
- Density rebuild: `handle.setMaterials(...)` with the new cloud, core and dust materials.

## C4 telemetry columns (bass-ink probe)

Appended after `viewYaw`, in this order: `orbitAngle` (rad), `orbitSpeed` (rad/s), `enhancedActive` (1 when the handle
exists and is enabled, else 0), `renderScale` (the handle's, 1 without one). Existing columns and their order are
unchanged.

## Ownership (one owner per file)

| Task | Owns |
|---|---|
| S0 (orchestrator) | this file, the shared seams above (`inkCloud.ts`, `dustField.ts`, `sprayPool.ts` material field, `bassInkPost.ts` and its spec) |
| T1 bandLevels | `app/features/visualizers/shared/bandLevels.ts` and spec, `trio-color-wave/spectrum.ts` and spec (removed), `trio-color-wave/trioColorWaveSheet.ts` and spec, `bass-ink/spectrumField.ts` |
| T2 enhanced look | `app/features/visualizers/bass-ink/enhanced/**` |
| T3 orbit | `bass-ink/bassInkOrbit.ts` and spec, `bass-ink/bassInkSceneConfig.ts` and spec, `bass-ink/useBassInkScene.ts` and spec, `bass-ink/framing.test.ts` |
| T4 enhanced wiring | `bass-ink/useBassInkScene.ts` and spec (after T3), `bass-ink/BassInkPage.tsx` and spec |
| T5 checks | `e2e/**`, `.size-limit.json`, `docs/agents/architecture.md` |

## S0 debug:viz baseline (pre-change, branch base 4fcd7bb, this machine, headed, 2026-11-27)

`npm run debug:viz -- --dir <main checkout>/.debug-in --track <t> --viz bass-ink` (whole track):

| Track | Rows | Median frame | p95 frame | kicks | sprayBursts | grants | transitions | Verdict |
|---|---|---|---|---|---|---|---|---|
| drums-128.wav (30 s) | 1774 | 16.7 ms | 16.8 ms | 51 | 31 | 44 | 0 | no FALLOFF in 6 windows |
| imyourgirl.wav (34.9 s) | 2069 | 16.7 ms | 16.8 ms | 69 | 67 | 51 | 0 | no FALLOFF in 7 windows |

S5 repeats these with enhanced off (cells within noise) and with enhanced on (same reaction counts within noise,
frame time for AC8 on the user's reference GPU).

## Post-change measurements (orchestrator, this machine, headed, 2026-11-27)

| Track | Mode | Median frame | kicks | sprayBursts | grants | enhancedActive | renderScale |
|---|---|---|---|---|---|---|---|
| drums-128.wav | standard | 16.7 ms | 51 | 32 | 44 | 0 | 1 |
| imyourgirl.wav | standard | 16.7 ms | 69 | 67 | 52 | 0 | 1 |
| imyourgirl.wav | enhanced | 16.7 ms | 69 | 67 | 51 | 1 | 1 |

Reaction counts match the S0 baseline within one event. No console error or warning with enhanced on (the enhanced
shaders compile on this GPU). The builder's first constants gave about 1.6 times the standard light per point and
clipped the cloud to white; the orchestrator retuned the sprite and the second bloom (see `bassInkEnhancedConfig.ts`).
Accepted deviation from C2: `orbit.tilt` is -0.06 (the camera dips at azimuth π), because any rise pushed the flat
formations past the fill at the swing's most face-on tilt (framing.test.ts).

## Amendment BI-F4 (orchestrator, after review, 2026-11-27)

The second bloom's strength is `ENHANCED_BLOOM_STRENGTH * glow`, where `glow` is the Glow control passed through the
new `setGlow` (0 turns the pass off), like the standard bloom. Before this, Glow at 0 still left the second bloom on.
`ENHANCED_BLOOM_STRENGTH` becomes 1.25, so the control's default (0.4) gives the 0.5 the look was tuned at, and full
Glow stays near the standard bloom's 1.2. It still follows no audio or time input: the bloom is a fixed function of
each frame and adds no flash events of its own (flash events stay those BrightnessMix grants), but it does scale their
size above the threshold, as the standard bloom already does. A per-frame luminance measurement of flash amplitude
with enhanced on has not been made (the harness cannot read the canvas per frame); it stays open in BI-F4's notes.
