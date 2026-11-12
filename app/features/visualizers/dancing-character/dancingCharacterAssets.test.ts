import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DANCE_REQUIRED_BONES, DANCES } from './dancingCharacterConfig';
import { disposeDancingCharacterAssets, isAbortError, loadDancingCharacterAssets } from './dancingCharacterAssets';

const mocks = vi.hoisted(() => ({
    gltfLoadAsync: vi.fn(),
    gltfConstructed: vi.fn(),
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
    GLTFLoader: class {
        constructor() {
            mocks.gltfConstructed();
        }
        loadAsync = mocks.gltfLoadAsync;
    },
}));

const URLS = { model: 'model.glb', dances: 'dances.glb' };

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function makeModel() {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    return { scene, geometry, material };
}

// A clip of the given length that drives the given bones (default: all the required ones).
function clipFor(id: string, beats: number, bones: readonly string[] = DANCE_REQUIRED_BONES): THREE.AnimationClip {
    const tracks = bones.map(
        (bone) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, [0, beats * 0.5], [0, 0, 0, 1, 0, 0, 0, 1]),
    );
    return new THREE.AnimationClip(id, -1, tracks);
}

// A dances file; by default every registered dance, correct length, every required bone.
function makeDances(clips: THREE.AnimationClip[] = DANCES.map((d) => clipFor(d.id, d.beats))) {
    return { scene: new THREE.Group(), animations: clips };
}

// Answers each url with its own gltf; a url mapped to an Error rejects.
function serve(files: Record<string, unknown>) {
    mocks.gltfLoadAsync.mockImplementation((url: string) => {
        const file = files[url];
        return file instanceof Error ? Promise.reject(file) : Promise.resolve(file);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.gltfLoadAsync.mockReset();
    serve({ 'model.glb': makeModel(), 'dances.glb': makeDances() });
});

describe('loadDancingCharacterAssets', () => {
    it('returns the model', async () => {
        const gltf = makeModel();
        serve({ 'model.glb': gltf, 'dances.glb': makeDances() });

        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);

        expect(assets.model).toBe(gltf.scene);
        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith('model.glb');
        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith('dances.glb');
    });

    it('returns every valid dance by id', async () => {
        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);
        expect([...assets.dances.keys()]).toEqual(DANCES.map((d) => d.id));
        expect(assets.dances.get('lambada')?.name).toBe('lambada');
    });

    it('omits a clip that is missing, unknown, the wrong length or lacks a required bone', async () => {
        serve({
            'model.glb': makeModel(),
            'dances.glb': makeDances([
                // lambada is missing; twist is 4 beats long instead of 8; cabbage-patch lacks the head;
                // salsa is right; "mystery" is no dance.
                clipFor('twist', 4),
                clipFor(
                    'cabbage-patch',
                    4,
                    DANCE_REQUIRED_BONES.filter((bone) => bone !== 'head'),
                ),
                clipFor('salsa', 4),
                clipFor('mystery', 4),
            ]),
        });
        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);
        expect([...assets.dances.keys()]).toEqual(['salsa']);
    });

    it('accepts a clip within a millisecond of its length and rejects one further off', async () => {
        const close = clipFor('salsa', 4);
        close.duration = 2.0005;
        serve({ 'model.glb': makeModel(), 'dances.glb': makeDances([close]) });
        const accepted = await loadDancingCharacterAssets(new AbortController().signal, URLS);
        expect([...accepted.dances.keys()]).toEqual(['salsa']);
        close.duration = 2.002;
        const rejected = await loadDancingCharacterAssets(new AbortController().signal, URLS);
        expect(rejected.dances.size).toBe(0);
    });

    it('still resolves the model with an empty map when the dances file fails', async () => {
        const gltf = makeModel();
        serve({ 'model.glb': gltf, 'dances.glb': new Error('no dances') });
        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);
        expect(assets.model).toBe(gltf.scene);
        expect(assets.dances.size).toBe(0);
    });

    it('uses the bundled asset url by default', async () => {
        mocks.gltfLoadAsync.mockImplementation((url: string) =>
            Promise.resolve(url.includes('Dances') ? makeDances() : makeModel()),
        );

        await loadDancingCharacterAssets(new AbortController().signal);

        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith(expect.stringContaining('MakeHumanDancer'));
        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith(expect.stringContaining('MakeHumanDances'));
    });

    it('rejects immediately and starts no load when already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const error = await loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);

        expect(isAbortError(error)).toBe(true);
        expect(mocks.gltfConstructed).not.toHaveBeenCalled();
        expect(mocks.gltfLoadAsync).not.toHaveBeenCalled();
    });

    it('disposes the model when aborted while loading', async () => {
        const controller = new AbortController();
        const gltf = makeModel();
        const model = deferred<ReturnType<typeof makeModel>>();
        mocks.gltfLoadAsync.mockImplementation((url: string) =>
            url === 'model.glb' ? model.promise : Promise.resolve(makeDances()),
        );
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const materialDispose = vi.spyOn(gltf.material, 'dispose');

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();
        model.resolve(gltf);

        expect(isAbortError(await caught)).toBe(true);
        expect(geometryDispose).toHaveBeenCalled();
        expect(materialDispose).toHaveBeenCalled();
    });

    it('disposes the dances file too when aborted, even if the model failed', async () => {
        const controller = new AbortController();
        const dances = makeDances();
        const traverse = vi.spyOn(dances.scene, 'traverse');
        serve({ 'model.glb': new Error('bad glb'), 'dances.glb': dances });
        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();
        expect(isAbortError(await caught)).toBe(true);
        expect(traverse).toHaveBeenCalled();
    });

    it('frees the dances file when the model fails', async () => {
        const dances = makeDances();
        const traverse = vi.spyOn(dances.scene, 'traverse');
        serve({ 'model.glb': new Error('bad glb'), 'dances.glb': dances });
        await expect(loadDancingCharacterAssets(new AbortController().signal, URLS)).rejects.toThrow('bad glb');
        expect(traverse).toHaveBeenCalled();
    });

    it('disposes the model when aborted and the dances file failed too', async () => {
        const controller = new AbortController();
        const gltf = makeModel();
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        serve({ 'model.glb': gltf, 'dances.glb': new Error('no dances') });
        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();
        expect(isAbortError(await caught)).toBe(true);
        expect(geometryDispose).toHaveBeenCalled();
    });

    it('rejects with the model error even when both files fail', async () => {
        const failure = new Error('bad glb');
        serve({ 'model.glb': failure, 'dances.glb': new Error('no dances') });
        await expect(loadDancingCharacterAssets(new AbortController().signal, URLS)).rejects.toBe(failure);
    });

    it('rejects with the model error', async () => {
        const failure = new Error('bad glb');
        serve({ 'model.glb': failure, 'dances.glb': makeDances() });

        await expect(loadDancingCharacterAssets(new AbortController().signal, URLS)).rejects.toBe(failure);
    });
});

describe('isAbortError', () => {
    it('recognizes a DOMException named AbortError', () => {
        expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    });

    it('recognizes an Error named AbortError', () => {
        const error = new Error('x');
        error.name = 'AbortError';
        expect(isAbortError(error)).toBe(true);
    });

    it('rejects other errors and non-errors', () => {
        expect(isAbortError(new Error('x'))).toBe(false);
        expect(isAbortError(new DOMException('x', 'NetworkError'))).toBe(false);
        expect(isAbortError({ name: 'AbortError' })).toBe(false);
        expect(isAbortError('AbortError')).toBe(false);
        expect(isAbortError(null)).toBe(false);
        expect(isAbortError(undefined)).toBe(false);
    });
});

describe('disposeDancingCharacterAssets', () => {
    it('disposes the model geometry and material', () => {
        const gltf = makeModel();
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const materialDispose = vi.spyOn(gltf.material, 'dispose');

        disposeDancingCharacterAssets({ model: gltf.scene, dances: new Map() });

        expect(geometryDispose).toHaveBeenCalledTimes(1);
        expect(materialDispose).toHaveBeenCalledTimes(1);
    });
});
