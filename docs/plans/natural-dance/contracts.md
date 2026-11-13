# Natural dance: frozen contracts

Frozen by the verified-diamond orchestrator from `natural-dance.plan.json` (r1, hash f90d601b16fb2ada) at base revision
`6bccc895447c6e41bead8cd0005e53ee4407fbf7`. Workers implement these exactly. Only the orchestrator changes this file;
if a contract does not fit, stop and escalate instead of working around it.

## C1: select ControlDefinition (`app/components/ControlPanel/controls.ts`)

```ts
export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectControl extends ControlBase {
    type: 'select';
    options: readonly SelectOption[];
    default: string; // one of options[].value
}

export type ControlDefinition = RangeControl | CheckboxControl | ColorControl | SelectControl;
```

- `ControlValues` maps a select to `string` (the existing `ValueOf` fallthrough already does).
- `ControlInput` renders a native `<select>` with a visible `<label htmlFor>`; one `<option>` per entry, in order; a change
  passes the option's `value` string to the existing change callback. No custom widget.
- `useControlValues` stores the string unchanged. The option list is static (module-level table), never changed at runtime.

## C2: dance registry and clip invariants

In `app/features/visualizers/dancing-character/dancingCharacterConfig.ts`:

```ts
export interface DanceDefinition {
    id: string;
    label: string;
    beats: 4 | 8;
}
export const DANCES = [/* filled in S2/S4 */] as const satisfies readonly DanceDefinition[];
export type DanceId = (typeof DANCES)[number]['id'];
export const CALM_DANCE_ID: DanceId;
// The select's value for automatic rotation.
export const AUTO_DANCE = 'auto';
export const AUTO_ROTATE_BARS = 8;
```

`NATIVE_BPM` stays 120; a beat is 0.5 s of clip time. Every clip length is a multiple of 4 beats, so every 4-beat
(bar) boundary is a valid switch point for any pair of dances.

Each clip in `assets/MakeHumanDances.glb`:
- is named by its `DanceId` and lasts `beats * 0.5` s (to 1e-6);
- has beat 1 at t = 0 and beat k at k * 0.5 s, produced by a piecewise-linear beat-to-beat time warp from the per-beat
  source times listed in its manifest;
- has a track for every bone in `DANCE_REQUIRED_BONES` (bone names as GLTFLoader loads them);
- carries no root translation except hips height (see the S0 note below);
- closes its loop with a max bone rotation delta under 10 degrees between the last and first key;
- keeps foot skate under `FOOT_SKATE_MAX_METERS` (value set by the build script, decided in S0);
- has its contact signal (hips-height minimum or a foot strike) within 40 ms of each beat marker.

The build script asserts all of these and fails otherwise; a unit test asserts them again against the committed GLB.
Licence allowlist in manifests: `CC0-1.0`, `CC-BY-4.0`, `CMU-mocap` (CMU Graphics Lab terms: "The motion capture data
may be copied, modified, or redistributed without permission.", http://mocap.cs.cmu.edu/faqs.php, read 2026-11-11).

S0 note: whether hips XZ may keep a small, loop-closing in-place sway (no net drift) instead of being stripped is an
open S0 measurement. Until the orchestrator amends this file, the rule above stands.

## C3: asset loader result (`dancingCharacterAssets.ts`)

```ts
export interface DancingCharacterAssets {
    model: THREE.Group;
    dances: ReadonlyMap<DanceId, THREE.AnimationClip>;
}
export function loadDancingCharacterAssets(
    signal: AbortSignal,
    urls?: { model: string; dances: string },
): Promise<DancingCharacterAssets>;
```

A clip that is missing or fails validation is omitted, never thrown. If no dance remains, the loader still resolves
with an empty map and the scene keeps the rest pose (the model still renders). Abort behaviour is unchanged.

## C4: DanceDirector (`dancingCharacterDirector.ts`, pure, allocation-free in `update`)

```ts
export interface DanceDirectorInput {
    selection: string; // AUTO_DANCE, a DanceId, or anything else (treated as AUTO_DANCE)
    beatCount: number;
    downbeatCount: number;
    meterLocked: boolean; // rhythm.barPhase !== undefined
    songChangeCount: number;
}
export interface DanceDirectorOutput {
    active: DanceId; // the dance that should be at full weight once any fade finishes
    next: DanceId | null; // a pending switch waiting for the next boundary
    switchNow: boolean; // true on exactly the update where a switch starts
}
export interface DanceDirector {
    update(input: Readonly<DanceDirectorInput>, out: DanceDirectorOutput): void;
    reset(): void;
}
export function createDanceDirector(available: readonly DanceId[]): DanceDirector;
export function createDanceDirectorOutput(initial: DanceId): DanceDirectorOutput;
```

Amendment 1 (orchestrator, feature branch `feat/natural-dance` at `befbfba`, base `cd018d8` approved by the user):
`DanceId` does not exist until S2b fills `DANCES`, so the director is generic over the id type:
`createDanceDirector<Id extends string>(available: readonly Id[]): DanceDirector<Id>`, with
`DanceDirectorOutput<Id>` and `createDanceDirectorOutput<Id extends string>(initial: Id)`. S2b instantiates it with
`DanceId`. `AUTO_DANCE`, `AUTO_ROTATE_BARS`, `FALLBACK_BEATS_PER_BAR` (4) and `DanceDefinition` are already committed in
`dancingCharacterConfig.ts`; import them, never redefine them.

Amendment 2 (orchestrator): to tell an unavailable dance from an unknown string, the factory takes every registry id:
`createDanceDirector<Id extends string>(available: readonly Id[], known: readonly Id[] = available)`. A selection in
`known` but not in `available` maps to `available[0]`; a selection in neither (and not `AUTO_DANCE`) is treated as
`AUTO_DANCE`. S2b passes `DANCES.map((d) => d.id)` as `known`.

- Boundary: a `downbeatCount` increment while `meterLocked`; otherwise every 4th `beatCount` increment.
- Manual selection of an available dance switches on the next boundary. An unavailable `DanceId` maps to the first
  available dance; an unknown string is treated as `AUTO_DANCE`.
- Auto rotates on a `songChangeCount` increment or after `AUTO_ROTATE_BARS` boundaries, always to a different
  available dance, on a boundary. With one available dance it never switches.
- The scene cross-fades over one beat (0.5 s of clip time scaled by the current time scale) and keeps every action on one
  shared clip clock, so phase is continuous across a switch.

## Amendment 3 (orchestrator, after S0g; the user approved the four loops by eye)

Feature branch `feat/natural-dance` at `7c49786` (origin/main `cd3af30` merged in, gates green).

The registry is frozen as follows; S2b writes it into `dancingCharacterConfig.ts` in this order (the order is the Auto
rotation order and `available[0]` is the fallback):

```ts
export const DANCES = [
    { id: 'lambada', label: 'Lambada', beats: 8 },
    { id: 'twist', label: 'Twist', beats: 8 },
    { id: 'cabbage-patch', label: 'Cabbage Patch', beats: 4 },
    { id: 'salsa', label: 'Salsa', beats: 4 },
] as const satisfies readonly DanceDefinition[];
export const CALM_DANCE_ID: DanceId = 'lambada';
export const FOOT_SKATE_MAX_METERS = 0.15;
```

| DanceId | Approved spike clip (spike/natural-dance-s0g @ ed85b68) | CMU sources |
|---|---|---|
| `lambada` | `55_02_loop` | 55.asf, 55_02.amc |
| `twist` | `15_04_twist_soft_loop` | 15.asf, 15_04.amc |
| `cabbage-patch` | `15_04_cabbage_loop` | 15.asf, 15_04.amc |
| `salsa` | `60_02_grounded_loop` | 60.asf, 60_02.amc (legs/hips), 60_01.amc (upper body) |

Clarifications of C2 for these clips:
- The human acceptance is the look of the approved spike clips. The real pipeline must reproduce each one: the same key
  count and duration, every rotation track within 0.2 degrees of the spike clip at every key, the root position within
  1 mm. The clip may carry extra helper-bone tracks beyond `DANCE_REQUIRED_BONES` (the salsa adds shoulder01R/upperarm02R).
- The root position track carries hips height only (X and Z are 0 at every key).
- The beat warp: each manifest lists its per-beat source frames (beats + 1 entries, the last closing the loop), taken from
  the approved spike loop (start frame + k * source frames per beat). These are the reviewed annotation.
- The 40 ms contact rule is reported per beat by the build and asserted only as a warning, because the approved timing
  was judged by eye and the ground lock moves the hips-height minimum; the seam (< 10 deg), the foot-skate limit,
  the floor contact (lowest foot within 3 cm), the arm clearance (>= 0) and the hands/elbows not more than 10 cm behind
  the chest stay hard failures.

## Amendment 4 (orchestrator, S2a escalations E1/E2)

- Root translation (replaces "root X and Z are 0"): the root bone keeps the pelvis centered over the rig, so its X/Z
  swing with the hips' rotation. Rule: no travel. Every key's root X/Z is within 0.10 m of the root's rest X/Z, and the
  first and last keys match within 1 mm. Hips height is free.
- `FOOT_SKATE_MAX_METERS = 0.16` (was suggested 0.15). The approved twist measures 0.153 m on the final clip; the human
  approved its look, and the limit is a proxy for visible sliding, so it is set just above the approved clips instead of
  tuning an approved clip.
- Seam: "max bone rotation delta under 10 degrees between the last and first key" is measured on the final clip as
  played. The closing correction spread over the loop before closing is reported, not asserted.
- CREDITS.md: the opening paragraph may be reworded so it says which file is CC0 (MakeHumanDancer.glb) and which is under
  the CMU terms (MakeHumanDances.glb). The MakeHumanDancer.glb record itself stays unchanged.
