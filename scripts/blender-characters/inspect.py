# Qualifies Blender character files for the dancing-character visualizer (contract C4).
#
# Run (from the repository root; Blender is not on the PATH on Windows, use its full path):
#   blender --factory-startup --disable-autoexec --background --python scripts/blender-characters/inspect.py -- <dir> --out <report.json>
#
# For every .blend in <dir> it reports the Blender version that saved the file, its armatures and bones, and for each of
# the 20 bones the dance drives (DANCE_REQUIRED_BONES in dancingCharacterConfig.ts) the source bone that looks like it,
# whether that bone deforms, and whether any skinned mesh has weights on it. The matches are suggestions from bone names
# and hierarchy; the reviewed result is the bone-map JSON next to each shipped GLB. It ends with two verdicts per
# armature: strict (all 20 map to distinct bones) and relaxed (the spine and neck gaps may be filled by dummy bones).
#
# .blend files can embed Python, so the script refuses to run unless Blender was started with auto-run of scripts off.

import json
import re
import sys
from pathlib import Path

import bpy

# The 20 bones, root first, then spine05 (lowest) up to spine01, then the limbs, then neck02 and head. Keep in step with
# DANCE_REQUIRED_BONES in app/features/visualizers/dancing-character/dancingCharacterConfig.ts.
REQUIRED = [
    "root",
    "spine05",
    "spine04",
    "spine03",
    "spine02",
    "spine01",
    "clavicleL",
    "clavicleR",
    "upperarm01L",
    "upperarm01R",
    "lowerarm01L",
    "lowerarm01R",
    "upperleg01L",
    "upperleg01R",
    "lowerleg01L",
    "lowerleg01R",
    "footL",
    "footR",
    "neck02",
    "head",
]
# Bones a dummy may stand in for: a zero-weight bone inserted into the chain between its mapped neighbors.
DUMMY_OK = {"spine01", "spine02", "spine03", "spine04", "spine05", "neck02"}
WEIGHTLESS_OK = {"root", "neck02"} | {f"spine0{i}" for i in range(1, 6)}
SPINE = ["spine01", "spine02", "spine03", "spine04", "spine05"]

# Blender's own name for the side suffix is ".L"/".R", but rigs also write _L, -l, Left, "left " or a leading "l_".
_SIDE_L = re.compile(r"(^|[._\-\s])(l|left)($|[._\-\s\d])|left|(?<=[a-z])L$", re.IGNORECASE)
_SIDE_R = re.compile(r"(^|[._\-\s])(r|right)($|[._\-\s\d])|right|(?<=[a-z])R$", re.IGNORECASE)

# Role keywords, checked in this order so "forearm" is not taken for an arm and "upperleg" not for a leg.
_ROLES = [
    ("lowerarm", re.compile(r"arm.?guard|fore.?arm|lower.?arm|low.?arm|elbow|arm.?2|arm.?lo", re.IGNORECASE)),
    ("upperarm", re.compile(r"upper.?arm|up.?arm|(?<![a-z])arm|bicep|arm.?1|shoulder.?arm", re.IGNORECASE)),
    ("clavicle", re.compile(r"clavicle|collar|shoulder|sholder|scapula", re.IGNORECASE)),
    ("lowerleg", re.compile(r"shin|calf|lower.?leg|low.?leg|knee|leg.?2|leg.?lo|leg.?shin", re.IGNORECASE)),
    ("upperleg", re.compile(r"thigh|upper.?leg|up.?leg|top.?leg|(?<![a-z])leg|leg.?1", re.IGNORECASE)),
    ("foot", re.compile(r"foot|ankle|heel", re.IGNORECASE)),
    ("neck", re.compile(r"neck", re.IGNORECASE)),
    ("head", re.compile(r"head", re.IGNORECASE)),
    ("root", re.compile(r"root|hips?$|pelvis|cog|center", re.IGNORECASE)),
    ("spine", re.compile(r"spine|chest|ribs?$|torso|abdomen|belly|back|waist|stomach", re.IGNORECASE)),
]
# Helper bones that should never be picked for a role.
_NOISE = re.compile(r"twist|roll|ik|pole|target|ctrl|control|helper|corrective|toe|finger|thumb|hand|eye|jaw|tail", re.IGNORECASE)


def sanitize(name):
    # PropertyBinding.sanitizeNodeName in three.js: whitespace becomes "_" and "[]./:" are dropped, so "upperarm01.L"
    # loads as "upperarm01L". The registry and the dance use the loaded names.
    return re.sub(r"[\[\].:/]", "", re.sub(r"\s", "_", name))


_PREFIX = re.compile(r"^(ORG|DEF|MCH|CTRL|TWEAK)[-_]", re.IGNORECASE)


def base(name):
    # Rigify names its deforming bones DEF-<name>, the originals ORG-<name> and its helpers MCH-<name>.
    return _PREFIX.sub("", name)


def side_of(name):
    left = bool(_SIDE_L.search(name))
    right = bool(_SIDE_R.search(name))
    if left and not right:
        return "L"
    if right and not left:
        return "R"
    return None


def role_of(name):
    for role, pattern in _ROLES:
        if pattern.search(name):
            return role
    return None


def depth(bone):
    count = 0
    while bone.parent:
        bone = bone.parent
        count += 1
    return count


def suggest(armature, weighted):
    """Suggests a source bone for each required name from names and hierarchy. Returns {required: bone name or None}."""
    bones = list(armature.data.bones)
    by_role = {}
    for bone in bones:
        name = base(bone.name)
        if re.match(r"^(MCH|CTRL|TWEAK)", bone.name, re.IGNORECASE) or (_NOISE.search(name) and role_of(name) != "root"):
            continue
        role = role_of(name)
        if role:
            by_role.setdefault((role, side_of(name)), []).append(bone)

    def pick(role, side=None):
        candidates = by_role.get((role, side), [])
        # Prefer a bone that carries weights (Rigify's DEF- over ORG-), then the shallowest: a deeper match is usually a
        # twist or a sub-segment.
        return min(candidates, key=lambda b: (b.name not in weighted, depth(b), b.name)).name if candidates else None

    result = dict.fromkeys(REQUIRED)
    for side in ("L", "R"):
        result[f"clavicle{side}"] = pick("clavicle", side)
        result[f"upperarm01{side}"] = pick("upperarm", side)
        result[f"lowerarm01{side}"] = pick("lowerarm", side)
        result[f"upperleg01{side}"] = pick("upperleg", side)
        result[f"lowerleg01{side}"] = pick("lowerleg", side)
        result[f"foot{side}"] = pick("foot", side)
    result["head"] = pick("head") or pick("head", None)
    result["neck02"] = pick("neck")

    # Root: a named root/hips bone, else the shallowest bone that is an ancestor of the legs.
    root = pick("root")
    if root is None:
        thigh = result["upperleg01L"]
        if thigh:
            node = armature.data.bones[thigh]
            while node.parent and node.parent.parent:
                node = node.parent
            root = node.parent.name if node.parent else node.name
    result["root"] = root

    # Spine: the bones strictly between the root and the head (or neck) on the path up, minus the neck itself. The
    # topmost is spine01 and they count down towards the pelvis.
    top = result["neck02"] or result["head"]
    if top and root:
        chain = []
        node = armature.data.bones[top].parent
        while node and node.name != root:
            if node.name != result["neck02"] and role_of(node.name) in ("spine", None) and not _NOISE.search(node.name):
                chain.append(node.name)
            node = node.parent
        for name, key in zip(chain, SPINE):
            result[key] = name
    return result


def skinned_weights(armature):
    """Vertex group names carrying a positive weight, over every mesh the armature deforms."""
    weighted = set()
    skinned = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if not any(m.type == "ARMATURE" and m.object == armature for m in obj.modifiers):
            continue
        skinned.append(obj.name)
        groups = {g.index: g.name for g in obj.vertex_groups}
        for vertex in obj.data.vertices:
            for entry in vertex.groups:
                if entry.weight > 0 and entry.group in groups:
                    weighted.add(groups[entry.group])
    return weighted, skinned


def rigid_meshes(armature):
    return [
        obj.name
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj.parent == armature and obj.parent_type == "BONE"
    ]


def textureless_materials():
    flagged = []
    for material in bpy.data.materials:
        if not material.users:
            continue
        has_image = bool(material.use_nodes and material.node_tree and any(
            node.type == "TEX_IMAGE" and node.image for node in material.node_tree.nodes
        ))
        if not has_image:
            flagged.append(material.name)
    return flagged


def inspect_armature(armature):
    weighted, skinned = skinned_weights(armature)
    suggestion = suggest(armature, weighted)
    bones = armature.data.bones
    names = [b.name for b in bones]
    loaded = [sanitize(n) for n in names]
    # Two bones that load under the same name, or a mapped bone already named like another required bone: renaming
    # in Blender would append ".001" and GLTFLoader would then load a wrong name.
    seen = {}
    collisions = []
    for original, name in zip(names, loaded):
        if name in seen and seen[name] != original:
            collisions.append([seen[name], original])
        seen[name] = original
    table = {}
    for required in REQUIRED:
        source = suggestion[required]
        bone = bones.get(source) if source else None
        table[required] = {
            "source": source,
            "deform": bool(bone.use_deform) if bone else None,
            "weighted": (source in weighted) if source else None,
        }
    mapped = [t["source"] for t in table.values() if t["source"]]
    distinct = len(mapped) == len(set(mapped))
    missing_strict = [r for r, t in table.items() if not t["source"]]
    # Root, spine and neck bones may stay weightless (MakeHuman's own root is): their rotation still moves every child.
    # The limbs, clavicles, feet and head must carry weights or the pose would not show.
    unskinned = [r for r, t in table.items() if t["source"] and not t["weighted"] and r not in WEIGHTLESS_OK]
    missing_relaxed = [r for r in missing_strict if r not in DUMMY_OK]
    # A real (not dummy) required bone must also deform: the scene only finds bones through SkinnedMesh skeletons.
    ok_skin = bool(skinned)
    problems_strict = missing_strict + unskinned
    problems_relaxed = missing_relaxed + [r for r in unskinned if r not in DUMMY_OK]
    return {
        "armature": armature.name,
        "bone_count": len(names),
        "bones": names,
        "required": table,
        "collisions": collisions,
        "anonymous_names": sum(1 for n in names if re.fullmatch(r"(Bone|bone)(\.\d+)?", n)) > len(names) // 2,
        "tree": [
            [b.name, b.parent.name if b.parent else None, [round(v, 3) for v in (armature.matrix_world @ b.head_local)]]
            for b in bones
        ],
        "skinned_meshes": skinned,
        "rigid_bone_parented_meshes": rigid_meshes(armature),
        "strict": {"qualifies": ok_skin and distinct and not problems_strict, "problems": problems_strict},
        "relaxed": {"qualifies": ok_skin and distinct and not problems_relaxed, "problems": problems_relaxed},
    }


def inspect_file(path):
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    report = {
        "file": path.name,
        "saved_with_blender": ".".join(str(v) for v in bpy.data.version),
        "armatures": [inspect_armature(a) for a in armatures],
        "textureless_materials": textureless_materials(),
    }
    report["no_armature"] = not armatures
    return report


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not argv or argv[0].startswith("--"):
        sys.exit("usage: blender --factory-startup --disable-autoexec --background --python inspect.py -- <dir> --out <report.json>")
    directory = Path(argv[0])
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else None
    return directory, out


def main():
    print(f"Blender {bpy.app.version_string}")
    if bpy.context.preferences.filepaths.use_scripts_auto_execute:
        sys.exit("refusing to open files: auto-run of Python scripts is on (start Blender with --disable-autoexec)")
    directory, out = parse_args()
    reports = []
    for path in sorted(directory.glob("*.blend")):
        try:
            reports.append(inspect_file(path))
        except Exception as error:  # one unreadable file must not hide the others
            reports.append({"file": path.name, "error": str(error)})
    for report in reports:
        print(f"\n== {report['file']}")
        if "error" in report:
            print(f"   ERROR {report['error']}")
            continue
        print(f"   saved with Blender {report['saved_with_blender']}; textureless materials: {len(report['textureless_materials'])}")
        if report["no_armature"]:
            print("   no armature")
        for arm in report["armatures"]:
            print(f"   armature {arm['armature']}: {arm['bone_count']} bones, skinned meshes {len(arm['skinned_meshes'])}, rigid {len(arm['rigid_bone_parented_meshes'])}")
            print(f"     strict {'PASS' if arm['strict']['qualifies'] else 'FAIL'} {arm['strict']['problems']}")
            print(f"     relaxed {'PASS' if arm['relaxed']['qualifies'] else 'FAIL'} {arm['relaxed']['problems']}")
    if out:
        out.write_text(json.dumps(reports, indent=2), encoding="utf-8")
        print(f"\nwrote {out}")


main()
