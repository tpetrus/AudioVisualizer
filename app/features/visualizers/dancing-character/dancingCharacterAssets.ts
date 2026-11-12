import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from '~/lib/three/disposeScene';
import { DANCE_REQUIRED_BONES, DANCES, NATIVE_BPM, type DanceId } from './dancingCharacterConfig';
import { CHARACTER_REGISTRY } from './characterRegistry';

export interface DancingCharacterAssets {
    model: THREE.Group;
    // The dances that loaded and passed validation, by id. Empty when none did; the scene then keeps the rest pose.
    dances: ReadonlyMap<DanceId, THREE.AnimationClip>;
}

// How far a clip's length may be from beats * (60 / NATIVE_BPM) seconds before the clip is not trusted to stay on the
// bar clock.
const DURATION_TOLERANCE_SECONDS = 1e-3;

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

// The clips of the dances file that can be used. A clip that is unknown, has the wrong length or does not drive every
// required bone is left out rather than thrown: the dancer then has fewer dances, or none, but still renders.
export function pickDances(animations: readonly THREE.AnimationClip[]): Map<DanceId, THREE.AnimationClip> {
    const dances = new Map<DanceId, THREE.AnimationClip>();
    for (const dance of DANCES) {
        const clip = animations.find((candidate) => candidate.name === dance.id);
        if (!clip) continue;
        const expected = (dance.beats * 60) / NATIVE_BPM;
        if (Math.abs(clip.duration - expected) > DURATION_TOLERANCE_SECONDS) continue;
        const driven = new Set(clip.tracks.map((track) => track.name));
        if (!DANCE_REQUIRED_BONES.every((bone) => driven.has(`${bone}.quaternion`))) continue;
        dances.set(dance.id, clip);
    }
    return dances;
}

// Loads the dancer and its dances in parallel. The dances are optional: if that file fails, the model still resolves
// with an empty map. On abort whatever did load is disposed here, because the caller never receives it and would
// otherwise leak the GPU-bound objects.
export async function loadDancingCharacterAssets(
    signal: AbortSignal,
    urls: { model: string; dances: string } = CHARACTER_REGISTRY[0].urls,
): Promise<DancingCharacterAssets> {
    if (signal.aborted) throw createAbortError();

    const loader = new GLTFLoader();
    const [model, dances] = await Promise.allSettled([loader.loadAsync(urls.model), loader.loadAsync(urls.dances)]);

    if (signal.aborted) {
        if (model.status === 'fulfilled') disposeModel(model.value.scene);
        if (dances.status === 'fulfilled') disposeModel(dances.value.scene);
        throw createAbortError();
    }
    if (model.status === 'rejected') {
        if (dances.status === 'fulfilled') disposeModel(dances.value.scene);
        throw model.reason;
    }

    // The dances file holds animation only; its scene (bones, if any) is not used, so free it.
    if (dances.status === 'fulfilled') disposeModel(dances.value.scene);
    return {
        model: model.value.scene,
        dances: dances.status === 'fulfilled' ? pickDances(dances.value.animations) : new Map(),
    };
}
