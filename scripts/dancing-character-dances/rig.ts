// Loads a character GLB in node with GLTFLoader (the way scripts/dancing-character-model/check.ts does) and
// exposes its bones by the names GLTFLoader gives them.

import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import type { Bone, Group, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

// GLTFLoader decodes textures through an <img> element, which Node lacks. This stand-in answers "loaded" for any
// source so the loader builds its Texture objects, and is removed afterwards.
export async function withFakeImages<T>(run: () => Promise<T>): Promise<T> {
    const scope = globalThis as unknown as Record<string, unknown>;
    const added: string[] = [];
    const define = (name: string, value: unknown): void => {
        if (scope[name] !== undefined) return;
        scope[name] = value;
        added.push(name);
    };
    define('self', globalThis);
    define('document', {
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
    try {
        return await run();
    } finally {
        for (const name of added) delete scope[name];
    }
}

export async function loadGlb(path: string): Promise<GLTF> {
    const bytes = readFileSync(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return withFakeImages(() => new GLTFLoader().parseAsync(buffer, ''));
}

export interface TargetRig {
    scene: Group;
    // Every bone by its loaded name, in parent-first order.
    bones: Bone[];
    byName: Map<string, Bone>;
    restLocal: Map<string, Quaternion>;
    restWorld: Map<string, Quaternion>;
    restHead: Map<string, Vector3>;
}

export async function loadTargetRig(path: string): Promise<TargetRig> {
    const gltf = await loadGlb(path);
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const bones: Bone[] = [];
    scene.traverse((o: Object3D) => {
        if ('isBone' in o) bones.push(o as Bone);
    });
    const byName = new Map(bones.map((b) => [b.name, b]));
    const restLocal = new Map<string, Quaternion>();
    const restWorld = new Map<string, Quaternion>();
    const restHead = new Map<string, Vector3>();
    for (const bone of bones) {
        restLocal.set(bone.name, bone.quaternion.clone());
        restWorld.set(bone.name, bone.getWorldQuaternion(new Quaternion()));
        restHead.set(bone.name, bone.getWorldPosition(new Vector3()));
    }
    return { scene, bones, byName, restLocal, restWorld, restHead };
}
