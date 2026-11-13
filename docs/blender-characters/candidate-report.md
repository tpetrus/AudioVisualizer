# Blender candidate report (S1)

Generated with `scripts/blender-characters/inspect.py` under Blender 5.3 (`--factory-startup --disable-autoexec`) on
2026-11-12. Only the first 7 of 12 candidates could be downloaded (the free limit is 7 a day); 8995, 6164, 30743, 27251
and 6360 are still to do. The verdicts come from bone-name matching and are suggestions; a bone map is reviewed by hand.

"Strict" means all 20 bones the dance drives map to distinct, weighted source bones. "Relaxed" lets dummy bones fill the
spine and neck gaps. Clavicles, limbs, feet and head cannot be dummies.

| ID    | Character         | Saved with | Bones           | Strict | Relaxed                                      | Notes                                                                                                                                   |
| ----- | ----------------- | ---------- | --------------- | ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 11590 | Mr Incredible     | 2.69       | 411 (Rigify)    | fail   | **pass**                                     | Only spine03-05 missing. 7 textureless materials. CC-BY 3.0, fan art.                                                                   |
| 10017 | Wario             | 2.66       | 399 (Rigify)    | fail   | **pass** (`rig`; `metarig` has no skinning)  | Only spine03-05 missing. 16 textureless materials. Listed CC0, license file says fan art and non-commercial.                            |
| 18416 | Gallade           | 2.78       | 32              | fail   | **pass** (ArmGuard taken as forearm)         | Spine02-05 missing. Confirm ArmGuard in the viewport. 3 rigid parented meshes. CC-BY 3.0, fan art.                                      |
| 5830  | C-3PO             | 2.63       | 17              | fail   | fail: no clavicles, no right forearm bone    | Spine03-05 missing. Fixable only by re-rigging. CC-BY 3.0.                                                                              |
| 16234 | Mario             | 2.75       | 51, all `Bone.NNN` | fail | likely pass with a hand-made map             | T-pose humanoid: root, 3-bone spine, neck, head, shoulder/arm/forearm/hand, 4-bone legs. Names carry no meaning, so the map is manual.   |
| 17097 | Plankton          | 2.76       | 41, all `Bone.NNN` | fail | doubtful                                     | Arms have 2 bones and there is no clavicle; the long chains are antennae. 3 rigid parented meshes.                                      |
| 27211 | Cute Cartoon Char. | 2.91       | 13              | fail   | **fail**                                     | A bendy-limb rig (`Bone`, `end`, `Bendy`, `start`): no spine, neck, head, hands or feet. Cannot drive the dance without re-rigging.     |

## What this changes in the plan

- Candidates that can work: Mr Incredible, Wario, Gallade, and Mario with a manual map. That meets the success metric of
  at least 2 characters besides MakeHuman.
- The plan's pilot, the original Cute Cartoon Character (D12), fails. Every viable candidate is fan art, so the
  "original character ships first" rule (D12) cannot be kept. This needs a user decision.
- All 7 files are Blender 2.6x-2.9x with Blender Internal or Cycles materials, so every one needs a manual material
  rebuild (K3).
- Licenses are uploader-declared. The license files for 11590, 10017, 18416, 17097 and 16234 say fan art, not for
  commercial use; the Wario file is labeled CC0 yet carries the same note.

## Outcome

- Shipped: Mr Incredible (11590) and Wario (10017), both Rigify rigs that reused one bone map.
- Mario (16234) was converted with a hand-made bone map and passed every dance rule, but his proportions (stubby body,
  long arms, big gloves) looked wrong while dancing, so he was removed. `convert.py` keeps what the work added
  (Solidify and Multires modifiers, `arm_scale`, `skin_material`, the straight-elbow nudge).
- Not attempted: Gallade (needs a hand and wrist built), Plankton and C-3PO (fail the relaxed check), and the five files
  that were never downloaded (8995, 6164, 30743, 27251, 6360).
