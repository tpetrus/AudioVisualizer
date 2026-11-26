# bass-ink-post: frozen contracts (trails and bloom)

Frozen by the verified-diamond orchestrator on 2026-11-26. Items 4 and 5 of the "make it feel full" list: trails
(each moving point leaves a short smear) and bloom (a soft glow around the brightest areas). Tunables are frozen in
`bassInkSceneConfig.post`; a worker reports a wish for a different value and does not edit it.

## Shared hook (orchestrator, done)

`SceneHandle` gains `render?: () => void`. When present, `useThreeScene` calls it after `update` instead of
`renderer.render(scene, camera)`. Nothing else in the hook changes, and other visualizers are untouched.

## C1 BassInkPost (`bassInkPost.ts`)

```ts
export interface PostSettings { trails: number; glow: number } // control values, 0..1
export class BassInkPost {
    // Built once per scene. On a software renderer (`software` true) it never builds a composer, and render() is a
    // plain renderer.render(scene, camera).
    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, size: SceneSize, software: boolean);
    // Per frame, before render(): applies the control values (damp = trails * trailsDampMax; bloom strength =
    // glow * bloomStrengthMax) and turns each pass on or off (a value of 0 is off). No allocation.
    apply(settings: Readonly<PostSettings>): void;
    // Draws the frame: through the composer once built (on a real GPU it is the only path, see below), else plainly.
    render(): void;
    setSize(size: SceneSize): void; // composer and bloom (at bloomResolutionScale) follow the drawing size
    dispose(): void; // the composer, every pass and their render targets
    readonly active: boolean; // true when the last render went through the composer (telemetry and tests)
}
```

- Passes, from `three/addons/postprocessing/`: `RenderPass` → `AfterimagePass` → `UnrealBloomPass` → `OutputPass`.
  The `OutputPass` does the sRGB conversion once at the end. Pixel ratio follows `renderer.getPixelRatio()`.
- Amended after review: the composer blends the additive points in linear light, while a plain render blends them
  after the sRGB conversion, so dense areas look different between the two. On a real GPU every frame therefore goes
  through the composer from the first `apply()`, even with both passes off, so moving a slider to 0 never switches
  paths. Only a software renderer renders plainly.
- When trails switch from off to on, the afterimage's old frame is cleared (or the pass re-created), so a stale frame
  never fades in.
- **Flash safety:** neither the damp nor the bloom strength, radius or threshold follows the music. The afterimage
  is a max, not a sum, so trails never add light; they only slow the fall of a bright frame. Bloom is a fixed,
  monotonic function of the frame, so it cannot add flashes that `BrightnessMix` did not grant. It can make a
  granted flash larger and brighter (a halo past the threshold); WCAG 2.3.1's three-flashes-per-second rule bounds the
  count, which `BrightnessMix` keeps at 3, so that still passes. Measuring the size change on a real GPU is a
  follow-up.

## C2 controls and wiring (`bassInkControls.ts`, `useBassInkScene.ts`)

- Two `range` controls are appended at the end of the `Look` section: `trails` ("Trails", 0..1, step 0.05, default
  0.4) and `glow` ("Glow", 0..1, step 0.05, default 0.4). The existing controls do not change. The settings-panel
  baseline changes, and is regenerated with the "Update visual snapshots" workflow.
- The scene builds one `BassInkPost` after the camera, calls `post.apply({ trails, glow })` at the end of `update`,
  returns `render: () => post.render()` in its handle, calls `post.setSize(size)` in its resize, and
  `post.dispose()` in its dispose. No per-frame allocation: reuse one settings object.
- Telemetry: the bass-ink probe appends one column, `postActive` (1 or 0), at the end.
