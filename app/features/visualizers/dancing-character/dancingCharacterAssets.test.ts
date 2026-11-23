import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DANCE_REQUIRED_BONES, DANCES } from './dancingCharacterConfig';
import { disposeDancingCharacterAssets, isAbortError, loadDancingCharacterAssets } from './dancingCharacterAssets';

const mocks = vi.hoisted(() => ({
    gltfParseAsync: vi.fn(),
    gltfConstructed: vi.fn(),
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
    GLTFLoader: class {
        constructor() {
            mocks.gltfConstructed();
        }
        parseAsync = mocks.gltfParseAsync;
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

const fetchMock = vi.fn();

// Each url downloads its own buffer; parsing that buffer yields the url's gltf, and an Error value fails the download
// (a rejected parse stands in for a corrupt file, see the HTTP specs for transfer failures).
function serve(files: Record<string, unknown>) {
    const buffers = new Map<ArrayBuffer, unknown>();
    fetchMock.mockImplementation((url: string) => {
        const buffer = new ArrayBuffer(1);
        buffers.set(buffer, files[url]);
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(buffer) });
    });
    mocks.gltfParseAsync.mockImplementation((buffer: ArrayBuffer) => {
        const file = buffers.get(buffer);
        return file instanceof Error ? Promise.reject(file) : Promise.resolve(file);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.gltfParseAsync.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    serve({ 'model.glb': makeModel(), 'dances.glb': makeDances() });
});

describe('loadDancingCharacterAssets', () => {
    it('returns the model', async () => {
        const gltf = makeModel();
        serve({ 'model.glb': gltf, 'dances.glb': makeDances() });

        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);

        expect(assets.model).toBe(gltf.scene);
        expect(fetchMock).toHaveBeenCalledWith('model.glb', expect.anything());
        expect(fetchMock).toHaveBeenCalledWith('dances.glb', expect.anything());
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
        serve({});
        mocks.gltfParseAsync.mockImplementation(() => Promise.resolve({ ...makeModel(), animations: [] }));

        await loadDancingCharacterAssets(new AbortController().signal);

        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('MakeHumanDancer'), expect.anything());
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('MakeHumanDances'), expect.anything());
    });

    it('rejects immediately and starts no load when already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const error = await loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);

        expect(isAbortError(error)).toBe(true);
        expect(mocks.gltfConstructed).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('disposes the model when aborted while loading', async () => {
        const controller = new AbortController();
        const gltf = makeModel();
        const model = deferred<ReturnType<typeof makeModel>>();
        serve({ 'model.glb': gltf, 'dances.glb': makeDances() });
        mocks.gltfParseAsync.mockImplementation((buffer: ArrayBuffer) => {
            void buffer;
            return mocks.gltfParseAsync.mock.calls.length === 1 ? model.promise : Promise.resolve(makeDances());
        });
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

describe('loadDancingCharacterAssets transfers', () => {
    it('passes the given signal and the url base to fetch and the parser', async () => {
        const controller = new AbortController();
        serve({ '/a/b/model.glb': makeModel(), 'dances.glb': makeDances() });
        await loadDancingCharacterAssets(controller.signal, { model: '/a/b/model.glb', dances: 'dances.glb' });

        expect(fetchMock).toHaveBeenCalledWith('/a/b/model.glb', { signal: controller.signal });
        expect(fetchMock).toHaveBeenCalledWith('dances.glb', { signal: controller.signal });
        expect(mocks.gltfParseAsync).toHaveBeenCalledWith(expect.any(ArrayBuffer), '/a/b/');
        expect(mocks.gltfParseAsync).toHaveBeenCalledWith(expect.any(ArrayBuffer), './');
    });

    it('rejects with an AbortError when the abort cancels the fetch', async () => {
        const controller = new AbortController();
        fetchMock.mockImplementation(
            (_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
                }),
        );

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();

        expect(isAbortError(await caught)).toBe(true);
        expect(mocks.gltfParseAsync).not.toHaveBeenCalled();
    });

    it('disposes both parsed scenes when aborted after they parsed', async () => {
        const controller = new AbortController();
        const gltf = makeModel();
        const geometryDispose = vi.spyOn(gltf.geometry, 'dispose');
        const dances = makeDances();
        const traverse = vi.spyOn(dances.scene, 'traverse');
        serve({ 'model.glb': gltf, 'dances.glb': dances });

        const caught = loadDancingCharacterAssets(controller.signal, URLS).catch((e: unknown) => e);
        controller.abort();

        expect(isAbortError(await caught)).toBe(true);
        expect(geometryDispose).toHaveBeenCalled();
        expect(traverse).toHaveBeenCalled();
    });

    it('fails with the status and url when the model response is not ok', async () => {
        serve({ 'dances.glb': makeDances() });
        fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404 }));

        const error = await loadDancingCharacterAssets(new AbortController().signal, URLS).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('404');
        expect((error as Error).message).toContain('model.glb');
    });

    it('resolves the model with no dances when the dances response is not ok', async () => {
        const gltf = makeModel();
        serve({ 'model.glb': gltf });
        fetchMock.mockImplementation((url: string) =>
            url === 'dances.glb'
                ? Promise.resolve({ ok: false, status: 500 })
                : Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }),
        );
        mocks.gltfParseAsync.mockResolvedValue(gltf);

        const assets = await loadDancingCharacterAssets(new AbortController().signal, URLS);

        expect(assets.model).toBe(gltf.scene);
        expect(assets.dances.size).toBe(0);
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
