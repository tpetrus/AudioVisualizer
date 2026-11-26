# Enhanced graphics: frozen contracts

Frozen by the verified-diamond orchestrator before any worker starts. Workers implement these exactly; a change to
anything here goes back to the orchestrator. Source: `dancer-enhanced-graphics.plan.json` r1 (hash `ee1b24f732238502`),
C1 to C5, decisions D9 to D11 confirmed by Trevor Petrus on 2026-11-26.

## C1 enhancedGraphicsStore (`app/features/settings/enhancedGraphicsStore.ts`)

```ts
export const ENHANCED_GRAPHICS_KEY = 'audioVisualizer.enhancedGraphics';
// true only when the stored value is exactly the string 'true'; missing, any other value, or storage that throws
// all read as false. Never throws.
export function getEnhancedGraphics(): boolean;
// Writes 'true' or 'false', then notifies every same-tab listener (also when the write throws). Never throws.
export function setEnhancedGraphics(on: boolean): void;
// Calls `listener` after every setEnhancedGraphics in this tab and on every window `storage` event whose key is
// ENHANCED_GRAPHICS_KEY (or null, a clear()). Returns the unsubscribe function, which removes the window listener
// when the last subscriber leaves.
export function subscribeEnhancedGraphics(listener: () => void): () => void;
```

Binding: `app/features/settings/useEnhancedGraphics.ts` exports `useEnhancedGraphics(): boolean`, built on
`useSyncExternalStore(subscribeEnhancedGraphics, getEnhancedGraphics, () => false)`.

Rollout flag (D11): `app/features/settings/enhancedGraphicsFlags.ts` exports
`export const ENHANCED_GRAPHICS_UI: boolean`, `import.meta.env.DEV` until S3, then `true`. When false, neither the
landing toggle nor the panel header toggle renders and the dancer ignores the stored value (renders standard).

## C5 ControlPanel header slot (`app/components/ControlPanel/ControlPanel.tsx`)

`ControlPanelProps` gains `header?: ReactNode`. When given, it renders inside the open panel, above the first control
section and outside the control table; when absent, the DOM is identical to today (other visualizers, their tests
and their visual baselines do not change).

## Shared toggle (`app/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle.tsx`)

```ts
export type EnhancedGraphicsStatus = 'loading' | 'ready' | 'error';
export interface EnhancedGraphicsToggleProps {
    status?: EnhancedGraphicsStatus; // only the dancer panel passes it; the landing page does not
    className?: string;
}
export function EnhancedGraphicsToggle(props: EnhancedGraphicsToggleProps): JSX.Element;
```

Reads and writes C1 through `useEnhancedGraphics`/`setEnhancedGraphics`. A `<button role="switch" aria-checked>`
with the visible label "Enhanced graphics", a visible On/Off state, `aria-describedby` pointing at the description
"Richer lighting, reflections and sky for the dancing character. Needs a strong GPU; downloads up to about 30 MB.",
and an `aria-live="polite"` status line: loading "Loading enhanced assets", ready "Enhanced graphics on", error
"Could not load enhanced assets, using standard". S4 adds the capability hint inside this component (no prop).
Strings live in a `strings.ts` beside it. No three.js import anywhere on this path.

## C2 EnhancedLook (`app/features/visualizers/dancing-character/enhanced/dancingCharacterEnhanced.ts`)

Only ever reached through `import()` from `useDancingCharacterScene`, only when the preference is on and
`ENHANCED_GRAPHICS_UI` is true.

```ts
export interface EnhancedLookContext {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    club: DancingCharacterClub;           // exposes its tile, seam and cone materials read-only for toneMapped=false
    keyLight: THREE.DirectionalLight;     // exposed by DancingCharacterScene
    signal: AbortSignal;                  // the useThreeScene teardown signal
    onStatus: (status: 'loading' | 'ready' | 'error') => void;
}
export interface EnhancedLook {
    apply(): void;
    onModelChanged(model: THREE.Object3D): void;
    dispose(): void;
}
export function createEnhancedLook(ctx: EnhancedLookContext): EnhancedLook;
```

- `apply()`: AgX (or Neutral) tone mapping and sRGB output, PCF soft shadow map, key light `castShadow`; tile, seam
  and cone materials `toneMapped = false`; adds a ShadowMaterial catcher just above the LED floor, a low-opacity
  half-resolution Reflector glass layer (resolution from config) that lets the tiles show through, a sky dome
  (`fog: false`, horizon matching the club fog color) and a PMREM environment (RoomEnvironment at once; the HDR from
  S3 swaps in when loaded). Calls `onStatus('loading')` when asset loads start and `onStatus('ready')` when every
  asset has swapped in (immediately when there are none), `onStatus('error')` plus one `console.warn` on any asset
  failure, leaving the standard-equivalent look in place.
- `onModelChanged(model)`: called from the hook for every character load (after `setCharacter`): sets
  `castShadow` on its meshes, `envMapIntensity` and texture anisotropy on its materials, and fits the key light's
  shadow camera to the model's world bounding box (a preallocated `Box3`, a margin from config).
- Refinement of plan C2: the plan's `framing` field is dropped because no framing type exists in the repo
  (`computeFraming` returns a distance); the model's bounds are what the shadow camera needs.
- `dispose()`: frees every env map, render target, texture, geometry and material it created, including anything that
  resolves after `signal` aborted. It does not restore renderer state (the toggle rebuilds the renderer, D9). The
  club, character and dances are never removed or restructured.
- Tunables (sizes, intensities, opacities, resolutions) live in `enhanced/dancingCharacterEnhancedConfig.ts`.

Hook side (S2): `useThreeScene(containerRef, setup, { antialias: enhanced })` so a toggle rebuilds; the camera pose
(position and orbit target) is kept in a ref across the rebuild; a failed `import()` reports `'error'` with one
`console.warn` and keeps the standard scene; the stored preference is never changed by the scene. The hook takes an
`onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void` option (undefined when standard), and the
page passes the latest status to the panel header toggle.

## C3 detectCapability (`app/features/settings/capability.ts`)

```ts
export interface CapabilityProbe {
    webgl2: boolean;
    maxTextureSize: number;
    renderer?: string;
    deviceMemory?: number;
    hardwareConcurrency?: number;
}
export function detectCapability(probe: CapabilityProbe): boolean;
export function probeCapability(): Promise<CapabilityProbe | undefined>;
```

Required: `webgl2` and `maxTextureSize >= 8192`. Optional fields fail only when present: `deviceMemory < 8`,
`hardwareConcurrency < 8`, `renderer` matching `/swiftshader|llvmpipe/i`. `probeCapability` waits for
`requestIdleCallback` (falling back to `setTimeout`), uses an `OffscreenCanvas` or detached `<canvas>` (never in the
DOM), reads the fields, calls `WEBGL_lose_context.loseContext()`, and resolves `undefined` on any failure. A
`useCapabilityHint(): boolean` hook beside it runs the probe once per page visit (cached) and is what the toggle uses;
the hint shows only while the toggle is off.

## C4 FrameRateMonitor (`app/features/settings/frameRateMonitor.ts`)

```ts
export interface FrameRateMonitorOptions { thresholdFps: number; windowMs: number; warmupMs: number; maxDtMs: number }
export class FrameRateMonitor {
    constructor(options: FrameRateMonitorOptions);
    sample(dtMs: number, hidden: boolean): boolean; // true exactly once per warm-up cycle, when the visible-frame
                                                    // average over the last windowMs is below thresholdFps
    restartWarmup(): void;                          // on every rebuild and every onStatus change
}
export function isSlowNoticeDismissed(): boolean; // module flag, one page visit
export function dismissSlowNotice(): void;
```

Hidden frames and frames with `dtMs > maxDtMs` are ignored and do not count toward warm-up. Fixed-size buffer, no
allocation in `sample`. `SlowFrameNotice.tsx` (role="status", never takes focus, "Switch to standard" and "Dismiss")
renders inside the page's fullscreen wrapper; accept calls `setEnhancedGraphics(false)`, both buttons dismiss.
