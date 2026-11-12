// Turns a retargeted motion into a 30 keys/s clip (local rotations per bone plus the root's position with its X and Z
// at their rest values) and poses the target rig from a clip.

import { Quaternion, Vector3 } from 'three';
import type { Bone } from 'three';
import { createFk, rootPositionFor } from './retarget';
import type { Retargeted } from './retarget';
import type { TargetRig } from './rig';

export const CLIP_FPS = 30;

export interface Clip {
    id: string;
    keys: number;
    times: Float32Array;
    // Local rotation per mapped bone, keys * 4.
    quaternions: Map<string, Float32Array>;
    // The root bone's position, keys * 3. Only its height varies; X and Z stay at the values that put the pelvis over
    // the rig's rest position (the root's own rotation moves them by a few millimeters, never a travel).
    rootPosition: Float32Array;
    // Pelvis height (meters, the pelvis center's world Y), keys.
    pelvisHeight: Float64Array;
}

// What posing the rig needs of a clip: also what a clip loaded back from the GLB provides.
export type PoseTrack = Pick<Clip, 'keys' | 'quaternions' | 'rootPosition'>;

const percentile = (values: ArrayLike<number>, p: number): number => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
};

export function buildClip(id: string, r: Retargeted, rig: TargetRig): Clip {
    const keys = Math.floor(((r.frames - 1) / r.fps) * CLIP_FPS) + 1;
    const times = new Float32Array(keys);
    const quaternions = new Map<string, Float32Array>();
    const qa = new Quaternion();
    const qb = new Quaternion();
    const sample = (k: number): { f0: number; f1: number; u: number } => {
        const s = Math.min((k / CLIP_FPS) * r.fps, r.frames - 1);
        const f0 = Math.floor(s);
        return { f0, f1: Math.min(f0 + 1, r.frames - 1), u: s - f0 };
    };
    for (let k = 0; k < keys; k++) times[k] = k / CLIP_FPS;
    for (const [bone, track] of r.quaternions) {
        const out = new Float32Array(keys * 4);
        for (let k = 0; k < keys; k++) {
            const { f0, f1, u } = sample(k);
            qa.fromArray(track, f0 * 4);
            qb.fromArray(track, f1 * 4);
            qa.slerp(qb, u).toArray(out, k * 4);
        }
        quaternions.set(bone, out);
    }
    const pelvisY = new Float64Array(keys);
    for (let k = 0; k < keys; k++) {
        const { f0, f1, u } = sample(k);
        pelvisY[k] = r.pelvisHeight[f0] * (1 - u) + r.pelvisHeight[f1] * u;
    }

    const fk = createFk(rig);
    const rootWorldRest = rig.restWorld.get('root') as Quaternion;
    const rootRotation = new Quaternion();
    const pelvis = new Vector3();
    const rootPos = new Vector3();
    const rootPosition = new Float32Array(keys * 3);
    const ankles = new Float64Array(keys * 6);
    const place = (): void => {
        for (let k = 0; k < keys; k++) {
            rootRotation.fromArray(quaternions.get('root') as Float32Array, k * 4);
            pelvis.set(r.restPelvis.x, pelvisY[k], r.restPelvis.z);
            rootPositionFor(r, rootRotation, rootWorldRest, pelvis, rootPos);
            rootPos.toArray(rootPosition, k * 3);
            fk.ankles(
                (name) => {
                    const track = quaternions.get(name);
                    if (!track) return null;
                    return qa.fromArray(track, k * 4);
                },
                rootPos,
                ankles.subarray(k * 6, k * 6 + 6),
            );
        }
    };
    // First place the pelvis at its scaled source height, then lower or raise the whole motion so that the feet's
    // lowest 3 % of ankle heights sit at the rest ankle height (the floor), whatever the source's proportions.
    place();
    const low: number[] = [];
    for (let k = 0; k < keys; k++) low.push(Math.min(ankles[k * 6 + 1], ankles[k * 6 + 4]));
    const shift = r.restAnkleY - percentile(low, 0.03);
    for (let k = 0; k < keys; k++) pelvisY[k] += shift;
    place();
    return { id, keys, times, quaternions, rootPosition, pelvisHeight: pelvisY };
}

// Puts the rig in the pose of key k: the clip's rotation per bone (the rest rotation where it has none) and its root
// position.
export function poseAt(rig: TargetRig, clip: PoseTrack, k: number): void {
    const q = new Quaternion();
    for (const bone of rig.bones) {
        const track = clip.quaternions.get(bone.name);
        if (track) bone.quaternion.fromArray(track, k * 4);
        else bone.quaternion.copy(q.copy(rig.restLocal.get(bone.name) as Quaternion));
    }
    (rig.byName.get('root') as Bone).position.fromArray(clip.rootPosition, k * 3);
    rig.scene.updateMatrixWorld(true);
}
