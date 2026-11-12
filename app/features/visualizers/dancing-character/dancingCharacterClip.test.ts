import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    BODY_MATERIAL_NAMES,
    DANCE_CLIP_DURATION,
    DANCE_CLOCK_SECONDS,
    DANCE_REQUIRED_BONES,
    DANCES,
    NATIVE_BPM,
} from './dancingCharacterConfig';

// Parses the vendored GLB with GLTFLoader (the garment textures are decoded by a stand-in image element), so the config
// constants that describe the asset are checked against the real file.

const BONE_COUNT = 163;

async function loadModel() {
    // GLTFLoader decodes the garment textures through an <img> element, which the node environment lacks. This
    // stand-in answers "loaded", so the loader builds its Texture objects (setup.ts unstubs it after each test).
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
    const gltf = await new GLTFLoader().parseAsync(bytes, '');
    const skinned: THREE.SkinnedMesh[] = [];
    const materials = new Set<string>();
    gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(object as THREE.SkinnedMesh);
        if (mesh.isMesh) for (const material of [mesh.material].flat()) materials.add(material.name);
    });
    return { gltf, skinned, materials };
}

describe('vendored MakeHumanDancer.glb', () => {
    it('has five skinned meshes sharing one 163-bone skeleton and no animation', async () => {
        const { gltf, skinned } = await loadModel();
        expect(gltf.animations).toHaveLength(0);
        expect(skinned).toHaveLength(5);
        for (const mesh of skinned) expect(mesh.skeleton.bones).toEqual(skinned[0].skeleton.bones);
        expect(skinned[0].skeleton.bones).toHaveLength(BONE_COUNT);
    });

    it('names the bones the dance drives the way GLTFLoader sanitizes them (no dots)', async () => {
        const { skinned } = await loadModel();
        const names = new Set(skinned[0].skeleton.bones.map((bone) => bone.name));
        for (const name of DANCE_REQUIRED_BONES) expect(names.has(name), name).toBe(true);
        expect(names.has('upperarm01.L')).toBe(false);
        // The bone literally called root exists; the clip's 'root.position' track relies on it.
        expect(names.has('root')).toBe(true);
    });

    it('has a Skin material, which is what the body tint targets, and one more per garment', async () => {
        const { materials } = await loadModel();
        expect(materials).toEqual(new Set(['Skin', 'Outfit', 'Shoes', 'Hair', 'Eyes']));
        for (const name of BODY_MATERIAL_NAMES) expect(materials.has(name)).toBe(true);
    });

    it('has a native tempo and bar length that agree: four beats at 120 BPM take two seconds', () => {
        expect(DANCE_CLIP_DURATION).toBe(2);
        expect(NATIVE_BPM).toBe(120);
    });

    it('has a shared dance clock that every clip length divides, so every bar line coincides', () => {
        expect(DANCE_CLOCK_SECONDS).toBe(4);
        for (const dance of DANCES) {
            const length = (dance.beats * 60) / NATIVE_BPM;
            expect(DANCE_CLOCK_SECONDS % length, dance.id).toBe(0);
            // A switch is possible on any bar line of the shortest clip, and every clip is whole bars.
            expect(length % DANCE_CLIP_DURATION, dance.id).toBe(0);
        }
    });
});
