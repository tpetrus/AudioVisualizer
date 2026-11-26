import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { ClubSet } from '../dancingCharacterClub';
import { CLUB_BACKGROUND, CLUB_FLOOR_HALF } from '../dancingCharacterConfig';
import { createEnhancedLook, type EnhancedStatus } from './dancingCharacterEnhanced';
import {
    ENHANCED_CATCHER_LIFT,
    ENHANCED_CATCHER_OPACITY,
    ENHANCED_FRAME_REPEAT_U,
    ENHANCED_GLASS_LIFT,
    ENHANCED_GLASS_MIN_RESOLUTION,
    ENHANCED_GLASS_RESOLUTION_FACTOR,
    ENHANCED_HDR_ENVIRONMENT_INTENSITY,
    ENHANCED_MAX_ANISOTROPY,
    ENHANCED_ROOM_ENVIRONMENT_INTENSITY,
    ENHANCED_SHADOW_MAP_SIZE,
} from './dancingCharacterEnhancedConfig';
import { ENHANCED_ASSET_URLS } from './enhancedAssetUrls';

// The PMREM generator needs a GPU; this stand-in hands out render targets whose textures are plain disposable stubs.
const pmremState = vi.hoisted(() => ({ instances: [] as unknown[] }));
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof import('three')>();
    class FakePmrem {
        readonly targets: { texture: THREE.Texture; dispose: ReturnType<typeof vi.fn> }[] = [];
        readonly fromScene = vi.fn(() => this.makeTarget());
        readonly fromEquirectangular = vi.fn((_source: unknown) => this.makeTarget());
        readonly dispose = vi.fn();
        constructor() {
            pmremState.instances.push(this);
        }
        makeTarget() {
            const target = { texture: new actual.Texture(), dispose: vi.fn() };
            this.targets.push(target);
            return target;
        }
    }
    return { ...actual, PMREMGenerator: FakePmrem };
});

// The HDR parser is the one real piece of work done on the main thread; the spec only cares that its result is used.
const parse = vi.hoisted(() => vi.fn());
vi.mock('three/addons/loaders/HDRLoader.js', () => ({
    HDRLoader: class {
        parse = parse;
    },
}));

interface FakePmremShape {
    targets: { texture: THREE.Texture; dispose: ReturnType<typeof vi.fn> }[];
    fromScene: ReturnType<typeof vi.fn>;
    fromEquirectangular: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
}
const generators = () => pmremState.instances as FakePmremShape[];

interface Deferred {
    promise: Promise<Response>;
    resolve: (response?: Response) => void;
    reject: (error: unknown) => void;
}

function okResponse(): Response {
    return {
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(['x'])),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as unknown as Response;
}

// Each url's fetch can be held and settled by hand; the rest resolve at once.
function stubFetch(held: string[] = []) {
    const deferreds = new Map<string, Deferred>();
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
        if (!held.includes(url)) return Promise.resolve(okResponse());
        let resolve!: (response?: Response) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<Response>((res, rej) => {
            resolve = (response) => res(response ?? okResponse());
            reject = rej;
        });
        const deferred = { promise, resolve, reject };
        deferreds.set(url, deferred);
        return promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, deferreds };
}

const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];

function makeRenderer(maxAnisotropy = 16) {
    return {
        toneMapping: THREE.NoToneMapping,
        toneMappingExposure: 0,
        outputColorSpace: THREE.LinearSRGBColorSpace,
        shadowMap: { enabled: false, type: THREE.BasicShadowMap },
        capabilities: { getMaxAnisotropy: () => maxAnisotropy },
        getDrawingBufferSize: (target: THREE.Vector2) => target.set(1000, 800),
    } as unknown as THREE.WebGLRenderer;
}

function setup(held: string[] = []) {
    const { fetchMock, deferreds } = stubFetch(held);
    const renderer = makeRenderer();
    const scene = new THREE.Scene();
    const club = new ClubSet(scene);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2);
    keyLight.position.set(3, 6, 4);
    scene.add(keyLight);
    const controller = new AbortController();
    const statuses: EnhancedStatus[] = [];
    const look = createEnhancedLook({
        renderer,
        scene,
        club,
        keyLight,
        signal: controller.signal,
        onStatus: (status) => statuses.push(status),
    });
    return { fetchMock, deferreds, renderer, scene, club, keyLight, controller, statuses, look };
}

// Lets every pending promise chain run.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeModel(
    x: number,
    size: number,
    material: THREE.Material | THREE.Material[] = new THREE.MeshStandardMaterial(),
) {
    const model = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
    mesh.position.set(x, size / 2, 0);
    model.add(mesh);
    return { model, mesh };
}

beforeEach(() => {
    pmremState.instances = [];
    bitmaps.length = 0;
    parse.mockReturnValue({ width: 2, height: 1, data: new Uint16Array(8), type: THREE.HalfFloatType });
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(() => {
            const bitmap = { close: vi.fn() };
            bitmaps.push(bitmap);
            return Promise.resolve(bitmap);
        }),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('apply', () => {
    it('sets tone mapping, color space and shadows on the renderer and the key light', () => {
        const { renderer, keyLight, look } = setup();
        look.apply();
        expect(renderer.toneMapping).toBe(THREE.AgXToneMapping);
        expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
        expect(renderer.shadowMap.enabled).toBe(true);
        expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
        expect(keyLight.castShadow).toBe(true);
        expect(keyLight.shadow.mapSize.x).toBe(ENHANCED_SHADOW_MAP_SIZE);
        look.dispose();
    });

    it('stops tone mapping the tiles, seams and cones and leaves the frame alone', () => {
        const { club, look } = setup();
        look.apply();
        const { tile, seam, cones, frame } = club.materials;
        expect(cones.length).toBeGreaterThan(0);
        for (const material of [tile, seam, ...cones]) expect(material.toneMapped).toBe(false);
        expect(frame.toneMapped).toBe(true);
        look.dispose();
    });

    it('adds the shadow catcher, the half-resolution glass and the fog-free dome', () => {
        const { scene, club, look } = setup();
        club.setFloorY(-1);
        look.apply();

        const catcher = scene.children.find(
            (child) => child instanceof THREE.Mesh && child.material instanceof THREE.ShadowMaterial,
        ) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
        expect(catcher.receiveShadow).toBe(true);
        expect(catcher.material.opacity).toBe(ENHANCED_CATCHER_OPACITY);
        expect(catcher.material.depthWrite).toBe(false);
        expect(catcher.position.y).toBeCloseTo(club.floorSurfaceY + ENHANCED_CATCHER_LIFT);
        expect(catcher.position.y).toBeGreaterThan(club.floorSurfaceY);

        const reflector = scene.children.find((child) => child instanceof Reflector) as Reflector;
        const glass = reflector.material as THREE.ShaderMaterial;
        expect(reflector.position.y).toBeCloseTo(club.floorSurfaceY + ENHANCED_GLASS_LIFT);
        expect(reflector.position.y).toBeGreaterThan(catcher.position.y);
        expect(glass.transparent).toBe(true);
        expect(glass.depthWrite).toBe(false);
        expect(glass.uniforms.opacity.value).toBeLessThan(0.5);
        const target = reflector.getRenderTarget();
        expect(target.width).toBe(Math.round(1000 * ENHANCED_GLASS_RESOLUTION_FACTOR));
        expect(target.height).toBe(Math.round(800 * ENHANCED_GLASS_RESOLUTION_FACTOR));
        expect((catcher.geometry.parameters.width as number) / 2).toBe(CLUB_FLOOR_HALF);

        const dome = scene.children.find(
            (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry,
        ) as THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
        expect(dome.material.fog).toBe(false);
        expect(dome.material.depthWrite).toBe(false);
        expect(dome.material.side).toBe(THREE.BackSide);
        expect(dome.renderOrder).toBeLessThan(0);
        // Plain fog color until the sky loads.
        expect(dome.material.uniforms.skyMix.value).toBe(0);
        expect((dome.material.uniforms.fogColor.value as THREE.Color).getHex()).toBe(
            new THREE.Color(CLUB_BACKGROUND).getHex(),
        );
        look.dispose();
    });

    it('lights the scene with the room environment at once, at a low intensity', () => {
        const { scene, look } = setup(Object.values(ENHANCED_ASSET_URLS.frame));
        look.apply();
        const [generator] = generators();
        expect(generator.fromScene).toHaveBeenCalledTimes(1);
        expect(scene.environment).toBe(generator.targets[0].texture);
        expect(scene.environmentIntensity).toBe(ENHANCED_ROOM_ENVIRONMENT_INTENSITY);
        expect(scene.environmentIntensity).toBeLessThan(1);
        look.dispose();
    });

    it('ignores a second apply', () => {
        const { fetchMock, look } = setup();
        look.apply();
        look.apply();
        expect(fetchMock).toHaveBeenCalledTimes(5);
        look.dispose();
    });

    it('does nothing after dispose', () => {
        const { fetchMock, renderer, look } = setup();
        look.dispose();
        look.apply();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    });
});

describe('asset loading', () => {
    it('reports loading, then ready once every asset has swapped in', async () => {
        const { scene, club, statuses, fetchMock, look } = setup();
        look.apply();
        expect(statuses).toEqual(['loading']);
        await flush();
        expect(statuses).toEqual(['loading', 'ready']);

        // Every asset is fetched with the abort signal.
        const urls = fetchMock.mock.calls.map(([url]) => url);
        expect(urls).toEqual(
            expect.arrayContaining([
                ENHANCED_ASSET_URLS.environmentHdr,
                ENHANCED_ASSET_URLS.skyTexture,
                ENHANCED_ASSET_URLS.frame.map,
                ENHANCED_ASSET_URLS.frame.normalMap,
                ENHANCED_ASSET_URLS.frame.roughnessMap,
            ]),
        );
        for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);

        // The HDR environment replaced the room's, which was freed.
        const [generator] = generators();
        expect(generator.fromEquirectangular).toHaveBeenCalledTimes(1);
        expect(scene.environment).toBe(generator.targets[1].texture);
        expect(scene.environmentIntensity).toBe(ENHANCED_HDR_ENVIRONMENT_INTENSITY);
        expect(generator.targets[0].dispose).toHaveBeenCalledTimes(1);

        // The sky is on the dome and the concrete is on the frame.
        const dome = scene.children.find(
            (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry,
        ) as THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
        const sky = dome.material.uniforms.skyMap.value as THREE.Texture;
        expect(sky.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(dome.material.uniforms.skyMix.value).toBe(1);
        const { frame } = club.materials;
        expect(frame.map?.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(frame.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
        expect(frame.roughnessMap).not.toBeNull();
        expect(frame.map?.repeat.x).toBe(ENHANCED_FRAME_REPEAT_U);
        expect(frame.map?.anisotropy).toBe(ENHANCED_MAX_ANISOTROPY);
        look.dispose();
    });

    it('caps anisotropy by what the GPU supports', async () => {
        const { club, renderer, look } = setup();
        (renderer.capabilities as { getMaxAnisotropy: () => number }).getMaxAnisotropy = () => 2;
        look.apply();
        await flush();
        expect(club.materials.frame.map?.anisotropy).toBe(2);
        look.dispose();
    });

    it('warns once and reports an error when assets fail, keeping the rest', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deferreds, club, statuses, scene, look } = setup([
            ENHANCED_ASSET_URLS.environmentHdr,
            ENHANCED_ASSET_URLS.skyTexture,
        ]);
        look.apply();
        deferreds.get(ENHANCED_ASSET_URLS.environmentHdr)?.reject(new Error('network down'));
        deferreds.get(ENHANCED_ASSET_URLS.skyTexture)?.resolve({ ok: false, status: 404 } as Response);
        await flush();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(statuses).toEqual(['loading', 'error']);
        // The assets that did load stay, and the room environment stays.
        expect(club.materials.frame.map).not.toBeNull();
        expect(scene.environmentIntensity).toBe(ENHANCED_ROOM_ENVIRONMENT_INTENSITY);
        look.dispose();
    });

    it('does not warn or report an error when aborted mid-load', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deferreds, controller, statuses, look } = setup([
            ENHANCED_ASSET_URLS.environmentHdr,
            ENHANCED_ASSET_URLS.skyTexture,
        ]);
        look.apply();
        controller.abort();
        const abort = new DOMException('aborted', 'AbortError');
        deferreds.get(ENHANCED_ASSET_URLS.environmentHdr)?.reject(abort);
        deferreds.get(ENHANCED_ASSET_URLS.skyTexture)?.reject(abort);
        await flush();
        look.dispose();
        expect(warn).not.toHaveBeenCalled();
        expect(statuses).toEqual(['loading']);
    });

    it('treats a bare AbortError as an abort even before the signal fires', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { deferreds, statuses, look } = setup([ENHANCED_ASSET_URLS.skyTexture]);
        look.apply();
        deferreds.get(ENHANCED_ASSET_URLS.skyTexture)?.reject(new DOMException('aborted', 'AbortError'));
        await flush();
        expect(warn).not.toHaveBeenCalled();
        expect(statuses).not.toContain('error');
        look.dispose();
    });

    it('disposes the HDR and textures that resolve after the signal aborted', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
        const held = [
            ENHANCED_ASSET_URLS.environmentHdr,
            ENHANCED_ASSET_URLS.skyTexture,
            ENHANCED_ASSET_URLS.frame.map,
        ];
        const { deferreds, controller, scene, statuses, look } = setup(held);
        look.apply();
        await flush();
        controller.abort();
        look.dispose();
        dispose.mockClear();

        for (const url of held) deferreds.get(url)?.resolve();
        await flush();

        // Three late results: the HDR source, the sky and the frame map. The generator was already disposed and is
        // never asked for the late environment; the decoded bitmaps are released.
        expect(dispose).toHaveBeenCalledTimes(3);
        expect(generators()[0].fromEquirectangular).not.toHaveBeenCalled();
        expect(bitmaps.filter((bitmap) => bitmap.close.mock.calls.length > 0)).toHaveLength(2);
        expect(scene.environment).toBeNull();
        expect(warn).not.toHaveBeenCalled();
        expect(statuses).toEqual(['loading']);
    });
});

describe('onModelChanged', () => {
    it('casts shadows, sets environment and anisotropy and fits the shadow camera for two successive models', () => {
        const { club, keyLight, look } = setup();
        look.apply();
        club.setFloorY(-1);

        const map = new THREE.Texture();
        const standard = new THREE.MeshStandardMaterial({ map });
        const basic = new THREE.MeshBasicMaterial();
        const first = makeModel(0, 2, [standard, basic]);
        look.onModelChanged(first.model);
        expect(first.mesh.castShadow).toBe(true);
        expect(standard.envMapIntensity).toBe(1);
        expect(map.anisotropy).toBe(ENHANCED_MAX_ANISOTROPY);

        const camera = keyLight.shadow.camera;
        const firstExtent = camera.right - camera.left;
        const firstFar = camera.far;
        expect(firstExtent).toBeGreaterThan(2);
        expect(camera.near).toBeGreaterThan(0);
        // Every corner of the model lands inside the shadow camera's box.
        const point = new THREE.Vector3();
        const inside = (model: THREE.Group) => {
            const box = new THREE.Box3().setFromObject(model);
            for (const x of [box.min.x, box.max.x])
                for (const y of [box.min.y, box.max.y])
                    for (const z of [box.min.z, box.max.z]) {
                        point.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
                        expect(point.x).toBeGreaterThanOrEqual(camera.left);
                        expect(point.x).toBeLessThanOrEqual(camera.right);
                        expect(point.y).toBeGreaterThanOrEqual(camera.bottom);
                        expect(point.y).toBeLessThanOrEqual(camera.top);
                        expect(-point.z).toBeGreaterThanOrEqual(camera.near);
                        expect(-point.z).toBeLessThanOrEqual(camera.far);
                    }
        };
        inside(first.model);

        const second = makeModel(1.5, 4, standard);
        look.onModelChanged(second.model);
        expect(second.mesh.castShadow).toBe(true);
        expect(camera.right - camera.left).toBeGreaterThan(firstExtent);
        expect(camera.far).not.toBe(firstFar);
        inside(second.model);
        look.dispose();
    });

    it('moves the floor layers with the dancer and skips models without geometry', () => {
        const { club, scene, keyLight, look } = setup();
        look.apply();
        const before = keyLight.shadow.camera.right;
        club.setFloorY(-0.8);
        look.onModelChanged(new THREE.Group());
        const reflector = scene.children.find((child) => child instanceof Reflector) as Reflector;
        expect(reflector.position.y).toBeCloseTo(club.floorSurfaceY + ENHANCED_GLASS_LIFT);
        expect(keyLight.shadow.camera.right).toBe(before);
        look.dispose();
    });

    it('works before apply and after dispose without touching anything', () => {
        const { look, keyLight } = setup();
        const early = makeModel(0, 1);
        look.onModelChanged(early.model);
        expect(early.mesh.castShadow).toBe(true);
        const fitted = keyLight.shadow.camera.right;
        look.dispose();
        const late = makeModel(0, 6);
        look.onModelChanged(late.model);
        expect(late.mesh.castShadow).toBe(false);
        expect(keyLight.shadow.camera.right).toBe(fitted);
    });
});

describe('dispose', () => {
    it('frees everything it created and is idempotent', async () => {
        const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
        const { scene, club, look } = setup();
        const before = scene.children.length;
        look.apply();
        await flush();
        expect(scene.children.length).toBe(before + 3);

        const catcher = scene.children.find(
            (child) => child instanceof THREE.Mesh && child.material instanceof THREE.ShadowMaterial,
        ) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
        const reflector = scene.children.find((child) => child instanceof Reflector) as Reflector;
        const dome = scene.children.find(
            (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry,
        ) as THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
        const frame = club.materials.frame;
        const loaded = [
            frame.map,
            frame.normalMap,
            frame.roughnessMap,
            dome.material.uniforms.skyMap.value as THREE.Texture,
        ];
        const spies = [
            vi.spyOn(catcher.material, 'dispose'),
            vi.spyOn(catcher.geometry, 'dispose'),
            vi.spyOn(reflector, 'dispose'),
            vi.spyOn(dome.geometry, 'dispose'),
            vi.spyOn(dome.material, 'dispose'),
        ];
        const [generator] = generators();
        textureDispose.mockClear();

        look.dispose();
        look.dispose();

        for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
        expect(scene.children.length).toBe(before);
        // The four loaded textures were freed, and the frame no longer points at them.
        expect(textureDispose).toHaveBeenCalledTimes(4);
        for (const texture of loaded) expect(texture).toBeTruthy();
        expect(frame.map).toBeNull();
        expect(frame.normalMap).toBeNull();
        expect(frame.roughnessMap).toBeNull();
        // The HDR target is freed and the scene's environment released; the room target went when the HDR swapped in.
        expect(generator.targets[1].dispose).toHaveBeenCalledTimes(1);
        expect(scene.environment).toBeNull();
        expect(generator.dispose).toHaveBeenCalledTimes(1);
    });

    it('frees the room environment when the HDR never arrived', () => {
        const { scene, look } = setup(['never']);
        look.apply();
        const [generator] = generators();
        look.dispose();
        expect(generator.targets[0].dispose).toHaveBeenCalledTimes(1);
        expect(scene.environment).toBeNull();
    });

    it('leaves an environment it does not own alone', () => {
        const { scene, look } = setup();
        look.apply();
        const other = new THREE.Texture();
        scene.environment = other;
        look.dispose();
        expect(scene.environment).toBe(other);
    });

    it('does nothing when nothing was applied', () => {
        const { scene, look } = setup();
        const before = scene.children.length;
        look.dispose();
        expect(scene.children.length).toBe(before);
    });
});

describe('small canvases', () => {
    it('keeps the glass target at a usable size', () => {
        const { renderer, scene, look } = setup();
        (renderer as unknown as { getDrawingBufferSize: (v: THREE.Vector2) => THREE.Vector2 }).getDrawingBufferSize = (
            v,
        ) => v.set(10, 10);
        look.apply();
        const reflector = scene.children.find((child) => child instanceof Reflector) as Reflector;
        expect(reflector.getRenderTarget().width).toBe(ENHANCED_GLASS_MIN_RESOLUTION);
        look.dispose();
    });
});

describe('resize', () => {
    it('resizes the glass target with the drawing buffer', () => {
        const { renderer, scene, look } = setup();
        look.resize(); // before apply there is no glass yet
        look.apply();
        (renderer as unknown as { getDrawingBufferSize: (v: THREE.Vector2) => THREE.Vector2 }).getDrawingBufferSize = (
            v,
        ) => v.set(2000, 1200);
        look.resize();
        const target = (scene.children.find((child) => child instanceof Reflector) as Reflector).getRenderTarget();
        expect(target.width).toBe(Math.round(2000 * ENHANCED_GLASS_RESOLUTION_FACTOR));
        expect(target.height).toBe(Math.round(1200 * ENHANCED_GLASS_RESOLUTION_FACTOR));
        look.dispose();
        look.resize(); // after dispose it is a no-op
    });
});
