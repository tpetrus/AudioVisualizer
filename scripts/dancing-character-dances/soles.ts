// Sole clearance. A character with big shoes (Wario) or a different foot shape pitches its feet the way the capture
// did, and the toe of a pitched shoe then dips well below the floor while the ankle stays where the ground lock put it.
// The app puts its floor at the lowest point of the whole dance, so one deep dip leaves the character floating in
// every other pose. Per key this finds how far the foot's rotation has to be eased back toward its rest (flat) rotation
// for the lowest foot vertex to stay within `tolerance` of the sole's rest level, then smooths that amount over the loop.

import { Quaternion, Vector3 } from 'three';
import type { Bone, SkinnedMesh } from 'three';
import type { Clip } from './clip';
import { poseAt } from './clip';
import type { TargetRig } from './rig';

const SIDES = ['L', 'R'] as const;
type Side = (typeof SIDES)[number];

interface SoleVertices {
    mesh: SkinnedMesh;
    indices: number[];
}

// Vertices whose strongest bone is the foot or the toe of one side, per skinned mesh.
function soleVertices(rig: TargetRig, side: Side): SoleVertices[] {
    const names = new Set([`foot${side}`, `toe1-1${side}`]);
    const found: SoleVertices[] = [];
    rig.scene.traverse((o) => {
        const mesh = o as SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        const indexAttr = mesh.geometry.getAttribute('skinIndex');
        const weightAttr = mesh.geometry.getAttribute('skinWeight');
        const indices: number[] = [];
        for (let i = 0; i < indexAttr.count; i++) {
            let best = 0;
            for (let c = 1; c < 4; c++) if (weightAttr.getComponent(i, c) > weightAttr.getComponent(i, best)) best = c;
            if (names.has(mesh.skeleton.bones[indexAttr.getComponent(i, best)].name)) indices.push(i);
        }
        if (indices.length > 0) found.push({ mesh, indices });
    });
    return found;
}

function lowest(sets: readonly SoleVertices[]): number {
    const v = new Vector3();
    let low = Infinity;
    for (const { mesh, indices } of sets) {
        mesh.skeleton.update();
        for (const i of indices) {
            mesh.getVertexPosition(i, v);
            low = Math.min(low, v.applyMatrix4(mesh.matrixWorld).y);
        }
    }
    return low;
}

// The needed easing per key, widened by `reach` keys each way and then averaged over `blur` keys each way. Every
// averaged value is at least the need of the key it belongs to, so smoothing never gives back clearance (as long as
// `blur` does not exceed `reach`).
export function smoothNeeds(need: readonly number[], reach: number, blur: number): number[] {
    const n = need.length;
    const wrap = (k: number): number => ((k % n) + n) % n;
    const widened = need.map((_, k) => {
        let m = 0;
        for (let j = -reach; j <= reach; j++) m = Math.max(m, need[wrap(k + j)]);
        return m;
    });
    return widened.map((_, k) => {
        let sum = 0;
        for (let j = -blur; j <= blur; j++) sum += widened[wrap(k + j)];
        return sum / (2 * blur + 1);
    });
}

export interface SoleReport {
    // Deepest dip below the rest sole level (meters) before and after, over both feet.
    dipBefore: number;
    dipAfter: number;
}

export function clearSoles(rig: TargetRig, clip: Clip, tolerance: number): SoleReport {
    const n = clip.keys - 1;
    let dipBefore = 0;
    let dipAfter = 0;
    const q = new Quaternion();
    const original = new Quaternion();
    const flat = new Quaternion();
    for (const side of SIDES) {
        const sets = soleVertices(rig, side);
        if (sets.length === 0) throw new Error(`no skinned vertices on foot${side}`);
        // The floor is y = 0: a character stands with its soles there (contract C-BONES), whichever bones own the sole's
        // own vertices.
        const restLevel = 0;
        const track = clip.quaternions.get(`foot${side}`) as Float32Array;
        const foot = rig.byName.get(`foot${side}`) as Bone;
        const restWorld = rig.restWorld.get(`foot${side}`) as Quaternion;
        const source = track.slice();
        // Flat means the foot's rest orientation in the world, so the target local rotation depends on how the leg above
        // it is turned at this key (the leg does not change when the foot is eased).
        const flatAt = (k: number): void => {
            poseAt(rig, clip, k);
            (foot.parent as Bone).getWorldQuaternion(flat).invert().multiply(restWorld);
        };
        const dipAt = (k: number, u: number): number => {
            original.fromArray(source, k * 4);
            if (original.dot(flat) < 0) original.set(-original.x, -original.y, -original.z, -original.w);
            q.copy(original)
                .slerp(flat, u)
                .toArray(track, k * 4);
            poseAt(rig, clip, k);
            return restLevel - lowest(sets);
        };
        const need: number[] = [];
        for (let k = 0; k < n; k++) {
            flatAt(k);
            const dip = dipAt(k, 0);
            dipBefore = Math.max(dipBefore, dip);
            if (dip <= tolerance) {
                need.push(0);
                continue;
            }
            // The smallest easing that brings the dip within tolerance: the dip falls as the foot flattens.
            let lo = 0;
            let hi = 1;
            for (let i = 0; i < 12; i++) {
                const mid = (lo + hi) / 2;
                if (dipAt(k, mid) <= tolerance) hi = mid;
                else lo = mid;
            }
            need.push(hi);
        }
        const eased = smoothNeeds(need, 3, 2);
        for (let k = 0; k < n; k++) {
            flatAt(k);
            dipAfter = Math.max(dipAfter, dipAt(k, eased[k]));
        }
        // The last key is the first one.
        for (let c = 0; c < 4; c++) track[n * 4 + c] = track[c];
    }
    return { dipBefore, dipAfter };
}
