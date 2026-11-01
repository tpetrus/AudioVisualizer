// Loads the generated GLB with three's GLTFLoader (as the app will) and prints what a later animation task needs to
// know: the skinned mesh and bone counts, the bounding box, the rest pose, each dance bone's rest axes in world space and
// which way a small rotation about each local axis moves the bone's child. Throws when an expectation fails.

import { readFileSync } from 'node:fs';
import { Box3, Matrix4, PropertyBinding, Quaternion, SkinnedMesh, Vector3 } from 'three';
import type { Bone, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// [bone, a descendant whose movement shows what rotating the bone does]
const DANCE_BONES: [string, string][] = [
    ['root', 'spine05'],
    ['root', 'upperarm01.L'],
    ['spine05', 'upperarm01.L'],
    ['spine03', 'upperarm01.L'],
    ['spine01', 'upperarm01.L'],
    ['spine05', 'spine04'],
    ['spine04', 'spine03'],
    ['spine03', 'spine02'],
    ['spine02', 'spine01'],
    ['spine01', 'neck01'],
    ['neck01', 'neck02'],
    ['neck02', 'neck03'],
    ['neck03', 'head'],
    ['head', 'head'],
    ['clavicle.L', 'upperarm01.L'],
    ['shoulder01.L', 'upperarm01.L'],
    ['upperarm01.L', 'wrist.L'],
    ['upperarm02.L', 'wrist.L'],
    ['lowerarm01.L', 'wrist.L'],
    ['lowerarm02.L', 'wrist.L'],
    ['wrist.L', 'wrist.L'],
    ['pelvis.L', 'upperleg01.L'],
    ['upperleg01.L', 'foot.L'],
    ['upperleg02.L', 'foot.L'],
    ['lowerleg01.L', 'foot.L'],
    ['lowerleg02.L', 'foot.L'],
    ['foot.L', 'foot.L'],
    ['clavicle.R', 'upperarm01.R'],
    ['shoulder01.R', 'upperarm01.R'],
    ['upperarm01.R', 'wrist.R'],
    ['upperarm02.R', 'wrist.R'],
    ['lowerarm01.R', 'wrist.R'],
    ['lowerarm02.R', 'wrist.R'],
    ['wrist.R', 'wrist.R'],
    ['pelvis.R', 'upperleg01.R'],
    ['upperleg01.R', 'foot.R'],
    ['upperleg02.R', 'foot.R'],
    ['lowerleg01.R', 'foot.R'],
    ['lowerleg02.R', 'foot.R'],
    ['foot.R', 'foot.R'],
];

const fmt = (v: Vector3): string => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
// The nearest cardinal direction of a vector, e.g. "+Y" or "-Z" (with the dominant share in parentheses).
function cardinal(v: Vector3): string {
    const axes = [
        ['X', v.x],
        ['Y', v.y],
        ['Z', v.z],
    ] as const;
    const [name, value] = [...axes].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    return `${value < 0 ? '-' : '+'}${name}(${Math.abs(value / v.length()).toFixed(2)})`;
}

function expect(condition: boolean, message: string): void {
    if (!condition) throw new Error(`check failed: ${message}`);
    console.log(`ok: ${message}`);
}

export async function checkGlb(path: string): Promise<void> {
    const bytes = readFileSync(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const meshes: SkinnedMesh[] = [];
    const boneObjects = new Map<string, Bone>();
    scene.traverse((object: Object3D) => {
        if (object instanceof SkinnedMesh) meshes.push(object as SkinnedMesh);
        if ('isBone' in object) boneObjects.set(object.name, object as Bone);
    });
    expect(meshes.length === 1, `one SkinnedMesh (found ${meshes.length})`);
    const mesh = meshes[0];
    expect(mesh.skeleton.bones.length === 163, `163 bones (found ${mesh.skeleton.bones.length})`);
    // GLTFLoader strips "[ ] . : /" from node names, so "upperarm01.L" is "upperarm01L" once loaded.
    const bone = (name: string): Bone => {
        const found = boneObjects.get(PropertyBinding.sanitizeNodeName(name));
        if (!found) throw new Error(`no bone ${name}`);
        return found;
    };
    for (const name of ['root', 'spine05', 'head', 'upperarm01.L', 'lowerleg01.R', 'foot.L']) bone(name);
    expect(mesh.geometry.getAttribute('position').count > 10000, 'mesh has the body vertices');

    // Weights sum to 1 on every vertex.
    const weights = mesh.geometry.getAttribute('skinWeight');
    let worstSum = 0;
    for (let i = 0; i < weights.count; i++) {
        worstSum = Math.max(
            worstSum,
            Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1),
        );
    }
    expect(worstSum < 1e-5, `every vertex's weights sum to 1 (worst error ${worstSum.toExponential(2)})`);

    const box = new Box3().setFromObject(mesh, true);
    const size = box.getSize(new Vector3());
    console.log(`bbox min ${fmt(box.min)} max ${fmt(box.max)} size ${fmt(size)}`);
    expect(size.y > 1.6 && size.y < 1.8, `about 1.7 m tall (${size.y.toFixed(3)} m)`);

    // Facing: the toes lie in front of the heel, and the figure's left (.L) is on the +X side when it faces +Z.
    const world = (name: string): Vector3 => bone(name).getWorldPosition(new Vector3());
    const toeDirection = world('toe1-1.L').sub(world('foot.L'));
    expect(toeDirection.z > 0.05, `faces +Z (toes ${toeDirection.z.toFixed(3)} m ahead of the ankle)`);
    expect(world('upperarm01.L').x > world('upperarm01.R').x, 'the .L side is at +X');

    // Rest pose: an A-pose has the wrists below the shoulders and out to the side, not straight down and not horizontal.
    const arm = world('wrist.L').sub(world('upperarm01.L'));
    const dropAngle = (Math.atan2(arm.x, -arm.y) * 180) / Math.PI;
    console.log(`left arm rest: shoulder to wrist ${fmt(arm)}, ${dropAngle.toFixed(1)} degrees out from straight down`);
    expect(dropAngle > 15 && dropAngle < 70 && Math.abs(arm.z) < 0.25, 'rest pose is an A-pose');

    // Skinning: bend the left upper arm about each local axis, and count which vertices move.
    const rest = positionsOf(mesh);
    const upperArm = bone('upperarm01.L');
    for (const axis of ['x', 'y', 'z'] as const) {
        const restQuaternion = upperArm.quaternion.clone();
        upperArm.quaternion.multiply(localRotation(axis, 0.6));
        scene.updateMatrixWorld(true);
        const moved = positionsOf(mesh);
        let count = 0;
        let wrongSide = 0;
        for (let i = 0; i < rest.length; i += 3) {
            const distance = Math.hypot(moved[i] - rest[i], moved[i + 1] - rest[i + 1], moved[i + 2] - rest[i + 2]);
            if (distance > 0.01) {
                count++;
                if (rest[i] < 0) wrongSide++;
            }
        }
        upperArm.quaternion.copy(restQuaternion);
        scene.updateMatrixWorld(true);
        console.log(`rotating upperarm01.L about local ${axis.toUpperCase()}: ${count} vertices move by > 1 cm`);
        expect(count > 200 && wrongSide === 0, `upperarm01.L ${axis.toUpperCase()} moves only left-side vertices`);
    }

    // Report: parent, rest world head and local axes in world coordinates.
    console.log('\nbone | parent | world head (m) | local X | local Y | local Z (world coordinates)');
    for (const name of new Set(DANCE_BONES.map(([bone]) => bone))) {
        const object = bone(name);
        const head = object.getWorldPosition(new Vector3());
        const q = object.getWorldQuaternion(new Quaternion());
        const m = new Matrix4().makeRotationFromQuaternion(q);
        const axes = [new Vector3(), new Vector3(), new Vector3()];
        m.extractBasis(axes[0], axes[1], axes[2]);
        const parent = object.parent instanceof Object && 'isBone' in object.parent ? object.parent.name : '-';
        console.log(
            `${object.name} | ${parent} | ${fmt(head)} | ${axes.map((a) => `${fmt(a)} ${cardinal(a)}`).join(' | ')}`,
        );
    }

    // Probe: which way does a +0.3 rad rotation about each local axis move the bone's reference descendant (or, for a
    // leaf, a point 0.1 m along its local Y)? Positions are relative to the bone head.
    console.log('\nbone +0.3 rad about local axis: displacement of the reference point (world)');
    for (const [name, reference] of DANCE_BONES) {
        const object = bone(name);
        const target = reference === name ? null : bone(reference);
        const point = (): Vector3 =>
            target ? target.getWorldPosition(new Vector3()) : new Vector3(0, 0.1, 0).applyMatrix4(object.matrixWorld);
        const before = point();
        const line: string[] = [];
        for (const axis of ['x', 'y', 'z'] as const) {
            const restQuaternion = object.quaternion.clone();
            object.quaternion.multiply(localRotation(axis, 0.3));
            scene.updateMatrixWorld(true);
            const delta = point().sub(before);
            line.push(`${axis.toUpperCase()}: ${fmt(delta.multiplyScalar(100))} cm`);
            object.quaternion.copy(restQuaternion);
            scene.updateMatrixWorld(true);
        }
        console.log(`${object.name} (via ${reference}): ${line.join('  ')}`);
    }
}

// A rotation about one of the bone's own axes (its rest frame), applied the way an animation clip should write it:
// the new local quaternion is rest * rotation(axis, angle).
function localRotation(axis: 'x' | 'y' | 'z', angle: number): Quaternion {
    const unit = new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    return new Quaternion().setFromAxisAngle(unit, angle);
}

function positionsOf(mesh: SkinnedMesh): Float32Array {
    const count = mesh.geometry.getAttribute('position').count;
    const out = new Float32Array(count * 3);
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, v);
        // getVertexPosition is in mesh space and the mesh node has no transform, so this is also world space.
        out.set([v.x, v.y, v.z], i * 3);
    }
    return out;
}
