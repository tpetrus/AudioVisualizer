// The checks every shipped dance clip must pass (docs/plans/natural-dance/contracts.md, C2 and Amendments 3 and 4), run against
// the clips as GLTFLoader loads them back from the GLB, and the reproduction check against the approved spike clips.
// Hard rules come back as `failures`; the 40 ms contact rule comes back as `warnings`.

import { Quaternion, Vector3 } from 'three';
import type { AnimationClip } from 'three';
import { DANCE_REQUIRED_BONES } from '../../app/features/visualizers/dancing-character/dancingCharacterConfig';
import { CLIP_FPS } from './clip';
import type { PoseTrack } from './clip';
import { measureClearance } from './clearance';
import type { Torso } from './clearance';
import { behindChest, floatPerKey, maxAbs } from './edits';
import { KEYS_PER_BEAT, quatAngleDegrees } from './loop';
import { createFk } from './retarget';
import type { TargetRig } from './rig';

// Mirrors FOOT_SKATE_MAX_METERS in dancingCharacterConfig.ts (added there with the dance registry). It is a proxy for
// visible sliding, set just above the approved clips (the approved twist measures 0.153 m) instead of tuning a clip the
// human already approved (Amendment 4).
export const FOOT_SKATE_MAX_METERS = 0.16;
// The root bone keeps the pelvis centered over the rig, so its X/Z swing with the hips' rotation; "no travel" means every
// key stays within this distance (meters) of the root's rest X/Z, and the loop's first and last keys match within 1 mm.
const ROOT_XZ_MAX_METERS = 0.1;
const LOOP_ROOT_METERS = 1e-3;
const SEAM_MAX_DEGREES = 10;
// The lowest foot joint may be this far (meters) above or below its rest height at any key.
const FLOOR_TOLERANCE = 0.03;
// How far (meters) an elbow or hand may go behind the chest's coronal plane.
const BEHIND_CHEST_MAX = 0.1;
const CONTACT_WARN_MS = 40;
// An ankle is in contact with the floor below this height above its rest height, for at least three keys.
const CONTACT_HEIGHT = 0.04;
const MIN_CONTACT_KEYS = 3;
// Quaternions are stored as float32 and normalized by the loader's consumers, so a loose unit tolerance.
const UNIT_TOLERANCE = 1e-3;
const LOOP_CLOSED_DEGREES = 0.5;

export interface ExpectedClip {
    id: string;
    beats: number;
}

export interface ClipMetrics {
    keys: number;
    duration: number;
    // Largest rotation difference between the last and first key over every bone.
    seamDegrees: number;
    skateMeters: number;
    floorMeters: number;
    clearanceMeters: number;
    behindChestMeters: { L: number; R: number };
    // Largest horizontal distance of the root from its rest X/Z.
    rootXZMeters: number;
    // Per beat, the distance (ms) from the beat marker to the nearest contact signal.
    contactMs: number[];
}

export interface ClipReport {
    id: string;
    failures: string[];
    warnings: string[];
    metrics: ClipMetrics | null;
}

// The pose data of an animation clip loaded from the GLB.
export function poseTrackOf(clip: AnimationClip): PoseTrack & { times: ArrayLike<number> } {
    const quaternions = new Map<string, Float32Array>();
    let rootPosition = new Float32Array(0);
    let times: ArrayLike<number> = [];
    for (const track of clip.tracks) {
        if (track.name.endsWith('.quaternion')) {
            quaternions.set(track.name.replace('.quaternion', ''), Float32Array.from(track.values));
        } else if (track.name === 'root.position') {
            rootPosition = Float32Array.from(track.values);
            times = track.times;
        }
    }
    return { keys: rootPosition.length / 3, quaternions, rootPosition, times };
}

const restAnkleY = (rig: TargetRig): number =>
    ((rig.restHead.get('footL') as Vector3).y + (rig.restHead.get('footR') as Vector3).y) / 2;

// World positions of both ankles per key with the clip's own root position, keys * 6 (Lx, Ly, Lz, Rx, Ry, Rz).
export function ankleTrack(rig: TargetRig, pose: PoseTrack): Float64Array {
    const fk = createFk(rig);
    const ankles = new Float64Array(pose.keys * 6);
    const q = new Quaternion();
    const root = new Vector3();
    for (let k = 0; k < pose.keys; k++) {
        root.fromArray(pose.rootPosition, k * 3);
        fk.ankles(
            (name) => {
                const track = pose.quaternions.get(name);
                return track ? q.fromArray(track, k * 4) : null;
            },
            root,
            ankles.subarray(k * 6, k * 6 + 6),
        );
    }
    return ankles;
}

// The contact runs of each foot as [first key, last key] pairs (keys 0..keys-1, not wrapped).
function contactRuns(ankles: Float64Array, keys: number, floorY: number): { foot: number; from: number; to: number }[] {
    const runs: { foot: number; from: number; to: number }[] = [];
    for (const foot of [0, 1]) {
        let from = -1;
        for (let k = 0; k <= keys; k++) {
            const inContact = k < keys && ankles[k * 6 + foot * 3 + 1] < floorY + CONTACT_HEIGHT;
            if (inContact && from < 0) from = k;
            else if (!inContact && from >= 0) {
                if (k - from >= MIN_CONTACT_KEYS) runs.push({ foot, from, to: k - 1 });
                from = -1;
            }
        }
    }
    return runs;
}

// Largest horizontal distance an ankle drifts from where its contact began, over every contact run (meters).
export function footSkate(ankles: Float64Array, keys: number, floorY: number): number {
    let worst = 0;
    for (const { foot, from, to } of contactRuns(ankles, keys, floorY)) {
        const x0 = ankles[from * 6 + foot * 3];
        const z0 = ankles[from * 6 + foot * 3 + 2];
        for (let k = from; k <= to; k++) {
            worst = Math.max(worst, Math.hypot(ankles[k * 6 + foot * 3] - x0, ankles[k * 6 + foot * 3 + 2] - z0));
        }
    }
    return worst;
}

// Per beat of the loop, the distance in ms from the beat marker to the nearest contact signal: a local minimum of the hips
// height or the key a foot lands (starts a contact run). The loop is cyclic, so distances wrap.
export function contactDistances(
    rootY: ArrayLike<number>,
    ankles: Float64Array,
    floorY: number,
    beats: number,
): number[] {
    const n = beats * KEYS_PER_BEAT;
    const signals: number[] = [];
    for (let k = 0; k < n; k++) {
        const before = rootY[(k + n - 1) % n];
        const after = rootY[(k + 1) % n];
        if (rootY[k] <= before && rootY[k] <= after && (rootY[k] < before || rootY[k] < after)) signals.push(k);
    }
    for (const { from } of contactRuns(ankles, n, floorY)) signals.push(from);
    return Array.from({ length: beats }, (_, beat) => {
        const marker = beat * KEYS_PER_BEAT;
        let best = Infinity;
        for (const s of signals) {
            const d = Math.abs(s - marker);
            best = Math.min(best, d, n - d);
        }
        return (best * 1000) / CLIP_FPS;
    });
}

export function validateClip(rig: TargetRig, torso: Torso, clip: AnimationClip, expected: ExpectedClip): ClipReport {
    const failures: string[] = [];
    const warnings: string[] = [];
    const id = expected.id;
    const fail = (message: string): void => {
        failures.push(`${id}: ${message}`);
    };
    const names = new Set(clip.tracks.map((track) => track.name));
    for (const bone of DANCE_REQUIRED_BONES) {
        if (!names.has(`${bone}.quaternion`)) fail(`no ${bone}.quaternion track`);
    }
    if (!names.has('root.position')) fail('no root.position track');
    if (Math.abs(clip.duration - expected.beats * 0.5) > 1e-6) {
        fail(`duration ${clip.duration} is not ${expected.beats * 0.5}`);
    }
    let bad = 0;
    for (const track of clip.tracks) {
        for (const value of track.values) if (!Number.isFinite(value)) bad++;
        const keysPerSecond = (track.times.length - 1) / (track.times[track.times.length - 1] - track.times[0]);
        if (Math.abs(keysPerSecond - CLIP_FPS) > 0.01) fail(`${track.name} has ${keysPerSecond.toFixed(3)} keys/s`);
        if (!track.name.endsWith('.quaternion')) continue;
        for (let i = 0; i < track.values.length; i += 4) {
            const length = Math.hypot(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
            if (Math.abs(length - 1) > UNIT_TOLERANCE) {
                fail(`${track.name} key ${i / 4} is not a unit quaternion`);
                break;
            }
        }
    }
    if (bad > 0) fail(`${bad} non-finite values`);
    const pose = poseTrackOf(clip);
    if (pose.keys !== expected.beats * KEYS_PER_BEAT + 1) {
        fail(`${pose.keys} keys, expected ${expected.beats * KEYS_PER_BEAT + 1}`);
        return { id, failures, warnings, metrics: null };
    }
    const last = pose.keys - 1;
    let seamDegrees = 0;
    for (const [bone, track] of pose.quaternions) {
        const degrees = quatAngleDegrees(track, 0, track, last * 4);
        seamDegrees = Math.max(seamDegrees, degrees);
        if (degrees > LOOP_CLOSED_DEGREES) fail(`${bone} first/last differ by ${degrees.toFixed(3)} deg`);
    }
    if (seamDegrees >= SEAM_MAX_DEGREES)
        fail(`loop seam ${seamDegrees.toFixed(2)} deg is not under ${SEAM_MAX_DEGREES}`);
    if (Math.abs(pose.rootPosition[1] - pose.rootPosition[last * 3 + 1]) > 1e-3) fail('hips height first != last');
    const restRoot = rig.restHead.get('root') as Vector3;
    let rootXZMeters = 0;
    for (let k = 0; k < pose.keys; k++) {
        rootXZMeters = Math.max(
            rootXZMeters,
            Math.hypot(pose.rootPosition[k * 3] - restRoot.x, pose.rootPosition[k * 3 + 2] - restRoot.z),
        );
    }
    if (rootXZMeters > ROOT_XZ_MAX_METERS) {
        fail(`root X/Z travels ${rootXZMeters.toFixed(3)} m from its rest position, over ${ROOT_XZ_MAX_METERS}`);
    }
    const closing = Math.hypot(
        pose.rootPosition[0] - pose.rootPosition[last * 3],
        pose.rootPosition[2] - pose.rootPosition[last * 3 + 2],
    );
    if (closing > LOOP_ROOT_METERS) fail(`root X/Z first != last (${closing} m)`);

    const floorY = restAnkleY(rig);
    const ankles = ankleTrack(rig, pose);
    const skateMeters = footSkate(ankles, pose.keys, floorY);
    if (skateMeters >= FOOT_SKATE_MAX_METERS)
        fail(`foot skate ${skateMeters.toFixed(3)} m is not under ${FOOT_SKATE_MAX_METERS}`);
    const floorMeters = maxAbs(floatPerKey(rig, pose));
    if (floorMeters > FLOOR_TOLERANCE) fail(`lowest foot is ${(floorMeters * 100).toFixed(1)} cm off the floor`);
    const clearanceMeters = measureClearance(rig, torso, pose).minClearance;
    if (!(clearanceMeters >= 0)) fail(`arm clearance ${(clearanceMeters * 100).toFixed(2)} cm is below 0`);
    const behindChestMeters = { L: behindChest(rig, pose, 'L').max, R: behindChest(rig, pose, 'R').max };
    for (const side of ['L', 'R'] as const) {
        if (behindChestMeters[side] > BEHIND_CHEST_MAX) {
            fail(`${side} arm goes ${(behindChestMeters[side] * 100).toFixed(1)} cm behind the chest`);
        }
    }
    const rootY = Array.from({ length: pose.keys }, (_, k) => pose.rootPosition[k * 3 + 1]);
    const contactMs = contactDistances(rootY, ankles, floorY, expected.beats);
    contactMs.forEach((ms, beat) => {
        if (ms > CONTACT_WARN_MS)
            warnings.push(`${id}: beat ${beat + 1} has no contact within ${CONTACT_WARN_MS} ms (${ms.toFixed(0)} ms)`);
    });
    return {
        id,
        failures,
        warnings,
        metrics: {
            keys: pose.keys,
            duration: clip.duration,
            seamDegrees,
            skateMeters,
            floorMeters,
            clearanceMeters,
            behindChestMeters,
            rootXZMeters,
            contactMs,
        },
    };
}

// ---- reproduction ----

export interface Reproduction {
    keys: number;
    duration: number;
    // Largest rotation difference over every shared track and key (degrees), and the track it is on.
    rotationDegrees: number;
    worstBone: string;
    // Largest root position difference (meters).
    rootMeters: number;
}

// Compares a built clip with its approved spike clip. Throws on a different key count or duration.
export function compareClips(built: AnimationClip, approved: AnimationClip): Reproduction {
    const a = poseTrackOf(built);
    const b = poseTrackOf(approved);
    if (a.keys !== b.keys) throw new Error(`${built.name}: ${a.keys} keys, the approved clip has ${b.keys}`);
    if (Math.abs(built.duration - approved.duration) > 1e-6) {
        throw new Error(`${built.name}: duration ${built.duration}, the approved clip has ${approved.duration}`);
    }
    let rotationDegrees = 0;
    let worstBone = '';
    for (const [bone, track] of b.quaternions) {
        const mine = a.quaternions.get(bone);
        if (!mine) throw new Error(`${built.name}: the approved clip has a ${bone} track the built one lacks`);
        for (let k = 0; k < a.keys; k++) {
            const degrees = quatAngleDegrees(mine, k * 4, track, k * 4);
            if (degrees > rotationDegrees) {
                rotationDegrees = degrees;
                worstBone = bone;
            }
        }
    }
    let rootMeters = 0;
    for (let i = 0; i < a.rootPosition.length; i++) {
        rootMeters = Math.max(rootMeters, Math.abs(a.rootPosition[i] - b.rootPosition[i]));
    }
    return { keys: a.keys, duration: built.duration, rotationDegrees, worstBone, rootMeters };
}

export const REPRODUCTION_MAX_DEGREES = 0.2;
export const REPRODUCTION_MAX_METERS = 0.001;
