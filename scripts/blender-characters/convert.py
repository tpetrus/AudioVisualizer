# Converts a rigged Blender character into a GLB with a MakeHuman-named skeleton (contracts C-BONES, C-MAP, C-CLI).
#
# Run (from the repository root; Blender is not on the PATH on Windows, use its full path). The .blend is opened by
# Blender's own command line, so --disable-autoexec must be there: .blend files can embed Python and this script never
# runs anything stored in one.
#   blender --factory-startup --disable-autoexec --background <file.blend> --python scripts/blender-characters/convert.py \
#       -- --map <bone-map.json> --out <model.glb> --max-mb 3
#
# What it does:
#   1. Reads the joint positions of the source bones in the rest pose.
#   2. Builds a new armature with exactly the C-BONES bones (MakeHuman names and hierarchy). A bone whose map value is a
#      source bone (or a list of them) sits at the head of the first listed source bone; a "dummy" bone is placed on
#      the line between its mapped neighbors and carries no weights.
#   3. Applies the Subdivision modifier (the highest level that keeps the GLB under --max-mb), joins the skinned meshes,
#      merges the source vertex groups into the new bones (sum, keep the 4 largest, normalize) and drops all other
#      groups.
#   4. Scales the character to --height meters from the floor to the top of the head, with the feet on y = 0 after the
#      glTF Y-up conversion (Blender +Z up and -Y forward become glTF +Y up and +Z forward).
#   5. Rebuilds every material as a Principled BSDF with a flat base color (the source material's diffuse color).
#   6. Exports a GLB without animation, cameras or lights.
# It exits non-zero on a missing name, a mapping that is not distinct, a bone-name collision, a mesh without the
# armature, or a GLB over --max-mb.

import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

# Parent of every C-BONES bone (sides are written out below). The order is parent first.
SPINE = ["spine05", "spine04", "spine03", "spine02", "spine01"]
NECK = ["neck01", "neck02", "neck03", "head"]
SIDES = ["L", "R"]


def hierarchy():
    parents = {"root": None}
    prev = "root"
    for name in SPINE:
        parents[name] = prev
        prev = name
    for name, parent in zip(NECK, ["spine01", "neck01", "neck02", "neck03"]):
        parents[name] = parent
    for s in SIDES:
        chain = [
            ("clavicle", "spine01"),
            ("shoulder01", f"clavicle{s}"),
            ("upperarm01", f"shoulder01{s}"),
            ("upperarm02", f"upperarm01{s}"),
            ("lowerarm01", f"upperarm02{s}"),
            ("lowerarm02", f"lowerarm01{s}"),
            ("wrist", f"lowerarm02{s}"),
            ("finger2-1", f"wrist{s}"),
            ("finger3-1", f"wrist{s}"),
            ("finger5-1", f"wrist{s}"),
            ("pelvis", "root"),
            ("upperleg01", f"pelvis{s}"),
            ("upperleg02", f"upperleg01{s}"),
            ("lowerleg01", f"upperleg02{s}"),
            ("lowerleg02", f"lowerleg01{s}"),
            ("foot", f"lowerleg02{s}"),
            ("toe1-1", f"foot{s}"),
        ]
        for base, parent in chain:
            parents[f"{base}{s}"] = parent
    return parents


PARENTS = hierarchy()
BONE_ORDER = list(PARENTS)
# The child a bone's tail points at (a Blender bone needs a tail; roll does not matter to the retarget).
PRIMARY_CHILD = {"pelvisL": "upperleg01L", "pelvisR": "upperleg01R", "root": "spine05", "spine01": "neck01", "neck01": "neck02", "neck02": "neck03", "neck03": "head"}
for _name in SPINE[:-1]:
    PRIMARY_CHILD[_name] = SPINE[SPINE.index(_name) + 1]
for _s in SIDES:
    PRIMARY_CHILD.update(
        {
            f"clavicle{_s}": f"shoulder01{_s}",
            f"shoulder01{_s}": f"upperarm01{_s}",
            f"upperarm01{_s}": f"upperarm02{_s}",
            f"upperarm02{_s}": f"lowerarm01{_s}",
            f"lowerarm01{_s}": f"lowerarm02{_s}",
            f"lowerarm02{_s}": f"wrist{_s}",
            f"wrist{_s}": f"finger3-1{_s}",
            f"upperleg01{_s}": f"upperleg02{_s}",
            f"upperleg02{_s}": f"lowerleg01{_s}",
            f"lowerleg01{_s}": f"lowerleg02{_s}",
            f"lowerleg02{_s}": f"foot{_s}",
            f"foot{_s}": f"toe1-1{_s}",
        }
    )

# Bones that must stand on a real source bone: a dummy there would leave the pose with nothing to move.
MUST_BE_REAL = {"head"} | {
    f"{base}{s}"
    for s in SIDES
    for base in ("clavicle", "upperarm01", "lowerarm01", "wrist", "finger2-1", "finger3-1", "finger5-1", "upperleg01", "lowerleg01", "foot", "toe1-1")
}


def blender_name(name):
    # The glTF node name carries the dot MakeHuman's own file has ("upperarm01.L"); GLTFLoader drops it on load, so the
    # bone loads as the C-BONES name "upperarm01L".
    return f"{name[:-1]}.{name[-1]}" if name[-1] in SIDES and name not in ("root", "head") else name


def loaded_name(name):
    return re.sub(r"[\[\].:/]", "", re.sub(r"\s", "_", name))


def fail(message):
    print(f"ERROR: {message}")
    sys.exit(1)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

    def option(flag, default=None):
        return argv[argv.index(flag) + 1] if flag in argv else default

    map_path, out_path = option("--map"), option("--out")
    if not map_path or not out_path:
        fail("usage: blender --factory-startup --disable-autoexec --background <file.blend> --python convert.py -- --map <bone-map.json> --out <model.glb> [--max-mb 3] [--height 1.68] [--subdiv 2,1,0] [--fallback-bone spine01]")
    return {
        "map": Path(map_path),
        "out": Path(out_path),
        "max_mb": float(option("--max-mb", "3")),
        "height": float(option("--height", "1.68")),
        "subdiv": [int(v) for v in option("--subdiv", "2,1,0").split(",")],
        "fallback": option("--fallback-bone", "spine01"),
    }


def load_map(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("id", "source", "armature", "map"):
        if key not in data:
            fail(f"bone map has no '{key}'")
    mapping = data["map"]
    missing = [n for n in BONE_ORDER if n not in mapping]
    if missing:
        fail(f"bone map misses C-BONES names: {missing}")
    extra = [n for n in mapping if n not in PARENTS]
    if extra:
        fail(f"bone map has names that are not in C-BONES: {extra}")
    sources = {}
    seen = {}
    for target in BONE_ORDER:
        value = mapping[target]
        if value == "dummy":
            sources[target] = []
            if target in MUST_BE_REAL:
                fail(f"{target} cannot be a dummy")
            continue
        names = [value] if isinstance(value, str) else list(value)
        if not names or not all(isinstance(n, str) and n for n in names):
            fail(f"{target}: expected a source bone name, a list of them, or 'dummy'")
        for n in names:
            if n in seen:
                fail(f"source bone {n} feeds both {seen[n]} and {target}: the mapping is not distinct")
            seen[n] = target
        sources[target] = names
    return data, sources


def source_joints(armature, sources):
    """World head and tail of every mapped source bone in the rest pose; fails on a missing name."""
    armature.data.pose_position = "REST"
    bpy.context.view_layer.update()
    bones = armature.data.bones
    joints = {}
    for target, names in sources.items():
        for n in names:
            bone = bones.get(n)
            if bone is None:
                fail(f"source bone {n} (for {target}) is not in armature {armature.name}")
            joints[n] = (armature.matrix_world @ bone.head_local, armature.matrix_world @ bone.tail_local)
    return joints


def place_bones(sources, joints):
    """Head position of every target bone. Real bones take the head of their first source bone; a dummy is
    interpolated: the spine and neck dummies along their chain, the root at the middle of the thighs, shoulder01 near
    the end of the clavicle, and the 02 twist bones halfway between their 01 bone and the next joint."""
    head = {t: joints[names[0]][0].copy() for t, names in sources.items() if names}

    def lerp(a, b, t):
        return head[a].lerp(head[b], t)

    def chain(members):
        real = [i for i, n in enumerate(members) if n in head]
        if not real:
            fail(f"nothing to interpolate {members} from")
        for i, name in enumerate(members):
            if name in head:
                continue
            before = max((j for j in real if j < i), default=None)
            after = min((j for j in real if j > i), default=None)
            if before is None or after is None:
                fail(f"{name} is a dummy at the end of its chain; it needs a real bone on both sides")
            head[name] = lerp(members[before], members[after], (i - before) / (after - before))

    chain(SPINE)
    chain(NECK)
    for s in SIDES:
        if f"shoulder01{s}" not in head:
            head[f"shoulder01{s}"] = lerp(f"clavicle{s}", f"upperarm01{s}", 0.85)
        for twist, a, b in (("upperarm02", "upperarm01", "lowerarm01"), ("lowerarm02", "lowerarm01", "wrist"), ("upperleg02", "upperleg01", "lowerleg01"), ("lowerleg02", "lowerleg01", "foot")):
            if f"{twist}{s}" not in head:
                head[f"{twist}{s}"] = lerp(f"{a}{s}", f"{b}{s}", 0.5)
    if "root" not in head:
        head["root"] = lerp("upperleg01L", "upperleg01R", 0.5)
    # The pipeline reads the pelvis center from pelvisL (MakeHuman's pelvis bones start there and end at the hip joints).
    for s in SIDES:
        if f"pelvis{s}" not in head:
            head[f"pelvis{s}"] = head["root"].copy()
    for name in BONE_ORDER:
        if name not in head:
            fail(f"no position for {name}")
    return head


def tails(head, sources, joints):
    tail = {}
    for name in BONE_ORDER:
        child = PRIMARY_CHILD.get(name)
        if child:
            tail[name] = head[child].copy()
        elif sources[name]:
            # A leaf (fingers, toe, head) ends where its last source bone ends.
            tail[name] = joints[sources[name][-1]][1].copy()
        else:
            fail(f"{name} is a leaf dummy")
    for name in BONE_ORDER:
        if (tail[name] - head[name]).length < 1e-4:
            fail(f"{name} has a zero-length bone")
    return tail


def mesh_objects(armature):
    meshes = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name.startswith("WGT"):
            continue
        if any(m.type == "ARMATURE" and m.object == armature for m in obj.modifiers):
            meshes.append(obj)
    return meshes


def bake_mesh(obj, levels):
    """Bakes the object's world transform into the mesh, drops the armature modifier and applies the Subdivision
    modifier at `levels` (capped by the modifier's own render level)."""
    world = obj.matrix_world.copy()
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    obj.parent = None
    obj.matrix_basis = Matrix.Identity(4)
    obj.data.transform(world)
    for modifier in list(obj.modifiers):
        if modifier.type == "SUBSURF":
            modifier.show_viewport = True
            modifier.levels = min(levels, modifier.render_levels)
            if modifier.levels == 0:
                obj.modifiers.remove(modifier)
                continue
            with bpy.context.temp_override(object=obj, active_object=obj):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
        elif modifier.type == "MULTIRES":
            # A Multires modifier stores its own subdivision levels; apply it at the requested level, capped by what exists.
            modifier.show_viewport = True
            modifier.levels = min(levels, modifier.total_levels)
            if modifier.total_levels == 0:
                obj.modifiers.remove(modifier)
                continue
            with bpy.context.temp_override(object=obj, active_object=obj):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
        else:
            fail(f"{obj.name} has an unsupported modifier {modifier.type}")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def join_meshes(meshes):
    if len(meshes) == 1:
        return meshes[0]
    target = meshes[0]
    with bpy.context.temp_override(object=target, active_object=target, selected_editable_objects=meshes, selected_objects=meshes):
        bpy.ops.object.join()
    return target


def reweight(obj, sources, fallback_target):
    """Replaces the source vertex groups by the target bones' groups: sum, keep the 4 largest, normalize."""
    group_to_target = {}
    for target, names in sources.items():
        for n in names:
            group_to_target[n] = target
    index_to_target = {g.index: group_to_target.get(g.name) for g in obj.vertex_groups}
    dropped = sorted(g.name for g in obj.vertex_groups if g.name not in group_to_target)
    mesh = obj.data
    rows = []
    unweighted = 0
    for vertex in mesh.vertices:
        sums = {}
        for entry in vertex.groups:
            target = index_to_target.get(entry.group)
            if target and entry.weight > 0:
                sums[target] = sums.get(target, 0.0) + entry.weight
        if not sums:
            unweighted += 1
            sums = {fallback_target: 1.0}
        top = sorted(sums.items(), key=lambda kv: -kv[1])[:4]
        total = sum(w for _, w in top)
        rows.append([(t, w / total) for t, w in top])
    obj.vertex_groups.clear()
    groups = {}
    for i, row in enumerate(rows):
        for target, weight in row:
            if target not in groups:
                groups[target] = obj.vertex_groups.new(name=blender_name(target))
            groups[target].add([i], weight, "REPLACE")
    return dropped, unweighted, sorted(groups)


def rebuild_materials(obj):
    names = []
    for slot in obj.material_slots:
        material = slot.material
        if material is None:
            fail(f"{obj.name} has an empty material slot")
        color = tuple(material.diffuse_color)
        # The app's body color control tints the material named "Skin", so a source's "skin" becomes that name.
        if material.name.lower() == "skin" and material.name != "Skin" and "Skin" not in bpy.data.materials:
            material.name = "Skin"
        material.use_nodes = True
        tree = material.node_tree
        tree.nodes.clear()
        output = tree.nodes.new("ShaderNodeOutputMaterial")
        shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
        shader.inputs["Metallic"].default_value = 0.0
        shader.inputs["Roughness"].default_value = 0.7
        tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        # The source materials use hashed blending; the flat colors here are opaque.
        if hasattr(material, "blend_method"):
            material.blend_method = "OPAQUE"
        names.append(material.name)
    return names


def build_armature(head, tail, transform):
    data = bpy.data.armatures.new("Armature")
    armature = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = data.edit_bones
    # Two passes: create every bone under a temporary name, then rename, so a Blender ".001" suffix can never land on
    # a final name.
    created = {}
    for i, name in enumerate(BONE_ORDER):
        bone = edit.new(f"__tmp{i}")
        bone.head = transform @ head[name]
        bone.tail = transform @ tail[name]
        bone.roll = 0.0
        created[name] = bone
    for name, bone in created.items():
        bone.name = blender_name(name)
        if bone.name != blender_name(name):
            fail(f"bone name collision: wanted {blender_name(name)}, got {bone.name}")
        if PARENTS[name]:
            bone.parent = created[PARENTS[name]]
    bpy.ops.object.mode_set(mode="OBJECT")
    loaded = [loaded_name(b.name) for b in data.bones]
    if sorted(loaded) != sorted(BONE_ORDER) or len(set(loaded)) != len(loaded):
        fail("loaded bone names do not match C-BONES")
    return armature


def run(args, levels, first):
    if not first:
        bpy.ops.wm.open_mainfile(filepath=bpy.data.filepath, load_ui=False)
        if bpy.context.preferences.filepaths.use_scripts_auto_execute:
            fail("auto-run of Python scripts is on after reloading the file")
    info, sources = load_map(args["map"])
    armature = bpy.data.objects.get(info["armature"])
    if armature is None or armature.type != "ARMATURE":
        fail(f"armature {info['armature']} not found")
    joints = source_joints(armature, sources)
    head = place_bones(sources, joints)
    tail = tails(head, sources, joints)
    meshes = mesh_objects(armature)
    if not meshes:
        fail("no mesh is skinned to the armature")
    report = {"meshes": [m.name for m in meshes], "subdivision_level": levels}
    for obj in meshes:
        bake_mesh(obj, levels)
    obj = join_meshes(meshes)
    obj.name = "Body"
    obj.data.name = "Body"

    # Scale so the character is --height tall from the floor to the top of the head, feet on z = 0 (y = 0 once exported).
    zs = [v.co.z for v in obj.data.vertices]
    low, high = min(zs), max(zs)
    scale = args["height"] / (high - low)
    transform = Matrix.Diagonal((scale, scale, scale, 1.0)) @ Matrix.Translation((0.0, 0.0, -low))
    obj.data.transform(transform)
    report["source_height"] = high - low
    report["scale"] = scale

    report["dropped_groups"], report["unweighted_vertices"], report["weighted_bones"] = reweight(obj, sources, args["fallback"])
    report["materials"] = rebuild_materials(obj)

    new_armature = build_armature(head, tail, transform)
    obj.parent = new_armature
    obj.matrix_parent_inverse = Matrix.Identity(4)
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = new_armature
    for other in list(bpy.data.objects):
        if other not in (obj, new_armature):
            bpy.data.objects.remove(other, do_unlink=True)
    # A skinned mesh must carry the armature, or the viewer cannot pose it.
    for mesh in (o for o in bpy.data.objects if o.type == "MESH"):
        if not any(m.type == "ARMATURE" and m.object == new_armature for m in mesh.modifiers) or mesh.parent != new_armature:
            fail(f"mesh {mesh.name} is not skinned to the new armature")

    for o in bpy.data.objects:
        o.select_set(True)
    out = args["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_skins=True,
        export_def_bones=False,
        export_influence_nb=4,
        export_morph=False,
        export_materials="EXPORT",
        export_extras=False,
    )
    report["bytes"] = out.stat().st_size
    return report


def main():
    print(f"Blender {bpy.app.version_string}")
    if bpy.context.preferences.filepaths.use_scripts_auto_execute:
        fail("auto-run of Python scripts is on (start Blender with --disable-autoexec)")
    if not bpy.data.filepath:
        fail("no .blend file loaded: pass it before --python")
    args = parse_args()
    limit = args["max_mb"] * 1024 * 1024
    report = None
    for i, levels in enumerate(args["subdiv"]):
        report = run(args, levels, first=i == 0)
        print(f"subdivision level {levels}: {report['bytes'] / 1024 / 1024:.2f} MB")
        if report["bytes"] <= limit:
            break
    if report["bytes"] > limit:
        args["out"].unlink(missing_ok=True)
        fail(f"GLB is {report['bytes'] / 1024 / 1024:.2f} MB at the lowest subdivision level; the limit is {args['max_mb']} MB")
    print(json.dumps(report, indent=2))
    print(f"wrote {args['out']} ({report['bytes'] / 1024 / 1024:.2f} MB)")


main()
