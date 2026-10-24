# AudioVisualizer (React)

Audio-reactive 3D visualizations in the browser. The user picks an audio source (screen/tab audio or an input device such
as Stereo Mix), and each visualizer renders a three.js scene that reacts to it. The app was ported from Angular; the
standards below are the ones agreed during that port. Follow them so new code reads like the existing code.

## Commands
| Task | Command |
|---|---|
| Dev server (HMR) | `npm run dev` |
| Format all files / check formatting (Prettier) | `npm run format` / `npm run format:check` |
| Lint (ESLint, type-aware) | `npm run lint` |
| Type-check the app and `e2e/` (also regenerates route types) | `npm run typecheck` |
| Unit tests (vitest, node environment by default) | `npm run test` |
| Unit tests with coverage (fails under 95%) | `npm run test:coverage` |
| Production build (static SPA → `build/client`) | `npm run build` |
| Bundle-size budget (reads the existing build) | `npm run size` |
| End-to-end tests (Playwright; builds must exist, serves via wrangler) | `npm run test:e2e` (first time: `npm run test:e2e:install`) |
| Only the visual-regression specs (Linux baselines) | `npm run test:e2e:visual` |
| Smoke tests against production (or `BASE_URL`) | `npm run test:smoke` |
| Lighthouse budget on `/` (reads the existing build) | `npm run lighthouse` |
| Offline rhythm evaluation over labelled WAVs | `npm run eval:rhythm -- <dataset-dir>` (no args prints usage) |
| Regenerate the E2E audio fixture | `npm run e2e:fixture` |
| Regenerate the AVIF/WebP card images from the PNGs in `public/visualization-images/` | `npm run images` |
| Re-render the landing title image after changing `scripts/title-banner/` | `npm run title-banner` |
| Check the lockfile for entries Windows npm drops (see "Known gaps"); runs the published `ci-tools` CLI from `tpetrus/ci-workflows`, not a local script | `npm run check:lockfile` |
| Release helper used by the version/release workflows (`check-title`, `expected-version`, `write-version`, ...); lives in `tpetrus/ci-workflows` now and is mainly for the workflows' own internal use (the `release-cli` composite action) — a human only needs this npx form for the rare manual-recovery case under "Versioning and releases" | `npx --yes --package=github:tpetrus/ci-workflows#v0.1.3 ci-tools release <command>` (no args prints usage) |
| Serve the build locally like production | `npm run preview` (wrangler dev) |
| Manual deploy (normally not needed, see "CI and deploys") | `npm run deploy` |

Before finishing any change: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage` and
`npm run build` must pass with no errors. For anything that renders, also run `npm run test:e2e` and check it in
`npm run dev` (see "Verifying changes" below). CI runs all of these on every pull request.

## Stack
- **React 19 + React Router 8 in framework mode, SPA (`ssr: false`).** Routes live in `app/routes.ts`; route modules in
  `app/routes/`. Read `.agents/skills/react-router/` before changing routing.
- **three.js r186** (pinned exactly; addons import from `three/addons/...`). Do not upgrade it as part of other work.
- **Web Audio API** for capture and analysis. Everything is client-side; there is no server.
- **Tailwind CSS 4** via `@tailwindcss/vite`, entry `app/app.css`. CSS Modules only where a component needs real CSS.
- **TypeScript strict**, path alias `~/` → `app/` (from `tsconfig.json` `paths`).
- **Deploy:** Cloudflare Workers static assets (`wrangler.jsonc` serves `build/client`, SPA fallback for deep links).
  Cloudflare Workers Builds deploys every push to `main` to production (https://audio-visualizer.mypoke.workers.dev)
  and every PR branch to a preview URL. GitHub Actions only checks; it never deploys.
- **Tooling:** Node 24 (`.nvmrc`), Prettier, ESLint 9 flat config (`eslint.config.js`), Vitest, Playwright (Chromium),
  size-limit, Lighthouse CI. `.github/workflows/` here holds thin caller workflows; see below for where the actual
  CI/CD logic lives.

This repo's CI/CD is now built on [`tpetrus/ci-workflows`](https://github.com/tpetrus/ci-workflows): the build,
test, release and version-bump logic lives there as reusable workflows and composite actions. Changes to that shared
pipeline behavior belong in that repo, not here — this repo's own `.github/workflows/*.yml` files are now just thin
callers that pass in repo-specific inputs (build directory, shipped-path prefixes, secrets).

**How ci-workflows is pinned.** Every `uses: tpetrus/ci-workflows/...` reference is an exact version tag
(`@v0.1.3`), not a SHA and not a moving `@v1`. Releases are immutable from v0.1.4 on (v0.1.3 predates the setting) and
nobody moves tags. Third-party actions stay SHA-pinned; `.github/zizmor.yml` lets `tpetrus/*` use a ref-pin and keeps
hash-pinning for everything else. Dependabot's github-actions updater bumps exact-tag refs to newer same-precision tags
(for example `v0.1.3` to `v0.1.4`). It never edits `package.json` script strings, so the `ci-tools` ref in
`check:lockfile` and in the `npx` commands in these docs is bumped by hand in the same PR as each ci-workflows `uses:`
bump.

## Where things live
```
app/
  root.tsx, routes.ts            app shell (AudioProvider, RhythmProvider) and route table
  routes/                        thin route modules: meta + render a feature page (default export required here)
  features/
    audio/                       AudioEngine (framework-free), storage, React bindings, guard, source dialog
    rhythm/                      tempo / beat / 3-vs-4 meter / song-change tracker: pure DSP modules, worklet, RhythmTracker
    landing/                     landing page, title banner (a pre-rendered image), visualization cards
    visualizers/<name>/          one folder per visualizer (page, scene hook, controls, config, pure maths, classes)
    visualizers/meshes/          shared mesh classes + GLSL shader strings
  components/                    shared, feature-agnostic UI (ControlPanel, PerformanceStats, RhythmStats)
  hooks/                         shared hooks (useThreeScene, useLatestRef)
  test/                          shared test fakes and helpers (not shipped)
  lib/three/                     three.js helpers (disposeScene, createOrbitView)
public/                          static files served from / (title-banner.*, visualization-images/, _headers)
e2e/                             Playwright specs and fixtures; its own TypeScript program (e2e/tsconfig.json)
  visual.spec.ts-snapshots/      Linux screenshot baselines (regenerate with the "Update visual snapshots" workflow)
scripts/                         node scripts that stay local (rhythm evaluation, smoke-test runner, card images);
                                  the lockfile check and release helper now live in `tpetrus/ci-workflows`
  title-banner/                  landing title scene, font JSON and renderer (`npm run title-banner`)
.github/                         thin caller workflows (the actual CI/CD logic lives in `tpetrus/ci-workflows`) and
                                  Dependabot config
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
- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build` pass.
- `npm run test:e2e` passes (after `npm run build`). It automates the manual checks below in Chromium with a fake
  microphone and software WebGL: every visualizer renders one `<canvas>` and `/` none, controls, camera lock and reset
  view work, the audio source can be switched, round trips to each visualizer release their WebGL context, deep links
  redirect or resume correctly, there are no serious axe violations, and the page logs no errors.
- Still look at it in `npm run dev` when you change how something looks or moves: the tests check that the scene
  renders and doesn't leak, not that it looks right. Choose an audio source on `/`, open each visualizer, change
  controls, and watch the console for errors and "Too many active WebGL contexts" warnings.
- Deploy-affecting changes: `npm run preview`, then load `/`, `/cubes` and `/trio-color-wave` directly by URL; the PR's
  Cloudflare preview URL (posted on the PR) is the same check against the real host.

## CI and deploys
Every pull request runs these checks, and `main` requires them to pass before merging. All of the actual CI/CD logic
runs in the shared [`tpetrus/ci-workflows`](https://github.com/tpetrus/ci-workflows) repo; the files under
`.github/workflows/` here are thin callers that invoke its reusable workflows with this repo's own inputs. The table
below names the calling workflow file in this repo and the job(s) it runs inside the shared repo's reusable workflow.
**Caveat:** GitHub sometimes displays a job from a called reusable workflow under a compound name
(`<caller job> / <inner job>`) rather than the inner job name alone, so the exact string the branch ruleset and PR
checks list may not match what's written here — treat these names as best-effort from reading the workflow files,
not as confirmed, until they're observed on a real PR's checks, and correct this table then.

| Check (calling workflow → job(s) in the shared reusable workflow) | What it gates |
|---|---|
| `ci.yml` → `result` (`tpetrus/ci-workflows`'s `node-ci.yml`) | the one required check: format, lint, typecheck, unit tests with the 95% coverage threshold and the build (`quality`, `build`, `max-file-size`) are never optional; the bundle-size budget (`size`, `.size-limit.json`), the Lighthouse budget (`lighthouse`, `lighthouserc.json`), the sharded Playwright suite (`e2e-plan`/`e2e`/`e2e-result`) and an offline link check (`links`) must each pass or be cleanly skipped. One shared build feeds all of them, replacing this repo's former separate `size.yml`, `lighthouse.yml` and `e2e.yml` |
| `pr-checks.yml` → `pr-title` (`tpetrus/ci-workflows`'s `pr-checks.yml`) | the PR title is a Conventional Commit (see "Versioning and releases") |
| `pr-checks.yml` → `version` (`tpetrus/ci-workflows`'s `pr-checks.yml`) | `package.json` and `package-lock.json` carry the version the title calls for; docs/ci/test titles change nothing that ships |
| `security.yml` → `audit`, `dependency-review` (`tpetrus/ci-workflows`'s `security.yml`) | known-vulnerable production dependencies; risky dependencies added by a PR |
| `codeql.yml` → `analyze` (matrix per language) (`tpetrus/ci-workflows`'s `codeql.yml`) | static security analysis of the TypeScript and the workflows |
| Workers Builds (Cloudflare) | the PR builds and deploys to a preview URL |

After a merge, Cloudflare deploys `main` to production and "Smoke (production)" (`smoke.yml`) runs the `@smoke` tests
against the live site; it also runs daily. If it fails, roll back from the Cloudflare dashboard (Workers →
audio-visualizer → Deployments) or with `npx wrangler rollback`, then fix forward. Never deploy from CI.

When a gate fails:
- **Budgets** (`.size-limit.json`, `lighthouserc.json`): if the growth or score drop is intended, change the limit in
  the same PR and say why in the PR description. Don't loosen a limit to get an unrelated change through.
- **Visual baselines**: a deliberate UI change (including a new visualizer, which adds a settings-panel screenshot and
  changes the landing page) needs new baselines. Run the "Update visual snapshots" workflow on the PR branch from the
  Actions tab, review the committed images in the PR diff, then push any commit (an empty one is fine) so the checks run
  again; the bot's commit doesn't trigger them.
- **Dependencies**: Dependabot opens weekly grouped PRs. It never updates `three`/`@types/three` (pinned), and skips
  majors of `typescript`, `eslint`, `@eslint/js` and `@types/node` on purpose (see the comments in
  `.github/dependabot.yml`).
  Never merge a Dependabot PR with failing checks. The Playwright container image tag is now derived automatically
  from the installed `@playwright/test` version inside `tpetrus/ci-workflows`'s `node-ci.yml` and
  `update-snapshots.yml` reusable workflows, so bumping `@playwright/test` alone is enough; still regenerate the
  baselines afterward.

## Versioning and releases
The version in `package.json` (shown on the landing page) is set by automation from the PR title, and each release is
tagged and published on GitHub. Nobody edits the version by hand, and nothing is ever pushed to `main` by automation,
because every push to `main` is a production deploy.

**PR titles are Conventional Commits:** `type(scope)?!?: description`, for example `fix(audio): stop the meter leaking`.
The merge commit carries the title, so the title is also what the release notes list. Allowed types: `feat`, `fix`,
`perf`, `refactor`, `build`, `chore`, `revert`, `style`, `docs`, `ci`, `test`. The `pr-title` check enforces it.

| Title | Bump |
|---|---|
| any type with `!` before the colon (`feat!:`, `fix(api)!:`) | major |
| `feat` | minor |
| `fix`, `perf`, `refactor`, `build`, `chore`, `revert`, `style` | patch |
| `docs`, `ci`, `test` | none: the version must equal the base branch's |

It is plain semver, including the prerelease: `0.1.0-beta` plus a patch (or a `feat`) is `0.1.0`, and plus a `!` is
`1.0.0`. A `docs`, `ci` or `test` PR must not change anything that ships (`app/**`, `public/**`, `vite.config.ts`,
`react-router.config.ts`, `wrangler.jsonc`, or the `dependencies`/`devDependencies` of `package.json`); the `version`
check fails and asks for a releasing type instead. Dependabot titles are `build(deps): …` / `build(deps-dev): …` and
`ci(deps): …` (configured in `.github/dependabot.yml`), so npm bumps release a patch and action bumps release nothing.

**What the version bot does** (`version-bump.yml` here is a thin caller of `tpetrus/ci-workflows`'s `version-bump.yml`
reusable workflow, which does the work below as a GitHub App so its pushes re-run the checks):
- On every PR event (opened, edited, synchronize, reopened) for a same-repo PR, it computes the expected version from the
  base branch's `package.json` and the title. If the head differs, it commits `chore: set version to X.Y.Z` to the PR
  branch, editing only the version lines of `package.json` and `package-lock.json`. It checks out the base branch for its
  scripts and never runs anything from the PR branch (it runs with secrets under `pull_request_target`).
- On every push to `main`, it merges `main` into each open same-repo PR branch and re-derives the version, since the
  expected version depends on `main`'s current one. A conflict confined to the version lines is resolved by taking
  `main`'s side; any other conflict aborts the merge, leaves one comment on the PR and skips it.
- `pr-checks.yml` (`pr-title`, `version`) then verifies the result. If the bot is down, run
  `npx --yes --package=github:tpetrus/ci-workflows#v0.1.3 ci-tools release write-version <version>` yourself; the failing check
  names the exact version.

**What `release.yml` does:** on every push to `main`, if the tag `v<package.json version>` does not exist, it builds the
release notes from the PR titles merged since the previous tag (Features / Fixes / Performance / Other; docs, ci and test
are left out), creates the tag and a GitHub Release (a pre-release while the version has a prerelease part), and
otherwise exits. To replace the generated notes for a release, add `.github/release-notes/v<version>.md` in the PR.

**One-time setup** (repository admin):
1. Create a GitHub App (Settings → Developer settings → GitHub Apps) with repository permissions Contents: read and
   write, Issues: read and write (the shared `sync-prs` job requests `permission-issues: write`; without it the job
   fails with `The permissions requested are not granted to this installation.`), Pull requests: read and write,
   Workflows: read and write (so merging `main` into a branch that touches workflow files can be pushed), Metadata: read. No webhook is needed. Install it on this repository only.
2. Add its App ID as the secret `RELEASE_APP_ID` and a generated private key as `RELEASE_APP_PRIVATE_KEY`, in both
   Settings → Secrets → Actions and Settings → Secrets → Dependabot (Dependabot-triggered runs read only the latter).
3. In the `main` ruleset, require the `pr-title` and `version` checks and require branches to be up to date before
   merging.

## Testing
Specs sit next to the file they test (`foo.ts` -> `foo.test.ts`). `npm run test:coverage` enforces 95% for lines,
statements, functions and branches over `app/**` (`vitest.config.ts`); keep it green, and write specs rather than
excluding files. Specs run in node by default; DOM specs start with `// @vitest-environment jsdom`. The shared fakes in
`app/test/` (Web Audio, media devices, the three.js renderer, ResizeObserver, injected engine and tracker,
`renderWithProviders`) replace ad-hoc mocks. Some rhythm specs use `it.fails` to record known tracker weaknesses;
fixing one makes its test fail until `.fails` is removed. See "Testing" in `docs/agents/conventions.md`.

End-to-end specs live in `e2e/` and read the visualizer list from `app/features/landing/visualizations.ts`, so a new
visualizer is covered without editing them. Use the fixtures in `e2e/fixtures.ts` (they fail a test on any page error,
console error or WebGL-context warning) and the helpers in `e2e/visualizers.ts`. App code must never import from `e2e/`
(lint enforces it). Tag tests that are safe to run against production, with no audio fixture, `@smoke`. See "End-to-end
tests" in `docs/agents/conventions.md`.

## Known gaps (don't copy, don't build on)
- **`npm install` on Windows can break the lockfile for Linux.** It drops the bundled
  `@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/*` entries, so `npm ci` fails on Linux ("Missing: … from lock
  file"). Run `npm run check:lockfile` after any install on Windows; every workflow runs the equivalent check (via
  `tpetrus/ci-workflows`'s `actions/setup` composite action) before `npm ci`, so CI fails early with the fix printed.
  To repair, take `main`'s copy (`git checkout origin/main -- package-lock.json`) and redo the install, or install on
  Linux/WSL.
- **E2E runs one worker per job.** Software WebGL is CPU-bound, so on a 4-vCPU runner more workers made tests time out
  (measured; see the comment on `workers` in `playwright.config.ts`). Each worker gets its own copy of the fake-microphone
  file (`e2e/fixtures.ts`), which avoids the getUserMedia hang that sharing one file caused on Windows.
