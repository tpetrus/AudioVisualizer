// Turns a stretch of a 30 keys/s clip into a seamless loop. The stretch is warped beat to beat (piecewise linear: every
// beat of the loop is 15 keys, 0.5 s, and starts at the clip position the manifest lists for it) and the residual
// rotation between its last and first pose is spread over the whole loop, so the last key equals the first exactly and
// nothing visibly jumps or swings.

import { Quaternion, Vector3 } from 'three';
import { CLIP_FPS } from './clip';
import type { Clip } from './clip';
import { rootPositionFor } from './retarget';
import type { Retargeted } from './retarget';
import type { TargetRig } from './rig';

const DEGREES = 180 / Math.PI;
// A beat is 0.5 s of clip time, so 15 keys at 30 keys/s.
export const KEYS_PER_BEAT = CLIP_FPS / 2;

// Angle in degrees between two unit quaternions.
export const angleDegrees = (a: Quaternion, b: Quaternion): number =>
    2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * DEGREES;

// Angle in degrees between the quaternions at float offsets i and j of two tracks.
export function quatAngleDegrees(a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number): number {
    const dot = Math.abs(a[i] * b[j] + a[i + 1] * b[j + 1] + a[i + 2] * b[j + 2] + a[i + 3] * b[j + 3]);
    return 2 * Math.acos(Math.min(1, dot)) * DEGREES;
}

// Largest rotation difference over every bone track (the root's yaw included) between two keys.
export function seam(clip: Clip, a: number, b: number): number {
    let worst = 0;
    for (const track of clip.quaternions.values())
        worst = Math.max(worst, quatAngleDegrees(track, a * 4, track, b * 4));
    return worst;
}

// The manifest lists source frames; the loop is warped from the 30 keys/s clip, so a frame is `sourceFps / 30` times the
// key position. `windowStart` is the first source frame the clip was built from.
export function beatKeys(frames: readonly number[], sourceFps: number, windowStart: number): number[] {
    return frames.map((frame) => (frame - windowStart) / (sourceFps / CLIP_FPS));
}

// The source key (fractional) that output key `i` samples: a straight line between the keys of the beat it is in.
export function warpPosition(keysPerBeat: readonly number[], i: number): number {
    const beats = keysPerBeat.length - 1;
    const beat = Math.min(beats - 1, Math.floor(i / KEYS_PER_BEAT));
    const u = (i - beat * KEYS_PER_BEAT) / KEYS_PER_BEAT;
    return keysPerBeat[beat] * (1 - u) + keysPerBeat[beat + 1] * u;
}

export interface LoopReport {
    // The largest rotation difference between the warped stretch's last and first pose, before it was closed (degrees).
    seamBefore: number;
    // The same after closing (about 0.04 degrees: the closing key repeats the first).
    seamAfter: number;
}

export function makeLoop(
    clip: Clip,
    r: Retargeted,
    rig: TargetRig,
    id: string,
    keysPerBeat: readonly number[],
): { clip: Clip; report: LoopReport } {
    const beats = keysPerBeat.length - 1;
    const n = beats * KEYS_PER_BEAT;
    const keys = n + 1;
    const last = clip.keys - 1;
    if (keysPerBeat.some((k) => k < 0 || k > last)) throw new Error(`${id}: the beat table leaves the source clip`);
    const times = new Float32Array(keys);
    for (let i = 0; i < keys; i++) times[i] = i / CLIP_FPS;
    times[n] = beats * 0.5;

    const quaternions = new Map<string, Float32Array>();
    const qa = new Quaternion();
    const qb = new Quaternion();
    const q0 = new Quaternion();
    const qn = new Quaternion();
    const corr = new Quaternion();
    const ident = new Quaternion();
    const resid = new Quaternion();
    let seamBefore = 0;
    for (const [bone, track] of clip.quaternions) {
        const out = new Float32Array(keys * 4);
        for (let i = 0; i < keys; i++) {
            const s = warpPosition(keysPerBeat, i);
            const k0 = Math.min(Math.floor(s), last);
            const k1 = Math.min(k0 + 1, last);
            qa.fromArray(track, k0 * 4);
            qb.fromArray(track, k1 * 4);
            qa.slerp(qb, s - k0);
            if (i > 0 && qa.dot(qn) < 0) qa.set(-qa.x, -qa.y, -qa.z, -qa.w);
            qa.toArray(out, i * 4);
            qn.copy(qa);
        }
        q0.fromArray(out, 0);
        qn.fromArray(out, n * 4);
        seamBefore = Math.max(seamBefore, angleDegrees(q0, qn));
        // Residual that takes the last pose to the first, applied progressively as a left multiplication.
        resid.copy(q0).multiply(qn.clone().invert());
        if (resid.w < 0) resid.set(-resid.x, -resid.y, -resid.z, -resid.w);
        for (let i = 0; i < keys; i++) {
            qa.fromArray(out, i * 4);
            corr.copy(ident).slerp(resid, i / n);
            qa.premultiply(corr);
            if (i > 0 && qa.dot(qb) < 0) qa.set(-qa.x, -qa.y, -qa.z, -qa.w);
            qa.toArray(out, i * 4);
            qb.copy(qa);
        }
        // The last key is the first by construction; write it exactly, in the previous key's hemisphere.
        qa.fromArray(out, 0);
        qb.fromArray(out, (n - 1) * 4);
        if (qa.dot(qb) < 0) throw new Error(`${id}/${bone}: loop end flips hemisphere`);
        qa.toArray(out, n * 4);
        quaternions.set(bone, out);
    }

    // Pelvis height: warp, then remove the first-to-last difference linearly.
    const pelvisHeight = new Float64Array(keys);
    for (let i = 0; i < keys; i++) {
        const s = warpPosition(keysPerBeat, i);
        const k0 = Math.min(Math.floor(s), last);
        const k1 = Math.min(k0 + 1, last);
        pelvisHeight[i] = clip.pelvisHeight[k0] * (1 - (s - k0)) + clip.pelvisHeight[k1] * (s - k0);
    }
    const dh = pelvisHeight[n] - pelvisHeight[0];
    for (let i = 0; i < keys; i++) pelvisHeight[i] -= (dh * i) / n;
    pelvisHeight[n] = pelvisHeight[0];

    const rootWorldRest = rig.restWorld.get('root') as Quaternion;
    const rootRotation = new Quaternion();
    const pelvis = new Vector3();
    const rootPos = new Vector3();
    const rootPosition = new Float32Array(keys * 3);
    for (let i = 0; i < keys; i++) {
        rootRotation.fromArray(quaternions.get('root') as Float32Array, i * 4);
        pelvis.set(r.restPelvis.x, pelvisHeight[i], r.restPelvis.z);
        rootPositionFor(r, rootRotation, rootWorldRest, pelvis, rootPos);
        rootPos.toArray(rootPosition, i * 3);
    }
    const loop: Clip = { id, keys, times, quaternions, rootPosition, pelvisHeight };
    return { clip: loop, report: { seamBefore, seamAfter: seam(loop, 0, n) } };
}

// The bones that carry the legs' (and hips') steps; everything else (spine, head, shoulders, arms, hands) is the upper body.
const LEG_BONE = /^(root|upperleg|lowerleg|foot|toe)/;

// A loop whose hips, legs and pelvis height come from `legs` and whose spine, head, shoulders, arms and hands come from
// `upper`. Both loops must have the same length; each is closed on its own, so the combination is closed too.
export function combineLoops(legs: Clip, upper: Clip, id: string): Clip {
    if (legs.keys !== upper.keys) throw new Error(`${id}: the loops differ in length`);
    const quaternions = new Map<string, Float32Array>();
    for (const [bone, track] of upper.quaternions) {
        quaternions.set(bone, (LEG_BONE.test(bone) ? (legs.quaternions.get(bone) as Float32Array) : track).slice());
    }
    for (const [bone, track] of legs.quaternions) if (!quaternions.has(bone)) quaternions.set(bone, track.slice());
    return { ...legs, id, quaternions };
}

export const copyClip = (clip: Clip, id: string): Clip => ({
    ...clip,
    id,
    times: clip.times.slice(),
    quaternions: new Map([...clip.quaternions].map(([bone, track]) => [bone, track.slice()])),
    rootPosition: clip.rootPosition.slice(),
});
