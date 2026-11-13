# Blender characters: frozen contracts

Approach (a): each Blender character is converted offline to a GLB that carries a MakeHuman-named skeleton. The
existing dance pipeline (`scripts/dancing-character-dances/`) then retargets the motion-capture dances onto that
skeleton and writes one dances GLB per character. The app loads a `{ model, dances }` pair per character.

Source plan: `docs/plans/blend-dancers/blend-dancers.plan.json` (decisions D1-D13). Pilot character: Mr Incredible
(BlendSwap 11590). Candidate verdicts: `docs/blender-characters/candidate-report.md`.

## C-BONES: the skeleton a converted character must have

Names are as GLTFLoader loads them (dots removed: `upperarm01.L` loads as `upperarm01L`). Every bone below must exist
on the character's skinned-mesh skeleton. Hierarchy (parent first), `S` is `L` or `R`:

```
root
  spine05 > spine04 > spine03 > spine02 > spine01
    spine01 > clavicleS > shoulder01S > upperarm01S > upperarm02S > lowerarm01S > lowerarm02S > wristS
      wristS > finger2-1S, finger3-1S, finger5-1S      (index, middle, pinky first joints)
    spine01 > neck01 > neck02 > neck03 > head
  root > pelvisS > upperleg01S > upperleg02S > lowerleg01S > lowerleg02S > footS > toe1-1S
```

- The retarget reads each bone's rest world rotation and position, so bone roll does not matter, but the rest pose must
  stand upright facing +Z with Y up, feet on y = 0, and the root bone sitting directly under an identity-transform parent.
- Bones that have no counterpart in the source rig are zero-weight dummies placed on the line between their mapped
  neighbors (`spine*`, `neck01-03`, `shoulder01*`, `*02` twist bones, `toe1-1*`, `pelvis*`). Clavicles, upper/lower arms, wrists,
  upper/lower legs, feet, the three finger joints and `head` must be real, weighted bones.
- Height: the character is scaled so its height from the floor to the top of the head is `1.68` m (the MakeHuman
  figure, `NOMINAL_CHARACTER_SIZE` in `dancingCharacterConfig.ts`), within 10%.

## C-MAP: bone map JSON (`bone-map.json`)

```json
{
    "id": "mr-incredible",
    "source": "https://blendswap.com/blend/11590",
    "armature": "Mr Incredible Rig",
    "map": { "<C-BONES name>": "<source bone name>" | "dummy" }
}
```

Every C-BONES name is a key. Non-dummy values are distinct. When several source bones feed one target (Rigify's
twist segments), the value is a list of source bone names whose vertex weights are merged into the target.

## C-ASSETS: files per character

Under `app/features/visualizers/dancing-character/assets/characters/<id>/`:
`model.glb` (at most 3 MB), `dances.glb` (clips named as in `DANCES`), `bone-map.json`. MakeHuman keeps its current
files in `assets/` and is registry entry 0.

## C-CLI (Blender)

```
blender --factory-startup --disable-autoexec --background <file.blend> --python scripts/blender-characters/convert.py -- --map <bone-map.json> --out <model.glb> --max-mb 3
```

The script prints the Blender version, asserts `use_scripts_auto_execute` is False, fails on any missing name, any
non-distinct mapping, a bone-name collision, or a GLB over `--max-mb`.

## C-REGISTRY: `characterRegistry.ts`

```ts
export interface CharacterEntry {
    id: string;
    title: string;
    author: string; // empty for MakeHuman
    license: 'CC0' | 'CC-BY' | 'CC-BY-SA';
    licenseVersion: string;
    sourceUrl: string;
    modifiedNote: string; // e.g. 'Converted to glTF, bones renamed, materials rebuilt.'
    trademarkNote?: string;
    urls: { model: string; dances: string };
    bodyMaterialNames: readonly string[];
}
export const CHARACTER_REGISTRY: readonly CharacterEntry[]; // MakeHuman first
export const DEFAULT_CHARACTER_ID = 'makehuman';
```

## C-SWAP: character swap in the scene

`DancingCharacterScene.setCharacter(model, dances, bodyMaterialNames)` returns `{ danced: boolean; missing: string[] }`.
The hook owns one `AbortController` and an increasing request token per load, ignores late results, disposes the
previous model, and on failure restores `DEFAULT_CHARACTER_ID` in the control values and sets a status message. A
`character` select is the first control of the panel; nothing persists across reloads.
