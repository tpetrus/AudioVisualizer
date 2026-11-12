import * as THREE from 'three';

// The CMU motion capture carries no finger data, so no dance clip has a track for a finger bone and the hands would
// stay in the rig's flat bind pose (fingers straight) in every dance. This gives the dancer a loosely relaxed hand
// instead: each finger joint is bent a little about its own flexion axis, more toward the tips, and the thumb a little
// toward the palm. The clips never write these bones, so setting the rotation once is enough for every dance.

const DEG = Math.PI / 180;

// The rig follows the Blender bone convention (local +Y runs head to tail), but its finger bones flex about local Z, not
// X (X is nearly the palm normal here, so turning about it would only fan the fingers sideways). A negative angle about
// Z moves the fingertips toward the palm on both hands, identically (the left and right chains are exact mirror
// copies). The hands unit test measures all of this on the real rig, so a rig change that flips it fails loudly.
const FLEXION_AXIS = new THREE.Vector3(0, 0, -1);

// Curl in degrees for the three joints of a finger (proximal, middle, distal). Increasing toward the tip is what makes
// a relaxed hand read as natural; the sums stay well short of a fist. The little finger curls a bit more than the
// index, as in a resting hand. The thumb gets a gentler, separate curve.
const FINGER_CURL_DEG: readonly (readonly [number, number, number])[] = [
    [18, 26, 16], // index
    [22, 30, 18], // middle
    [26, 34, 20], // ring
    [30, 38, 22], // little
];
const THUMB_CURL_DEG: readonly [number, number, number] = [6, 10, 8];

const SIDES = ['L', 'R'] as const;

const flexion = new THREE.Quaternion();

function bend(model: THREE.Object3D, name: string, degrees: number): void {
    const bone = model.getObjectByName(name);
    if (!bone) return;
    // Post-multiplying turns the bone about its own flexion axis, on top of its bind rotation.
    bone.quaternion.multiply(flexion.setFromAxisAngle(FLEXION_AXIS, degrees * DEG));
}

// Curls every finger of both hands. Call it exactly once per loaded model: it adds to the bone's current rotation
// rather than setting it, so a second call would curl the hands twice as far.
export function applyRelaxedHands(model: THREE.Object3D): void {
    for (const side of SIDES) {
        THUMB_CURL_DEG.forEach((degrees, joint) => bend(model, `finger1-${joint + 1}${side}`, degrees));
        FINGER_CURL_DEG.forEach((joints, finger) =>
            joints.forEach((degrees, joint) => bend(model, `finger${finger + 2}-${joint + 1}${side}`, degrees)),
        );
    }
}
