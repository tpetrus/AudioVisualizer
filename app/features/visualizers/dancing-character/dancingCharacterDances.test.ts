import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DANCE_REQUIRED_BONES } from './dancingCharacterConfig';

// Loads the committed MakeHumanDances.glb with GLTFLoader and checks the hard rules of the dance clips
// (docs/plans/natural-dance/contracts.md, C2 and Amendments 3 and 4) on the file the app will ship.

// The dances and their length in beats (Amendment 3); the registry that names them is a later task.
const EXPECTED = [
    { id: 'lambada', beats: 8 },
    { id: 'twist', beats: 8 },
    { id: 'cabbage-patch', beats: 4 },
    { id: 'salsa', beats: 4 },
];

async function load(file: string) {
    // The loader decodes embedded textures through an <img> element, which the node environment lacks; the garment
    // file needs this stand-in and the dance file does not hurt by having it (setup.ts unstubs it after each test).
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
    const bytes = readFileSync(new URL(`./assets/${file}`, import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new GLTFLoader().parseAsync(buffer, '');
}

const track = (clip: THREE.AnimationClip, name: string): THREE.KeyframeTrack => {
    const found = clip.tracks.find((t) => t.name === name);
    if (!found) throw new Error(`no track ${name} in ${clip.name}`);
    return found;
};

describe('vendored MakeHumanDances.glb', () => {
    it('has exactly the four dance clips, each beats * 0.5 s long', async () => {
        const { animations } = await load('MakeHumanDances.glb');
        expect(animations.map((clip) => clip.name).sort()).toEqual(EXPECTED.map((d) => d.id).sort());
        for (const { id, beats } of EXPECTED) {
            const clip = animations.find((c) => c.name === id) as THREE.AnimationClip;
            expect(Math.abs(clip.duration - beats * 0.5), id).toBeLessThan(1e-6);
        }
    });

    it('drives every required bone with a quaternion track plus the root position, with finite unit values', async () => {
        const { animations } = await load('MakeHumanDances.glb');
        for (const clip of animations) {
            for (const bone of DANCE_REQUIRED_BONES)
                expect(() => track(clip, `${bone}.quaternion`), clip.name).not.toThrow();
            expect(() => track(clip, 'root.position'), clip.name).not.toThrow();
            for (const t of clip.tracks) {
                for (const value of t.values) expect(Number.isFinite(value), `${clip.name}/${t.name}`).toBe(true);
                if (!t.name.endsWith('.quaternion')) continue;
                for (let i = 0; i < t.values.length; i += 4) {
                    const length = Math.hypot(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]);
                    expect(Math.abs(length - 1), `${clip.name}/${t.name}`).toBeLessThan(1e-3);
                }
            }
        }
    });

    it('closes every loop: the last key is the first within 0.5 degrees and 1 mm', async () => {
        const { animations } = await load('MakeHumanDances.glb');
        for (const clip of animations) {
            for (const t of clip.tracks) {
                const keys = t.times.length;
                const first = t.values.slice(0, t.getValueSize());
                const last = t.values.slice((keys - 1) * t.getValueSize());
                if (t.name.endsWith('.quaternion')) {
                    const dot = Math.abs(
                        first[0] * last[0] + first[1] * last[1] + first[2] * last[2] + first[3] * last[3],
                    );
                    const degrees = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
                    expect(degrees, `${clip.name}/${t.name}`).toBeLessThanOrEqual(0.5);
                } else {
                    for (let i = 0; i < 3; i++)
                        expect(Math.abs(first[i] - last[i]), `${clip.name}/${t.name}`).toBeLessThan(1e-3);
                }
            }
        }
    });

    it("keeps the root X/Z within 0.10 m of the rig's root rest position", async () => {
        const { animations } = await load('MakeHumanDances.glb');
        const { scene } = await load('MakeHumanDancer.glb');
        scene.updateMatrixWorld(true);
        const rootBone = scene.getObjectByName('root') as THREE.Object3D;
        const rest = rootBone.getWorldPosition(new THREE.Vector3());
        for (const clip of animations) {
            const values = track(clip, 'root.position').values;
            let worst = 0;
            for (let i = 0; i < values.length; i += 3)
                worst = Math.max(worst, Math.hypot(values[i] - rest.x, values[i + 2] - rest.z));
            expect(worst, clip.name).toBeLessThanOrEqual(0.1);
        }
    });
});
