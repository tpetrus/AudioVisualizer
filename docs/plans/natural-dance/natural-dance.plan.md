# Natural dance for the dancing character
> Double-diamond plan `natural-dance` revision 1 | status **final** | lane full | risk R2 | base 6bccc895447c | updated 2026-11-11T15:33:13.076Z
_Generated from plan.json by dd_plan.py. Edit plan.json, not this file._
## Request

> <task>
> -Implement a more natural dance for the dancing character animation
> </task>
> 
> <context>
> -Currently the character has an awkward dance that just raises arms, and slightly bends legs
> -We want a more natural-looking dance
> </context>
> 
> <requirements>
> -Dance should mimic the dance a normal human would make
> -This can either be a popular dance, or just a basic dance someone might make on a dance floor
> </requirements>
> 
> <scope-and-non-goals>
> -The dance can include any part of the body moving: legs, feet, arms, hands, head, chest, etc
> -Prioritize finding a dance online that you can use, rather than creating from scratch
> -You can decide to create one from scratch only if you can't find a good one online
> -If there are multiple options, we can consider letting the user select a dance
> </scope-and-non-goals>
> 
> <verification>
> -A new dance has been created and still dances to tempo properly
> </verification>

## Problem

The dancing-character visualizer's dance is a procedural 4-beat loop (buildDanceClip in dancingCharacterDanceClip.ts: a per-beat bounce plus arm-sway and head-nod accents) that reads as awkward: it mostly raises the arms and slightly bends the legs. Viewers expect the character to move like a person on a dance floor, with weight shifts, steps, hips, chest, arms and head working together, while staying locked to the detected tempo.

**Users:** Visitors of the AudioVisualizer site who open the dancing-character visualizer while music plays

**Evidence:**
- User report in this session: the current dance just raises arms and slightly bends legs
- context-brief.md: the dance is built procedurally in code from 20 required bones, no motion-capture data is used

## Goals

- Replace the current dance with natural-looking human dances, preferably sourced from existing motion-capture or animation clips rather than authored from scratch
- Ship 2-3 distinct dances the user can pick from in the settings panel, plus an auto-rotate mode that changes dance over time
- Keep every dance locked to tempo: beats of the dance land on detected beats, and the speed follows the BPM as today

## Non-goals

- Changing the character model, outfit, club scene, camera or framing beyond what a new dance needs
- Runtime retargeting or loading of arbitrary user-supplied animations
- Upgrading three.js or adding a runtime animation library
- Choreography that reacts to individual sounds beyond the existing beat, bar and bass signals

## Success metrics

- In npm run dev with a 120 BPM track, the dance's step hits coincide with detected beats for every dance (visual check plus a unit test on clip timing)
- The user judges each shipped dance natural-looking in a manual review
- Coverage stays at or above 95 percent and all CI gates pass

## Constraints

- three.js r186 pinned; no new runtime dependencies; named exports only; logic outside React; no per-frame allocation (AGENTS.md)
- The rig is the CC0 MakeHuman 163-bone skeleton in assets/MakeHumanDancer.glb; any clip must be retargeted to its bone names offline
- Every bundled asset needs provenance and licence in assets/CREDITS.md
- Tempo sync assumes a clip of DANCE_CLIP_BEATS beats at NATIVE_BPM 120 (dancingCharacterConfig.ts, dancingCharacterSync.ts)
- ControlPanel supports only range, checkbox and color controls today
- A settings-panel change needs new Linux visual baselines

## Acceptance criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | the dancing-character visualizer is open with audio playing | a dance is active | the character performs a full-body dance (weight shift or steps in legs and feet, hip and chest motion, arm and head motion) sourced from or retargeted from human motion data, not the old buildDanceClip motion |
| AC2 | a track with a steady detected tempo between 80 and 160 BPM | any shipped dance plays | each dance's baked beat markers sit at k times 0.5 s, its contact signal (hips-height minimum or foot strike) lies within 40 ms of each marker in the build check and a unit test, and computeDanceTiming with that dance's beat count keeps beat phase aligned and speed scaled with BPM in the sync simulation |
| AC3 | the settings panel is open | the user selects one of at least 2 named dances in the Dance select | the switch starts on the next bar boundary (or next 4-beat boundary when the meter is not locked), cross-fades over one beat with the shared clip clock continuous and the per-frame bone rotation change during the fade under a unit-tested bound, and an unavailable or unknown selection falls back to an available dance or Auto |
| AC4 | the Dance select is set to Auto | a song change is detected or 8 bars (or 32 beats without a locked meter) pass | the dance changes to a different available dance on a boundary with a cross-fade, tested in the director for both locked and unlocked meter |
| AC5 | the dance assets are bundled | the repository is inspected | assets/CREDITS.md has a new section per dance with source URL, author, licence and its verification, the retarget process, and the dances GLB hash and size, leaving the existing CC0 model record untouched; the build script, its manifests and either the committed inputs or a hash-verified fetch of them are committed |
| AC6 | the change is complete | CI runs | format, lint, typecheck, coverage at 95 percent, build, size and e2e (with refreshed visual baselines) pass, and the e2e fixtures (which fail on any console error or WebGL-context warning) pass with the Dance select changed |

## Decisions

| ID | Question | Answer | Decided by | Rationale |
| --- | --- | --- | --- | --- |
| D1 | One dance or several? | 2-3 dances with a picker in the settings panel, plus an auto-rotate mode | user | User answer in round 1 |
| D2 | Which animation sources are acceptable? | CC0, CC-BY, or a custom licence verified to explicitly allow copying, modification and redistribution (for example the CMU Graphics Lab mocap terms), each recorded in CREDITS.md. Only if none is good enough, revisit Mixamo with files kept out of git and fetched at build time; never commit Mixamo data | user | Round 3 (CC0/CC-BY first) and critic round (allow CMU-style permissive terms) |
| D3 | Web research allowed? | Yes | user | User answer in round 1 |
| D4 | How is the current dance produced and synced? | Procedurally in buildDanceClip; an AnimationMixer advanced by dt times timeScale (BPM/120 times step multiple) plus a phase nudge from beat or bar phase | repo-fact | context-brief.md, dancingCharacterScene.ts and dancingCharacterSync.ts |
| D5 | Where does retargeting happen and with which toolchain? | Offline in a committed script under scripts/dancing-character-dances/; the S0 spike picks node (three.js BVHLoader plus retarget maths) or Blender headless and records the choice and any install need | planner assumption (confirm) | Keeps runtime simple and allocation-free; toolchain is a spike outcome (critic F7) |
| D6 | Keep the old procedural dance as a selectable option? | No, remove it and its code | user | Round 2 answer |
| D7 | Is the framing (2-3 retargeted mocap dances, selector with Auto, cross-fades, tempo lock, credits) confirmed? | Yes, with the CC0/CC-BY-first source policy | user | Round 2 and 3 answers |
| D8 | Fixed 4-beat loop or per-dance loop length? | Per-dance beats of 4 or 8; the active dance's beats are passed to computeDanceTiming, which already takes clipBeats | planner assumption (confirm) | Critic F3: natural grooves alternate left and right over 8 beats; generalising is cheap now |
| D9 | What counts as a bar boundary when the meter is not locked? | A bar boundary is a downbeatCount increment when barPhase is defined; otherwise every 4th beatCount increment. Auto also rotates on songChangeCount increments | repo-fact | RhythmState in app/features/rhythm/types.ts has beatCount, downbeatCount, songChangeCount and barPhase (undefined unless the meter is locked); critic F1 |

## Options considered

Weights: fit 30%, risk 25%, effort 20%, ux 15%, reversibility 10%. Scores 1-5, higher is better.

| ID | Lens | Summary | fit | risk | effort | ux | reversibility | Covers all ACs | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O3 | experience | Retarget 2-3 CC0/CC-BY mocap dances offline into fixed 4-beat/2s clips, add a native select control (Auto default, named dances) with bar-aligned cross-fades, and make every state (loading, missing clip, reduced motion, switching) look intentional. | 4 | 3 | 2 | 5 | 4 | yes | 3.5 |
| O1 | minimal | Bake 3 CC0/CC-BY mocap dances offline into 4-beat, 2 s, 120 BPM loops in one animation-only GLB so the runtime sync maths stays untouched, then add a select control and crossFadeTo between mixer actions. | 5 | 4 | 4 | 3 | 4 | yes | 4.15 |
| O2 | robust | Offline pipeline bakes licence-verified CC0/CC-BY mocap into versioned, validated clip data per dance, loaded through a single DanceLibrary with a uniform clip contract (loop length, beat markers, root-motion stripped) and a proper select control with bar-boundary cross-fades. | 3 | 3 | 2 | 4 | 4 | yes | 3.05 |
| **O4** (chosen) | hybrid | O1's core (offline-baked 4-beat, 2 s, 120 BPM clips in one animation-only GLB, sync maths untouched) plus O2's build-time validation and licence allowlist, plus O3's pure DanceDirector with bar-aligned cross-fades, Auto rotation and load-failure fallback. | 5 | 4 | 3 | 4 | 4 | yes | 4.1 |

## Decision

**O4**: O1's core (offline-baked 4-beat, 2 s, 120 BPM clips in one animation-only GLB, sync maths untouched) plus O2's build-time validation and licence allowlist, plus O3's pure DanceDirector with bar-aligned cross-fades, Auto rotation and load-failure fallback.

O1 scores marginally higher on effort alone, but O4 adds what the user asked for and O1 handles thinly: Auto rotation and switching on a bar boundary, both pure and unit-testable in a director, plus build-time licence and loop validation that enforces the CC0/CC-BY decision (D2). It keeps O1's fixed 4-beat clip so computeDanceTiming and its tests stay unchanged, and it skips O2's generalised beat counts and per-dance JSON format, which cost more without a requirement behind them.

**Approach:**
- Spike first (S0, no commit): verify each candidate's licence page against D2 (CC0, CC-BY or verified permissive custom such as CMU), retarget one dance to MakeHuman, decide toolchain and loop length, and get the user's go or no-go
- Offline script under scripts/dancing-character-dances/ (does not edit the protected scripts/dancing-character-model/) reads a manifest per dance (source URL, author, licence, input sha256, per-beat source times), maps joints to MakeHuman bone names, strips root translation except hips height, applies a piecewise beat-to-beat warp to 4 or 8 beats at 120 BPM, blends the loop seam and writes all clips into assets/MakeHumanDances.glb
- The build fails when a clip lacks a required bone, has NaN, exceeds the seam or foot-skate thresholds, misplaces its contact signal by more than 40 ms from a beat marker, or carries a licence outside the D2 allowlist
- DANCES registry (id, label, beats) in dancingCharacterConfig.ts; the active dance's beats feed computeDanceTiming; loadDancingCharacterAssets also loads the dances GLB; buildDanceClip and its tests are deleted (D6)
- Pure dancingCharacterDirector.ts: boundaries from downbeatCount when the meter is locked, else every 4 beats; Auto on song change or every 8 bars; unavailable selection maps to an available dance, unknown to Auto
- Scene creates one LoopRepeat action per clip and cross-fades over one beat with a continuous shared clock
- Static select ControlDefinition rendered as a labelled native select; reduced-motion table defaults to CALM_DANCE_ID
- CREDITS.md gets a new section per dance; refresh the settings-panel Linux baseline

## Design

Mocap dances from CC0/CC-BY sources are retargeted offline to the existing MakeHuman rig and baked into a single animation-only GLB of 4-beat, 2 s loops at 120 BPM. At runtime the scene creates one AnimationAction per dance on the existing mixer, which the existing computeDanceTiming already advances at BPM/120 with a phase nudge. A pure DanceDirector picks the active dance from the control value (Auto or a named dance), the bar counter and song-change events, and the scene cross-fades between actions on bar boundaries. The procedural buildDanceClip is removed.

### Components
| Name | Responsibility | Location |
| --- | --- | --- |
| Dance build pipeline | Manifest-driven offline retarget, trim, time-warp, seam blend, validation and GLB output | scripts/dancing-character-dances/ |
| Dances asset | Baked clips plus per-dance manifests and credits | app/features/visualizers/dancing-character/assets/MakeHumanDances.glb, assets/dances/*.json, assets/CREDITS.md |
| DANCES registry | Dance ids and labels, shared constants | app/features/visualizers/dancing-character/dancingCharacterConfig.ts |
| DanceDirector | Pure decision logic for the active dance and switch timing | app/features/visualizers/dancing-character/dancingCharacterDirector.ts |
| Scene mixer wiring | Actions per dance, cross-fade on director decisions, framing via measureDance over all clips | app/features/visualizers/dancing-character/dancingCharacterScene.ts |
| Select control | Shared select ControlDefinition and native select input | app/components/ControlPanel/controls.ts, ControlInput.tsx |

### Contracts (freeze before dependent work)

- **C1 select ControlDefinition** (TypeScript type): ControlDefinition gains { type: 'select'; label; options: readonly { value: string; label: string }[] } with a string value; ControlInput renders a labelled native select; useControlValues stores the string
- **C2 Dance clip invariants and registry** (data contract): DANCES: readonly { id: DanceId; label: string; beats: 4 | 8 }[] in dancingCharacterConfig.ts, with CALM_DANCE_ID naming the calmest dance. Each clip in MakeHumanDances.glb is named by its id, lasts beats times 0.5 s at 120 BPM, has beat 1 at t=0 produced by a piecewise beat-to-beat warp from per-beat source times in its manifest, tracks for every DANCE_REQUIRED_BONES bone, no root translation except hips height, a loop seam with max bone rotation delta under 10 degrees, and foot skate under a stated threshold; asserted by the build and by unit tests against the real GLB
- **C3 Asset loader result** (function signature): loadDancingCharacterAssets(signal, urls) resolves { model, dances: ReadonlyMap<DanceId, AnimationClip> }; a missing or invalid clip is omitted, never thrown, unless none remain
- **C4 DanceDirector API** (pure module): createDanceDirector(available: readonly DanceId[]) with update(input: { selection: string; beatCount: number; downbeatCount: number; meterLocked: boolean; songChangeCount: number }, out) writing { active, next, switchNow } into a preallocated object. Boundary is a downbeatCount increment when meterLocked, else every 4th beatCount increment, further restricted to boundaries compatible with both dances' loop lengths. Auto rotates every AUTO_ROTATE_BARS (8) bars or on a songChangeCount increment and never picks the current dance. An unavailable selection maps to the first available dance; an unknown selection is treated as auto

### Data

No persisted data; control values are not persisted today (ControlPanel has no storage), and this plan does not add persistence.

### UX

Settings panel gains a static Dance select: Auto (default), then the named dances; the option list never changes at runtime. A manual pick takes effect on the next boundary with a one-beat cross-fade. Auto changes dance on song change or every 8 bars. Before the tempo locks, the existing CALM_DANCE_WEIGHT blend is reviewed per dance in S2; if the 0.35 blend toward the rest pose looks stiff, the calm state instead plays CALM_DANCE_ID at native rate.

### Accessibility

Native select with a visible label, keyboard and screen-reader support; the reduced-motion control table defaults the select to CALM_DANCE_ID instead of Auto; axe check in e2e must stay clean.

### Security and privacy

No new data or network calls; assets are bundled and hashed. Licence allowlist (CC0-1.0, CC-BY-4.0) enforced at build time; no Mixamo data is committed.

### Observability

Dev-only: the existing debug harness (npm run debug:viz) can record a track per dance to check beat alignment; no production telemetry added.

### Rollout and rollback

Ships as one feat PR (minor bump) merged to main, which Cloudflare deploys to production; check the PR preview URL first on /dancing-character with a real track. Rollback by reverting the PR or rolling back the deployment in Cloudflare; no data migration, so rollback is clean.

## Test strategy

- **Unit:** Director: locked and unlocked boundaries, manual switch waits for a boundary, Auto every 8 bars or 32 beats and on song change, never repeats, single-dance case, unavailable and unknown selections. Clips: every DANCES id exists in the real GLB with duration beats times 0.5 s, required bones, seam delta under 10 degrees, contact signal within 40 ms of each beat marker. Retarget maths: rest-pose conversion on a synthetic bone pair. Sync: existing dancingCharacterSync tests stay green; simulate per dance with its beat count. Fade: max per-frame bone rotation delta under a bound and continuous clock phase. Controls: select renders, changes value, keyboard works (jsdom). Loader: a missing clip is omitted. Coverage stays at 95 percent.
- **Integration:** useDancingCharacterScene and DancingCharacterPage tests updated for the new control key and multiple actions, using the shared fakes in app/test/.
- **End-to-end:** npm run test:e2e with the existing fixtures that fail on page errors, console errors and WebGL-context warnings; add a step that changes the Dance select; refresh the settings-panel visual baseline via the Update visual snapshots workflow.
- **Manual:** npm run dev with tracks at about 90, 120 and 150 BPM: each dance looks natural, steps land on beats, a manual switch fades on the next bar, Auto rotates, and there are no WebGL warnings; the user reviews each dance for naturalness.
- **Non-functional:** npm run size and npm run lighthouse stay within budget; the dances GLB stays under about 1 MB (record its size in CREDITS.md); no per-frame allocation in the director or scene changes.

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| K1 | Too few clips under the allowed licences look natural after retargeting | high | high | S0 is a no-commit spike that verifies licences of each candidate and has the user review one retargeted clip before any repository change; if it fails, the user decides on the D2 Mixamo fallback (Q2) |
| K2 | Retarget artifacts: rest-pose or bone-roll mismatch, twisted limbs, foot sliding | high | medium | Map rest poses explicitly in the build, strip root translation, review in dev and with the debug harness, and iterate per dance |
| K3 | Time-warping mocap to exactly 4 beats at 120 BPM distorts motion or misplaces the step accents | medium | medium | Piecewise beat-to-beat warp from per-beat source times in each manifest; beat 1 at a foot strike; contact signal within 40 ms of each marker asserted by build and unit test (AC2) |
| K4 | CC-BY attribution missed or a source licence misread | low | high | Manifest licence field with allowlist enforced by the build; source page URL and author recorded in CREDITS.md; reviewer checks each source page |
| K5 | Cross-fades or multiple actions change framing or break measureDance | low | medium | measureDance samples every clip and uses the union for framing; covered by framing tests |
| K6 | The pre-lock calm blend (CALM_DANCE_WEIGHT 0.35 toward the rest pose) looks stiff with mocap clips | medium | medium | Reviewed in S2; fallback is playing CALM_DANCE_ID at native rate during the calm state |

## Delivery slices

| ID | Slice | Depends on | ACs | Contracts | Risk | Size | Draft paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Select control type in ControlPanel: Add the select ControlDefinition and a labelled native select input with tests, unused by any visualizer yet | S0 | AC3, AC6 | C1 | R1 | S | app/components/ControlPanel/controls.ts, app/components/ControlPanel/ControlInput.tsx, app/components/ControlPanel/ControlInput.test.tsx |
| S2 | Dance build pipeline and first retargeted dance: Commit the pipeline with manifests, validation and retarget-maths tests, bake the approved dance into MakeHumanDances.glb with credits, pass the active dance's beats into computeDanceTiming, replace buildDanceClip, review the calm state, keep sync tests green | S0 | AC1, AC2, AC5 | C2, C3 | R2 | L | scripts/dancing-character-dances/, app/features/visualizers/dancing-character/assets/MakeHumanDances.glb, app/features/visualizers/dancing-character/assets/CREDITS.md, app/features/visualizers/dancing-character/dancingCharacterAssets.ts, app/features/visualizers/dancing-character/dancingCharacterConfig.ts, app/features/visualizers/dancing-character/dancingCharacterScene.ts, app/features/visualizers/dancing-character/dancingCharacterDanceClip.ts |
| S3 | DanceDirector and cross-fade switching: Pure director with locked and unlocked boundaries, scene wiring of one action per dance with one-beat cross-fades and continuous clock, Auto rotation, fallback for unavailable or unknown selections, tested with two clips | S2 | AC2, AC3, AC4 | C4 | R1 | M | app/features/visualizers/dancing-character/dancingCharacterDirector.ts, app/features/visualizers/dancing-character/dancingCharacterDirector.test.ts, app/features/visualizers/dancing-character/dancingCharacterScene.ts |
| S4 | Remaining dances, Dance selector and baselines: Bake the remaining 1-2 dances, add the Dance select (Auto default) and reduced-motion entry to the controls, refresh the settings-panel baseline and run the full gate set | S1, S3 | AC1, AC3, AC4, AC5, AC6 | C1, C2 | R2 | M | app/features/visualizers/dancing-character/dancingCharacterControls.ts, app/features/visualizers/dancing-character/assets/dances/, e2e/visual.spec.ts-snapshots/dancingcharacter-settings-panel-chromium-linux.png |
| S0 | Licence and retarget spike, no commit: Verify the licence page of each candidate (CMU dance subjects, Quaternius, others), list those that pass D2, retarget one dance to MakeHuman in a throwaway branch, pick the toolchain and loop length, and get the user's go or no-go before any committed change |  | AC1, AC5 | C2 | R1 | M | scripts/dancing-character-dances/ |

## Open questions

| ID | Question | Owner | Blocking |
| --- | --- | --- | --- |
| Q1 | Which specific dance takes ship (for example a two-step groove, a bounce with arm swing, a hip-hop or salsa basic)? | implementer in S2/S4, approved by the user after the dev review | no |
| Q2 | If no clip under the allowed licences passes the user's review in the S0 spike, adopt Mixamo fetched at build time and kept out of git? | user, at the end of S1 | no |

## Critic pre-mortem

Passes: 1. Verdict: sound with fixes

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | high | C4 takes a barIndex input and AC3/AC4 depend on 'bar boundary', but RhythmState (app/features/rhythm/types.ts) has no bar index. It has barPhase and downbeatCount. barPhase is undefined unless the tempo is locked, the meter is a confident 4/4 and a bar is known (dancingCharacterSync.ts L159-165). For most real music (3/4, weak meter, tempo not locked) the director never sees a bar advance. A manual pick then never applies, or Auto never rotates, with no feedback to the user. The plan names no source for barIndex and no fallback. | Fixed: D9 and C4 derive boundaries from downbeatCount when the meter is locked and from every 4th beatCount otherwise, with Auto on songChangeCount; AC3 and AC4 now cover both paths and director tests cover locked and unlocked meters |
| F2 | high | AC2 and the success metric claim steps land on beats, 'verified by unit tests on the timing maths for every dance'. But computeDanceTiming is dance-independent: it only nudges the clip's beat slot (clip phase * 4 against beatPhase, STEP_PHASE_OFFSET=0). Whether a given dance's foot strikes or accents sit at t = k*0.5 s depends on the baked clip. The plan only does a uniform time-warp of a groove segment (O4 approach, K3), so real mocap beats drift inside the loop. C2 puts 'beat 1 at t=0' in the contract but has no beat markers, and no test can assert accent positions. The existing procedural clip had identical beats, which is why the slot-only lock worked. | Fixed: manifests record per-beat source times and the build applies a piecewise beat-to-beat warp; C2 and AC2 require the contact signal within 40 ms of each k times 0.5 s marker, asserted by the build and a unit test against the real GLB |
| F3 | high | C2 freezes every dance to a 4-beat, 2 s loop before the S2 spike has shown that any real dance fits. A natural groove usually alternates left and right over 8 beats, and a 4-beat loop looks mechanical, which the plan's own cons admit. The rationale for dropping O2's per-dance beats ('cost more') is weak: computeDanceTiming already takes clipBeats as a parameter, and the scene hard-codes DANCE_CLIP_BEATS at the call (scene L267). Generalising is cheap now. If the spike finds 8 beats are needed, C2, the config, sync tests and every clip change after S3/S4 depend on them. | Fixed: D8 allows 4 or 8 beats per dance in DANCES, the active dance's beats are passed to computeDanceTiming, and the S0 spike chooses the loop length; C4 switches only on boundaries compatible with both loop lengths |
| F4 | high | The licence allowlist (CC0-1.0, CC-BY-4.0, D2, K4) conflicts with the spike shortlist in O4 (CMU mocap, Rokoko free dance pack, Movella free data). To my knowledge these ship under their own custom terms, not CC0 or CC-BY, so they would fail the build's own allowlist. The usable CC0/CC-BY dance supply is small, so K1 ('medium') looks understated and the D2 fallback is likely to be reached. The decision depends on Q1/Q2 and on user review at the end of an L slice. | Fixed: the user widened D2 to verified permissive custom licences such as CMU's terms, recorded in CREDITS.md; K1 raised to high likelihood; S0 verifies each candidate's licence before any commit |
| F5 | high | The plan says 'a clip missing at load is dropped from the select', but the control table must be a module-level constant. dancingCharacterControls.ts L81-82 says useControlValues needs a constant table, and the table is chosen once at mount by controlsForMotionPreference. The options therefore cannot change after the async asset load. Dropping an option would need a dynamic table, which breaks useControlValues. The alternative leaves the user selecting a dance that silently does nothing. | Fixed: the select stays static (design.ux); C4 maps an unavailable selection to the first available dance and an unknown one to Auto; covered by AC3 and director tests |
| F6 | medium | Until the tempo locks (start of every track, quiet or unclear music), the scene sets the base action's weight to CALM_DANCE_WEIGHT (0.35) at the native rate. That blends the pose toward the bind/rest pose. This was a gentle bounce for the procedural clip, but for a 20-bone mocap dance it yields a stiff partial pose, and it is what a visitor sees first. D6 removes the old clip, so this state is never revisited. The reduced-motion plan to 'pin the calmest dance' is also undefined: which dance is calmest, and how a default Auto becomes pinned (the reduced table only changes defaults). | Fixed: K6 and design.ux review the 0.35 calm blend per dance in S2 with a fallback to CALM_DANCE_ID at native rate; C2 names CALM_DANCE_ID and the reduced-motion table defaults to it |
| F7 | medium | The go or no-go on the content (K1) sits at the end of S2, an L slice that also adds the pipeline, deletes buildDanceClip and its tests, and rewires the scene. S3 and S1 do not depend on the review outcome, so work and a half-replaced scene pile up before the user has judged a single clip. If the review fails, the delete-the-old-dance (D6) work and the scene rewrite are wasted or must be reverted. The pipeline toolchain is also undecided (D5 says 'node or Blender'). | Fixed: new S0 no-commit spike (licence check, one retargeted clip, toolchain and loop length, user go or no-go) precedes S1 and S2 |
| F8 | medium | Several ACs are not observable as written. AC1 'natural' and AC3 'without a visible pose snap' are judged by eye only. AC3 says 'stays on beat' during a cross-fade, but there is no test for the fade itself. The plan sets a seam-delta threshold in the build but no number and no foot-sliding check, and K2 (high likelihood) relies only on manual review. AC6 'no WebGL warnings' is not tied to a mechanism. | Fixed: C2 sets a 10 degree seam bound and a foot-skate threshold, AC3 adds a unit-tested per-frame rotation bound and continuous clock during fades, AC6 names the e2e fixtures that fail on console errors and WebGL warnings; naturalness stays a user review (success metric) |
| F9 | medium | AC5 requires 'the build script that produces them is committed', but the input mocap files are neither committed nor kept reproducible. The manifest holds a source URL and an input sha256, and nothing says where raw inputs live (CC0 inputs could be committed, CC-BY ones need attribution in-repo). The 20-bone retarget (rest-pose and bone-roll mapping to the 163-bone rig, K2) is the riskiest code in the plan and is a single unspecified script, with no tests besides the output validators. MakeHumanDances.glb also needs its hash and size recorded in CREDITS.md; the existing CC0 record is protected. | Fixed: AC5 requires committed inputs or a hash-verified fetch, retarget-maths unit tests on a synthetic bone pair are in test_strategy, and the GLB hash and size go in a new CREDITS.md section leaving the CC0 record untouched |
| F10 | low | design.data says the selection 'persists like other controls if useControlValues persists them', which is unverified. A grep of app/components/ControlPanel found no storage use, so persistence is probably absent. The Auto default also means a visitor never sees a stable choice in the settings-panel baseline, and an invalid or stale value (renamed dance id) has no handling. | Fixed: design.data drops the persistence claim; C4 treats an unknown selection as Auto with a test |

## Hand-off

A verified-diamond draft DAG with 5 task(s) and 4 contract(s) to freeze first is embedded in plan.json under `handoff.verified_diamond` (plan hash `f90d601b16fb2ada`).
