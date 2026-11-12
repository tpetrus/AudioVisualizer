// Edits on finished loops. Ground lock: the hips height is set so the lowest foot joint of every key rests on the floor
// (the Twist's hips rose and floated at the top of its dance). Salsa arms: one arm drives the other as a left/right
// mirror shifted in time, and the upper arms are soft-capped in lift and in how far the elbow leaves the side. Twist
// head: the head is turned toward the chest's front and its movement is scaled.

import { Quaternion, Vector3 } from 'three';
import type { Bone } from 'three';
import type { Clip, PoseTrack } from './clip';
import { poseAt } from './clip';
import type { TargetRig } from './rig';

const FOOT_JOINTS = ['footL', 'toe1-1L', 'footR', 'toe1-1R'];
const DEGREES = 180 / Math.PI;

const joint = (rig: TargetRig, name: string): Bone => {
    const bone = rig.byName.get(name);
    if (!bone) throw new Error(`no bone ${name}`);
    return bone;
};

// Per key, how far the lowest foot joint is above its own rest height (meters; 0 = standing flat on the floor).
export function floatPerKey(rig: TargetRig, clip: PoseTrack): Float64Array {
    const out = new Float64Array(clip.keys);
    const v = new Vector3();
    for (let k = 0; k < clip.keys; k++) {
        poseAt(rig, clip, k);
        let low = Infinity;
        for (const name of FOOT_JOINTS) {
            low = Math.min(low, joint(rig, name).getWorldPosition(v).y - (rig.restHead.get(name) as Vector3).y);
        }
        out[k] = low;
    }
    return out;
}

export const maxAbs = (a: ArrayLike<number>): number => Math.max(...Array.from(a).map(Math.abs));

export interface GroundReport {
    floatBefore: number;
    floatAfter: number;
}

// Lowers or raises the hips so the lowest foot joint is on the floor at every key (within `tolerance` meters, to keep the
// height smooth).
export function groundLock(rig: TargetRig, clip: Clip, tolerance = 0.01): GroundReport {
    const before = floatPerKey(rig, clip);
    const n = clip.keys - 1;
    const exact = Array.from({ length: n }, (_, k) => clip.rootPosition[k * 3 + 1] - before[k]);
    // The exact lock follows every swivel of the feet (steps of several cm per key), so the height is the smoothest closed
    // curve that stays within `tolerance` of the exact lock: relaxed toward its neighbors, then pulled back into the band.
    const height = exact.slice();
    for (let pass = 0; pass < 4000; pass++) {
        for (let k = 0; k < n; k++) {
            const mean = (height[(k + n - 1) % n] + height[(k + 1) % n]) / 2;
            height[k] = Math.min(exact[k] + tolerance, Math.max(exact[k] - tolerance, mean));
        }
    }
    for (let k = 0; k < n; k++) clip.rootPosition[k * 3 + 1] = height[k];
    // The last key is the first one.
    clip.rootPosition[n * 3 + 1] = height[0];
    return { floatBefore: maxAbs(before), floatAfter: maxAbs(floatPerKey(rig, clip)) };
}

// ---- salsa arms ----

// Every bone from the shoulder to the hand, parent first. The helper bones (shoulder01, upperarm02, lowerarm02) are included
// because their rest frames, like the main bones', are not mirror images of the other side's.
const CHAIN = ['clavicle', 'shoulder01', 'upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist'];
// The bone the clavicles hang from; the arm is mirrored in its frame, not the world's, so a twisting spine does not skew it.
const CHEST = 'spine01';

// Reflection across the body's sagittal plane (x = 0) of a world rotation given as a quaternion: the axis is a pseudovector.
export const mirror = (q: Quaternion): Quaternion => new Quaternion(q.x, -q.y, -q.z, q.w);

// A bone's rotation away from its rest orientation, in world axes.
const restDelta = (rig: TargetRig, name: string): Quaternion =>
    joint(rig, name)
        .getWorldQuaternion(new Quaternion())
        .multiply((rig.restWorld.get(name) as Quaternion).clone().invert());

// Replaces the arm on `to` by the mirror image of the arm on the other side, `shift` keys later in the loop. Each bone's
// rotation from rest is taken relative to the chest, reflected, and put back on the chest's pose at this key; the side's own
// rest frame is used for the result and the local rotation comes from the rig's actual parent chain.
export function mirrorArm(rig: TargetRig, clip: Clip, to: 'L' | 'R', shift: number, id: string): Clip {
    const from = to === 'L' ? 'R' : 'L';
    const n = clip.keys - 1;
    const quaternions = new Map<string, Float32Array>();
    for (const [bone, track] of clip.quaternions) quaternions.set(bone, track.slice());
    for (const part of CHAIN) {
        const name = `${part}${to}`;
        if (!quaternions.has(name)) {
            const rest = rig.restLocal.get(name) as Quaternion;
            const track = new Float32Array(clip.keys * 4);
            for (let k = 0; k < clip.keys; k++) rest.toArray(track, k * 4);
            quaternions.set(name, track);
        }
    }
    const rel = new Map<string, Quaternion>();
    for (let k = 0; k < n; k++) {
        poseAt(rig, clip, (k + shift) % n);
        const chestFrom = restDelta(rig, CHEST).invert();
        for (const part of CHAIN) rel.set(part, chestFrom.clone().multiply(restDelta(rig, `${part}${from}`)));
        // The spine and the other bones keep this key's own pose; the arm chain is rebuilt on top of them.
        poseAt(rig, clip, k);
        const chestTo = restDelta(rig, CHEST);
        for (const part of CHAIN) {
            const bone = joint(rig, `${part}${to}`);
            bone.parent?.updateMatrixWorld(true);
            const parent = (bone.parent as Bone).getWorldQuaternion(new Quaternion());
            const target = chestTo
                .clone()
                .multiply(mirror(rel.get(part) as Quaternion))
                .multiply(rig.restWorld.get(`${part}${to}`) as Quaternion);
            const local = parent.invert().multiply(target);
            const track = quaternions.get(`${part}${to}`) as Float32Array;
            const old = new Quaternion().fromArray(track, k * 4);
            if (local.dot(old) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
            local.toArray(track, k * 4);
            bone.quaternion.copy(local);
            bone.updateMatrixWorld(true);
        }
    }
    for (const part of CHAIN) {
        const track = quaternions.get(`${part}${to}`) as Float32Array;
        for (let c = 0; c < 4; c++) track[n * 4 + c] = track[c];
    }
    return { ...clip, id, quaternions, times: clip.times.slice() };
}

// Soft limit: passes values up to 70 % of `cap` and compresses the rest so the result never reaches `cap`.
export const soft = (value: number, cap: number): number => {
    const knee = cap * 0.7;
    return value <= knee ? value : knee + (cap - knee) * Math.tanh((value - knee) / (cap - knee));
};

// Pulls each upper arm toward the body: its lift away from hanging down is held below `liftCap` degrees and the elbow's
// sideways distance from the shoulder below `elbowCap` meters (both soft), by turning the upper arm in world space.
// The forearm keeps its local rotation, so the hand follows. Each key is treated alone, so the loop stays closed.
export function capUpperArms(rig: TargetRig, clip: Clip, liftCap: number, elbowCap: number, id: string): Clip {
    const n = clip.keys - 1;
    const quaternions = new Map<string, Float32Array>();
    for (const [bone, track] of clip.quaternions) quaternions.set(bone, track.slice());
    const out: Clip = { ...clip, id, quaternions, times: clip.times.slice() };
    const down = new Vector3(0, -1, 0);
    for (let k = 0; k < n; k++) {
        poseAt(rig, clip, k);
        for (const side of ['L', 'R']) {
            const upper = joint(rig, `upperarm01${side}`);
            const shoulder = upper.getWorldPosition(new Vector3());
            const elbow = joint(rig, `lowerarm01${side}`).getWorldPosition(new Vector3());
            const length = elbow.distanceTo(shoulder);
            const dir = elbow.sub(shoulder).normalize();
            const wanted = dir.clone();
            wanted.x = (Math.sign(dir.x) * soft(Math.abs(dir.x) * length, elbowCap)) / length;
            // The sideways part is shortened and the forward/down part grows to keep the length, so the arm swings toward
            // the body's front instead of staying out to the side.
            const rest = Math.hypot(dir.y, dir.z);
            const scale = rest > 1e-6 ? Math.sqrt(Math.max(0, 1 - wanted.x * wanted.x)) / rest : 0;
            wanted.y = dir.y * scale;
            wanted.z = dir.z * scale;
            const lift = wanted.angleTo(down) * DEGREES;
            const capped = soft(lift, liftCap);
            if (lift > 1e-6 && capped < lift) {
                const axis = new Vector3().crossVectors(down, wanted).normalize();
                wanted.copy(down).applyAxisAngle(axis, capped / DEGREES);
            }
            const turn = new Quaternion().setFromUnitVectors(dir, wanted);
            const world = upper.getWorldQuaternion(new Quaternion());
            const parent = (upper.parent as Bone).getWorldQuaternion(new Quaternion());
            const local = parent.invert().multiply(turn).multiply(world);
            const track = quaternions.get(`upperarm01${side}`) as Float32Array;
            const old = new Quaternion().fromArray(track, k * 4);
            if (local.dot(old) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
            local.toArray(track, k * 4);
        }
    }
    for (const side of ['L', 'R']) {
        const track = quaternions.get(`upperarm01${side}`) as Float32Array;
        for (let c = 0; c < 4; c++) track[n * 4 + c] = track[c];
    }
    return out;
}

// ---- head ----

const UP = new Vector3(0, 1, 0);

export interface HeadReport {
    // Sideways turn (degrees) of the head relative to the chest over the loop: mean and largest, before and after.
    yawMeanBefore: number;
    yawMeanAfter: number;
    yawMaxBefore: number;
    yawMaxAfter: number;
}

// The head's facing relative to the chest: yaw about the vertical (degrees) of the head's forward axis, from the world-axes
// rotation `x` of the head in the chest frame.
const yawOf = (x: Quaternion): number => {
    const fwd = new Vector3(0, 0, 1).applyQuaternion(x);
    return Math.atan2(fwd.x, fwd.z) * DEGREES;
};

// Turns the head toward the chest's front: `keep` of its mean sideways offset stays, and the rest of its movement (all but
// that offset) is scaled by `scale`. The correction is shared between the neck and the head so neither one snaps; the target
// is a function of each key alone, so a closed loop stays closed.
export function faceHeadForward(
    rig: TargetRig,
    clip: Clip,
    keep: number,
    scale: number,
    neckShare: number,
): HeadReport {
    const n = clip.keys - 1;
    const yawsBefore = Array.from({ length: n }, (_, k) => {
        poseAt(rig, clip, k);
        return yawOf(restDelta(rig, CHEST).invert().multiply(restDelta(rig, 'head')));
    });
    const mean = yawsBefore.reduce((a, b) => a + b, 0) / n;
    const yaw = (degrees: number): Quaternion => new Quaternion().setFromAxisAngle(UP, degrees / DEGREES);
    const identity = new Quaternion();
    const neckTrack = clip.quaternions.get('neck02') as Float32Array;
    const headTrack = clip.quaternions.get('head') as Float32Array;
    const neck = joint(rig, 'neck02');
    const head = joint(rig, 'head');
    const yawsAfter: number[] = [];
    for (let k = 0; k < n; k++) {
        poseAt(rig, clip, k);
        const chest = restDelta(rig, CHEST);
        const current = restDelta(rig, 'head');
        const x = chest.clone().invert().multiply(current);
        const deviation = yaw(-mean).multiply(x);
        const wanted = yaw(keep * mean).multiply(new Quaternion().slerpQuaternions(identity, deviation, scale));
        yawsAfter.push(yawOf(wanted));
        const change = chest.clone().multiply(wanted).multiply(current.invert());
        const neckTarget = new Quaternion()
            .slerpQuaternions(identity, change, neckShare)
            .multiply(neck.getWorldQuaternion(new Quaternion()));
        const neckLocal = (neck.parent as Bone).getWorldQuaternion(new Quaternion()).invert().multiply(neckTarget);
        const headTarget = change.clone().multiply(head.getWorldQuaternion(new Quaternion()));
        neck.quaternion.copy(neckLocal);
        neck.updateMatrixWorld(true);
        const headLocal = (head.parent as Bone).getWorldQuaternion(new Quaternion()).invert().multiply(headTarget);
        for (const [track, local] of [
            [neckTrack, neckLocal],
            [headTrack, headLocal],
        ] as const) {
            const old = new Quaternion().fromArray(track, k * 4);
            if (local.dot(old) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
            local.toArray(track, k * 4);
        }
    }
    for (const track of [neckTrack, headTrack]) for (let c = 0; c < 4; c++) track[n * 4 + c] = track[c];
    const stat = (v: number[]): number[] => [v.reduce((a, b) => a + b, 0) / n, Math.max(...v.map(Math.abs))];
    const [yawMeanBefore, yawMaxBefore] = stat(yawsBefore);
    const [yawMeanAfter, yawMaxAfter] = stat(yawsAfter);
    return { yawMeanBefore, yawMeanAfter, yawMaxBefore, yawMaxAfter };
}

// How far the elbow or hand (wrist) of one arm gets behind the chest's coronal plane (the plane through the chest bone, at
// right angles to its forward axis), over the loop: the largest distance in meters (0 when never behind) and which joint.
export function behindChest(rig: TargetRig, clip: PoseTrack, side: 'L' | 'R'): { max: number; joint: string } {
    const v = new Vector3();
    let best = { max: 0, joint: 'none' };
    for (let k = 0; k < clip.keys; k++) {
        poseAt(rig, clip, k);
        const chest = restDelta(rig, CHEST).invert();
        const origin = joint(rig, CHEST).getWorldPosition(new Vector3());
        for (const part of ['lowerarm01', 'wrist']) {
            const z = v
                .copy(joint(rig, `${part}${side}`).getWorldPosition(v))
                .sub(origin)
                .applyQuaternion(chest).z;
            if (-z > best.max) best = { max: -z, joint: part === 'wrist' ? 'hand' : 'elbow' };
        }
    }
    return best;
}
