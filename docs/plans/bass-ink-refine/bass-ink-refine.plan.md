# Refine the bass-ink visualizer
> Double-diamond plan `bass-ink-refine` revision 1 | status **final** | lane full | risk R1 | base ead045fb29a2 | updated 2026-11-25T20:12:57.832Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> <task>
> -clean up and refine the bass-ink visualization
> </task>
> 
> <context>
> -this visualization was a one-pass creation, so although the base is complete, it needs to be enhanced and refined still
> </context>
> 
> <requirements>
> -update the visualization to fill out more of the full screen size (right now it takes up a small amount of the screen by default)
> -replace the spring/coil visualization with one that makes no sense for viewing from one angle
> -make the bass/tempo work more similarly to the bass bump in cubes. it doesn't need a lock to show bass like the dancing character does
> -make the colors customizable
> -add color spectrum change speed slider
> -(stretch) give the visualization more visual depth. Right now all of the points in the maps makes it overall muddy.  Can we add reflection somehow to add more depth?
> </requirements>
> 
> <scope-and-non-goals>
> -any other visualizations
> -no modifying the audio analyzing hub in any way. if issues or defects are found with it, note them as a takeaway
> </scope-and-non-goals>
> 
> <verification>
> -
> </verification>

## Problem

bass-ink was built in one pass. By default its point cloud fills a small part of the screen, the double-helix formation only reads from one angle, the bass reaction is only visible through the kick ring driven by the learned bass gate (so it feels absent until the gate settles), colors are fixed to a pitch-driven palette with no user control, and the additive, non-depth-written points blend into a flat, muddy mass.

**Users:** Viewer who picks an audio source and watches bass-ink full screen; Maintainer who extends bass-ink and expects it to follow the cubes/trio-color-wave patterns

**Evidence:**
- bassInkSceneConfig.ts: cloud radius 3.4 at camera distance 12, fov 50; helix radius 0.45 and disc thickness 0.06 in bassInkConfig.ts (scout brief)
- useBassInkScene.ts already computes the GATE_BASS_BUMP pulse (lastGateBass) but uses it only for the bass gate and kick ring; cubes draws stepCubesBass(bass, snapshot.gateBass, dt, values) directly with no lock (scout brief)
- bassInkControls.ts has four range controls and no color or speed control; chromaPalette.ts follows pitch class, not time (scout brief)
- inkCloud.ts: THREE.Points with additive blending and depthWrite false (scout brief)

## Goals

- The cloud fills most of the viewport by default at common aspect ratios, without the user zooming
- Replace the double-helix formation with a formation that reads as 3D from every orbit angle
- Drive a visible bass bump from the cubes-style bass pulse every frame, with no dependence on tempo lock or the learned gate
- Let the user pick the palette colors and the speed at which hue cycles, with 0 meaning static
- Stretch: add visual depth and separation so dense regions stop reading as one muddy mass

## Non-goals

- Any change to other visualizers (cubes code may be imported, not modified)
- Any change to app/features/audio/hub/ or app/features/rhythm/; hub defects found become takeaways in docs, not fixes
- Upgrading three.js or adding a postprocessing dependency
- Raising the size-limit or Lighthouse budgets for the core work

## Success metrics

- At 16:9 and 4:3 the default framing has the cloud's projected bounding box covering at least about 70% of the viewport's smaller dimension
- Bass bump visibly moves on the first kicks after audio starts, before any tempo lock (checked with npm run debug:viz on a kick track)
- All CI gates pass unchanged: coverage 95%, size-limit, Lighthouse, e2e (with regenerated bass-ink visual baselines)

## Constraints

- Named exports only; logic in classes and pure functions; per-frame values via valuesRef/refs, never useState
- No per-frame allocation; every new GPU object disposed; StrictMode double-mount safe
- Software WebGL point cap of 8000 (renderBudget.ts) still respected
- Flash limit from the sparkle comment in bassInkSceneConfig.ts (WCAG 2.3.1) still respected by the new bass bump and hue cycling
- Bundle within .size-limit.json (133 kB entry, 339.25 kB total gzip)
- Settings-panel change requires regenerated bassink-settings-panel visual baseline via the Update visual snapshots workflow

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | a fresh visit to /bass-ink with default controls at 1920x1080 and 1024x768 | each formation renders at rest (no bass) | the 95th-percentile projected point radius of each formation spans at least 0.80 of the viewport's smaller half-dimension (unit test computed from the formation's actual points, not from the fit formula), loud peaks may clip at the edge by design, and a manual before/after screenshot per formation confirms it |
| AC2 | the formation set | the replacement for the double helix is generated | no helix remains (code, FORMATION_NAMES, tests, docs), the armillary-rings formation's per-axis extents are within 1.25x of each other and its projected silhouette area from each of the x, y and z axes is at least 0.5 of the largest, and the user confirms the look at the S2 review |
| AC3 | kicks playing with clock.locked false | the gateBass pulse rises | the swell value exceeds 0.3 within 3 frames (unit test on the pure mapping and a hook test with the injected fakes), with no lock or gate input in the code path, and the bass-ink telemetry shows a swell column rising on the first kicks in npm run debug:viz |
| AC4 | the bass-ink control panel | the user changes the palette color pickers | the points use the chosen colors on the next frame, the values persist like other controls, and reset restores the defaults |
| AC5 | the color speed slider | set to 0, then to its maximum | at 0 hues stay fixed; at higher values hue rotates around the palette at a rate proportional to the slider, with no flashing beyond the existing WCAG limit |
| AC6 | the depth slice is shipped | points sit at uDepthNear and at uDepthFar | a unit test on the shader-side maths shows the far point's alpha and size are at most 0.5 of the near point's, a manual before/after screenshot shows near points separate from far ones, and software-WebGL e2e stays within existing timeouts |
| AC7 | the full change | CI runs | format, lint, typecheck, test:coverage at 95%, build, size, Lighthouse and e2e pass, only the bassink-settings-panel baseline is regenerated (S4), and no file under app/features/audio/hub, app/features/rhythm, app/lib/three or other visualizers changes |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How do customizable colors work? | 2-3 palette color pickers; a speed slider rotates hue around the palette; speed 0 keeps colors static. | user |  |
| D2 | What replaces the spring/coil? | Chosen during Develop from ideator options; must read as 3D from any orbit angle. Confirmed at the checkpoint. | user |  |
| D3 | How far does the depth/reflection stretch goal go? | Planned as the last, droppable slice, within the existing bundle-size and performance budgets. | user |  |
| D4 | Which bass signal drives the bump? | The same GATE_BASS_BUMP pulse cubes reads (snapshot.gateBass), stepped through stepCubesBass or an equivalent pure bass-ink step; the kick ring may keep its gate. | repo-fact | Scout: useBassInkScene already computes lastGateBass with GATE_BASS_BUMP; cubesBass.ts is pure and lock-free. |
| D5 | Are postprocessing libraries allowed for depth? | No new dependency; use three.js core and three/addons only, within the bundle budget. | planner assumption (confirm) | Pinned three r186, tight size-limit, no postprocessing anywhere in app/. |
| D6 | Is the framing confirmed? | Yes, goals, non-goals and AC1-AC7 confirmed. | user |  |
| D7 | What form does the bass bump take? | Radial swell outward plus a brightness glow per pulse, then settle. | user |  |
| D8 | What happens to the gate-driven kick ring? | Kept as an extra accent; the new lock-free bump carries bass at all times. | user |  |
| D9 | Is inkShaders.ts shared with other visualizers? | No; only bass-ink/inkCloud.ts and its own tests import it, so changing it stays in scope. | repo-fact | grep for inkShaders under app/ |
| D10 | Which shape replaces the helix? | Armillary rings: three or four thick tilted point rings on different axes, which read as 3D from any orbit angle, let the existing kick waves and spectrum displacement travel visibly along each ring, and do not duplicate the sphere. | planner assumption (confirm) | The user asked for whichever looks best for audio; a standard trefoil is 3:3:1 flat (critic F2) and a nebula duplicates the sphere. The user confirms the look at the S2 review before S3-S5. |
| D11 | Do the color pickers replace the pitch-driven palette? | Replace: the three colors plus the hue phase compute core and edge colors on the CPU into the existing PalettePair; the paletteFrom/To transition fade is kept; the fragment shader is unchanged. | user |  |
| D12 | What does the depth slice include? | Shader depth fade only; the reflection is dropped from this plan and can be planned separately. | user |  |
| D13 | How is the fill achieved without breaking the orbit view? | Scale the cloud via uRadius by a fit factor on mount and resize; the camera and createOrbitView stay untouched, so reset and the moved-view state are unaffected. | planner assumption (confirm) | createOrbitView captures its default position once and has no setter; moving the camera would flip onViewChanged (critic F3) and touch shared lib code. |
| D14 | What drives the swell? | The existing lastGateBass (already GATE_BASS_BUMP-stepped every frame with no lock) mapped by a pure function to swell; glow is granted through BrightnessMix, not a new brightness channel; no second envelope and no stepCubesBass wrapper. | repo-fact | Critic F4/F5: useBassInkScene already computes the pulse; BrightnessMix is the only documented global brightness input. |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | Retune existing constants for framing, swap the helix for a filled Fibonacci-sphere shell plus noise-jittered volume, reuse stepCubesBass and cubes-style color controls, and add fog-style depth fade in the existing point shader. | 5 | 4 | 4 | 3 | 5 | yes | 4.25 |
| O2 | robust | Pure, unit-tested modules for framing, formation, bass step, hue cycling and depth, with GPU state updated only through uniforms, so every AC is verified by tests rather than by eye. | 4 | 4 | 2 | 4 | 4 | yes | 3.6 |
| **O3** (chosen) | experience | Fit the camera to the cloud by maths so it fills ~75% of the smaller viewport side at any aspect, swap the helix for a thick trefoil-knot tube, drive a per-frame swell and glow from snapshot.gateBass, add a Colors section (3 pickers plus a hue-speed slider), and add a shader depth fade so near points read brighter and larger than far ones. | 5 | 4 | 4 | 5 | 5 | yes | 4.55 |

## Decision

**O3**: Fit the camera to the cloud by maths so it fills ~75% of the smaller viewport side at any aspect, swap the helix for a thick trefoil-knot tube, drive a per-frame swell and glow from snapshot.gateBass, add a Colors section (3 pickers plus a hue-speed slider), and add a shader depth fade so near points read brighter and larger than far ones.

O3 scores highest and stays chosen, amended after the critic: the fill comes from scaling uRadius instead of moving the camera (D13), armillary rings replace the trefoil (D10), the swell reuses the existing lastGateBass pulse and glow goes through BrightnessMix (D14), colors compute into the existing PalettePair with no new color uniforms (D11), and the mirror is dropped so S5 is depth fade only (D12).

**Approach:**
- framing.ts: pure fitDistance(radius, fovDeg, aspect, fill=0.75) based on the smaller of the vertical and horizontal half-angles. The scene sets the camera distance from it on mount and on resize. Unit test at 16:9 and 4:3 asserts projected extent >= 0.7.
- formations.ts: remove doubleHelix and add trefoilKnot, a tube of radius about 0.3 around a (2,3) torus knot, normalised to the shared cloud radius. A test asserts the bounding extents on x, y and z are within about 1.5x of each other.
- bassInkBass.ts: pure stepBassInkBass(gateBass, dt, state), reusing stepCubesBass if its output shape fits. It outputs swell (0..1) and glow (0..1) every frame with no lock or gate. Feed it snapshot.gateBass in useBassInkScene. The kick ring keeps its gate (D8).
- inkShaders.ts: add uSwell (radial push along the normalised position) and uGlow (brightness gain, capped so the luminance step stays under the WCAG flash threshold). Add uDepthNear/uDepthFar, which fade alpha and size by view-space z.
- bassInkControls.ts: new 'Colors' section with three type:'color' pickers (defaults are the current palette) and a range 'Color speed' of 0 to 1. The unit is cycles per second, scaled to a maximum of about 0.2 Hz. The label states 0 = static.
- bassInkColor.ts: pure huePhase(t, speed) and sampleGradient(phase, colors, out) write into preallocated THREE.Color objects, with no per-frame allocation. Phase accumulates as speed*dt, so dragging the slider never jumps the colors.
- Optional last slice: a faint mirrored floor using a second draw of the same Points with y flipped and 0.25 alpha. It is droppable (D3).

## Design

Five slices inside app/features/visualizers/bass-ink/ plus meshes/inkShaders.ts, which only bass-ink uses. The camera, createOrbitView, hub and rhythm code are untouched. framing.ts computes a uRadius fit factor from each formation's 95th-percentile point radius, with the worst-case displacement known. formations.ts replaces the double helix with armillary rings. bassInkBass.ts maps the existing lastGateBass to a swell value and a BrightnessMix glow grant. bassInkColor.ts turns three user colors and an accumulated hue phase into core and edge colors written into the existing PalettePair, keeping the transition fade. S5 adds a view-depth fade in the shader.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| framing | fitScale(p95Radius, cameraDistance, fovDeg, aspect, fill) returns the uRadius multiplier, applied on mount and resize; worstCaseExtent(config) sums the breathing, punch, wave and spectrum maxima so clipping on peaks is a documented, tested choice | app/features/visualizers/bass-ink/framing.ts |
| armillary formation | Replaces doubleHelix: seeded points on three or four thick rings tilted on different axes, normalised to unit radius; FORMATION_NAMES, the bassInkTypes comment, the formations test and the debug-harness doc are updated | app/features/visualizers/bass-ink/formations.ts |
| bassInkBass | swellFromBump(lastGateBass, out) is pure and returns swell (0..1, sized below the beatPunch so the effects do not stack) and a glow grant that goes into BrightnessMix | app/features/visualizers/bass-ink/bassInkBass.ts |
| bassInkColor | advanceHuePhase(phase, speed, dt), with speed bounded in cycles per second; writeCustomPalette(colors, phase, outPair) writes core and edge in place into the PalettePair feeding the existing paletteFrom/To fade | app/features/visualizers/bass-ink/bassInkColor.ts |
| Colors controls | A Colors section with colorA, colorB and colorC pickers (defaults are the gradient of current palette 0) and a colorSpeed range from 0 to a bounded maximum (0 = static) | app/features/visualizers/bass-ink/bassInkControls.ts |
| telemetry | Add swell and glow columns to bass-ink's own debug telemetry probe, which lives in the bass-ink feature and not in the hub | app/features/visualizers/bass-ink/ |
| depth fade | uDepthNear/uDepthFar scale alpha and point size by view-space depth | app/features/visualizers/meshes/inkShaders.ts, app/features/visualizers/bass-ink/inkCloud.ts |

### Contracts (freeze before dependent work)

- **C1 fitScale** (function): fitScale(p95Radius, cameraDistance, fovDeg, aspect, fill): number, the multiplier on the uRadius that makes the formation's p95 projected radius equal fill times the smaller half-dimension; also worstCaseExtent(config): number
- **C2 swellFromBump** (function): swellFromBump(lastGateBass: number, out: { swell: number; glow: number }): void; pure, no allocation, no lock or gate parameter
- **C3 Bass-ink control ids** (ui-config): New persisted controls colorA, colorB, colorC (type color, hex defaults) and colorSpeed (type range, min 0, bounded max); the existing four controls are unchanged
- **C4 bassInkColor** (function): advanceHuePhase(phase, speed, dt): number; writeCustomPalette(colors, phase, out: PalettePair): void writes in place
- **C5 S3 shader uniform** (shader-interface): uSwell only (radial push along the normalised position); frozen in S3
- **C6 S5 depth uniforms** (shader-interface): uDepthNear, uDepthFar fade alpha and size by view-space depth

### Data

Control values persist through useControlValues like the existing four; no new storage keys beyond the new control ids.

### UX

The cloud fills about 75% of the smaller side at any window size. The bass swell and glow show from the first kick. The kick ring stays as an accent once the gate learns the beat. A Colors section holds three pickers and a Color speed slider labelled so that 0 means static, and reset restores the defaults.

### Accessibility

Glow goes through BrightnessMix, so the existing global brightness cap bounds it. One combined worst-case unit test (full gate pulse, full sparkle, a BrightnessMix grant, beatPunch) asserts the total luminance step stays under the 10% WCAG 2.3.1 budget in bassInkSceneConfig.ts. The hue speed is bounded in cycles per second. The luminance of user-picked colors is the user's choice and is stated in the control's help text. The new controls must pass the e2e axe check.

### Security and privacy

None; client-only rendering change.

### Observability

npm run debug:viz --viz bass-ink on a kick track: the new swell and glow telemetry columns rise before lock. Any hub or rhythm defect found becomes a takeaway in docs/agents/audio-presentation-audit.md, with no code change there; known notes already include bass-ink.kicks at about 240 ms on lonley and tracker onsets at 49-60 ms median.

### Rollout and rollback

Ships as feat PRs per slice; Cloudflare preview URL for a look; revert by PR. Only the bassink-settings-panel visual baseline is regenerated (S4) via the Update visual snapshots workflow.

## Test strategy

- **Unit:** framing.test.ts: per formation, the p95 projected radius from the real points is >= 0.80 at 16:9 and 4:3; worstCaseExtent comes from the config constants. formations.test.ts: no helix, the armillary per-axis extents are within 1.25x, the silhouette from each axis is >= 0.5 of the max. bassInkBass.test.ts: swell > 0.3 within 3 frames of a pulse with no lock input, decays, stays below beatPunch. A combined flash worst-case test. bassInkColor.test.ts: speed 0 keeps the phase constant, the rate is proportional and bounded, writes go to the same PalettePair instances. Depth: far/near alpha and size ratio <= 0.5. Coverage stays >= 95%.
- **Integration:** useBassInkScene.test.ts with the injected engine and tracker fakes: with clock unlocked, uSwell follows lastGateBass, the PalettePair follows the controls through valuesRef, uRadius refits on resize while the camera position is unchanged, and the StrictMode double mount disposes everything.
- **End-to-end:** npm run test:e2e (visualizer render, controls, WebGL context release, axe); regenerate only the bassink-settings-panel baseline in S4.
- **Manual:** npm run dev: before/after screenshots per formation at two window sizes, orbit the armillary rings 360 degrees, change the colors and speed, check reset, watch the console for WebGL warnings; debug:viz on a kick track before lock.
- **Non-functional:** npm run size within .size-limit.json; Lighthouse unchanged; software-WebGL e2e within existing timeouts.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Loud peaks (breathing, punch, kick waves, spectrum, swell) push the rim past the screen edge after the larger fit | medium | low | worstCaseExtent helper and test; clipping on peaks is accepted and documented, rest-state fill targets 0.80-0.85 |
| K2 | Swell and glow added to the sparkle, punch and grants breach the WCAG flash limit | medium | high | Glow only through BrightnessMix; combined worst-case unit test; bounded hue speed |
| K3 | Armillary rings do not look right in motion | medium | low | User review at S2 before S3-S5; the formation is isolated, so swapping it for a stretched-z trefoil is cheap |
| K4 | Losing pitch-driven colors removes the musical color meaning | medium | low | Decided by the user (D11); the transition fade is kept so formation changes still feel musical |
| K5 | Scaling uRadius changes the kick wave and spectrum displacement proportions | medium | low | Displacements stay in absolute units; tune by eye at S1 and cover with the worstCaseExtent test |
| K6 | Telemetry swell and glow columns need a change in the debug harness outside bass-ink | low | low | If the probe schema lives outside the bass-ink folder, fall back to the hook test plus a manual check, and record it as a takeaway |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Fill the screen: uRadius fit factor from the p95 point radius per formation, applied on mount and resize; camera untouched |  | AC1, AC7 | C1 | R1 | S | app/features/visualizers/bass-ink/framing.ts, app/features/visualizers/bass-ink/framing.test.ts, app/features/visualizers/bass-ink/useBassInkScene.ts, app/features/visualizers/bass-ink/bassInkSceneConfig.ts |
| S2 | Armillary rings replace helix: Remove the double helix everywhere and add the armillary-rings formation; the user reviews the look |  | AC2, AC7 |  | R1 | S | app/features/visualizers/bass-ink/formations.ts, app/features/visualizers/bass-ink/formations.test.ts, app/features/visualizers/bass-ink/bassInkConfig.ts, app/features/visualizers/bass-ink/bassInkTypes.ts, docs/agents/debug-harness.md |
| S3 | Lock-free bass swell and glow: Map the existing lastGateBass to uSwell and a BrightnessMix glow grant; add telemetry columns; the kick ring stays as an accent | S1 | AC3, AC7 | C2, C5 | R1 | M | app/features/visualizers/bass-ink/bassInkBass.ts, app/features/visualizers/bass-ink/bassInkBass.test.ts, app/features/visualizers/bass-ink/useBassInkScene.ts, app/features/visualizers/bass-ink/inkCloud.ts, app/features/visualizers/meshes/inkShaders.ts |
| S4 | Custom colors and speed: Colors section with three pickers and a bounded hue-speed slider writing into the existing PalettePair; regenerate the settings-panel baseline | S3 | AC4, AC5, AC7 | C3, C4 | R1 | M | app/features/visualizers/bass-ink/bassInkControls.ts, app/features/visualizers/bass-ink/bassInkColor.ts, app/features/visualizers/bass-ink/bassInkColor.test.ts, app/features/visualizers/bass-ink/useBassInkScene.ts, e2e/visual.spec.ts-snapshots/bassink-settings-panel-chromium-linux.png |
| S5 | Depth fade: Stretch, droppable: a view-depth fade on alpha and size; the reflection is left for a separate plan | S3 | AC6, AC7 | C6 | R1 | M | app/features/visualizers/meshes/inkShaders.ts, app/features/visualizers/meshes/inkShaders.test.ts, app/features/visualizers/bass-ink/inkCloud.ts, app/features/visualizers/bass-ink/bassInkSceneConfig.ts |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q2 | Should the dropped reflection floor be planned as a follow-up with a real-GPU frame-time check? | user, after S5 ships | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | AC1/S1/C1 is close to circular and may not fix the complaint. bassInkSceneConfig.ts already says the cloud fills about 60% of the height at distance 12 and fov 50. The new target of 0.70-0.75 is only a modest change, and the AC1 unit test checks fitDistance against its own formula, so it passes by construction. The fit uses the bounding sphere (radius 3.4). The formations are not all unit sphere: the helix was 0.45 wide, the disc is thin, and the torus is flat. Soft sprites with soft*soft alpha and the vRadial colour fall-off make the visible mass smaller than the bounding sphere. The trefoil also does not fill a sphere. So 'small amount of the screen' can survive a passing AC1. | Changed: AC1 now measures the p95 projected radius from each formation's real points against a 0.80 target, plus manual before/after screenshots per formation. |
| F2 | high | AC2 and D10 contradict each other. A (2,3) trefoil has centreline extents of roughly 3:3:1 (x:y:z, for example the standard torus-knot form, R=2, r=1), so the planned test 'extents within 1.5x on all three axes' cannot pass for a normalised trefoil without distorting the shape. Seen along x or y it is a flat band, and the torus formation already behaves that way. It would not read as 3D from every angle, which is the point of D2. D10 is a planner-assumption and is only confirmed in the end-of-run summary, while D2 says the shape is confirmed at the checkpoint. S2 therefore ships before the user has seen the shape. | Changed: armillary rings replace the trefoil (D10). AC2 uses a 1.25x extent test and silhouette area from each axis; the user reviews the look at S2. |
| F3 | high | The camera-distance fit conflicts with the orbit view (K5 is rated low impact). createOrbitView (app/lib/three/orbitView.ts) captures defaultPosition once at creation and has no setter. Refitting on resize therefore needs an edit to this shared lib, which is not in any slice's draft_paths and touches other visualizers. Moving the camera after resize also exceeds MOVED_THRESHOLD (0.5), which flips onViewChanged to true, so the reset-view button appears without the user touching anything. If the orbit is unlocked, a refit fights the user's own zoom. | Changed: fill comes from scaling uRadius, and the camera and createOrbitView are untouched (D13). The hook test asserts the camera position is unchanged on resize. |
| F4 | high | The flash budget is not honest (K2 is rated low likelihood). The sparkle comment in bassInkSceneConfig.ts says glints already use about 8% of the 10% budget. BrightnessMix is documented as the only global brightness input (the fragment shader uses (1+uBrightness)). The plan adds a second additive brightness channel (uGlow) plus a radial swell on every kick, on top of the kick ring, beatPunch (9%) and the BrightnessMix grants. Caps and tests per module (C2 and C4 unit tests) do not bound the sum. Kicks at 150-180 bpm approach the 3 per second general flash threshold. With user-chosen colours, a hue cycle between a dark and a bright picker also changes luminance, so a 'max rate' test cannot be written for arbitrary colours. | Changed: glow goes only through BrightnessMix, a combined worst-case flash test is added, the hue speed is bounded, and K2 is raised to medium. |
| F5 | medium | The bass wiring (S3/C2/AC3) duplicates and mis-specifies existing state. useBassInkScene already computes lastGateBass = bump.step(hub.snapshot.gateBass.pulse, dt) with GATE_BASS_BUMP every frame, with no lock condition (it is replaced only on source change). The plan's stepBassInkBass(gateBass, dt, state) wraps stepCubesBass, which needs a BassBump envelope and CubesBassSettings {bassBump, bgPulse}. Bass-ink has neither control and C3 says the existing four controls are unchanged. A second envelope would run beside the first. Bass-ink already has three radial pulses (beatPunch 9%, kick waves up to 1.3 units, spectrum 1.1) and the swell adds a fourth. AC3 ('same frame window as cubes') cannot be measured, because cubes is not in this scene. The telemetry probe has no swell or glow channel, only gateIn (which is already the post-bump value), so the debug:viz check in AC3 has nothing to read. | Changed: a pure swellFromBump maps the existing lastGateBass with no second envelope (D14). AC3 is measurable at 3 frames, and telemetry gets swell and glow columns. |
| F6 | high | The colour design (S4/C3/C4/C5/AC4) skips the real colour pipeline. Today colour comes from director cue.paletteIndex through writePalette, with the paletteFrom/To/Shown fade on each transition, into PalettePair core/edge uniforms mixed by vRadial. The plan adds uColorA/B/C and uHue but never says whether uCore/uEdge, the transition fade and the pitch offset stay. Q1 (replace or offset by pitch) is marked non-blocking and deferred to the S4 review, yet it decides the code shape. K4's 'offset by pitch class, defaults reproduce the current look' conflicts with AC4 ('points use the chosen colors'). A 3-colour gradient also cannot reproduce a per-pitch-class table. C5 is touched in S3, S4 and S5, so the shader contract is not frozen before its dependents. | Changed: the user chose to replace the palette (D11). Colors are written into the existing PalettePair with the fade kept and no new color uniforms. C5 is frozen to uSwell in S3, and S5 has its own C6. |
| F7 | medium | The mirrored floor in S5/AC6 is under-specified and untestable where it matters. There is no floor plane: the cloud is centred at the origin, tilted, rotating, and orbitable. The vertex shader computes the spectrum displacement in screen space relative to the modelView centre and the kick waves from distance to the origin. A y-flipped second Points draw would therefore apply the spectrum mirrored incorrectly (bass at the bottom) and double the 100k additive points on real GPUs. Because it is disabled under the software-WebGL cap, e2e and the visual baselines never exercise it, so the AC6 frame-time check passes vacuously. The plan's own text says the depth fade 'may leave muddiness', and AC6 ('reads distinctly') is subjective. | Changed: the user dropped the mirror (D12). AC6 is a measurable near/far ratio plus screenshots, and the follow-up is Q2. |
| F8 | medium | K1/K5 and the 0.75 fit ignore the existing displacements. Worst case at 3.4 radius: breathing 7%, punch 9%, kick wave up to 1.3 units, spectrum up to 1.1 units on the rim (the sum is about 5 units, or about 1.5x the radius). At 0.75 fill the cloud's rim would pass the screen edge on a loud kick. The planned test 'max swell stays within the viewport' covers only the new swell term, not these. The cloud can therefore clip at the edge on loud kicks, while quiet passages sit at the fill target. | Changed: a worstCaseExtent helper and test are added, and clipping on peaks is accepted and documented (K1). |
| F9 | low | The CI and baseline claims are partly wrong. The plan (test_strategy.e2e, AC7, constraints) says 'regenerate the bass-ink scene baselines' and 'visual baselines'. The only bass-ink file under e2e/visual.spec.ts-snapshots is bassink-settings-panel-chromium-linux.png, and there is no bass-ink mention in e2e/*.ts. So no scene screenshot exists, which means nothing guards the framing or depth look in CI, and only S4 changes a baseline. The slices that touch the scene (S1, S2, S3) list AC7, but their CI gate will not show regressions. Also S2's draft_paths omit formations.test.ts (the helix test at line 98), the FORMATION_NAMES array, the bassInkTypes.ts comment and docs/agents/debug-harness.md (which lists formation 2 as 'double helix'). | Changed: only the settings-panel baseline is regenerated (S4, AC7), and S2's paths include formations.test.ts, bassInkTypes.ts and debug-harness.md. |

## Hand-off

A verified-diamond draft DAG with 5 task(s) and 6 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `11ffc88fe66bea1b`).
