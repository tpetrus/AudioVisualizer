import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyRelaxedHands } from './dancingCharacterHands';

// Measured on the real rig: for every finger of both hands, curling moves the tip toward the palm, keeps the fingers
// in order across the hand, and shortens the wrist-to-tip distance by a relaxed amount (not a fist).

async function loadModel(): Promise<THREE.Group> {
    // Same stand-in image element as dancingCharacterClip.test.ts: GLTFLoader decodes textures through it.
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('document', {
        createElementNS: () => {
            const listeners = new Map<string, () => void>();
            return {
                width: 1,
                height: 1,
                addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
                removeEventListener: (type: string) => listeners.delete(type),
                set src(_value: string) {
                    queueMicrotask(() => listeners.get('load')?.());
                },
            };
        },
    });
    const file = readFileSync(new URL('./assets/MakeHumanDancer.glb', import.meta.url));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    return (await new GLTFLoader().parseAsync(bytes, '')).scene;
}

const SIDES = ['L', 'R'] as const;
type Side = (typeof SIDES)[number];

function position(model: THREE.Object3D, name: string): THREE.Vector3 {
    const bone = model.getObjectByName(name);
    if (!bone) throw new Error(`missing bone ${name}`);
    return bone.getWorldPosition(new THREE.Vector3());
}

// The distal bones have no child, so the tip is the distal head pushed on by the middle bone's length along the
// distal bone's own +Y.
function fingertip(model: THREE.Object3D, finger: number, side: Side): THREE.Vector3 {
    const middle = position(model, `finger${finger}-2${side}`);
    const distal = model.getObjectByName(`finger${finger}-3${side}`)!;
    const head = distal.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(distal.getWorldQuaternion(new THREE.Quaternion()));
    return head.addScaledVector(up, middle.distanceTo(head));
}

function measure(model: THREE.Object3D, side: Side) {
    model.updateMatrixWorld(true);
    return {
        wrist: position(model, `wrist${side}`),
        // Thumb first, then index to little.
        tips: [1, 2, 3, 4, 5].map((finger) => fingertip(model, finger, side)),
    };
}

// Palm normal from the rest pose: fingers direction crossed with the index-to-little direction, with the order set by
// the hand's side (the right hand is the mirror image of the left).
function palmFrame(model: THREE.Object3D, side: Side) {
    model.updateMatrixWorld(true);
    const wrist = position(model, `wrist${side}`);
    const forward = position(model, `finger3-1${side}`).sub(wrist).normalize();
    const across = position(model, `finger2-1${side}`)
        .sub(position(model, `finger5-1${side}`))
        .normalize();
    const normal = side === 'L' ? forward.clone().cross(across).normalize() : across.clone().cross(forward).normalize();
    return { normal, across };
}

describe('applyRelaxedHands', () => {
    it('curls every finger of both hands toward the palm by a relaxed amount', async () => {
        const rest = await loadModel();
        const curled = await loadModel();
        applyRelaxedHands(curled);

        const shrinks: Record<Side, number[]> = { L: [], R: [] };
        const lifts: Record<Side, number[]> = { L: [], R: [] };
        for (const side of SIDES) {
            const { normal, across } = palmFrame(rest, side);
            // The rig is in an A-pose with the palms facing the body, so the palm normal points toward the midline.
            expect(side === 'L' ? -normal.x : normal.x, `${side} palm faces the body`).toBeGreaterThan(0.3);

            const before = measure(rest, side);
            const after = measure(curled, side);
            after.tips.forEach((tip, i) => {
                const lift = tip.clone().sub(before.tips[i]).dot(normal);
                lifts[side].push(lift);
                expect(lift, `${side} finger ${i + 1} moves toward the palm`).toBeGreaterThan(0.004);
                shrinks[side].push(1 - tip.distanceTo(after.wrist) / before.tips[i].distanceTo(before.wrist));
            });

            // Fingers keep their order across the hand (no tip crosses its neighbor).
            const order = (tips: THREE.Vector3[]) =>
                tips
                    .map((tip, i) => ({ i, a: tip.dot(across) }))
                    .sort((p, q) => p.a - q.a)
                    .map((entry) => entry.i);
            expect(order(after.tips.slice(1))).toEqual(order(before.tips.slice(1)));
        }

        // Relaxed, not a fist: index to little finger tips come 10-30% closer to the wrist (a fist would be about
        // 55%); the thumb, which only bends gently, 1-8%.
        for (const side of SIDES) {
            expect(shrinks[side][0]).toBeGreaterThan(0.01);
            expect(shrinks[side][0]).toBeLessThan(0.08);
            for (const shrink of shrinks[side].slice(1)) {
                expect(shrink).toBeGreaterThan(0.1);
                expect(shrink).toBeLessThan(0.3);
            }
        }

        // The two hands are mirror images of each other.
        shrinks.L.forEach((shrink, i) => {
            expect(shrinks.R[i]).toBeCloseTo(shrink, 3);
            expect(lifts.R[i]).toBeCloseTo(lifts.L[i], 4);
        });
    });

    it('leaves a model without the finger bones alone', () => {
        expect(() => applyRelaxedHands(new THREE.Group())).not.toThrow();
    });
});
