import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from '~/lib/three/disposeScene';
import modelUrl from './assets/MakeHumanDancer.glb?url';

export interface DancingCharacterAssets {
    model: THREE.Group;
}

export function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError';
}

export function disposeDancingCharacterAssets(assets: DancingCharacterAssets): void {
    disposeModel(assets.model);
}

// disposeScene only traverses the tree and reads `environment`/`background` (absent on a Group, so skipped), but it is
// typed for a Scene; the cast avoids changing that shared helper for one caller.
function disposeModel(model: THREE.Group): void {
    disposeScene(model as unknown as THREE.Scene);
}

function createAbortError(): DOMException {
    return new DOMException('Loading was canceled', 'AbortError');
}

// Loads the dancer. On abort the model that did load is disposed here, because the caller never receives it and would
// otherwise leak the GPU-bound objects.
export async function loadDancingCharacterAssets(
    signal: AbortSignal,
    urls: { model: string } = { model: modelUrl },
): Promise<DancingCharacterAssets> {
    if (signal.aborted) throw createAbortError();

    const gltf = await new GLTFLoader().loadAsync(urls.model);

    if (signal.aborted) {
        disposeModel(gltf.scene);
        throw createAbortError();
    }

    return { model: gltf.scene };
}
