# bass-ink-camera-bands: frozen contracts

Frozen by the verified-diamond orchestrator on 2026-11-26. Items 6 and 7 of the "make it feel full" list: a
section-aware view (V) and color by band (B). Tunables are frozen in `bassInkSceneConfig.view` and `.bands`; a worker
reports a wish for a different value and does not edit them. No new control, so the settings panel does not change.

## C1 ViewSwing (`viewSwing.ts`, wired in `useBassInkScene.ts`, task V)

```ts
export interface ViewAngles { tilt: number; yaw: number } // offsets in radians, added to cloud.tilt and the drift
export class ViewSwing {
    constructor(seed: number);
    // Call every frame with the director's cue. When cue.transitionCount changes, the swing starts easing (smoothstep)
    // from its current offsets to new hashed targets, over cue.transitionSeconds from cue.transitionStart; between
    // changes it holds. `amount` is clamp(cameraDrift / view.fullAtDrift, 0, 1) and scales the output every frame (the
    // targets are unscaled), so amount 0 gives 0 offsets at once. Writes into `out`, no allocation.
    step(cue: Readonly<DirectorCue>, nowSeconds: number, amount: number, out: ViewAngles): void;
}
```

- Targets come from `hash01(transitionCount, seed, salt)`: tilt in [-tiltSwing, +tiltSwing], yaw in
  [-yawSwing, +yawSwing]. The first cue (count 0) holds 0 offsets. Non-finite inputs give 0 offsets and leave the state
  alone.
- Wiring: the scene sets the shell's `rotation.x = cloud.tilt + out.tilt` and `rotation.y = drift + out.yaw`, where
  `drift` is the accumulated drift angle the scene keeps today (keep it as its own number, so the yaw offset never
  accumulates into it). The same applies on the retarget path that resets the rotation today. The core and the spray
  still copy the shell's rotation. The dust does not turn with it.
- Telemetry: the bass-ink probe appends `viewTilt` and `viewYaw` (the offsets) at the end.
- Tests: an ease that starts and ends at the targets and is monotonic, a hold between changes, amount 0 gives 0, the
  same seed gives the same targets, and the offsets stay within the swing bounds.

## C2 band colors (`../meshes/inkShaders.ts`, `inkCloud.ts`, task B)

- Constant uniforms from `bassInkSceneConfig.bands`: `uBassTint`, `uSwellTint`, `uHighTint`, `uHighWhite`.
- Vertex: a new varying `vBass = clamp(push / uWaveMax * uBassTint + uSwell * uSwellTint, 0, 1)` (with `push` from the
  kick-wave piece, before its cap, guarded for `uWaveMax` 0), and a varying `vHigh = (glint > 0 ? uHigh : 0) * uHighTint`,
  clamped to 0..1, using the existing glint selection.
- Fragment: `color` from the core-edge gradient is mixed toward `uCore` by `vBass`, then toward
  `mix(uEdge, vec3(1.0), uHighWhite)` by `vHigh`. Then it is rescaled to the luminance of the original gradient color
  (linear Rec. 709 weights 0.2126, 0.7152, 0.0722; the rescale is skipped when either luminance is below 1e-4), so a
  tint changes the hue only.
- The same color math is exported as a pure TypeScript function `bandColor(base, core, edge, bass, high, highWhite,
  out)` in `../meshes/inkShaders.ts`. A test checks that the luminance is preserved within 1e-6 and that the bounds hold.
- Comments outside the GLSL strings, as in the existing pieces. The shell and the core share the shader, so both get
  the tints. The `InkCloudOptions` `displacementScale` already scales `uWaveMax`, so `push / uWaveMax` stays 0..1 for
  the core.
- Amended at integration: `bands.swellTint` is 0. The swell follows every bass bump with no rate limit and would tint
  the whole cloud at once; with a saturated red core picked, that could become a red flash (WCAG 2.3.1). The uniform
  stays, so a later rate-limited swell tint needs no shader change.
- Amended at integration: `view.yawSwing` is 0.45 (was 0.7), so a full swing turns at most about 0.68 rad a
  second at the smoothstep peak, which reads as a reframe rather than a spin. A config test bounds it, and another pins
  `bands.swellTint` at 0.

## C2a channel cap and red guard (follow-up BCB-F1, `../meshes/inkShaders.ts` only)

- Red guard: before the bass mix, the kick tint is scaled by `kickScale = 1 - smoothstep(0.7, 0.8, redShare)`, where
  `redShare = uCore.r / max(uCore.r + uCore.g + uCore.b, 1e-4)`. With a core whose red share is at least 0.8 (the
  WCAG 2.3.1 saturated-red definition) the kick ring adds no tint at all, so it cannot become a red flash; the ramp
  from 0.7 keeps a blend between palettes from popping. The glint tint is unchanged.
- Channel cap: after the luminance rescale, let `b` be the gradient color and `r` the rescaled tinted color. If any
  channel of `r` is above 1, the result is `mix(b, r, s)` with `s = min over channels with r_k > 1 of
  (1 - b_k) / (r_k - b_k)` (clamped to 0..1). Both endpoints have the same luminance and luminance is linear, so the mix
  keeps it exactly, and every channel ends at most 1 (gradient channels are already at most 1). Where no channel
  exceeds 1 nothing changes.
- `bandColor` keeps its signature and does the same maths, so the specs check: max channel at most 1 (within 1e-6) for
  extreme palettes, luminance preserved within 1e-6 including capped cases, unchanged output where no cap applies, and
  no kick tint for a core with red share at least 0.8.
