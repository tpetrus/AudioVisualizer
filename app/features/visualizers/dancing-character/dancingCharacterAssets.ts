import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from '~/lib/three/disposeScene';
import modelUrl from './assets/RobotExpressive.glb?url';
import skyboxUrl from './assets/kloofendal_48d_partly_cloudy_puresky_2k.jpg?url';

export interface DancingCharacterAssets {
    model: THREE.Group;
    clips: THREE.AnimationClip[];
    // null when the sky picture could not be loaded; the scene then uses a flat background color.
    skybox: THREE.Texture | null;
}

export function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError';
}

export function disposeDancingCharacterAssets(assets: DancingCharacterAssets): void {
    disposeModel(assets.model);
    assets.skybox?.dispose();
}

// disposeScene only traverses the tree and reads `environment`/`background` (absent on a Group, so skipped), but it is
// typed for a Scene; the cast avoids changing that shared helper for one caller.
function disposeModel(model: THREE.Group): void {
    disposeScene(model as unknown as THREE.Scene);
}

function createAbortError(): DOMException {
    return new DOMException('Loading was canceled', 'AbortError');
}

// Loads the robot and the sky in parallel. The sky is decoration, so its failure only yields `skybox: null`; the model
// is required, so its failure rejects. On abort or failure everything that did load is disposed here, because the
// caller never receives it and would otherwise leak the GPU-bound objects.
export async function loadDancingCharacterAssets(
    signal: AbortSignal,
    urls: { model: string; skybox: string } = { model: modelUrl, skybox: skyboxUrl },
): Promise<DancingCharacterAssets> {
    if (signal.aborted) throw createAbortError();

    // The sky promise never rejects (failure maps to null), so it cannot become an unhandled rejection while the
    // model is still being awaited or after an early exit.
    const skyboxPromise = new THREE.TextureLoader().loadAsync(urls.skybox).then(
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        },
        () => null,
    );
    const modelPromise = new GLTFLoader().loadAsync(urls.model);

    let gltf: Awaited<typeof modelPromise>;
    try {
        gltf = await modelPromise;
    } catch (error) {
        (await skyboxPromise)?.dispose();
        throw error;
    }

    if (signal.aborted) {
        disposeModel(gltf.scene);
        // Do not wait for the sky: free it whenever it settles.
        void skyboxPromise.then((texture) => texture?.dispose());
        throw createAbortError();
    }

    const skybox = await skyboxPromise;
    if (signal.aborted) {
        disposeModel(gltf.scene);
        skybox?.dispose();
        throw createAbortError();
    }

    return { model: gltf.scene, clips: gltf.animations, skybox };
}
