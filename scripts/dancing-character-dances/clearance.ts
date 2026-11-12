// Keeps the dancer's arms out of the dancer's body. The torso is a stack of thin horizontal slices (each a star-shaped
// contour around its center, measured in the bind pose from the vertices that the spine, pelvis and clavicle bones
// dominate) that follow the animated spine. Per key the elbow, forearm middle, wrist and hand tip (each with a limb
// radius) are tested against it; where one is inside, the upper arm (then the forearm) is rotated about its joint by the
// smallest angle that clears it. The corrections are smoothed over neighboring keys so nothing pops, and the loop's
// first and last keys get the same correction because they are the same pose.

import { Matrix4, Quaternion, SkinnedMesh, Vector3 } from 'three';
import type { Bone } from 'three';
import { poseAt } from './clip';
import type { Clip, PoseTrack } from './clip';
import type { TargetRig } from './rig';

const DEGREES = 180 / Math.PI;
const TORSO_BONES = /^(spine0|pelvis|root|clavicle|breast)/;
const SLICE_HEIGHT = 0.03;
const BINS = 36;
const MIN_RADIUS = 0.04;
// Slightly more than half the spacing, so neighbors overlap and no height is left uncovered.
const SLICE_REACH = SLICE_HEIGHT * 0.6;
// How far past the surface a joint is kept, so a pose that merely touches is not reported as a hit.
const MARGIN = 0.004;

interface Slice {
    y: number;
    bone: string;
    cx: number;
    cz: number;
    radius: Float64Array;
}

export interface Torso {
    slices: Slice[];
    // Rest world matrix per torso bone.
    rest: Map<string, Matrix4>;
}

export function buildTorso(rig: TargetRig): Torso {
    rig.scene.updateMatrixWorld(true);
    const points: { p: Vector3; bone: string; w: number }[] = [];
    rig.scene.traverse((o) => {
        const mesh = o as SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        const position = mesh.geometry.getAttribute('position');
        const indices = mesh.geometry.getAttribute('skinIndex');
        const weights = mesh.geometry.getAttribute('skinWeight');
        for (let i = 0; i < position.count; i++) {
            let best = 0;
            for (let c = 1; c < 4; c++) if (weights.getComponent(i, c) > weights.getComponent(i, best)) best = c;
            const bone = mesh.skeleton.bones[indices.getComponent(i, best)].name;
            if (!TORSO_BONES.test(bone)) continue;
            const p = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
            // The clavicle bones also own the shoulder caps; the arm is tested against the trunk, not its own shoulder.
            if (bone.startsWith('clavicle') && Math.abs(p.x) > 0.16) continue;
            points.push({ p, bone, w: weights.getComponent(i, best) });
        }
    });
    const bins = new Map<number, typeof points>();
    for (const point of points) {
        const key = Math.floor(point.p.y / SLICE_HEIGHT);
        const list = bins.get(key) ?? [];
        list.push(point);
        bins.set(key, list);
    }
    const slices: Slice[] = [];
    for (const [key, list] of [...bins].sort((a, b) => a[0] - b[0])) {
        if (list.length < 12) continue;
        const votes = new Map<string, number>();
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const { p, bone, w } of list) {
            votes.set(bone, (votes.get(bone) ?? 0) + w);
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        }
        const bone = [...votes].sort((a, b) => b[1] - a[1])[0][0];
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const raw = new Float64Array(BINS);
        for (const { p } of list) {
            const bin = Math.floor(((Math.atan2(p.z - cz, p.x - cx) + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
            raw[bin] = Math.max(raw[bin], Math.hypot(p.x - cx, p.z - cz));
        }
        const radius = new Float64Array(BINS);
        for (let b = 0; b < BINS; b++) {
            radius[b] = Math.max(MIN_RADIUS, raw[(b + BINS - 1) % BINS], raw[b], raw[(b + 1) % BINS]);
        }
        slices.push({ y: (key + 0.5) * SLICE_HEIGHT, bone, cx, cz, radius });
    }
    const rest = new Map<string, Matrix4>();
    for (const slice of slices) {
        rest.set(slice.bone, (rig.byName.get(slice.bone) as Bone).matrixWorld.clone());
    }
    return { slices, rest };
}

interface SliceFrame {
    toRest: Matrix4;
    toWorld: Matrix4;
}

function sliceFrames(rig: TargetRig, torso: Torso): SliceFrame[] {
    return torso.slices.map((s) => {
        const toWorld = (rig.byName.get(s.bone) as Bone).matrixWorld
            .clone()
            .multiply((torso.rest.get(s.bone) as Matrix4).clone().invert());
        return { toWorld, toRest: toWorld.clone().invert() };
    });
}

const tmp = new Vector3();

// Distance from a limb of `limbRadius` centered at world point `p` to the torso surface (negative inside), and the
// outward direction in world space.
function clearanceOf(torso: Torso, frames: SliceFrame[], p: Vector3, limbRadius: number, normal: Vector3): number {
    let best = Infinity;
    for (let i = 0; i < torso.slices.length; i++) {
        const s = torso.slices[i];
        tmp.copy(p).applyMatrix4(frames[i].toRest);
        if (Math.abs(tmp.y - s.y) > SLICE_REACH) continue;
        const dx = tmp.x - s.cx;
        const dz = tmp.z - s.cz;
        const dist = Math.hypot(dx, dz);
        const t = ((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * BINS - 0.5;
        const b0 = Math.floor(t);
        const u = t - b0;
        const r = s.radius[(b0 + BINS) % BINS] * (1 - u) + s.radius[(b0 + 1 + BINS) % BINS] * u;
        const c = dist - r - limbRadius;
        if (c < best) {
            best = c;
            if (dist > 1e-6) normal.set(dx / dist, 0, dz / dist);
            else normal.set(0, 0, 1);
            normal.transformDirection(frames[i].toWorld);
        }
    }
    return best;
}

// ---- the arm's test points ----

const LIMB_RADII = [0.045, 0.04, 0.03, 0.025];

interface Arm {
    side: 'L' | 'R';
    shoulder: Vector3;
    // Elbow, forearm middle, wrist, hand tip.
    points: Vector3[];
}

function armOf(rig: TargetRig, side: 'L' | 'R'): Arm {
    const at = (name: string): Vector3 => (rig.byName.get(name) as Bone).getWorldPosition(new Vector3());
    const elbow = at(`lowerarm01${side}`);
    const wrist = at(`wrist${side}`);
    const knuckle = at(`finger3-1${side}`);
    return {
        side,
        shoulder: at(`upperarm01${side}`),
        points: [
            elbow,
            elbow.clone().add(wrist).multiplyScalar(0.5),
            wrist,
            wrist.clone().add(knuckle.sub(wrist).multiplyScalar(1.8)),
        ],
    };
}

export interface ClearanceStats {
    penetratingKeys: number;
    minClearance: number;
    keys: number;
}

// Worst clearance over both arms' test points, per key 0..n-1 (the last key repeats the first).
export function measureClearance(rig: TargetRig, torso: Torso, clip: PoseTrack): ClearanceStats {
    const normal = new Vector3();
    let penetratingKeys = 0;
    let minClearance = Infinity;
    const n = clip.keys - 1;
    for (let k = 0; k < n; k++) {
        poseAt(rig, clip, k);
        const frames = sliceFrames(rig, torso);
        let worst = Infinity;
        for (const side of ['L', 'R'] as const) {
            const arm = armOf(rig, side);
            arm.points.forEach((p, i) => {
                worst = Math.min(worst, clearanceOf(torso, frames, p, LIMB_RADII[i], normal));
            });
        }
        if (worst < 0) penetratingKeys++;
        minClearance = Math.min(minClearance, worst);
    }
    return { penetratingKeys, minClearance, keys: n };
}

// ---- the correction ----

const MAX_UPPER = 90 / DEGREES;
const MAX_FORE = 90 / DEGREES;
const STEP = 1 / DEGREES;

// Rotates points[indices] about `pivot` by the smallest angle that lifts the worst of them out of the torso, repeatedly,
// accumulating into `total`. Returns whether anything moved.
function push(
    torso: Torso,
    frames: SliceFrame[],
    pivot: Vector3,
    points: Vector3[],
    indices: number[],
    total: Quaternion,
    limit: number,
): void {
    const normal = new Vector3();
    const axis = new Vector3();
    const q = new Quaternion();
    const probe = new Vector3();
    const probeNormal = new Vector3();
    for (let iteration = 0; iteration < 6; iteration++) {
        let worst = -1;
        let worstClearance = 0;
        for (const i of indices) {
            const c = clearanceOf(torso, frames, points[i], LIMB_RADII[i], normal);
            if (c < worstClearance) {
                worstClearance = c;
                worst = i;
            }
        }
        if (worst < 0) return;
        clearanceOf(torso, frames, points[worst], LIMB_RADII[worst], normal);
        axis.copy(points[worst]).sub(pivot).cross(normal);
        if (axis.lengthSq() < 1e-10) return;
        axis.normalize();
        let angle = 0;
        while (angle < limit) {
            angle += STEP;
            q.setFromAxisAngle(axis, angle);
            probe.copy(points[worst]).sub(pivot).applyQuaternion(q).add(pivot);
            if (clearanceOf(torso, frames, probe, LIMB_RADII[worst], probeNormal) >= MARGIN) break;
        }
        q.setFromAxisAngle(axis, angle);
        for (const i of indices) points[i].sub(pivot).applyQuaternion(q).add(pivot);
        total.premultiply(q);
        if (2 * Math.acos(Math.min(1, Math.abs(total.w))) > limit) return;
    }
}

const toVector = (q: Quaternion, out: Vector3): Vector3 => {
    const w = q.w < 0 ? -1 : 1;
    const angle = 2 * Math.acos(Math.min(1, q.w * w));
    const s = Math.sqrt(Math.max(0, 1 - q.w * q.w));
    return s < 1e-9 ? out.set(0, 0, 0) : out.set(q.x * w, q.y * w, q.z * w).multiplyScalar(angle / s);
};

const fromVector = (v: Vector3, out: Quaternion): Quaternion => {
    const angle = v.length();
    return angle < 1e-9 ? out.identity() : out.setFromAxisAngle(tmp.copy(v).divideScalar(angle), angle);
};

// Largest-magnitude vector within `radius` keys (cyclic), then a [1 2 3 2 1] blur: wide enough that the correction eases
// in and out, and dilated first so the blur does not eat the peak that clears the worst key.
function smooth(vectors: Vector3[], radius: number): Vector3[] {
    const n = vectors.length;
    const dilated = vectors.map((_, k) => {
        let best = vectors[k];
        for (let d = -radius; d <= radius; d++) {
            const v = vectors[(k + d + n * 4) % n];
            if (v.lengthSq() > best.lengthSq()) best = v;
        }
        return best;
    });
    const weights = [1, 2, 3, 2, 1];
    return dilated.map((_, k) => {
        const out = new Vector3();
        for (let d = -2; d <= 2; d++) out.addScaledVector(dilated[(k + d + n * 4) % n], weights[d + 2] / 9);
        return out;
    });
}

export interface ClearanceReport {
    before: ClearanceStats;
    after: ClearanceStats;
    // Largest rotation the correction added to an upper arm or forearm, in degrees.
    maxCorrection: number;
}

export function clearArms(rig: TargetRig, torso: Torso, clip: Clip): ClearanceReport {
    const before = measureClearance(rig, torso, clip);
    const n = clip.keys - 1;
    const original = new Map<string, Float32Array>();
    const tracks = ['L', 'R'].flatMap((s) => [`upperarm01${s}`, `lowerarm01${s}`]);
    for (const name of tracks) original.set(name, (clip.quaternions.get(name) as Float32Array).slice());
    const q = new Quaternion();
    const qu = new Quaternion();
    const qf = new Quaternion();
    const a = new Quaternion();
    const b = new Quaternion();
    const get = (bone: string): Quaternion => (rig.byName.get(bone) as Bone).getWorldQuaternion(new Quaternion());
    const parentWorld = (bone: string): Quaternion =>
        ((rig.byName.get(bone) as Bone).parent as Bone).getWorldQuaternion(new Quaternion());
    for (let pass = 0; pass < 4; pass++) {
        // Solve every key and side against the current pose.
        const vu = { L: [] as Vector3[], R: [] as Vector3[] };
        const vf = { L: [] as Vector3[], R: [] as Vector3[] };
        let any = false;
        for (let k = 0; k < n; k++) {
            poseAt(rig, clip, k);
            const frames = sliceFrames(rig, torso);
            for (const side of ['L', 'R'] as const) {
                const arm = armOf(rig, side);
                const upper = new Quaternion();
                const fore = new Quaternion();
                push(torso, frames, arm.shoulder, arm.points, [0], upper, MAX_UPPER);
                push(torso, frames, arm.points[0], arm.points, [1, 2, 3], fore, MAX_FORE);
                push(torso, frames, arm.shoulder, arm.points, [0, 1, 2, 3], upper, MAX_UPPER);
                push(torso, frames, arm.points[0], arm.points, [1, 2, 3], fore, MAX_FORE);
                if (upper.w < 1 - 1e-9 || fore.w < 1 - 1e-9) any = true;
                vu[side].push(toVector(upper, new Vector3()));
                vf[side].push(toVector(fore, new Vector3()));
            }
        }
        if (!any) break;
        const radius = pass < 2 ? 2 : 4;
        const su = { L: smooth(vu.L, radius), R: smooth(vu.R, radius) };
        const sf = { L: smooth(vf.L, radius), R: smooth(vf.R, radius) };
        // Apply: the upper arm turns about the shoulder in world space, the forearm about the elbow after that.
        for (let k = 0; k < n; k++) {
            poseAt(rig, clip, k);
            for (const side of ['L', 'R'] as const) {
                fromVector(su[side][k], qu);
                fromVector(sf[side][k], qf);
                const upperName = `upperarm01${side}`;
                const foreName = `lowerarm01${side}`;
                const wUpper = get(upperName);
                const wFore = get(foreName);
                const pUpper = parentWorld(upperName);
                const pFore = parentWorld(foreName);
                // upper local' = parent^-1 * R_u * W
                q.copy(pUpper).invert().multiply(qu).multiply(wUpper);
                writeKey(clip, upperName, k, q, original.get(upperName) as Float32Array);
                // fore local' = (R_u * parent)^-1 * R_f * R_u * W
                a.copy(qu).multiply(pFore).invert();
                b.copy(qf).multiply(qu).multiply(wFore);
                q.copy(a).multiply(b);
                writeKey(clip, foreName, k, q, original.get(foreName) as Float32Array);
            }
        }
    }
    // The last key is the first.
    for (const name of tracks) {
        const track = clip.quaternions.get(name) as Float32Array;
        for (let c = 0; c < 4; c++) track[n * 4 + c] = track[c];
    }
    const after = measureClearance(rig, torso, clip);
    let maxCorrection = 0;
    for (const name of tracks) {
        const track = clip.quaternions.get(name) as Float32Array;
        const old = original.get(name) as Float32Array;
        for (let k = 0; k <= n; k++) {
            const dot = Math.abs(
                track[k * 4] * old[k * 4] +
                    track[k * 4 + 1] * old[k * 4 + 1] +
                    track[k * 4 + 2] * old[k * 4 + 2] +
                    track[k * 4 + 3] * old[k * 4 + 3],
            );
            maxCorrection = Math.max(maxCorrection, 2 * Math.acos(Math.min(1, dot)) * DEGREES);
        }
    }
    return { before, after, maxCorrection };
}

// Stores q for key k in the hemisphere of the bone's previous key value.
function writeKey(clip: Clip, bone: string, k: number, q: Quaternion, reference: Float32Array): void {
    const track = clip.quaternions.get(bone) as Float32Array;
    const dot =
        q.x * reference[k * 4] + q.y * reference[k * 4 + 1] + q.z * reference[k * 4 + 2] + q.w * reference[k * 4 + 3];
    const s = dot < 0 ? -1 : 1;
    track[k * 4] = q.x * s;
    track[k * 4 + 1] = q.y * s;
    track[k * 4 + 2] = q.z * s;
    track[k * 4 + 3] = q.w * s;
}
