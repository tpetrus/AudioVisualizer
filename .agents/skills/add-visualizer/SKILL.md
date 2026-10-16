---
name: add-visualizer
description: Add a new audio-reactive three.js visualizer to AudioVisualizer (route, landing card, page, scene hook, controls, config). Use when asked to create, add, port or scaffold a visualizer or visualization.
---

# Add a visualizer

A visualizer is one folder in `app/features/visualizers/<kebab-name>/` plus a route and a landing card. Copy the
structure of `trio-color-wave/` (simplest) or `cubes/` (resize-dependent layout, extra audio processing). Read
`docs/agents/architecture.md` §3-5 and `docs/agents/conventions.md` first.

Below, `<kebab-name>` = `pulse-rings`, `<camelName>` = `pulseRings`, `<PascalName>` = `PulseRings`.

## Files
```
app/features/visualizers/<kebab-name>/
  <PascalName>Page.tsx          page component
  use<PascalName>Scene.ts       scene hook (three.js wiring)
  <camelName>Controls.ts        control definitions
  <camelName>Config.ts          tuning constants / tables (if any)
  <pure maths>.ts               e.g. spectrum sampling; no three.js, no React
  <camelName><Thing>.ts         classes owning GPU objects / audio nodes (if any)
app/routes/<camelName>Page.tsx  route module
public/visualization-images/<kebab-name>.png   landing thumbnail (4:3)
```

## Steps
1. **Controls**: `<camelName>Controls.ts`
   ```ts
   import type { ControlDefinition, ControlValues } from '~/components/ControlPanel/controls';

   export const <camelName>Controls = [
       { section: 'Response', key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.1, max: 2, step: 0.05, default: 0.6 },
       { section: 'Look', key: 'color', label: 'Color', type: 'color', default: '#8826c7' },
       { section: 'Look', key: 'glow', label: 'Glow', type: 'checkbox', default: true },
       { section: 'Look', key: 'glowAmount', label: 'Glow amount', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, shownWhen: 'glow' },
   ] as const satisfies readonly ControlDefinition[];

   export type <PascalName>ControlValues = ControlValues<typeof <camelName>Controls>;
   ```

2. **Scene content**: put maths in pure functions that write into `out` buffers, and anything creating geometry,
   materials or audio nodes in a class with `update(...)` and `dispose()`. Preallocate everything `update` touches.

3. **Scene hook**: `use<PascalName>Scene.ts`
   ```ts
   import { type RefObject, useCallback, useRef } from 'react';
   import * as THREE from 'three';
   import type { <PascalName>ControlValues } from './<camelName>Controls';
   import { useLatestRef } from '~/hooks/useLatestRef';
   import { useThreeScene } from '~/hooks/useThreeScene';
   import { createOrbitView } from '~/lib/three/orbitView';

   const CAMERA_FOV = 50;
   const CAMERA_DISTANCE = 32;

   interface <PascalName>SceneOptions {
       analyser: AnalyserNode | undefined;
       valuesRef: { readonly current: <PascalName>ControlValues };
       // Locked means the picture can't be dragged, rotated or zoomed.
       cameraLocked: boolean;
       onViewChanged: (changed: boolean) => void;
   }

   // <One sentence on what this visualizer shows.>
   export function use<PascalName>Scene(
       containerRef: RefObject<HTMLElement | null>,
       { analyser, valuesRef, cameraLocked, onViewChanged }: <PascalName>SceneOptions,
   ): { resetView: () => void } {
       // The scene is built once; it reads these through refs so it always sees the current values.
       const analyserRef = useLatestRef(analyser);
       const cameraLockedRef = useLatestRef(cameraLocked);
       const onViewChangedRef = useLatestRef(onViewChanged);
       const resetViewRef = useRef<() => void>(() => { });

       useThreeScene(containerRef, ({ scene, renderer, size }) => {
           const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, 1, 500);
           camera.position.set(0, 0, CAMERA_DISTANCE);   // before createOrbitView: this is the reset position
           scene.background = new THREE.Color(0x000000);

           const orbit = createOrbitView(camera, renderer.domElement, {
               locked: cameraLockedRef.current,
               onViewChanged: changed => onViewChangedRef.current(changed),
           });
           resetViewRef.current = orbit.reset;

           // Create content here (classes, preallocated buffers).
           let boundAnalyser: AnalyserNode | undefined;
           let spectrum = new Uint8Array(0);

           return {
               camera,
               update: () => {
                   const values = valuesRef.current;
                   orbit.setLocked(cameraLockedRef.current);

                   const source = analyserRef.current;
                   if (source) {
                       // A new source: keep the scene and just rebind.
                       if (source !== boundAnalyser) {
                           spectrum = new Uint8Array(source.frequencyBinCount);
                           boundAnalyser = source;
                       }
                       source.getByteFrequencyData(spectrum);
                   }
                   // Update content from `spectrum` and `values` — no allocations here.
               },
               // resize: (size) => { … }   only if layout depends on the aspect ratio
               dispose: () => {
                   orbit.dispose();
                   // dispose content classes / disconnect any analysers you tapped
               },
           };
       });

       const resetView = useCallback(() => resetViewRef.current(), []);
       return { resetView };
   }
   ```

4. **Page**: `<PascalName>Page.tsx` (identical shape to `TrioColorWavePage.tsx`)
   ```tsx
   import { useRef, useState } from 'react';
   import { <camelName>Controls } from './<camelName>Controls';
   import { use<PascalName>Scene } from './use<PascalName>Scene';
   import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
   import { useControlValues } from '~/components/ControlPanel/useControlValues';
   import { useAnalyser } from '~/features/audio/useAudioState';

   export function <PascalName>Page() {
       const containerRef = useRef<HTMLDivElement>(null);
       const analyser = useAnalyser();
       const { values, valuesRef, setValue, resetAll } = useControlValues(<camelName>Controls);
       // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
       const [cameraLocked, setCameraLocked] = useState(true);
       // True once the view has been moved away from its starting position (shows the reset-view button).
       const [viewChanged, setViewChanged] = useState(false);

       const { resetView } = use<PascalName>Scene(containerRef, {
           analyser,
           valuesRef,
           cameraLocked,
           onViewChanged: setViewChanged,
       });

       return (
           <>
               <div ref={containerRef} className="fixed inset-0 overflow-hidden bg-black" />
               <ControlPanel
                   definitions={<camelName>Controls}
                   values={values}
                   onChange={setValue}
                   onResetAll={resetAll}
                   cameraLocked={cameraLocked}
                   onCameraLockedChange={setCameraLocked}
                   viewChanged={viewChanged}
                   onResetView={resetView}
               />
           </>
       );
   }
   ```

5. **Route module**: `app/routes/<camelName>Page.tsx` (default export required here)
   ```tsx
   import { <PascalName>Page } from "~/features/visualizers/<kebab-name>/<PascalName>Page";
   import type { Route } from "../+types/root";

   export function meta({ }: Route.MetaArgs) {
     return [
       { title: "Audio Visualizer - <Title>" },
       { name: "description", content: "" },
     ];
   }

   export default function <PascalName>() {
     return <<PascalName>Page />;
   }
   ```

6. **Register the route** inside the `RequireAudio` layout in `app/routes.ts`, so it's protected:
   ```ts
   layout("routes/requireAudioLayout.tsx", [
     route('/cubes', "routes/cubesPage.tsx"),
     route('/trio-color-wave', "routes/trioColorWavePage.tsx"),
     route('/<kebab-name>', "routes/<camelName>Page.tsx"),
   ]),
   ```

7. **Landing card**: add an entry to `VISUALIZATIONS` in `app/features/landing/LandingPage.tsx` and the thumbnail to
   `public/visualization-images/` (URL `/visualization-images/<kebab-name>.png`, never `/public/...`). Keep the grid in
   step: the "More coming soon" tile fills the last cell.

## Checklist before finishing
- [ ] No React state read inside `update`; everything changing comes through refs.
- [ ] No allocations inside `update`; buffers and scratch objects preallocated.
- [ ] Everything created is freed: mesh classes `dispose()`, tapped analysers disconnected (try/catch), orbit disposed.
- [ ] Audio rebinding handled with `source !== boundAnalyser`; switching source in "Audio settings" keeps the scene.
- [ ] Named exports (except the route module); `~/` imports outside the folder; comments explain why.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] In `npm run dev`: the card enables after choosing a source, the visualizer reacts, controls work (including
      `shownWhen`), lock/reset view work, resize works, navigating away and back 10 times leaves no console errors or
      WebGL-context warnings, and a direct visit without audio redirects to `/`.
