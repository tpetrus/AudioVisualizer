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
    // changes it holds. `amount` is clamp(cameraDrift / view.fullAtDrift, 0, 1) and scales the targets at the time of
    // the change and the output every frame, so amount 0 gives 0 offsets at once. Writes into `out`, no allocation.
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
