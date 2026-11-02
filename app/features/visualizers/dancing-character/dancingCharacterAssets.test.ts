import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
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

const URLS = { model: 'model.glb' };

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

beforeEach(() => {
    vi.clearAllMocks();
});

describe('loadDancingCharacterAssets', () => {
    it('returns the model', async () => {
        const gltf = makeModel();
        mocks.gltfLoadAsync.mockResolvedValue(gltf);

        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);

        expect(assets.model).toBe(gltf.scene);
        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith('model.glb');
    });

    it('uses the bundled asset url by default', async () => {
        mocks.gltfLoadAsync.mockResolvedValue(makeModel());

        await loadDancingCharacterAssets(new AbortController().signal);

        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith(expect.stringContaining('MakeHumanDancer'));
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
        mocks.gltfLoadAsync.mockReturnValue(model.promise);
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const materialDispose = vi.spyOn(gltf.material, 'dispose');

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();
        model.resolve(gltf);

        expect(isAbortError(await caught)).toBe(true);
        expect(geometryDispose).toHaveBeenCalled();
        expect(materialDispose).toHaveBeenCalled();
    });

    it('rejects with the model error', async () => {
        const failure = new Error('bad glb');
        mocks.gltfLoadAsync.mockRejectedValue(failure);

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

        disposeDancingCharacterAssets({ model: gltf.scene });

        expect(geometryDispose).toHaveBeenCalledTimes(1);
        expect(materialDispose).toHaveBeenCalledTimes(1);
    });
});
