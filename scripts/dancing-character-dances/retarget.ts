// Retargets a CMU ASF/AMC motion onto the MakeHuman rig.
//
// Per mapped target bone the world rotation is Rt(t) = Rfix * Ws(t) * A * Rt0, where Ws(t) is the source bone's world
// rotation (the identity at the source's rest pose, so Ws * Rs0^-1 is Ws), Rfix turns the whole motion about the
// vertical axis to face +Z, A is a rest alignment (the identity for the torso, neck, head and root, which are neutral
// standing in both rigs; a shortest arc from the target bone's rest direction onto the source's for arms and legs, which
// are an A-pose in the target and a T-pose in the source; a calibration that keeps the sole flat while the foot is in
// contact for the feet) and Rt0 is the target bone's rest world rotation. The local rotation is then
// parentWorld(t)^-1 * Rt(t), where an unmapped parent keeps its rest local rotation.

import { Matrix4, Quaternion, Vector3 } from 'three';
import { createSourcePose, poseSource } from './acclaim';
import type { AmcMotion, AsfSkeleton } from './acclaim';
import type { TargetRig } from './rig';

type Align =
    | { kind: 'identity' }
    | { kind: 'arc'; head: string; tail: string; sourceDirection: string }
    // Full-frame alignment: the bone direction plus a secondary axis (world up, the elbow hinge or the palm normal)
    // in both rigs, so the roll about the bone matches as well as its direction.
    | {
          kind: 'frame';
          head: string;
          tail: string;
          sourceBone: string;
          secondary: 'up' | 'hinge' | 'palm';
          side: 'L' | 'R';
      }
    | { kind: 'foot'; tibia: string; side: 'l' | 'r' };

interface MapEntry {
    target: string;
    // The source bone, or a blend of two source bones: slerp(a, b, t).
    a: string;
    b: string;
    t: number;
    align: Align;
}

const entry = (target: string, a: string, align: Align, b = a, t = 0): MapEntry => ({ target, a, b, t, align });
const identity: Align = { kind: 'identity' };

// Target bones the dance drives, by their loaded names. The 02 twist bones (upperleg02, lowerleg02, upperarm02,
// lowerarm02), the pelvis, shoulder, toe and finger bones keep their rest rotation: a twist then lands entirely on the
// 01 bone, and the hand turns with the `wrist` bone, which takes the source's hand.
export function boneMap(): MapEntry[] {
    const map: MapEntry[] = [
        entry('root', 'root', identity),
        entry('spine05', 'lowerback', identity),
        entry('spine04', 'lowerback', identity),
        entry('spine03', 'lowerback', identity, 'upperback', 0.43),
        entry('spine02', 'upperback', identity, 'thorax', 0.15),
        entry('spine01', 'thorax', identity),
        entry('neck01', 'lowerneck', identity),
        entry('neck02', 'lowerneck', identity, 'upperneck', 0.5),
        entry('neck03', 'upperneck', identity),
        entry('head', 'head', identity),
    ];
    for (const [side, prefix] of [
        ['L', 'l'],
        ['R', 'r'],
    ] as const) {
        map.push(
            // The clavicles stay neutral (identity): both rigs stand with their shoulders level, and matching the
            // source's clavicle direction would lift the whole shoulder girdle.
            entry(`clavicle${side}`, `${prefix}clavicle`, identity),
            entry(`upperarm01${side}`, `${prefix}humerus`, {
                kind: 'frame',
                head: `upperarm01${side}`,
                tail: `lowerarm01${side}`,
                sourceBone: `${prefix}humerus`,
                secondary: 'hinge',
                side,
            }),
            entry(`lowerarm01${side}`, `${prefix}radius`, {
                kind: 'frame',
                head: `lowerarm01${side}`,
                tail: `wrist${side}`,
                sourceBone: `${prefix}radius`,
                secondary: 'hinge',
                side,
            }),
            entry(`wrist${side}`, `${prefix}hand`, {
                kind: 'frame',
                head: `wrist${side}`,
                tail: `finger3-1${side}`,
                sourceBone: `${prefix}hand`,
                secondary: 'palm',
                side,
            }),
            entry(`upperleg01${side}`, `${prefix}femur`, {
                kind: 'arc',
                head: `upperleg01${side}`,
                tail: `lowerleg01${side}`,
                sourceDirection: `${prefix}femur`,
            }),
            entry(`lowerleg01${side}`, `${prefix}tibia`, {
                kind: 'arc',
                head: `lowerleg01${side}`,
                tail: `foot${side}`,
                sourceDirection: `${prefix}tibia`,
            }),
            entry(`foot${side}`, `${prefix}foot`, { kind: 'foot', tibia: `${prefix}tibia`, side: prefix }),
        );
    }
    return map;
}

// The twist bones: the roll between two source bones about the bone's axis, taken by the 02 bone. The 01 bones sit at the
// joints and the 02 bones in the middle of the segment, so 02 takes half of the roll and the next bone (the lower arm,
// or the wrist) all of it.
const TWISTS = [
    // [twist bone, child whose head gives the axis, source bone before, source bone after]
    ['upperarm02', 'lowerarm01', 'humerus', 'radius'],
    ['lowerarm02', 'wrist', 'radius', 'wrist'],
] as const;
export const TWIST_SHARE = 0.5;

// The palm normal from the hand's joint positions (the middle finger's direction crossed with the index-to-pinky
// span, mirrored for the right hand), given a lookup of joint positions.
export function palmNormal(at: (name: string) => Vector3, side: 'L' | 'R', out = new Vector3()): Vector3 {
    const wrist = at(`wrist${side}`);
    const middle = at(`finger3-1${side}`).clone().sub(wrist);
    const span = at(`finger2-1${side}`)
        .clone()
        .sub(at(`finger5-1${side}`));
    return out
        .copy(middle)
        .cross(span)
        .multiplyScalar(side === 'L' ? 1 : -1)
        .normalize();
}

// The elbow's flexion axis from the rest pose, oriented so a positive rotation bends the forearm further forward.
export function targetHinge(rig: TargetRig, side: 'L' | 'R'): Vector3 {
    const at = (n: string): Vector3 => rig.restHead.get(n) as Vector3;
    const upper = at(`lowerarm01${side}`)
        .clone()
        .sub(at(`upperarm01${side}`));
    const fore = at(`wrist${side}`)
        .clone()
        .sub(at(`lowerarm01${side}`));
    const h = upper.cross(fore).normalize();
    if (h.clone().cross(fore).z <= 0) throw new Error('target elbow hinge does not flex forward');
    return h;
}

// The elbow's hinge in the source's rest pose: the radius's `axis` frame applied to its X (the dof is rx), oriented
// like the target's.
export function sourceHinge(skeleton: AsfSkeleton, side: 'L' | 'R'): Vector3 {
    const radius = skeleton.bones[skeleton.index.get(`${side === 'L' ? 'l' : 'r'}radius`) as number];
    const h = new Vector3(1, 0, 0).applyQuaternion(radius.axis);
    if (h.clone().cross(radius.direction).z < 0) h.negate();
    return h;
}

// The hand's palm normal in the source's rest pose: the hand's rz axis (radial/ulnar deviation, about the palm's
// normal), taken as the one that points down (the capture's T-pose has the palms down).
export function sourcePalm(skeleton: AsfSkeleton, side: 'L' | 'R'): Vector3 {
    const hand = skeleton.bones[skeleton.index.get(`${side === 'L' ? 'l' : 'r'}hand`) as number];
    const n = new Vector3(0, 0, 1).applyQuaternion(hand.axis);
    if (n.y > 0) n.negate();
    return n;
}

const basis = (d: Vector3, s: Vector3): Quaternion => {
    const x = d.clone().normalize();
    const z = x.clone().cross(s).normalize();
    const y = z.clone().cross(x);
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
};

// Rotation angle about `axis` of the twist part of q (swing-twist decomposition), wrapped to (-pi, pi].
function twistAngle(q: Quaternion, axis: Vector3): number {
    let a = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
}

export interface Retargeted {
    fps: number;
    frames: number;
    // Target local rotations per mapped bone, frames * 4 (x, y, z, w), at the source frame rate.
    quaternions: Map<string, Float32Array>;
    // Where the root bone's position tracks start from: the pelvis center in the source frame (facing fixed), meters in
    // the target's scale, frames * 2 (x, z), the pelvis height frames, and the ground offset that was added to it.
    swayXZ: Float64Array;
    pelvisHeight: Float64Array;
    legRatio: number;
    meanYawDegrees: number;
    // Signals at the source frame rate for the tempo estimate: pelvis height, both ankles' heights added, and the
    // left ankle's height minus the right's (meters).
    ankleSum: Float64Array;
    ankleDifference: Float64Array;
    // The pelvis center and the root bone's head in the target's rest pose, to turn a pelvis position into a root one.
    restPelvis: Vector3;
    restRootHead: Vector3;
    restAnkleY: number;
}

const UP = new Vector3(0, 1, 0);

function percentile(values: number[], p: number): number {
    const sorted = [...values].sort((x, y) => x - y);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
}

export function retarget(skeleton: AsfSkeleton, motion: AmcMotion, fps: number, rig: TargetRig): Retargeted {
    const frames = motion.frames.length;
    const nb = skeleton.bones.length;
    const idx = (name: string): number => {
        const i = skeleton.index.get(name);
        if (i === undefined) throw new Error(`no source bone ${name}`);
        return i;
    };
    // 1. Pose every source frame.
    const pose = createSourcePose(skeleton);
    const rotations = new Float64Array(frames * nb * 4);
    const rootPositions = new Float64Array(frames * 3);
    const ankleSource: Record<'l' | 'r', Float64Array> = {
        l: new Float64Array(frames * 3),
        r: new Float64Array(frames * 3),
    };
    const tibia = { l: idx('ltibia'), r: idx('rtibia') };
    for (let f = 0; f < frames; f++) {
        poseSource(skeleton, motion.frames[f], pose);
        for (let i = 0; i < nb; i++) pose.rotation[i].toArray(rotations, (f * nb + i) * 4);
        pose.rootPosition.toArray(rootPositions, f * 3);
        pose.tail[tibia.l].toArray(ankleSource.l, f * 3);
        pose.tail[tibia.r].toArray(ankleSource.r, f * 3);
    }
    const world = (f: number, i: number, out: Quaternion): Quaternion => out.fromArray(rotations, (f * nb + i) * 4);

    // Rest source skeleton: the vertical distance from the root to the ankles, for the leg ratio.
    const restPose = createSourcePose(skeleton);
    poseSource(skeleton, null, restPose);
    const sourceLeg = -(restPose.tail[tibia.l].y + restPose.tail[tibia.r].y) / 2;
    const head = (name: string): Vector3 => rig.restHead.get(name) as Vector3;
    const restPelvis = head('pelvisL').clone();
    const targetLeg = restPelvis.y - (head('footL').y + head('footR').y) / 2;
    const legRatio = targetLeg / sourceLeg;

    // 2. Facing: turn the motion about Y so the pelvis and thorax face +Z on average (a circular mean of the yaw).
    const q = new Quaternion();
    const forward = new Vector3();
    let sx = 0;
    let sz = 0;
    for (let f = 0; f < frames; f++) {
        for (const name of ['root', 'thorax']) {
            forward.set(0, 0, 1).applyQuaternion(world(f, idx(name), q));
            const length = Math.hypot(forward.x, forward.z);
            if (length > 1e-6) {
                sx += forward.x / length;
                sz += forward.z / length;
            }
        }
    }
    const meanYaw = Math.atan2(sx, sz);
    const rFix = new Quaternion().setFromAxisAngle(UP, -meanYaw);

    // 3. Rest alignments.
    const entries = boneMap();
    const alignments = new Map<string, Quaternion>();
    const groundSource = percentile(
        Array.from({ length: frames }, (_, f) => Math.min(ankleSource.l[f * 3 + 1], ankleSource.r[f * 3 + 1])),
        0.03,
    );
    for (const e of entries) {
        const a = new Quaternion();
        if (e.align.kind === 'arc') {
            const from = head(e.align.tail).clone().sub(head(e.align.head)).normalize();
            a.setFromUnitVectors(from, skeleton.bones[idx(e.align.sourceDirection)].direction);
        } else if (e.align.kind === 'frame') {
            const al = e.align;
            const sourceBone = skeleton.bones[idx(al.sourceBone)];
            const targetDirection = head(al.tail).clone().sub(head(al.head));
            const secondaryTarget =
                al.secondary === 'up'
                    ? UP.clone()
                    : al.secondary === 'hinge'
                      ? targetHinge(rig, al.side)
                      : palmNormal(head, al.side);
            const secondarySource =
                al.secondary === 'up'
                    ? UP.clone()
                    : al.secondary === 'hinge'
                      ? sourceHinge(skeleton, al.side)
                      : sourcePalm(skeleton, al.side);
            a.copy(basis(sourceBone.direction, secondarySource)).multiply(
                basis(targetDirection, secondaryTarget).invert(),
            );
        } else if (e.align.kind === 'foot') {
            // The foot's up vector in the source's rest frame, averaged over the frames its ankle is near the ground:
            // the sole is flat then, so the target's sole (up in its rest pose) must map onto it.
            const ankles = ankleSource[e.align.side];
            const sum = new Vector3();
            let count = 0;
            for (let f = 0; f < frames; f++) {
                if (ankles[f * 3 + 1] - groundSource > 0.03) continue;
                sum.add(UP.clone().applyQuaternion(world(f, idx(e.a), q).invert()));
                count++;
            }
            if (count >= 10) a.setFromUnitVectors(UP, sum.normalize());
        }
        alignments.set(e.target, a);
    }

    // 3b. Twist angles per frame (radians, unwrapped) about the source bone's axis, and the axis in the target bone's
    // own frame.
    const twists = new Map<string, { axis: Vector3; angles: Float64Array }>();
    const twistBefore = new Quaternion();
    const twistAfter = new Quaternion();
    for (const side of ['L', 'R'] as const) {
        const prefix = side === 'L' ? 'l' : 'r';
        for (const [bone, child, before, after] of TWISTS) {
            const sourceBefore = `${prefix}${before}`;
            const sourceAfter = `${prefix}${after}`;
            const direction = skeleton.bones[idx(`${prefix}${before}`)].direction;
            const angles = new Float64Array(frames);
            for (let f = 0; f < frames; f++) {
                world(f, idx(sourceBefore), twistBefore).invert();
                const rel = twistBefore.multiply(world(f, idx(sourceAfter), twistAfter));
                let angle = twistAngle(rel, direction);
                if (f > 0) angle += Math.round((angles[f - 1] - angle) / (2 * Math.PI)) * 2 * Math.PI;
                angles[f] = angle;
            }
            const name = `${bone}${side}`;
            const axisWorld = head(`${child}${side}`).clone().sub(head(name)).normalize();
            const axis = axisWorld.applyQuaternion((rig.restWorld.get(name) as Quaternion).clone().invert());
            twists.set(name, { axis, angles });
        }
    }

    // 4. Target rotations.
    const mapped = new Map(entries.map((e) => [e.target, e]));
    const quaternions = new Map<string, Float32Array>();
    for (const e of entries) quaternions.set(e.target, new Float32Array(frames * 4));
    for (const name of twists.keys()) quaternions.set(name, new Float32Array(frames * 4));
    const twistQ = new Quaternion();
    const worlds = new Map<string, Quaternion>(rig.bones.map((b) => [b.name, new Quaternion()]));
    const qa = new Quaternion();
    const qb = new Quaternion();
    const delta = new Quaternion();
    const local = new Quaternion();
    for (let f = 0; f < frames; f++) {
        for (const bone of rig.bones) {
            const parentWorld = bone.parent && worlds.get(bone.parent.name);
            const w = worlds.get(bone.name) as Quaternion;
            const e = mapped.get(bone.name);
            const twist = twists.get(bone.name);
            if (!e) {
                local.copy(rig.restLocal.get(bone.name) as Quaternion);
                // A twist bone rolls about its own axis, by its share of the roll the source has there.
                if (twist) local.multiply(twistQ.setFromAxisAngle(twist.axis, twist.angles[f] * TWIST_SHARE));
                if (parentWorld) w.copy(parentWorld).multiply(local);
                else w.copy(local);
                if (!twist) continue;
            } else {
                world(f, idx(e.a), qa);
                if (e.t > 0) delta.copy(qa).slerp(world(f, idx(e.b), qb), e.t);
                else delta.copy(qa);
                w.copy(rFix)
                    .multiply(delta)
                    .multiply(alignments.get(e.target) as Quaternion)
                    .multiply(rig.restWorld.get(bone.name) as Quaternion);
                if (parentWorld) local.copy(parentWorld).invert().multiply(w);
                else local.copy(w);
            }
            // Keep the track on one side of the sphere so linear and spherical interpolation agree.
            const track = quaternions.get(bone.name) as Float32Array;
            if (f > 0) {
                const prev = f * 4 - 4;
                if (
                    local.x * track[prev] +
                        local.y * track[prev + 1] +
                        local.z * track[prev + 2] +
                        local.w * track[prev + 3] <
                    0
                ) {
                    local.set(-local.x, -local.y, -local.z, -local.w);
                }
            }
            local.toArray(track, f * 4);
        }
    }

    // 5. Pelvis path in the source (facing fixed), scaled to the target.
    const swayXZ = new Float64Array(frames * 2);
    const pelvisHeight = new Float64Array(frames);
    const p = new Vector3();
    for (let f = 0; f < frames; f++) {
        p.fromArray(rootPositions, f * 3).applyQuaternion(rFix);
        swayXZ[f * 2] = p.x * legRatio;
        swayXZ[f * 2 + 1] = p.z * legRatio;
        pelvisHeight[f] = p.y * legRatio;
    }
    const ankleSum = new Float64Array(frames);
    const ankleDifference = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
        ankleSum[f] = (ankleSource.l[f * 3 + 1] + ankleSource.r[f * 3 + 1]) * legRatio;
        ankleDifference[f] = (ankleSource.l[f * 3 + 1] - ankleSource.r[f * 3 + 1]) * legRatio;
    }
    return {
        fps,
        frames,
        ankleSum,
        ankleDifference,
        quaternions,
        swayXZ,
        pelvisHeight,
        legRatio,
        meanYawDegrees: (meanYaw * 180) / Math.PI,
        restPelvis,
        restRootHead: head('root').clone(),
        restAnkleY: (head('footL').y + head('footR').y) / 2,
    };
}

// ---- Target forward kinematics, for the ground calibration and the foot-skate measurement ----

export interface Fk {
    // Sets the pose of one sample and returns the ankles' world positions [Lx, Ly, Lz, Rx, Ry, Rz] in `out`.
    ankles(quats: (bone: string) => Quaternion | null, rootPosition: Vector3, out: Float64Array): void;
}

export function createFk(rig: TargetRig): Fk {
    const left = rig.byName.get('footL');
    const right = rig.byName.get('footR');
    if (!left || !right) throw new Error('rig has no feet');
    const v = new Vector3();
    return {
        ankles(quats, rootPosition, out) {
            for (const bone of rig.bones) {
                const rotation = quats(bone.name);
                if (rotation) bone.quaternion.copy(rotation);
                else bone.quaternion.copy(rig.restLocal.get(bone.name) as Quaternion);
            }
            (rig.byName.get('root') as { position: Vector3 }).position.copy(rootPosition);
            rig.scene.updateMatrixWorld(true);
            left.getWorldPosition(v).toArray(out, 0);
            right.getWorldPosition(v).toArray(out, 3);
        },
    };
}

// A root bone position that puts the pelvis center at `pelvis` for the root bone's current rotation.
export function rootPositionFor(
    r: Retargeted,
    rootRotation: Quaternion,
    restRootRotation: Quaternion,
    pelvis: Vector3,
    out: Vector3,
): Vector3 {
    const relative = rootRotation.clone().multiply(restRootRotation.clone().invert());
    const offset = r.restPelvis.clone().sub(r.restRootHead).applyQuaternion(relative);
    return out.copy(pelvis).sub(offset);
}
