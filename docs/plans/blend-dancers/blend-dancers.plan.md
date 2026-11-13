# Blender characters for dancing-character
> Double-diamond plan `blend-dancers` revision 1 | status **final** | lane full | risk R2 | base cd3af30f9bbd | updated 2026-11-12T02:17:15.886Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> <task>
> -determine how feasible it is to add blender .blend files to the dancing-character visualization
> </task>
> 
> <context>
> -here is a list of possible options:
>     -https://blendswap.com/blend/11590
>     -https://blendswap.com/blend/6360
>     -https://blendswap.com/blend/10017
>     -https://blendswap.com/blend/30743
>     -https://blendswap.com/blend/5830
>     -https://blendswap.com/blend/6164
>     -https://blendswap.com/blend/27211
>     -https://blendswap.com/blend/8995
>     -https://blendswap.com/blend/18416
>     -https://blendswap.com/blend/17097
>     -https://blendswap.com/blend/27251
>     -https://blendswap.com/blend/16234
> </context>
> 
> <requirements>
> -determine which files have the correct number of bones (they should all be rigged)
> </requirements>

## Problem

The dancing-character visualizer ships one MakeHuman GLB, and its procedural dance is keyed to 20 MakeHuman bone names (DANCE_REQUIRED_BONES). The user wants several BlendSwap .blend characters selectable in it. Two things are unknown: which of the 12 candidate files have rigs that can drive the dance, and how .blend files get into a browser app that only loads glTF. BlendSwap listings give no bone counts or names. The rigs are not MakeHuman, so without a name map they silently stay in rest pose (buildDanceClip returns null). Most files are Blender 2.6x/2.7x with Blender Internal or Cycles materials, and those do not export cleanly to glTF.

**Users:** Visitors of the dancing-character visualizer who want to pick which character dances; The maintainer, who needs a repeatable, verifiable way to qualify and convert new Blender characters

**Evidence:**
- context-brief.md: one GLB, 163 bones, 20 required bone names, null clip means rest pose with no error
- dancingCharacterConfig.ts: DANCE_REQUIRED_BONES is root, spine01-05, clavicleL/R, upperarm01L/R, lowerarm01L/R, upperleg01L/R, lowerleg01L/R, footL/R, neck02, head
- app/components/ControlPanel/controls.ts: ControlDefinition is range, checkbox or color only; there is no select control
- BlendSwap listing pages for all 12 candidates (read 2026-11-11): every one says rigged, none states bone count or bone names; licenses CC-BY or CC0

## Goals

- Produce a per-file qualification report for all 12 candidates: Blender version, armature present, bone count, bone names, and whether each of the 20 required bones maps to a source bone
- Convert each qualifying, license-acceptable candidate from .blend to an optimized GLB with a repeatable script and a CREDITS entry
- Let visitors choose the dancing character from the settings panel, with the existing MakeHuman dancer as the default
- Every selectable character performs the existing procedural dance through a per-model bone-name map

## Non-goals

- Loading .blend files in the browser at runtime (three.js has no .blend loader; conversion happens offline)
- Hand re-rigging or re-skinning meshes that fail the 20-bone mapping (automatic dummy spine/neck bones at export are in scope)
- New dance choreography or per-character dance styles (rest-pose and bone-roll normalization in convert.py is in scope)
- Persisting control values across reloads (no control persists today)
- Upgrading three.js or adding DRACO/KTX2 decoders unless a size check shows it is needed
- Clearing trademark or copyright rights for fan-art characters (the user accepted that risk)

## Success metrics

- All 12 candidates have a recorded strict and relaxed verdict (qualifies / fails with the missing or non-skinned bones listed)
- Each shipped character GLB is at most 3 MB
- No shipped character stays in rest pose or breaks the pose checks: the registry test passes for every entry
- At least 2 characters besides MakeHuman pass the relaxed verdict and the pose checks; otherwise the picker (S4) is not built and the feasibility verdict is recorded instead

## Constraints

- three.js r186 pinned; GLTFLoader is the only model path (AGENTS.md, dancingCharacterAssets.ts)
- Only CC-BY and CC0 files; CC-BY authors credited in assets/CREDITS.md and in the app
- Named exports only, logic outside React, no React state in the render loop, no per-frame allocation, dispose every GPU resource (AGENTS.md rules 1-5)
- Coverage stays at 95% or more over app/**; visual baselines regenerated through the Update visual snapshots workflow
- Blender runs only offline on the maintainer's machine; CI never needs Blender (committed GLBs are the artifacts)
- BlendSwap downloads: 7 free per day for the account; licenses are uploader-declared

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the 12 candidate .blend files downloaded into a local folder | the maintainer runs inspect.py on the folder with --factory-startup and --disable-autoexec | a report lists for each file its Blender version, armatures, bone count and names, and for each of the 20 required bones the matched source bone or 'missing', its deform flag and whether any skinned mesh has weights on it, plus name collisions; it ends with a strict verdict (all 20 distinct) and a relaxed verdict (missing spine/neck bones filled by dummies), and flags rigid bone-parented meshes and textureless materials |
| AC2 | a candidate that passes the relaxed verdict and is CC-BY or CC0 | convert.py runs on it with its bone map | a GLB of at most 3 MB is written under assets/ with the 20 names present on SkinnedMesh skeletons, and CREDITS.md gets its sha256, source URL, author, license with version, snapshot date, a 'modified: converted, bones renamed, materials rebuilt' note and any trademark note |
| AC3 | the character registry | the registry unit test loads each GLB and samples its dance clip | the clip has tracks for all 20 bones; knees bend forward, hands stay outside the torso box, foot height drift stays within the tolerance used for MakeHuman, and the measured height is within 10% of NOMINAL_CHARACTER_SIZE; a model missing a bone fails the test naming it |
| AC4 | a visitor on /dancing-character | they open the settings panel and pick another character | the previous model is disposed, the chosen one loads and dances on the beat, and a reload starts again with the default like every other control |
| AC5 | a visitor who never touches the character control | the page loads | the existing MakeHuman dancer appears exactly as before, and the e2e suite passes with no WebGL-context warnings across character switches |
| AC6 | a selected CC-BY character | the settings panel is open | the character's title, author, license and a 'modified' note are shown as an attribution line |
| AC7 | a ControlDefinition list with a select entry | ControlPanel renders it and the user picks an option | a labelled native select shows the options, the value updates through useControlValues, and the reset button restores the default |
| AC8 | a registry character whose clip cannot be built or whose GLB fails to load | a visitor selects it | the default character is restored, the select shows the default again, the status line names the problem, and a console error lists the missing bones |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | How may the 12 files be researched? | Listing metadata first, then downloads where the metadata does not settle the rig | user | Listings state 'rigged' but never bone names, so downloads are needed for every file |
| D2 | What is the end goal? | Selectable characters, with the current one as the default | user | More value than a single swap |
| D3 | Which licenses are acceptable? | CC-BY and CC0 only, with credit | user | Public site; all 12 listings are CC-BY or CC0 so none is excluded by license |
| D4 | What counts as correct bones? | A rig qualifies when each of the 20 DANCE_REQUIRED_BONES maps to a distinct source bone; a per-model name map does the retarget | user | Bone count is not enforced in code; the 163 figure is only a test pin for the vendored MakeHuman file |
| D5 | Are fan-art characters of trademarked IP acceptable? | Yes, with author credit and a note naming the trademark owner | user | Free, non-commercial hobby site; the user accepts the risk |
| D6 | How are bones inspected? | Headless Blender (blender --background --python) on the maintainer's machine | user | Blender is installed locally |
| D7 | Does the browser load .blend directly? | No; .blend is converted offline to GLB and the GLB is committed | repo-fact | dancingCharacterAssets.ts uses GLTFLoader only; three.js r186 has no .blend loader |
| D8 | Do the current listings show bone counts? | No. All 12 pages say rigged; none states bone count or names | repo-fact | Read from the BlendSwap listing pages on 2026-11-11 |
| D9 | Which candidates are likely to qualify before inspection? | Likely humanoid bipeds: 11590 Mr Incredible, 10017 Wario, 5830 C-3PO, 27211 Cute Cartoon Character, 18416 Gallade, 17097 Plankton, 16234 Mario. Doubtful: 6164 Steve (Minecraft rigs usually lack elbows, knees and a spine chain), 8995 monster (simple rig). Unlikely: 30743 Kirby, 27251 Among Us, 6360 Pikmin (no humanoid limbs, or five characters in one file) | planner assumption (confirm) | Inferred from titles, descriptions and typical rigs; the inspection script in S1 replaces this guess with facts |
| D10 | Does the character choice persist across reloads? | No; it resets like every other control (no control persists today) | user | useControlValues is plain useState; persistence would be new, cross-visualizer work |
| D11 | How are rigs with fewer than five spine bones or no neck02 handled? | convert.py inserts zero-weight dummy bones into the chain between mapped neighbors so all 20 names exist; rotations still propagate to children. inspect.py reports a strict and a relaxed verdict | user | A strict rule would fail nearly all candidates |
| D12 | Is the copyright risk of fan-art characters acceptable? | Yes, but the original Cute Cartoon Character (27211) is the pilot and ships first; fan-art characters follow with modified and trademark notes | user | Gives the picker a safe core; user accepts the takedown risk |
| D13 | Control persistence exists? | No; useControlValues.ts holds values in useState(defaultValues) | repo-fact | Read in useControlValues.ts line 7 |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | minimal | One headless Blender script inspects and converts the candidates, a static TypeScript registry holds per-model bone maps, and a bone-name remap at load time lets the existing dance and a small select control work unchanged. | 4 | 3 | 4 | 3 | 4 | yes | 3.6 |
| O2 | robust | Data-driven character registry with per-model bone maps validated at three layers (offline inspect, offline convert, unit test), a generic retargeting resolve step in the scene, and a select control with attribution. | 4 | 4 | 2 | 4 | 4 | yes | 3.6 |
| O3 | contrarian | Move the retarget out of the runtime: a Blender script renames each source bone to the 20 MakeHuman names (and normalizes scale/orientation) before export, so every shipped GLB already satisfies DANCE_REQUIRED_BONES and the app needs only a model registry and a select control. | 5 | 3 | 4 | 3 | 4 | yes | 3.9 |
| **O4** (chosen) | hybrid | Hybrid of O3 and O2. Blender renames each qualifying rig's bones to the 20 MakeHuman names at export, so the runtime dance stays unchanged (O3). Each per-model bone map is committed and unit-tested. The registry carries framing and material fields, and missing bones are a loud, named error with fallback to the default (O2). A pilot conversion acts as a go/no-go gate before any UI work. | 5 | 4 | 3 | 4 | 4 | yes | 4.1 |

## Decision

**O4**: Hybrid of O3 and O2. Blender renames each qualifying rig's bones to the 20 MakeHuman names at export, so the runtime dance stays unchanged (O3). Each per-model bone map is committed and unit-tested. The registry carries framing and material fields, and missing bones are a loud, named error with fallback to the default (O2). A pilot conversion acts as a go/no-go gate before any UI work.

O4 keeps O3's single runtime name contract: bones are renamed at export, so the dance code is untouched. It adds O2's safety: maps are committed and tested, failures are loud and fall back, and the swap path has a contract. After the critic, convert.py also normalizes rest pose and roll, and fills spine gaps with dummy bones (D11). Measurable pose checks replace the subjective pilot judgment. O1's runtime rename hides the map from offline checks; O2's runtime resolve layer duplicates what export-time renaming gives.

**Approach:**
- inspect.py (blender --factory-startup --disable-autoexec --background --python): per .blend report version, armatures, bones, the 20 required matches with deform flag and vertex weights, collisions, rigid parented meshes, textureless materials; strict and relaxed verdicts (AC1)
- Bone maps as reviewed JSON next to the assets, 20 required names to distinct source bones or 'dummy' for spine/neck gaps
- convert.py: two-pass rename with a collision check against all bone names, insert dummy chain bones, normalize rest pose and bone roll to MakeHuman's A-pose axes, normalize height, export GLB, fail over 3 MB or on any missing name; BI materials need a manual Principled rebuild documented per model (AC2)
- Pilot gate on 27211 Cute Cartoon Character: load it in dev through a DEV-only ?character=<id> query parameter and pass the AC3 pose checks before any UI work
- characterRegistry.ts: {id, title, author, license, licenseVersion, sourceUrl, trademarkNote, url, bodyMaterialNames}; MakeHuman is entry 0 and the default; setCharacter takes bodyMaterialNames
- Swap contract: the hook owns a per-load AbortController and request token; setCharacter returns whether it danced and which bones are missing; failure restores the default (AC8)
- A select variant in ControlDefinition and ControlPanel, no persistence (AC7, AC4); attribution line with the modified note (AC6)
- Tests: registry pose and height checks, bone-map completeness, stale-load and dispose tests, e2e character switching, regenerated baseline (AC3, AC5)

## Design

An offline Blender pipeline (inspect, then convert) turns qualifying .blend files into GLBs that already use the 20 MakeHuman bone names. A typed registry lists the shipped characters; a new select control picks one; the scene swaps models through the existing loadDancingCharacterAssets urls seam, disposing the old one.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| inspect.py | Per-file bones, skinning, collisions, materials, strict and relaxed verdicts | scripts/blender-characters/inspect.py |
| convert.py | Rename, dummy bones, rest and roll normalization, height, GLB export, size gate, CREDITS entry | scripts/blender-characters/convert.py |
| bone maps | Per-model JSON from MakeHuman name to source bone or dummy | app/features/visualizers/dancing-character/assets/bone-maps/ |
| characterRegistry.ts | CHARACTER_REGISTRY, DEFAULT_CHARACTER_ID, attribution and bodyMaterialNames | app/features/visualizers/dancing-character/characterRegistry.ts |
| select control | Generic dropdown in ControlPanel | app/components/ControlPanel/ |
| scene and hook | Swap model on selection, abort stale loads, dispose, fall back on failure | app/features/visualizers/dancing-character/useDancingCharacterScene.ts |
| CharacterAttribution | Title, author, license, modified and trademark note | app/features/visualizers/dancing-character/CharacterAttribution.tsx |

### Contracts (freeze before dependent work)

- **C1 Select control** (TypeScript type): SelectControl { section, key, label, type: 'select', options: readonly {value: string, label: string}[], default: string } added to the ControlDefinition union; ControlValue includes string; isModified compares strings; no persistence
- **C2 CharacterEntry registry** (TypeScript type): CharacterEntry { id, title, author, license: 'CC0' | 'CC-BY', licenseVersion, sourceUrl, trademarkNote?, url, bodyMaterialNames: readonly string[] }; CHARACTER_REGISTRY readonly array; DEFAULT_CHARACTER_ID = 'makehuman'
- **C3 Bone-map JSON** (file format): { id, source: url, map: { <each of DANCE_REQUIRED_BONES>: <source bone name> | 'dummy' } }; 20 keys; non-dummy values distinct; 'dummy' allowed only for spine01-05 and neck02
- **C4 Blender scripts CLI** (CLI): blender --factory-startup --disable-autoexec --background --python inspect.py -- <dir> --out <report.json>; blender --factory-startup --disable-autoexec --background <file.blend> --python convert.py -- --map <bone-map.json> --out <file.glb> --max-mb 3; both assert use_scripts_auto_execute is False and print the Blender version
- **C5 Character swap** (TypeScript API): setCharacter(model, bodyMaterialNames) returns { danced: boolean, missing: string[] }; the hook keeps one AbortController and an increasing request token per load, ignores late results, disposes the previous model, and on failure restores DEFAULT_CHARACTER_ID in the control values and sets a status message

### Data

GLBs and bone maps are committed under app/features/visualizers/dancing-character/assets/; .blend sources stay out of git (downloaded locally). The selected character id is persisted with the other control values.

### UX

A 'Character' select at the top of the settings panel; the MakeHuman dancer is the default and comes back on reload. While a model loads the old one stays. On failure the default returns with a short status message. An attribution line shows title, author, license, a 'modified' note and any trademark note.

### Accessibility

Native select element with a label, keyboard operable; attribution is plain text; axe e2e check stays clean.

### Security and privacy

No new network origins: GLBs are same-origin hashed assets. Third-party .blend files never reach the browser. .blend files can embed Python, so the scripts always run with --factory-startup --disable-autoexec and assert auto-run is off before opening a file.

### Observability

A console error naming the model and its missing bones when a clip cannot be built; the e2e fixtures fail on console errors, so this is caught in CI.

### Rollout and rollback

Slices land behind the default: until S4 the registry only feeds the DEV-only query parameter, so users see no change. S4 is built only if the success-metric minimum (2 extra characters) is met. Each further character is a data-only PR. Rollback: Cloudflare rollback or removing the registry entry; removed GLBs remain in git history (accepted, D12).

## Test strategy

- **Unit:** Registry test per GLB: 20 names on SkinnedMesh skeletons, clip tracks for all 20, sampled pose checks (knee direction, hands outside torso box, foot drift) and height within 10%; bone-map completeness and dummy rules; select control tests; setCharacter result for a model missing a bone.
- **Integration:** Hook test with the fake renderer: switching ids disposes the previous model, a late-resolving stale load is ignored, and failure restores the default id.
- **End-to-end:** Extend the dancing-character spec to switch through every registry character, with no console errors or WebGL-context warnings; regenerate the settings-panel visual baseline.
- **Manual:** npm run dev: watch each character dance to a track; check framing, limb twist and materials. Run inspect.py on all 12 files and review the report.
- **Non-functional:** convert.py enforces at most 3 MB per GLB; npm run size and lighthouse stay green (the GLB is outside the JS budget and / is unchanged).

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Bone roll and rest orientation differ from MakeHuman, so the clip twists limbs wrongly even with correct names | high | high | convert.py normalizes rest pose and roll to MakeHuman's A-pose axes; AC3 pose checks make it measurable per model; the pilot (S2) must pass them before UI work, else the verdict is 'not feasible without re-rigging' |
| K2 | Few candidates qualify even with dummy spine bones (Steve, Kirby, Among Us, Pikmin, monster likely lack elbows, knees or clavicles) | high | medium | Strict and relaxed verdicts in the S1 report; minimum of 2 extra characters before S4 is built |
| K3 | Blender 2.6x/2.7x Blender Internal materials load flat or textureless in current Blender; there is no automatic converter | high | medium | inspect.py flags textureless output; manual Principled rebuild per model, recorded in CREDITS regeneration steps; per-model visual acceptance in S5 |
| K4 | A .blend file embeds a malicious Python script | low | high | --factory-startup --disable-autoexec on every call, and an assertion that auto-run is off |
| K5 | BlendSwap's 7 free downloads per day stretch inspection over two days | high | low | Download the likely candidates (D9) first |
| K6 | Copyright or trademark takedown of fan-art characters; files remain in git history | low | medium | Accepted (D5, D12); original character ships first; removal is a data-only change |
| K7 | Meshes are rigid pieces parented to bones, not skinned, so collectBones finds no skeleton | medium | medium | inspect.py flags it and the file fails both verdicts |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Inspect the 12 candidates: Precondition: the maintainer downloads the 12 files (7 per day free, likely candidates from D9 first). Write inspect.py and run it on them; commit the report with strict and relaxed verdicts per file. This answers which files have the right bones. |  | AC1 | C4 | R1 | S | scripts/blender-characters/inspect.py, scripts/blender-characters/README.md, docs/blender-characters/candidate-report.md |
| S2 | Pilot conversion and go/no-go: Write convert.py (rename, dummy bones, rest and roll normalization), the bone-map format and the registry with MakeHuman plus the pilot 27211, its CREDITS entry, a DEV-only ?character=<id> loader and the AC3 tests. Go only if the pilot passes the pose checks; a no-go stops here with the feasibility verdict. | S1 | AC2, AC3 | C2, C3, C4 | R2 | L | scripts/blender-characters/convert.py, app/features/visualizers/dancing-character/characterRegistry.ts, app/features/visualizers/dancing-character/characterRegistry.test.ts, app/features/visualizers/dancing-character/assets/bone-maps/, app/features/visualizers/dancing-character/assets/CREDITS.md |
| S3 | Select control kind: Add the select variant to ControlDefinition and ControlPanel with persistence and tests, unused by any visualizer yet. |  | AC7 | C1 | R2 | S | app/components/ControlPanel/controls.ts, app/components/ControlPanel/ControlPanel.tsx, app/components/ControlPanel/controls.test.ts |
| S4 | Character picker and attribution: Built only if at least 2 extra characters qualify. Wire the Character select, implement the C5 swap path with abort, dispose and fallback, show attribution, extend e2e and regenerate the baseline. | S2, S3 | AC4, AC5, AC6, AC8 | C1, C2, C5 | R2 | M | app/features/visualizers/dancing-character/dancingCharacterControls.ts, app/features/visualizers/dancing-character/useDancingCharacterScene.ts, app/features/visualizers/dancing-character/dancingCharacterScene.ts, app/features/visualizers/dancing-character/CharacterAttribution.tsx, e2e/ |
| S5 | Convert remaining qualifying characters: Convert every other candidate the S1 report qualifies, one registry entry, bone map, GLB and CREDITS entry each, with tests green. | S4 | AC2, AC3 | C2, C3 | R1 | M | app/features/visualizers/dancing-character/assets/, app/features/visualizers/dancing-character/characterRegistry.ts |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q2 | Should the 3 MB per-GLB cap be enforced in CI by a test, or only by convert.py? | maintainer | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | AC4 says the character choice 'survives a reload like the other control values', and C1/S3 promise 'persistence'. In the repo no control value persists: useControlValues.ts is plain useState(defaultValues), and localStorage is used only by app/features/audio/storage.ts. The premise is false, so AC4 is either unsatisfiable as written or S3 silently grows into building persistence for the whole ControlPanel (with validation of stored ids, which O4 mentions as 'unknown stored ids fall back'). S3 is also sized S with no persistence design. | User decided no persistence (D10); AC4, C1 and non-goals updated. |
| F2 | high | The dance is tuned to MakeHuman bone-local axes, signs and absolute amplitudes (dancingCharacterDanceClip.ts: knee bends on negative local Z, arm lift positive X on L / negative X on R, ARM_LOWER 0.6 assuming a ~38 degree A-pose, ELBOW_RELEASE 0.9 assuming forward-pointing forearms, ROOT_DROP 0.05 m, foot counter-rotation keyed to the same Z axis). Renaming bones at export (O4) fixes names only; a T-pose rig or a Blender rig with different bone roll will fold knees backwards, cross arms through the torso or float the feet. K1 is rated high/high, yet the mitigation is one subjective pilot ('watch it dance'), the non-goal forbids per-character dance tuning, and AC3 only asserts that tracks exist for 20 names, so it passes for a visibly broken dance. A pilot passing for one rig also says nothing about the other rigs. | Rest-pose and roll normalization added to convert.py; measurable pose and height checks in AC3; pilot must pass them; S2 re-sized L. |
| F3 | high | D4 requires all 20 names to map to distinct source bones, including five spine bones (spine01-05), neck02 and head, plus both clavicles. Typical Blender character rigs have 1-3 spine bones and one neck bone, so under D4 most or all of the 12 candidates will fail, and the 'ship the qualifying subset (likely 2-4)' expectation is optimistic. Q1 (what to do with fewer than five spine bones) is marked non-blocking, but it decides the S1 verdicts and therefore whether the picker ever has more than one real option. D9's 'likely to qualify' list is a planner-assumption inferred from titles. | User decided dummy spine/neck bones (D11); strict and relaxed verdicts in AC1; minimum of 2 extra characters gates S4; Q1 removed. |
| F4 | high | Qualification (AC1/D4) checks bone names only. The scene collects bones solely from THREE.SkinnedMesh skeletons (dancingCharacterScene.ts collectBones), so a rig whose meshes are bone-parented rigid pieces (plausible for Wario, Mario, C-3PO, Pikmin-style models) exports as non-skinned meshes and yields a null clip even with all 20 names. Also unaddressed: mapped bones may be non-deform control bones with no vertex weights; and renaming a source bone to e.g. 'head' or 'root' when an unmapped bone already has that name makes Blender silently append '.001', which GLTFLoader then sanitizes to a wrong name. C3's 'distinct values' check does not cover collisions with unmapped bones. | AC1 reports deform flags, vertex weights, collisions and rigid meshes; convert.py renames in two passes with a collision check; K7 added. |
| F5 | medium | K3/convert.py assume 'convert materials to Principled with textures at most 1024 px' can be automated. Blender 2.8+ has no Blender Internal to Principled converter and drops BI texture slots on load, so for the 2.6x/2.7x majority the result is flat-colored or textureless meshes, which is a manual per-model rebuild rather than a script flag. Impact is rated medium, but flat Mario/Wario models may be unacceptable to the user. The installed Blender version is never pinned or recorded in the plan. | fixed: manual BI material rebuild documented in K3 and O4; textureless flag in AC1; Blender version printed per C4. |
| F6 | medium | The character-swap mechanism has no contract. useDancingCharacterScene builds the scene once inside useThreeScene and calls loadDancingCharacterAssets(signal) with the scene-lifetime signal; settings are read through valuesRef inside the render loop. The plan does not say how a selection change is detected (effect vs per-frame comparison), where the per-load AbortController lives (a scene-lifetime signal cannot cancel a stale load), what happens to the 'loading'/'modelFailed' status during a switch, or how setCharacter reports a null clip (it returns void and currently sets no error). 'Fall back to default' on missing bones is described but with no state for the user (the select would still show the failing choice). | fixed: contract C5 and AC8 define the swap, stale-load token and fallback. |
| F7 | medium | security_privacy and K4 claim Python auto-run is disabled 'by default for --background without --enable-autoexec'. Blender's auto-run setting comes from the user's preferences, not from --background; a maintainer who enabled 'Auto Run Python Scripts' (common for rigs with driver expressions) would execute code from an untrusted BlendSwap file during inspect.py or convert.py. The mitigation text is therefore not a guarantee. | fixed: --factory-startup --disable-autoexec and an auto-run assertion in C4 and security. |
| F8 | medium | The S2 go/no-go cannot be exercised as sequenced: the pilot GLB is only loadable through the picker built in S4, and S2 offers no way to view it (the page loads the default URL). 'Dances acceptably' has no criterion, and the success metric 'loads in under 2 s on the e2e runner' has no AC or test. S3 lists AC4 as its acceptance although it has no character wiring. S1 depends on a manual user download of 12 files under a 7/day cap, so the first deliverable depends on an out-of-band action not modeled as a dependency. | fixed: DEV-only query loader in S2; download precondition in S1; 2 s metric dropped; S3 traces to new AC7. |
| F9 | medium | D5/K6 treat the legal exposure as a low-likelihood trademark complaint. Most candidates (Mario, Wario, Kirby, Mr Incredible, C-3PO, Gallade, Plankton, Among Us, Pikmin, Steve) are derivatives of copyrighted designs whose uploaders cannot grant CC0/CC-BY over the underlying character, and BlendSwap states licenses are uploader-declared and unverified. The user accepted a trademark risk, not necessarily a copyright/takedown risk on a public site. The 'rollback' of removing a registry entry leaves the GLB in git history and in immutable-cached /assets. AC6 shows title/author/license but CC-BY also requires indicating that the work was modified (converted, renamed bones, rebuilt materials), and the license version is not captured. | fixed: user re-confirmed with copyright framing (D12); original pilot first; modified note, license version and snapshot date in AC2 and AC6. |
| F10 | low | C2 carries bodyMaterialNames and framingScale, but the scene reads the BODY_MATERIAL_NAMES constant (['Skin']) and derives framing from the measured dance box (computeFraming in setCharacter), so framingScale is redundant and bodyMaterialNames is unwired unless S4 changes setCharacter. Without it the 'body color' control silently does nothing for new characters. ROOT_DROP is in absolute meters and NOMINAL_CHARACTER_SIZE assumes about 1.68 m, so a height-normalization error in convert.py changes the bounce visibly, yet no AC or test asserts model height. | fixed: framingScale dropped from C2; bodyMaterialNames passed to setCharacter; height check in AC3. |

## Hand-off

A verified-diamond draft DAG with 5 task(s) and 5 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `17af0e4665cc2797`).
