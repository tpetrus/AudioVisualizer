// Per-dance, per-bone-group amplitude scaling of a closed loop. Each bone's rotation is pulled toward (or
// pushed away from) a neutral rotation: q' = neutral * slerp(identity, mean^-1 * q, scale). The mean is the bone's own
// mean rotation over the loop; the neutral is that mean, optionally blended toward the rest pose by `restBlend` (to
// bring arms nearer the torso). Timing is untouched and, since the first and last key are the same rotation, the loop stays closed.

import { Quaternion } from 'three';
import type { Clip } from './clip';
import type { TargetRig } from './rig';

export interface AmplitudeGroup {
    // Bones this scale applies to.
    bones: string[];
    scale: number;
    // 0 keeps the loop's own mean pose as the neutral, 1 uses the rest pose (arms hanging) instead.
    restBlend?: number;
}

// The mean rotation of keys 0..n-1 of a track (hemisphere-aligned sum, renormalized; the spread of a loop's bone is
// small enough for this to match the true mean).
function meanRotation(track: Float32Array, n: number): Quaternion {
    const reference = new Quaternion().fromArray(track, 0);
    const q = new Quaternion();
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;
    for (let k = 0; k < n; k++) {
        q.fromArray(track, k * 4);
        const sign = q.dot(reference) < 0 ? -1 : 1;
        x += q.x * sign;
        y += q.y * sign;
        z += q.z * sign;
        w += q.w * sign;
    }
    return new Quaternion(x, y, z, w).normalize();
}

export function scaleAmplitude(clip: Clip, rig: TargetRig, id: string, groups: AmplitudeGroup[]): Clip {
    const n = clip.keys - 1;
    const quaternions = new Map<string, Float32Array>();
    for (const [bone, track] of clip.quaternions) quaternions.set(bone, track.slice());
    const ident = new Quaternion();
    const q = new Quaternion();
    const neutral = new Quaternion();
    const inverse = new Quaternion();
    const previous = new Quaternion();
    const deviation = new Quaternion();
    for (const group of groups) {
        for (const bone of group.bones) {
            const track = quaternions.get(bone);
            if (!track) throw new Error(`${id}: no ${bone} track`);
            const mean = meanRotation(track, n);
            neutral.copy(mean);
            if (group.restBlend) {
                const rest = rig.restLocal.get(bone) as Quaternion;
                if (neutral.dot(rest) < 0) neutral.set(-neutral.x, -neutral.y, -neutral.z, -neutral.w);
                neutral.slerp(rest, group.restBlend);
            }
            // Deviations are measured from the loop's own mean; the scaled deviation is then placed on the neutral.
            inverse.copy(mean).invert();
            const source = track.slice();
            for (let k = 0; k <= n; k++) {
                // The last key is the first one, so the loop closes exactly.
                q.fromArray(source, (k === n ? 0 : k) * 4);
                q.premultiply(inverse);
                if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
                deviation.copy(ident).slerp(q, group.scale);
                q.copy(neutral).multiply(deviation);
                if (k > 0 && q.dot(previous) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
                previous.copy(q);
                q.toArray(track, k * 4);
            }
        }
    }
    return { ...clip, id, quaternions, times: clip.times.slice() };
}
