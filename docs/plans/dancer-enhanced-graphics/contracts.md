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

Rollout flag (D11): dropped. All slices ship in one PR that merges only when complete, so no production user can
see a partial toggle; a constant that is always true at merge would be dead code. Recorded with the user's approval
of the single-PR rollout.

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
"Could not load enhanced assets, using standard". The capability hint (C3, `useCapabilityHint`) renders inside this component while it is off (no prop).
Strings live in a `strings.ts` beside it. No three.js import anywhere on this path.

## C2 EnhancedLook (`app/features/visualizers/dancing-character/enhanced/dancingCharacterEnhanced.ts`)

Only ever reached through `import()` from `useDancingCharacterScene`, only when the preference is on.

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
    onModelChanged(model: THREE.Object3D, bounds: THREE.Box3): void;
    resize(): void;
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
- `onModelChanged(model, bounds)` (bounds added after review finding F1: the model is scaled to 0.001 for its fade-in
  when this runs, so the shadow camera fits `DancingCharacterScene.danceBounds`, the full-size dance box): called from the hook for every character load (after `setCharacter`): sets
  `castShadow` on its meshes, `envMapIntensity` and texture anisotropy on its materials, and fits the key light's
  shadow camera to `bounds` (a margin from config).
- Refinement of plan C2: the plan's `framing` field is dropped because no framing type exists in the repo
  (`computeFraming` returns a distance); the model's bounds are what the shadow camera needs.
- `resize()` (added by the orchestrator after task C): resizes the glass layer's render target to the factor of the
  renderer's current drawing buffer; the hook calls it from the scene's `resize`. A no-op before `apply()` and after
  `dispose()`.
- Club and scene accessors (from task C): `club.materials` ({ tile, seam, cones, frame }), `club.floorSurfaceY`,
  `DancingCharacterScene.keyLight`, `DancingCharacterScene.clubSet`; `DancingCharacterClub` is a type alias of `ClubSet`.
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

## C6 Enhanced asset URLs (`app/features/visualizers/dancing-character/enhanced/enhancedAssetUrls.ts`)

```ts
export interface EnhancedAssetUrls {
    environmentHdr: string;   // 2K RGBE .hdr, lights the scene through PMREM; never shown directly
    skyTexture: string;       // 4K equirectangular LDR (.jpg or .avif, sRGB), mapped on the sky dome
    frame: { map: string; normalMap: string; roughnessMap: string }; // 2K PBR maps (.jpg) for the club frame
}
export const ENHANCED_ASSET_URLS: EnhancedAssetUrls;
```

Every value comes from a Vite `?url` import of a file under `dancing-character/assets/enhanced/`, so only the lazy
enhanced chunk references them and standard mode fetches none. Normal maps are OpenGL convention (`nor_gl`). Each file
is under 20 MiB, the folder totals at most 30 MB, and every file is credited (source URL, license CC0, sha256, any
conversion step) in `dancing-character/assets/CREDITS.md`. The EnhancedLook loads them with `fetch(url, { signal })`
plus `HDRLoader`/`TextureLoader` parsing, so an abort stops the download.

## Ownership (one owner per file)

| Task | Owns |
|---|---|
| A | `app/features/settings/{enhancedGraphicsStore,useEnhancedGraphics,capability,useCapabilityHint}.ts(x)` and specs, `app/components/EnhancedGraphicsToggle/`, `ControlPanel.tsx` and its spec, `LandingPage.tsx` and its spec |
| B | `dancing-character/assets/enhanced/`, `assets/CREDITS.md`, `enhanced/enhancedAssetUrls.ts`, `enhanced/enhancedAssets.test.ts`, `scripts/dancing-character-enhanced/` |
| C | `enhanced/dancingCharacterEnhanced.ts`, `enhanced/dancingCharacterEnhancedConfig.ts` and spec, `dancingCharacterScene.ts`, `dancingCharacterClub.ts` and their specs |
| D | `useDancingCharacterScene.ts`, `DancingCharacterPage.tsx` and their specs, `app/features/settings/{frameRateMonitor.ts,SlowFrameNotice.tsx}` and specs |
| E | `e2e/enhanced-graphics.spec.ts`, docs, budgets |
