# AudioVisualizer (React)

Audio-reactive 3D visualizations in the browser. The user picks an audio source (screen/tab audio or an input device such
as Stereo Mix), and each visualizer renders a three.js scene that reacts to it. The app was ported from Angular; the
standards below are the ones agreed during that port. Follow them so new code reads like the existing code.

## Commands
| Task | Command |
|---|---|
| Dev server (HMR) | `npm run dev` |
| Type-check (also regenerates route types) | `npm run typecheck` |
| Unit tests (vitest, node environment) | `npm run test` |
| Offline rhythm evaluation over labelled WAVs | `npm run eval:rhythm -- <dataset-dir>` (no args prints usage) |
| Production build (static SPA → `build/client`) | `npm run build` |
| Serve the build locally like production | `npm run preview` (wrangler dev) |
| Deploy to Cloudflare | `npm run deploy` |

Before finishing any change: `npm run typecheck`, `npm run test` and `npm run build` must all pass with no errors. For anything that
renders, also check it in `npm run dev` (see "Verifying changes" below).

## Stack
- **React 19 + React Router 8 in framework mode, SPA (`ssr: false`).** Routes live in `app/routes.ts`; route modules in
  `app/routes/`. Read `.agents/skills/react-router/` before changing routing.
- **three.js 0.141** (pinned; imports from `three/examples/jsm/...`). Do not upgrade it as part of other work.
- **Web Audio API** for capture and analysis. Everything is client-side; there is no server.
- **Tailwind CSS 4** via `@tailwindcss/vite`, entry `app/app.css`. CSS Modules only where a component needs real CSS.
- **TypeScript strict**, path alias `~/` → `app/` (from `tsconfig.json` `paths`).
- **Deploy:** Cloudflare Workers static assets (`wrangler.jsonc` serves `build/client`, SPA fallback for deep links).

## Where things live
```
app/
  root.tsx, routes.ts            app shell (AudioProvider, RhythmProvider) and route table
  routes/                        thin route modules: meta + render a feature page (default export required here)
  features/
    audio/                       AudioEngine (framework-free), storage, React bindings, guard, source dialog
    rhythm/                      tempo / beat / 3-vs-4 meter / song-change tracker: pure DSP modules, worklet, RhythmTracker
    landing/                     landing page, 3D title, visualization cards
    visualizers/<name>/          one folder per visualizer (page, scene hook, controls, config, pure maths, classes)
    visualizers/meshes/          shared mesh classes + GLSL shader strings
  components/                    shared, feature-agnostic UI (ControlPanel, PerformanceStats, RhythmStats)
  hooks/                         shared hooks (useThreeScene, useLatestRef)
  lib/three/                     three.js helpers (disposeScene, createOrbitView)
public/                          static files served from / (fonts/, visualization-images/)
```

## Rules that matter most
Full detail and the reasons are in the docs below; these are the ones most often gotten wrong.
1. **Named exports only.** The only default exports are `app/root.tsx`, `app/routes.ts` and modules in `app/routes/`
   (React Router requires them).
2. **Logic lives outside React.** Audio is the framework-free `AudioEngine`; three.js content lives in classes and pure
   functions. Components and hooks only wire lifecycles and render UI.
3. **Never read React state inside a render loop.** The scene is built once; it reads changing values through refs
   (`useLatestRef`, `valuesRef`). Per-frame values never go into `useState`.
4. **Every resource has an owner that frees it.** GPU objects are disposed, audio nodes are disconnected, timers and
   listeners are cleared, effects return a cleanup. StrictMode double-mounts in dev to catch misses.
5. **No allocation per frame.** Preallocate typed arrays, `Color`s, `Matrix4`s and dummies; update in place.
6. **Reuse the shared pieces** instead of re-implementing them: `useThreeScene`, `createOrbitView`, `disposeScene`,
   `useLatestRef`, `useControlValues` + `ControlPanel`, `useAudio`/`useAnalyser`, `RequireAudio`, `useRhythm` (beat/bar
   phase and counters from `tracker.state`).
7. **Comments explain why**, in plain sentences, above the code they describe. Keep the existing ones when moving code.

## Read before working
- `docs/agents/architecture.md`: how audio, routing, scenes and controls fit together, and the contracts between them.
- `docs/agents/conventions.md`: code style, naming, TypeScript/React/three.js/Web Audio rules, with examples.
- `.agents/skills/add-visualizer/SKILL.md`: step-by-step for adding a new visualizer (the most common task).
- `.agents/skills/react-router/SKILL.md`: React Router framework-mode reference.

Use `app/features/visualizers/cubes/` and `app/features/visualizers/trio-color-wave/` as the reference
implementations; new code should look like them.

## Verifying changes
- `npm run typecheck`, `npm run test` and `npm run build` pass.
- In `npm run dev`: choose an audio source on `/`, open each visualizer, change controls, toggle the camera lock and reset
  view, switch the audio source from the panel's "Audio settings", and navigate away and back several times. The console
  must stay free of errors and of "Too many active WebGL contexts" warnings, and the page should contain one `<canvas>`
  per scene.
- Deploy-affecting changes: `npm run preview`, then load `/`, `/cubes` and `/trio-color-wave` directly by URL.

## Known gaps (don't copy, don't build on)
- **Thin test coverage.** `npm run test` runs vitest in the node environment (`vitest.config.ts`), and only the rhythm
  modules have specs (`app/features/rhythm/*.test.ts`, with synthetic audio in `testSignals.ts`). Some of those use
  `it.fails` to record known tracker weaknesses; fixing one makes its test fail until `.fails` is removed. Nothing yet
  covers the audio helpers (`bands.ts`, `spectrum.ts`, `storage.ts`, `controls.ts`), React components or hooks; `jsdom`
  and Testing Library are installed for those but unused. Run a spec in jsdom with `// @vitest-environment jsdom`.
- **Leftover Tailwind 3 / PostCSS config.** `tailwind.config.js` and `postcss.config.ts` are not used by the Tailwind 4
  Vite plugin. Configure Tailwind in `app/app.css` (`@theme`), not in those files.
