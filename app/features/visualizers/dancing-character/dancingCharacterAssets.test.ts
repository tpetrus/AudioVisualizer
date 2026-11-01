import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeDancingCharacterAssets, isAbortError, loadDancingCharacterAssets } from './dancingCharacterAssets';

const mocks = vi.hoisted(() => ({
    gltfLoadAsync: vi.fn(),
    textureLoadAsync: vi.fn(),
    gltfConstructed: vi.fn(),
    textureConstructed: vi.fn(),
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
    GLTFLoader: class {
        constructor() {
            mocks.gltfConstructed();
        }
        loadAsync = mocks.gltfLoadAsync;
    },
}));

vi.mock('three', async (importOriginal) => ({
    ...(await importOriginal<typeof import('three')>()),
    TextureLoader: class {
        constructor() {
            mocks.textureConstructed();
        }
        loadAsync = mocks.textureLoadAsync;
    },
}));

const URLS = { model: 'model.glb', skybox: 'sky.jpg' };

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
    return { scene, animations: [new THREE.AnimationClip('Dance', 1, [])], geometry, material };
}

// Lets the microtask queue drain so chained promise callbacks run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('loadDancingCharacterAssets', () => {
    it('returns the model, clips and a configured skybox', async () => {
        const gltf = makeModel();
        const texture = new THREE.Texture();
        mocks.gltfLoadAsync.mockResolvedValue(gltf);
        mocks.textureLoadAsync.mockResolvedValue(texture);

        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);

        expect(assets.model).toBe(gltf.scene);
        expect(assets.clips).toBe(gltf.animations);
        expect(assets.skybox).toBe(texture);
        expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
        expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith('model.glb');
        expect(mocks.textureLoadAsync).toHaveBeenCalledWith('sky.jpg');
    });

    it('uses the bundled asset urls by default', async () => {
        mocks.gltfLoadAsync.mockResolvedValue(makeModel());
        mocks.textureLoadAsync.mockResolvedValue(new THREE.Texture());

        await loadDancingCharacterAssets(new AbortController().signal);

        expect(mocks.gltfLoadAsync).toHaveBeenCalledWith(expect.stringContaining('RobotExpressive'));
        expect(mocks.textureLoadAsync).toHaveBeenCalledWith(expect.stringContaining('kloofendal'));
    });

    it('rejects immediately and starts no loads when already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const error = await loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);

        expect(isAbortError(error)).toBe(true);
        expect(mocks.gltfConstructed).not.toHaveBeenCalled();
        expect(mocks.textureConstructed).not.toHaveBeenCalled();
        expect(mocks.gltfLoadAsync).not.toHaveBeenCalled();
        expect(mocks.textureLoadAsync).not.toHaveBeenCalled();
    });

    it('disposes the model and the late skybox when aborted while loading', async () => {
        const controller = new AbortController();
        const gltf = makeModel();
        const model = deferred<ReturnType<typeof makeModel>>();
        const sky = deferred<THREE.Texture>();
        mocks.gltfLoadAsync.mockReturnValue(model.promise);
        mocks.textureLoadAsync.mockReturnValue(sky.promise);
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const materialDispose = vi.spyOn(gltf.material, 'dispose');
        const texture = new THREE.Texture();
        const textureDispose = vi.spyOn(texture, 'dispose');

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();
        model.resolve(gltf);

        expect(isAbortError(await caught)).toBe(true);
        expect(geometryDispose).toHaveBeenCalled();
        expect(materialDispose).toHaveBeenCalled();
        expect(textureDispose).not.toHaveBeenCalled();

        sky.resolve(texture);
        await flush();
        expect(textureDispose).toHaveBeenCalledTimes(1);
    });

    it('tolerates a skybox that fails after the call was aborted', async () => {
        const controller = new AbortController();
        const model = deferred<ReturnType<typeof makeModel>>();
        const sky = deferred<THREE.Texture>();
        mocks.gltfLoadAsync.mockReturnValue(model.promise);
        mocks.textureLoadAsync.mockReturnValue(sky.promise);

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();
        model.resolve(makeModel());
        expect(isAbortError(await caught)).toBe(true);

        sky.reject(new Error('late failure'));
        await flush();
    });

    it('disposes everything when aborted after the model resolved and before the sky returns', async () => {
        const controller = new AbortController();
        const gltf = makeModel();
        const texture = new THREE.Texture();
        const sky = deferred<THREE.Texture>();
        mocks.gltfLoadAsync.mockResolvedValue(gltf);
        mocks.textureLoadAsync.mockReturnValue(sky.promise);
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const textureDispose = vi.spyOn(texture, 'dispose');

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        // The model has resolved and the loader now waits for the sky; abort during that wait.
        await flush();
        controller.abort();
        sky.resolve(texture);

        expect(isAbortError(await caught)).toBe(true);
        expect(geometryDispose).toHaveBeenCalled();
        expect(textureDispose).toHaveBeenCalledTimes(1);
    });

    it('aborts cleanly when the sky failed while waiting', async () => {
        const controller = new AbortController();
        const sky = deferred<THREE.Texture>();
        mocks.gltfLoadAsync.mockResolvedValue(makeModel());
        mocks.textureLoadAsync.mockReturnValue(sky.promise);

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        await flush();
        controller.abort();
        sky.reject(new Error('no sky'));

        expect(isAbortError(await caught)).toBe(true);
    });

    it('returns a null skybox when the sky fails to load', async () => {
        const gltf = makeModel();
        mocks.gltfLoadAsync.mockResolvedValue(gltf);
        mocks.textureLoadAsync.mockRejectedValue(new Error('404'));

        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);

        expect(assets.skybox).toBeNull();
        expect(assets.model).toBe(gltf.scene);
    });

    it('rejects with the model error and disposes a skybox that loaded', async () => {
        const failure = new Error('bad glb');
        const texture = new THREE.Texture();
        const textureDispose = vi.spyOn(texture, 'dispose');
        mocks.gltfLoadAsync.mockRejectedValue(failure);
        mocks.textureLoadAsync.mockResolvedValue(texture);

        await expect(loadDancingCharacterAssets(new AbortController().signal, URLS)).rejects.toBe(failure);
        expect(textureDispose).toHaveBeenCalledTimes(1);
    });

    it('rejects with the model error when the skybox failed too', async () => {
        const failure = new Error('bad glb');
        mocks.gltfLoadAsync.mockRejectedValue(failure);
        mocks.textureLoadAsync.mockRejectedValue(new Error('404'));

        await expect(loadDancingCharacterAssets(new AbortController().signal, URLS)).rejects.toBe(failure);
    });

    it('disposes a skybox that settles after the model failed', async () => {
        const failure = new Error('bad glb');
        const texture = new THREE.Texture();
        const textureDispose = vi.spyOn(texture, 'dispose');
        const sky = deferred<THREE.Texture>();
        mocks.gltfLoadAsync.mockRejectedValue(failure);
        mocks.textureLoadAsync.mockReturnValue(sky.promise);

        const caught = loadDancingCharacterAssets(new AbortController().signal, URLS).catch((e: unknown) => e);
        await flush();
        expect(textureDispose).not.toHaveBeenCalled();
        sky.resolve(texture);

        expect(await caught).toBe(failure);
        expect(textureDispose).toHaveBeenCalledTimes(1);
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
    it('disposes geometry, material and the skybox', () => {
        const gltf = makeModel();
        const texture = new THREE.Texture();
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const materialDispose = vi.spyOn(gltf.material, 'dispose');
        const textureDispose = vi.spyOn(texture, 'dispose');

        disposeDancingCharacterAssets({ model: gltf.scene, clips: gltf.animations, skybox: texture });

        expect(geometryDispose).toHaveBeenCalledTimes(1);
        expect(materialDispose).toHaveBeenCalledTimes(1);
        expect(textureDispose).toHaveBeenCalledTimes(1);
    });

    it('tolerates a null skybox', () => {
        const gltf = makeModel();
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');

        expect(() => disposeDancingCharacterAssets({ model: gltf.scene, clips: [], skybox: null })).not.toThrow();
        expect(geometryDispose).toHaveBeenCalledTimes(1);
    });
});
