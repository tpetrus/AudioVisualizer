# Checks a converted character GLB against the contracts (C-BONES, C-ASSETS) by reading the file itself, with no Blender
# and no dependencies: python -I scripts/blender-characters/check_glb.py <model.glb> [--max-mb 3] [--height 1.68]
#
# It asserts: every C-BONES name is a joint of a skin (and the skin has no others), the node hierarchy matches C-BONES,
# the file size, the material names, one skinned mesh node, no animation/camera/light, every vertex has at most 4
# normalized influences, and that the character stands upright on y = 0, faces +Z and is --height tall (+-10%).
# It exits non-zero on the first failed check group and prints what it measured.

import json
import math
import re
import struct
import sys
from pathlib import Path

SIDES = ["L", "R"]
PARENTS = {
    "root": None,
    "spine05": "root",
    "spine04": "spine05",
    "spine03": "spine04",
    "spine02": "spine03",
    "spine01": "spine02",
    "neck01": "spine01",
    "neck02": "neck01",
    "neck03": "neck02",
    "head": "neck03",
}
for s in SIDES:
    for name, parent in (
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
    ):
        PARENTS[f"{name}{s}"] = parent


def loaded(name):
    # PropertyBinding.sanitizeNodeName in three.js.
    return re.sub(r"[\[\].:/]", "", re.sub(r"\s", "_", name))


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF" and version == 2 and length == len(data), "not a GLB 2.0 file"
    offset, doc, binary = 12, None, b""
    while offset < len(data):
        size, kind = struct.unpack("<I4s", data[offset : offset + 8])
        chunk = data[offset + 8 : offset + 8 + size]
        if kind == b"JSON":
            doc = json.loads(chunk)
        elif kind == b"BIN\x00":
            binary = chunk
        offset += 8 + size
    return doc, binary


def mat_identity():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def local_matrix(node):
    if "matrix" in node:
        m = node["matrix"]  # column-major
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    r = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [
        [r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx],
        [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
        [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz],
        [0, 0, 0, 1],
    ]


def main():
    argv = sys.argv[1:]
    if not argv or argv[0].startswith("--"):
        sys.exit("usage: python -I check_glb.py <model.glb> [--max-mb 3] [--height 1.68]")
    path = Path(argv[0])
    max_mb = float(argv[argv.index("--max-mb") + 1]) if "--max-mb" in argv else 3.0
    height = float(argv[argv.index("--height") + 1]) if "--height" in argv else 1.68
    doc, binary = read_glb(path)
    problems = []

    def check(ok, message):
        print(("ok    " if ok else "FAIL  ") + message)
        if not ok:
            problems.append(message)

    size = path.stat().st_size
    check(size <= max_mb * 1024 * 1024, f"file size {size / 1024 / 1024:.2f} MB <= {max_mb} MB")

    nodes = doc["nodes"]
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i
    by_loaded = {}
    for i, node in enumerate(nodes):
        by_loaded.setdefault(loaded(node.get("name", "")), []).append(i)
    check(all(len(v) == 1 for v in by_loaded.values()), "node names are unique once loaded")

    skins = doc.get("skins", [])
    check(len(skins) == 1, f"one skin ({len(skins)})")
    joints = skins[0]["joints"]
    joint_names = [loaded(nodes[j].get("name", "")) for j in joints]
    check(len(joints) == len(PARENTS), f"joints count {len(joints)} == {len(PARENTS)} C-BONES")
    check(set(joint_names) == set(PARENTS), f"joint names equal C-BONES (missing {sorted(set(PARENTS) - set(joint_names))}, extra {sorted(set(joint_names) - set(PARENTS))})")

    index = {loaded(nodes[j].get("name", "")): j for j in joints}
    wrong = []
    for name, expected in PARENTS.items():
        actual = parent.get(index.get(name))
        actual_name = loaded(nodes[actual].get("name", "")) if actual is not None else None
        if expected is None:
            if actual_name in PARENTS:
                wrong.append((name, actual_name, None))
        elif actual_name != expected:
            wrong.append((name, actual_name, expected))
    check(not wrong, f"hierarchy matches C-BONES {wrong}")

    # The root bone's parent (the Armature node) must be an identity transform, and so must every ancestor above it.
    ancestor = parent.get(index["root"])
    chain_identity = True
    while ancestor is not None:
        chain_identity &= all(abs(a - b) < 1e-6 for ra, rb in zip(local_matrix(nodes[ancestor]), mat_identity()) for a, b in zip(ra, rb))
        ancestor = parent.get(ancestor)
    check(chain_identity, "root bone sits under identity-transform ancestors")

    world = {}

    def world_matrix(i):
        if i not in world:
            local = local_matrix(nodes[i])
            world[i] = mat_mul(world_matrix(parent[i]), local) if i in parent else local
        return world[i]

    def pos(name):
        m = world_matrix(index[name])
        return [m[0][3], m[1][3], m[2][3]]

    check(pos("head")[1] > pos("root")[1] > pos("footL")[1], f"upright: head y {pos('head')[1]:.3f} > root y {pos('root')[1]:.3f} > foot y {pos('footL')[1]:.3f}")
    check(pos("toe1-1L")[2] >= pos("footL")[2] - 0.002, f"faces +Z: toe z {pos('toe1-1L')[2]:.3f} > ankle z {pos('footL')[2]:.3f}")
    check(pos("wristL")[0] * pos("wristR")[0] < 0, f"left/right: wristL x {pos('wristL')[0]:.3f}, wristR x {pos('wristR')[0]:.3f}")
    check(abs(pos("footL")[0] + pos("footR")[0]) < 0.05 and abs(pos("root")[0]) < 0.01, "symmetric about x = 0")

    # Meshes: one skinned mesh node, positions give the height and the floor.
    skinned = [n for n in nodes if "mesh" in n]
    check(len(skinned) == 1 and all("skin" in n for n in skinned), f"one mesh node, skinned ({len(skinned)})")
    mesh = doc["meshes"][skinned[0]["mesh"]]
    check(len(doc["meshes"]) == 1, f"mesh count {len(doc['meshes'])}")
    accessors = doc["accessors"]
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for primitive in mesh["primitives"]:
        a = accessors[primitive["attributes"]["POSITION"]]
        lo = [min(x, y) for x, y in zip(lo, a["min"])]
        hi = [max(x, y) for x, y in zip(hi, a["max"])]
        check("JOINTS_0" in primitive["attributes"] and "JOINTS_1" not in primitive["attributes"], f"primitive {primitive.get('material')} has 4 influences")
    extent = hi[1] - lo[1]
    check(abs(extent - height) <= 0.1 * height, f"height {extent:.4f} m within 10% of {height} (min y {lo[1]:.4f}, max y {hi[1]:.4f})")
    check(abs(lo[1]) < 0.01, f"feet on y = 0 (min y {lo[1]:.5f})")
    print(f"      bounding box x [{lo[0]:.3f}, {hi[0]:.3f}] z [{lo[2]:.3f}, {hi[2]:.3f}]")

    # Weights: each vertex's four weights sum to 1 and a nonzero weight never points at a joint outside the skin.
    views = doc["bufferViews"]
    worst = 0.0
    bad_joint = 0
    vertices = 0
    for primitive in mesh["primitives"]:
        wa = accessors[primitive["attributes"]["WEIGHTS_0"]]
        ja = accessors[primitive["attributes"]["JOINTS_0"]]
        wv, jv = views[wa["bufferView"]], views[ja["bufferView"]]
        wstride = wv.get("byteStride", 16)
        jstride = jv.get("byteStride", 8 if ja["componentType"] == 5123 else 4)
        assert wa["componentType"] == 5126, "weights are expected as float32"
        for v in range(wa["count"]):
            w = struct.unpack_from("<4f", binary, wv.get("byteOffset", 0) + wa.get("byteOffset", 0) + v * wstride)
            if ja["componentType"] == 5123:
                j = struct.unpack_from("<4H", binary, jv.get("byteOffset", 0) + ja.get("byteOffset", 0) + v * jstride)
            else:
                j = struct.unpack_from("<4B", binary, jv.get("byteOffset", 0) + ja.get("byteOffset", 0) + v * jstride)
            worst = max(worst, abs(sum(w) - 1.0))
            bad_joint += sum(1 for wi, ji in zip(w, j) if wi > 0 and ji >= len(joints))
            vertices += 1
    check(worst < 1e-3, f"{vertices} vertices, weights sum to 1 (worst error {worst:.2e})")
    check(bad_joint == 0, "no weight points outside the skin")

    materials = [m.get("name") for m in doc.get("materials", [])]
    print(f"      materials {materials}")
    check(len(materials) == len(set(materials)) and "Skin" in materials, "material names are unique and include Skin")
    check(not doc.get("animations") and not doc.get("cameras") and "KHR_lights_punctual" not in doc.get("extensionsUsed", []), "no animation, camera or light")
    check(all(m.get("alphaMode", "OPAQUE") == "OPAQUE" for m in doc.get("materials", [])), "all materials are opaque")

    print("\nPASS" if not problems else f"\n{len(problems)} problem(s)")
    sys.exit(1 if problems else 0)


main()
