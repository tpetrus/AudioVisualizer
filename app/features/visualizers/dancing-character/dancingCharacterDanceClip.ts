import * as THREE from 'three';
import { DANCE_CLIP_BEATS, DANCE_CLIP_DURATION, DANCE_REQUIRED_BONES } from './dancingCharacterConfig';

// The MakeHuman model ships without animation, so the dance is written here in code. It comes as two clips of the same
// length that the scene plays together:
// - `base` is a bounce that is identical on every beat (the dip lands on the beat), so it is correct at any tempo and
//   needs no bar position.
// - `accents` is an additive layer of bigger moves (arm sway, head nod) that only shows while the bar is known.
export interface DanceClips {
    base: THREE.AnimationClip;
    accents: THREE.AnimationClip;
}

type Axis = 'x' | 'y' | 'z';
type Shape = (beat: number, u: number) => number;

// Keys per beat. Eight sample a cosine ease finely enough that the linear interpolation between them looks smooth.
const KEYS_PER_BEAT = 8;
const KEY_INTERVALS = DANCE_CLIP_BEATS * KEYS_PER_BEAT;

// ---- Pose amplitudes ----
// Angles are radians about a bone's own axis, applied after its rest rotation. The axes and signs were measured on the
// rig (see assets/CREDITS.md): knees bend with negative local Z, hips flex forward with positive Z, an arm rises
// outward with positive X on the left and negative X on the right, the elbow flexes with negative Z, and the head
// nods forward with negative Z.

// The root drops this far (meters) at the bottom of the bounce. The knee and hip angles below are chosen so the
// legs reach this much shorter and the feet stay planted (measured on the rig: the ankle ends within 5 mm of its rest height).
const ROOT_DROP = 0.05;
const KNEE_BEND = 0.575;
const HIP_FLEXION = 0.29;
// The foot turns back by what the shin tilts (knee bend minus hip flexion) so the sole stays flat on the floor while the shin tilts.
const FOOT_COUNTER = KNEE_BEND - HIP_FLEXION;
// The chest leans forward a little at the bottom of the bounce, shared across the five spine bones.
const CHEST_LEAN_PER_BONE = 0.03;
const SHRUG = 0.08;
// Arms hang lower than the A-pose they start in (about 43 degrees out) and the elbows stay bent.
const ARM_LOWER = 0.4;
const ARM_FORWARD = 0.1;
const ELBOW_REST = 0.8;
const ELBOW_BOUNCE = 0.3;
// Accents: the arms lift outward and forward and straighten, and the head nods.
const SWAY_LIFT = 0.75;
const SWAY_FORWARD = 0.3;
const SWAY_STRAIGHTEN = 0.5;
const NOD_NECK = 0.12;
const NOD_HEAD = 0.35;

const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
};

// One rotation about a bone-local axis, as an angle that depends on where the loop is.
interface Term {
    axis: Axis;
    // `beat` is the beat index 0..DANCE_CLIP_BEATS-1 and `u` the fraction 0..1 through it.
    angle: Shape;
}

// 1 at the start of the beat (the dip), 0 half way (the top), 1 again at the next beat: a smooth down-up.
const dip: Shape = (_beat, u) => 0.5 + 0.5 * Math.cos(2 * Math.PI * u);

// 0 at both ends of a beat and 1 in the middle, but only on the beats `active` accepts; a smooth bump.
function bump(active: (beat: number) => boolean): Shape {
    return (beat, u) => (active(beat) ? Math.sin(Math.PI * u) ** 2 : 0);
}

// Beats 1 and 3 of the bar (indices 0 and 2) carry the arm sway, beats 2 and 4 the head nod.
const swayEnvelope = bump((beat) => beat % 2 === 0);
const nodEnvelope = bump((beat) => beat % 2 === 1);

function scaled(amplitude: number, shape: Shape): Shape {
    return (beat, u) => amplitude * shape(beat, u);
}

function constant(value: number): Shape {
    return () => value;
}

const times = Array.from({ length: KEY_INTERVALS + 1 }, (_, i) => (i * DANCE_CLIP_DURATION) / KEY_INTERVALS);

// Calls `visit` for every key with its beat and position in the beat. The last key reuses the first key's position
// exactly, so the loop closes without a seam instead of within rounding error.
function forEachKey(visit: (index: number, beat: number, u: number) => void): void {
    for (let i = 0; i <= KEY_INTERVALS; i++) {
        const wrapped = i % KEY_INTERVALS;
        const beat = Math.floor(wrapped / KEYS_PER_BEAT);
        visit(i, beat, (wrapped % KEYS_PER_BEAT) / KEYS_PER_BEAT);
    }
}

// Rotation keys. `rest` is the bone's rest rotation for an absolute track, or null for an additive one, where the
// identity means no change.
function rotationTrack(
    bone: string,
    rest: THREE.Quaternion | null,
    terms: readonly Term[],
): THREE.QuaternionKeyframeTrack {
    const values = new Float32Array((KEY_INTERVALS + 1) * 4);
    const q = new THREE.Quaternion();
    const step = new THREE.Quaternion();
    forEachKey((index, beat, u) => {
        if (rest) q.copy(rest);
        else q.identity();
        for (const term of terms) {
            step.setFromAxisAngle(AXIS_VECTORS[term.axis], term.angle(beat, u));
            q.multiply(step);
        }
        q.toArray(values, index * 4);
    });
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

function rootPositionTrack(rest: THREE.Vector3): THREE.VectorKeyframeTrack {
    const values = new Float32Array((KEY_INTERVALS + 1) * 3);
    forEachKey((index, beat, u) => {
        values[index * 3] = rest.x;
        values[index * 3 + 1] = rest.y - ROOT_DROP * dip(beat, u);
        values[index * 3 + 2] = rest.z;
    });
    return new THREE.VectorKeyframeTrack('root.position', times, values);
}

const SPINE_BONES = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'] as const;

// Reads names and rest quaternions/positions once per load; may allocate. Returns null when the rig lacks a bone the
// dance drives. Track names use the loaded (sanitized) bone names. 'root.position' binds to the bone named root and not
// to the mixer root (dancingCharacterDanceClip.test.ts checks it against the real model), because the mixer root's
// own name only matches when it is also called 'root'.
export function buildDanceClip(bones: readonly THREE.Bone[]): DanceClips | null {
    const byName = new Map<string, THREE.Bone>();
    for (const bone of bones) byName.set(bone.name, bone);
    for (const name of DANCE_REQUIRED_BONES) if (!byName.has(name)) return null;
    const rest = (name: string): THREE.Quaternion => byName.get(name)!.quaternion;

    const base: THREE.KeyframeTrack[] = [rootPositionTrack(byName.get('root')!.position)];
    for (const side of ['L', 'R'] as const) {
        // The left arm rises outward with positive X and the right with negative X, so those moves flip with the side.
        const outward = side === 'L' ? 1 : -1;
        base.push(
            rotationTrack(`upperleg01${side}`, rest(`upperleg01${side}`), [
                { axis: 'z', angle: scaled(HIP_FLEXION, dip) },
            ]),
            rotationTrack(`lowerleg01${side}`, rest(`lowerleg01${side}`), [
                { axis: 'z', angle: scaled(-KNEE_BEND, dip) },
            ]),
            rotationTrack(`foot${side}`, rest(`foot${side}`), [{ axis: 'z', angle: scaled(FOOT_COUNTER, dip) }]),
            rotationTrack(`clavicle${side}`, rest(`clavicle${side}`), [
                { axis: 'x', angle: scaled(outward * SHRUG, dip) },
            ]),
            rotationTrack(`upperarm01${side}`, rest(`upperarm01${side}`), [
                { axis: 'x', angle: constant(-outward * ARM_LOWER) },
                { axis: 'z', angle: constant(-ARM_FORWARD) },
            ]),
            rotationTrack(`lowerarm01${side}`, rest(`lowerarm01${side}`), [
                { axis: 'z', angle: (beat, u) => -ELBOW_REST - ELBOW_BOUNCE * dip(beat, u) },
            ]),
        );
    }
    for (const name of SPINE_BONES) {
        base.push(rotationTrack(name, rest(name), [{ axis: 'z', angle: scaled(-CHEST_LEAN_PER_BONE, dip) }]));
    }

    const accents: THREE.KeyframeTrack[] = [];
    for (const side of ['L', 'R'] as const) {
        const outward = side === 'L' ? 1 : -1;
        accents.push(
            rotationTrack(`upperarm01${side}`, null, [
                { axis: 'x', angle: scaled(outward * SWAY_LIFT, swayEnvelope) },
                { axis: 'z', angle: scaled(-SWAY_FORWARD, swayEnvelope) },
            ]),
            rotationTrack(`lowerarm01${side}`, null, [{ axis: 'z', angle: scaled(SWAY_STRAIGHTEN, swayEnvelope) }]),
        );
    }
    accents.push(
        rotationTrack('neck02', null, [{ axis: 'z', angle: scaled(-NOD_NECK, nodEnvelope) }]),
        rotationTrack('head', null, [{ axis: 'z', angle: scaled(-NOD_HEAD, nodEnvelope) }]),
    );

    const accentClip = new THREE.AnimationClip('DanceAccents', DANCE_CLIP_DURATION, accents);
    accentClip.blendMode = THREE.AdditiveAnimationBlendMode;
    return { base: new THREE.AnimationClip('DanceBase', DANCE_CLIP_DURATION, base), accents: accentClip };
}
