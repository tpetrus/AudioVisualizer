# bass-ink-fullness: frozen contracts

Frozen by the verified-diamond orchestrator on 2026-11-26 before any worker started. Base: `feat/bass-ink-fullness`
off `main` 7c4965f. The user asked for bass-ink to feel more "full" and chose three additions: a background dust field
(F1), a small dense core inside the main cloud (F2) and spray thrown off on bass hits (F3). Their tunables are frozen in
`bassInkSceneConfig.core`, `.dust` and `.spray`; a worker that wants a different value reports it and does not edit
the config.

Every path is under `app/features/visualizers/bass-ink/` unless it says otherwise. Nothing under `app/features/audio/`,
`app/features/rhythm/`, `app/lib/three/`, `app/hooks/`, `app/components/` or another visualizer changes. Code follows
`AGENTS.md`: named exports, no per-frame allocation, every GPU object disposed, comments explain why. GLSL comments go
in TypeScript comments above named GLSL pieces, not inside the shader strings (the bundle budget, see
`docs/plans/bass-ink-refine/contracts.md`, "Size budget").

## Shared rules

- **Flash safety (WCAG 2.3.1).** None of the three may change the frame's overall brightness in step with the music.
  Global brightness stays `BrightnessMix`'s job alone.
  - The dust's total light is constant over time: each point twinkles around its own mean with a random phase, and the
    high band changes only the twinkle speed, never its depth or the mean.
  - Spray bursts are at most 3 per second, fade in over `attackSeconds`, and their alpha is scaled by the
    flash-intensity control (0 shows no spray).
- **On screen.** The shell's fit (framing.ts) is unchanged. The core's whole pulse envelope stays inside the shell's,
  and the spray's reach (origin plus travel) stays inside the shell's worst-case extent, both checked by framing tests.
- **Budget.** Point counts scale with the density control and are capped on a software renderer. The core takes its
  points out of the cloud's, so the total drawn stays the same. Dust and spray add at most `pointShare` and `poolSize`.

## C1 DustField (`dustField.ts`, `../meshes/dustShaders.ts`, task D)

```ts
export class DustField {
    readonly object: THREE.Points;
    readonly pointCount: number;
    constructor(pointCount: number, seed: number, maxPointSize: number);
    // Same meaning as InkCloud.setViewport.
    setViewport(heightPixels: number, fovDegrees: number): void;
    // `high` is the scene's followed high-band level (0..1 or so); `palette` the shown palette (linear RGB).
    update(nowSeconds: number, high: number, palette: PalettePair): void;
    dispose(): void;
}
// In ../meshes/dustShaders.ts: the GLSL twinkle factor mirrored in TypeScript for tests. Mean over uniformly random
// `rand` is 1 for any time and speed.
export function dustTwinkle(rand: number, phaseCycles: number, depth: number): number;
export const dustVertexShader: string;
export const dustFragmentShader: string;
```

- Points fill a spherical shell between `innerRadius` and `outerRadius`, uniform in direction, from `hash01`. The whole
  field turns at `driftSpeed`. The twinkle phase advances by `twinkleSpeed * (1 + highGain * clamp(high, 0, 1))` per
  second, integrated on the CPU (a uniform phase, so a speed change never jumps the phase).
- Color: the palette edge mixed toward white by `whiteMix`. Additive blending, `depthWrite: false`, no frustum
  culling. Size attenuates with distance, clamped to `maxPointSize`.
- Test: the mean of `dustTwinkle` over 10000 random `rand` stays within 2 percent of 1 at several phases and depths.

## C2 core (`inkCloud.ts`, `framing.ts`, task C)

```ts
export interface InkCloudOptions {
    swellAmplitude?: number;     // default bassInkSceneConfig.cloud.swellAmplitude
    displacementScale?: number;  // multiplies uWaveAmp, uWaveMax, uSpectrumAmp, uNoiseBase and uNoiseMid; default 1
    alphaScale?: number;         // multiplies uAlpha; default 1
}
// InkCloud's constructor gains an optional fourth parameter `options?: InkCloudOptions`; without it nothing changes.
// framing.ts:
// World extent of the core's pulse envelope for a shell fitted to `shellRadius`, with the core config.
export function coreWorstCaseExtent(shellRadius: number): number;
// Farthest a spray point can reach from the center for that shell: the formation's outermost rest point at
// shellRadius plus speed * dragSeconds.
export function sprayMaxReach(shellRadius: number, formationIndex: number): number;
```

- Framing tests: for every formation and at 16:9 and 4:3, at the fitted radius,
  `coreWorstCaseExtent(radius) <= ` the shell's worst-case world extent, and `sprayMaxReach(radius, i) <= ` the
  same. The existing fit and rest-fill tests stay green.

## C3 SprayPool (`sprayPool.ts`, `../meshes/sprayShaders.ts`, task S)

```ts
// Where bursts come from; InkCloud already satisfies it (restPosition gives the unit rest position, before radius).
export interface RestSource {
    readonly pointCount: number;
    restPosition(index: number, out: Float32Array | number[]): void;
}
export class SprayTrigger {
    // True on a frame that should fire a burst: the swell rose through `arm`, it re-armed below `rearm` since the
    // last burst, and at least minIntervalSeconds have passed. Non-finite input never fires.
    step(swell: number, nowSeconds: number): boolean;
}
export class SprayPool {
    readonly object: THREE.Points;
    readonly capacity: number;
    constructor(capacity: number, seed: number, maxPointSize: number);
    setViewport(heightPixels: number, fovDegrees: number): void;
    // Writes `count` points into the ring: each takes a hashed point of `source`, its origin is that rest position
    // times `radius`, it moves outward along the origin's direction with a little hashed jitter, and starts at
    // `nowSeconds` with `strength` (0..1). Only the written ranges are uploaded (addUpdateRange). No allocation.
    emit(source: RestSource, radius: number, count: number, nowSeconds: number, strength: number): void;
    // `intensity` is the flash-intensity control (0..1); it scales the alpha.
    update(nowSeconds: number, palette: PalettePair, intensity: number): void;
    // Points still alive at the last update, for telemetry and tests.
    readonly liveCount: number;
    readonly burstCount: number;
    dispose(): void;
}
```

- Motion is in the vertex shader: `origin + dir * speed * drag * (1 - exp(-age / drag))`. Alpha follows a linear
  attack over `attackSeconds` and then falls to 0 at `lifeSeconds`, times strength, intensity and `alpha`. Points
  older than `lifeSeconds` or not yet born draw nothing. The same motion and alpha are exported as pure TypeScript
  functions in `../meshes/sprayShaders.ts` (`sprayOffset(age)`, `sprayAlpha(age)`) for tests.
- Color: the palette core. Additive blending, `depthWrite: false`, no frustum culling.
- Tests: the trigger's arm, re-arm and interval, at most 3 bursts in any 1 s on a swell oscillating at 60 fps, the ring
  wrapping, and travel `<= speed * dragSeconds` for any age.

## C4 integration (`useBassInkScene.ts`, task I, after D, C and S)

- Points: the shell gets `round(total * (1 - core.pointShare))`, the core the rest, where `total` is today's
  `pointCountFor(...)`. Dust gets `round(total * dust.pointShare)`, capped at `dust.softwareCap` on a software
  renderer. The spray pool is `poolSize` (`softwarePoolSize` on a software renderer), with `perBurst` or
  `softwarePerBurst`. A density rebuild rebuilds all four.
- The core is an `InkCloud` with the core options, showing `core.formation` and never transitioning. It gets the same
  per-frame calls as the shell (cue, breathing, kick ring, palette, brightness, punch, swell, texture, spectrum) and
  `setRadius(shellRadius * core.radiusScale)` (the shell's world radius, `cloud.radius * fit`) wherever the shell's radius is set.
- The scene steps `SprayTrigger` with the frame's swell and, on a burst, calls
  `spray.emit(shell, shellRadius, perBurst, now, swell)`. The dust gets `update(now, highLevel, paletteShown)`, the
  spray `update(now, paletteShown, values.intensity)`. Every object goes into the scene and is disposed in the
  cleanup. The resize path calls `setViewport` on all of them.
- The core and the spray share the shell's tilt and drift rotation (copy it each frame, or put the three in one
  `THREE.Group` that takes it). Spray origins are in the shell's local, unrotated space, which is what `restPosition`
  returns, so bursts leave from where the shell's points are. The dust does not take the shell's rotation.
- Telemetry: the bass-ink probe appends `sprayBursts` and `sprayLive` at the end; the existing column order is
  unchanged. `docs/agents/debug-harness.md` lists them.

## C5 surface-true spray and a seamless density rebuild (follow-up BIF-F4)

- `InkCloud` gets a getter `surfaceScale`: the factor the vertex shader applies to the rest position on top of
  `uRadius`, computed in TypeScript from the uniforms it already holds:
  `(1 - uTension * uSqueeze) * (1 + uBreathAmp * sin(2 pi uBreath)) * (1 + uPunchAmp * uPunch) * (1 + uSwellAmp * uSwell)`.
  A spec pairs it with the GLSL line (string check) and checks it at rest, full tension and full swell.
- The scene emits a burst with radius `shellRadius * min(1, cloud.surfaceScale)`, read after this frame's `update`,
  `setPunch` and `setSwell`, so bursts leave from where the shell is drawn when it is squeezed. The cap at 1 keeps every
  origin within the rest radius, so `sprayMaxReach` and the framing bound (spray reach at most the shell's worst reach)
  stay as they are. `SprayPool.emit` keeps its signature (C3 is unchanged; only the radius the scene passes changes).
- Density rebuild: the spray pool's size does not depend on density, so the rebuild keeps the existing pool (live
  bursts finish). `DustField` gets `carryFrom(previous: DustField)`, copying the unwrapped phase and the last update
  time, and the rebuild calls it on the new field before freeing the old one, so the twinkle continues without a reset.
