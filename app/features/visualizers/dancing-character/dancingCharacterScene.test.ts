import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRhythmState } from '~/features/rhythm/types';
import type { RhythmState } from '~/features/rhythm/types';
import { dancingCharacterControls, type DancingCharacterSettings } from './dancingCharacterControls';
import {
    BASS_SQUASH,
    CAMERA_ELEVATION,
    DANCE_CLIP_DURATION,
    FADE_IN_SECONDS,
    FALLBACK_BACKGROUND,
    MAX_ZOOM_KICK,
} from './dancingCharacterConfig';
import { DancingCharacterScene, type DancingCharacterFrame } from './dancingCharacterScene';

const DEFAULTS = Object.fromEntries(
    dancingCharacterControls.map((control) => [control.key, control.default]),
) as unknown as DancingCharacterSettings;

function settings(overrides: Partial<DancingCharacterSettings> = {}): DancingCharacterSettings {
    return { ...DEFAULTS, ...overrides };
}

function makeFrame(overrides: Partial<DancingCharacterFrame> = {}): DancingCharacterFrame {
    return {
        dt: 1 / 60,
        rhythm: createRhythmState(),
        bass: 0,
        settings: settings(),
        cameraLocked: true,
        ...overrides,
    };
}

function makeCamera(aspect = 16 / 9): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    camera.position.set(0, 0, 10);
    return camera;
}

// A rig with the robot's materials. The empty 'Phase' child's x position is a linear ramp over the clip, so the clip phase can be
// read back from the pose.
function makeModel(): { model: THREE.Group; clips: THREE.AnimationClip[]; materials: Record<string, THREE.Material> } {
    const model = new THREE.Group();
    const materials = {
        Main: new THREE.MeshStandardMaterial({ name: 'Main', color: '#808080' }),
        Grey: new THREE.MeshStandardMaterial({ name: 'Grey', color: '#404040' }),
        Black: new THREE.MeshStandardMaterial({ name: 'Black', color: '#101010' }),
    };
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), materials.Main);
    body.position.y = 2;
    const parts = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.5), [materials.Grey, materials.Black]);
    const phase = new THREE.Group();
    phase.name = 'Phase';
    parts.position.y = 1;
    model.add(body, parts, phase);
    const dance = new THREE.AnimationClip('Dance', DANCE_CLIP_DURATION, [
        new THREE.NumberKeyframeTrack('Phase.position[x]', [0, DANCE_CLIP_DURATION], [0, 1]),
    ]);
    const idle = new THREE.AnimationClip('Idle', 1, [
        new THREE.NumberKeyframeTrack('Phase.position[z]', [0, 1], [0, 1]),
    ]);
    return { model, clips: [idle, dance], materials };
}

function clipPhase(model: THREE.Group): number {
    return model.getObjectByName('Phase')!.position.x;
}

function wrapSigned(delta: number): number {
    return delta - Math.round(delta);
}

function modelBox(model: THREE.Group): THREE.Box3 {
    model.updateMatrixWorld(true);
    // Precise, because a skinned mesh caches its bounding box and the default mode would miss the animated pose.
    return new THREE.Box3().setFromObject(model, true);
}

function expectBoxInView(box: THREE.Box3, camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const corner = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
                corner.set(x, y, z).project(camera);
                expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
                expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
                expect(corner.z).toBeLessThan(1);
            }
        }
    }
}

function distanceOf(camera: THREE.PerspectiveCamera): number {
    return camera.position.length();
}

function azimuthOf(camera: THREE.PerspectiveCamera): number {
    return Math.atan2(camera.position.x, camera.position.z);
}

function setup(overrides: Partial<DancingCharacterSettings> = {}, aspect = 16 / 9) {
    const scene = new THREE.Scene();
    const camera = makeCamera(aspect);
    const dancing = new DancingCharacterScene(scene, camera, settings(overrides));
    return { scene, camera, dancing };
}

function run(dancing: DancingCharacterScene, frames: number, frame: () => DancingCharacterFrame): void {
    for (let i = 0; i < frames; i++) dancing.update(frame());
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('constructor', () => {
    it('sets a flat background, adds lights, floor and ring and frames the nominal box', () => {
        const { scene, camera, dancing } = setup();
        expect((scene.background as THREE.Color).getHexString()).toBe(
            new THREE.Color(FALLBACK_BACKGROUND).getHexString(),
        );
        expect(scene.children.filter((child) => (child as THREE.Light).isLight)).toHaveLength(3);
        expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(2);
        expect(dancing.lookTarget.toArray()).toEqual([0, 0, 0]);

        // Written at azimuth 0, slightly above the look target, and looking at the origin.
        expect(camera.position.x).toBeCloseTo(0);
        expect(camera.position.y).toBeCloseTo(Math.sin(CAMERA_ELEVATION) * distanceOf(camera));
        expect(camera.position.z).toBeGreaterThan(0);
        const forward = camera.getWorldDirection(new THREE.Vector3());
        expect(forward.dot(camera.position.clone().normalize())).toBeCloseTo(-1);
    });

    it('frames the whole nominal body', () => {
        const { camera } = setup();
        const box = new THREE.Box3(new THREE.Vector3(-0.75, -2.25, -0.6), new THREE.Vector3(0.75, 2.25, 0.6));
        expectBoxInView(box, camera);
    });

    it('halves the distance at zoom 2', () => {
        const base = distanceOf(setup().camera);
        expect(distanceOf(setup({ zoom: 2 }).camera)).toBeCloseTo(base / 2);
    });
});

describe('setCharacter', () => {
    it.each([16 / 9, 9 / 16])('centers the model at the origin and frames it fully at aspect %f', (aspect) => {
        const { scene, camera, dancing } = setup({ autoOrbit: false }, aspect);
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        expect(scene.children).toContain(model);
        // Run past the fade-in so the model is full size.
        run(dancing, 12, () => makeFrame({ dt: 0.1, settings: settings({ autoOrbit: false }) }));

        const box = modelBox(model);
        expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(0.05);
        expectBoxInView(box, camera);
    });

    it('frames the model at every orbit angle with the real camera pose from update', () => {
        const { camera, dancing } = setup({ autoOrbit: true, orbitSpeed: 2 });
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        for (let i = 0; i < 200; i++) {
            dancing.update(makeFrame({ dt: 0.05, settings: settings({ autoOrbit: true, orbitSpeed: 2 }) }));
            if (i > 15) expectBoxInView(modelBox(model), camera);
        }
    });

    it('moves the floor and ring to the feet', () => {
        const { scene, dancing } = setup();
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        const meshes = scene.children.filter((child) => child !== model && (child as THREE.Mesh).isMesh);
        const feet = modelBox(model).min.y;
        // The model is still fading in (tiny), so use its planned size: the nominal box height is replaced by the real one.
        expect(meshes).toHaveLength(2);
        for (const mesh of meshes) {
            expect(mesh.position.y).toBeGreaterThan(-3);
            expect(mesh.position.y).toBeLessThan(0);
        }
        expect(feet).toBeDefined();
    });

    it('clones the materials, so the input model keeps its colors, and tints Main and Grey only', () => {
        const { dancing } = setup({ bodyColor: '#ff0000' });
        const { model, clips, materials } = makeModel();
        dancing.setCharacter(model, clips);
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ff0000' }) }));

        const used = new Map<string, THREE.MeshStandardMaterial>();
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            for (const material of [mesh.material].flat())
                used.set(material.name, material as THREE.MeshStandardMaterial);
        });
        for (const name of ['Main', 'Grey', 'Black']) expect(used.get(name)).not.toBe(materials[name]);

        const original = new THREE.Color('#808080');
        expect(used.get('Main')!.color.r).toBeCloseTo(original.r);
        expect(used.get('Main')!.color.g).toBeCloseTo(0);
        expect(used.get('Main')!.color.b).toBeCloseTo(0);
        expect(used.get('Grey')!.color.g).toBeCloseTo(0);
        expect(used.get('Black')!.color.getHexString()).toBe(new THREE.Color('#101010').getHexString());
        // The shared originals are untouched.
        expect((materials.Main as THREE.MeshStandardMaterial).color.getHexString()).toBe(original.getHexString());
    });

    it('does not compound the body color and returns to the original when set back to white', () => {
        const { dancing } = setup();
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#808080' }) }));
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ffffff' }) }));
        const main = (model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(main.color.getHexString()).toBe(new THREE.Color('#808080').getHexString());
    });

    it('applies a new tint to the next character', () => {
        const { dancing } = setup();
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#00ff00' }) }));
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#00ff00' }) }));
        const main = (model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(main.color.r).toBeCloseTo(0);
    });

    it('stands still without clips and falls back to the first clip without a Dance clip', () => {
        const { dancing } = setup();
        const still = makeModel();
        dancing.setCharacter(still.model, []);
        run(dancing, 5, () => makeFrame());
        expect(clipPhase(still.model)).toBe(0);

        const noDance = makeModel();
        dancing.setCharacter(noDance.model, [noDance.clips[0]!]);
        run(dancing, 30, () => makeFrame());
        expect(noDance.model.getObjectByName('Phase')!.position.z).toBeGreaterThan(0);
    });

    it('skips materials that are not standard and meshes without names in the tint list', () => {
        const { dancing } = setup();
        const model = new THREE.Group();
        const basic = new THREE.MeshBasicMaterial({ name: 'Main' });
        model.add(new THREE.Mesh(new THREE.BoxGeometry(), basic), new THREE.Group());
        expect(() => dancing.setCharacter(model, [])).not.toThrow();
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ff0000' }) }));
    });

    it('fades the model in over FADE_IN_SECONDS', () => {
        const { dancing } = setup();
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        expect(model.scale.y).toBeLessThan(0.01);
        run(dancing, 3, () => makeFrame({ dt: FADE_IN_SECONDS / 6 }));
        expect(model.scale.y).toBeGreaterThan(0.01);
        expect(model.scale.y).toBeLessThan(1);
        run(dancing, 6, () => makeFrame({ dt: FADE_IN_SECONDS / 6 }));
        expect(model.scale.y).toBeCloseTo(1);
    });

    it('disposes the first character when a second one is set', () => {
        const { scene, dancing } = setup();
        const first = makeModel();
        const bodyGeometry = (first.model.children[0] as THREE.Mesh).geometry;
        const disposeGeometry = vi.spyOn(bodyGeometry, 'dispose');
        dancing.setCharacter(first.model, first.clips);
        const clonedMaterial = (first.model.children[0] as THREE.Mesh).material as THREE.Material;
        const disposeMaterial = vi.spyOn(clonedMaterial, 'dispose');

        const second = makeModel();
        dancing.setCharacter(second.model, second.clips);
        expect(disposeGeometry).toHaveBeenCalled();
        expect(disposeMaterial).toHaveBeenCalled();
        expect(scene.children).not.toContain(first.model);
        expect(scene.children).toContain(second.model);
    });
});

describe('setSkybox', () => {
    it('uses the texture as the background, disposes the previous one and returns to flat color on null', () => {
        const { scene, dancing } = setup();
        const first = new THREE.Texture();
        const second = new THREE.Texture();
        const disposeFirst = vi.spyOn(first, 'dispose');
        const disposeSecond = vi.spyOn(second, 'dispose');

        dancing.setSkybox(first);
        expect(scene.background).toBe(first);
        dancing.setSkybox(second);
        expect(disposeFirst).toHaveBeenCalledTimes(1);
        expect(scene.background).toBe(second);
        dancing.setSkybox(null);
        expect(disposeSecond).toHaveBeenCalledTimes(1);
        expect((scene.background as THREE.Color).getHexString()).toBe(
            new THREE.Color(FALLBACK_BACKGROUND).getHexString(),
        );
    });
});

describe('camera', () => {
    it('advances the azimuth while locked with auto orbit, and keeps it when auto orbit is off', () => {
        const orbiting = setup();
        run(orbiting.dancing, 60, () => makeFrame());
        expect(Math.abs(azimuthOf(orbiting.camera))).toBeGreaterThan(0.01);

        const still = setup({ autoOrbit: false });
        run(still.dancing, 60, () => makeFrame({ settings: settings({ autoOrbit: false }) }));
        expect(azimuthOf(still.camera)).toBeCloseTo(0);
    });

    it('writes nothing to the camera and does not advance the azimuth while unlocked', () => {
        const { camera, dancing } = setup();
        run(dancing, 30, () => makeFrame({ cameraLocked: false }));
        camera.position.set(3, 4, 5);
        run(dancing, 30, () => makeFrame({ cameraLocked: false, bass: 1 }));
        expect(camera.position.toArray()).toEqual([3, 4, 5]);

        // Locking again continues from azimuth 0, not from the time spent unlocked.
        dancing.update(makeFrame());
        expect(Math.abs(azimuthOf(camera))).toBeLessThan(0.01);
    });

    it('resetOrbit restores azimuth 0 and the fitted distance, locked or not', () => {
        const { camera, dancing } = setup({ zoom: 2 });
        const fitted = distanceOf(camera);
        run(dancing, 120, () => makeFrame({ settings: settings({ zoom: 2 }) }));
        expect(Math.abs(azimuthOf(camera))).toBeGreaterThan(0.01);
        dancing.resetOrbit();
        expect(azimuthOf(camera)).toBeCloseTo(0);
        expect(distanceOf(camera)).toBeCloseTo(fitted);

        camera.position.set(9, 9, 9);
        dancing.resetOrbit();
        expect(camera.position.x).toBeCloseTo(0);
        expect(distanceOf(camera)).toBeCloseTo(fitted);
    });

    it('follows zoom changes and aspect changes (after resize)', () => {
        const { camera, dancing } = setup();
        dancing.update(makeFrame());
        const base = distanceOf(camera);
        dancing.update(makeFrame({ settings: settings({ zoom: 2 }) }));
        expect(distanceOf(camera)).toBeCloseTo(base / 2, 1);

        camera.aspect = 0.2;
        camera.updateProjectionMatrix();
        dancing.resize();
        dancing.update(makeFrame({ settings: settings({ zoom: 2 }) }));
        expect(distanceOf(camera)).toBeGreaterThan(base / 2 + 1);
    });
});

describe('dance', () => {
    it('advances the clip with an unknown tempo (no freeze)', () => {
        const { dancing } = setup();
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        const before = clipPhase(model);
        run(dancing, 30, () => makeFrame());
        expect(clipPhase(model)).not.toBe(before);
    });

    it('converges the beat slot to the beat phase with a confident locked rhythm', () => {
        const { dancing } = setup();
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        const rhythm: RhythmState = createRhythmState();
        rhythm.bpm = 120;
        rhythm.tempoConfidence = 0.5;
        let time = 0;
        const dt = 1 / 60;
        // Start the beat a third of a loop-slot away from where the clip is.
        for (let i = 0; i < 60 * 25; i++) {
            time += dt;
            rhythm.beatPhase = (time * 2 + 0.37) % 1;
            dancing.update(makeFrame({ rhythm, dt, settings: settings({ autoOrbit: false }) }));
        }
        // 120 BPM normalizes to itself; one loop is eight beats.
        const slot = (clipPhase(model) * 8) % 1;
        expect(Math.abs(wrapSigned(slot - (rhythm.beatPhase ?? 0)))).toBeLessThan(0.05);
    });

    it('orbits faster with a fast tempo than with an unknown one', () => {
        const unknown = setup();
        run(unknown.dancing, 600, () => makeFrame());
        const fast = setup();
        const rhythm = createRhythmState();
        rhythm.bpm = 160;
        rhythm.tempoConfidence = 0.5;
        rhythm.beatPhase = 0.5;
        const { model, clips } = makeModel();
        fast.dancing.setCharacter(model, clips);
        run(fast.dancing, 600, () => makeFrame({ rhythm }));
        const unwrapped = (camera: THREE.PerspectiveCamera) => Math.abs(azimuthOf(camera));
        expect(unwrapped(fast.camera)).not.toBeCloseTo(unwrapped(unknown.camera), 3);
    });

    it('clamps huge frame steps', () => {
        const { dancing } = setup();
        const { model, clips } = makeModel();
        dancing.setCharacter(model, clips);
        dancing.update(makeFrame({ dt: 100 }));
        expect(clipPhase(model)).toBeLessThan(0.1);
        dancing.update(makeFrame({ dt: -1 }));
    });
});

describe('bass', () => {
    function settled(bass: number, overrides: Partial<DancingCharacterSettings> = {}) {
        const rig = setup(overrides);
        const { model, clips } = makeModel();
        rig.dancing.setCharacter(model, clips);
        run(rig.dancing, 60, () => makeFrame({ bass: 0, settings: settings(overrides) }));
        const rest = distanceOf(rig.camera);
        rig.dancing.update(makeFrame({ bass, settings: settings(overrides) }));
        const ring = rig.scene.children.find(
            (child) =>
                (child as THREE.Mesh).isMesh &&
                child !== model &&
                (child as THREE.Mesh).geometry.type === 'RingGeometry',
        ) as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
        return { ...rig, model, ring, rest };
    }

    it('does nothing at bass 0', () => {
        const { model, ring } = settled(0);
        expect(model.scale.y).toBe(1);
        expect(model.scale.x).toBe(1);
        expect(ring.material.opacity).toBe(0);
        expect(ring.visible).toBe(false);
    });

    it('squashes the model, shows the ring and pulls the camera in at bass 1', () => {
        const { model, ring, camera, rest } = settled(1, { autoOrbit: false });
        expect(model.scale.y).toBeCloseTo(1 - BASS_SQUASH);
        expect(model.scale.x).toBeCloseTo(1 + BASS_SQUASH / 2);
        expect(ring.visible).toBe(true);
        expect(ring.material.opacity).toBeGreaterThan(0.5);
        expect(ring.scale.x).toBeGreaterThan(1.5);
        expect(distanceOf(camera) / rest).toBeCloseTo(1 - MAX_ZOOM_KICK, 3);
    });

    it('has no effect when the bass strength is 0', () => {
        const { model, ring, camera, rest } = settled(1, { bassStrength: 0, autoOrbit: false });
        expect(model.scale.y).toBe(1);
        expect(ring.material.opacity).toBe(0);
        expect(distanceOf(camera)).toBeCloseTo(rest);
    });
});

describe('colors', () => {
    it('applies the accent and floor colors to the ring, rim light and floor, and re-applies on change', () => {
        const { scene, dancing } = setup({ accentColor: '#00ff00', floorColor: '#0000ff' });
        const floor = scene.children.find((c) => (c as THREE.Mesh).geometry?.type === 'CircleGeometry') as THREE.Mesh<
            THREE.CircleGeometry,
            THREE.MeshStandardMaterial
        >;
        const ring = scene.children.find((c) => (c as THREE.Mesh).geometry?.type === 'RingGeometry') as THREE.Mesh<
            THREE.RingGeometry,
            THREE.MeshBasicMaterial
        >;
        const rim = scene.children.find((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight;
        expect(floor.material.color.getHexString()).toBe(new THREE.Color('#0000ff').getHexString());
        expect(ring.material.color.getHexString()).toBe(new THREE.Color('#00ff00').getHexString());
        expect(rim.color.getHexString()).toBe(new THREE.Color('#00ff00').getHexString());

        dancing.update(makeFrame({ settings: settings({ accentColor: '#ff0000', floorColor: '#ffffff' }) }));
        expect(floor.material.color.getHexString()).toBe('ffffff');
        expect(ring.material.color.getHexString()).toBe(new THREE.Color('#ff0000').getHexString());
        expect(rim.color.getHexString()).toBe(new THREE.Color('#ff0000').getHexString());
    });
});

describe('dispose', () => {
    it('frees geometries, materials, textures, skeletons and the mixer cache and removes everything it added', () => {
        const { scene, dancing } = setup();
        const texture = new THREE.Texture();
        const disposeTexture = vi.spyOn(texture, 'dispose');
        dancing.setSkybox(texture);

        const { model, clips } = makeModel();
        const skinnedGeometry = new THREE.BoxGeometry();
        const vertexCount = skinnedGeometry.getAttribute('position').count;
        skinnedGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
        skinnedGeometry.setAttribute(
            'skinWeight',
            new THREE.Float32BufferAttribute(
                Array.from({ length: vertexCount * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
                4,
            ),
        );
        const skinned = new THREE.SkinnedMesh(skinnedGeometry, new THREE.MeshStandardMaterial({ name: 'Main' }));
        const skeleton = new THREE.Skeleton([new THREE.Bone()]);
        skinned.bind(skeleton);
        model.add(skinned);
        const disposeSkeleton = vi.spyOn(skeleton, 'dispose');
        const geometries = [] as THREE.BufferGeometry[];
        const materialSpies = [] as ReturnType<typeof vi.spyOn>[];
        dancing.setCharacter(model, clips);
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            geometries.push(mesh.geometry);
            vi.spyOn(mesh.geometry, 'dispose');
            for (const material of [mesh.material].flat()) materialSpies.push(vi.spyOn(material, 'dispose'));
        });
        const uncache = vi.spyOn(THREE.AnimationMixer.prototype, 'uncacheRoot');
        const stop = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');
        const floorGeometry = (
            scene.children.find((c) => (c as THREE.Mesh).geometry?.type === 'CircleGeometry') as THREE.Mesh
        ).geometry;
        const disposeFloor = vi.spyOn(floorGeometry, 'dispose');

        dancing.dispose();
        expect(disposeTexture).toHaveBeenCalled();
        expect(disposeSkeleton).toHaveBeenCalled();
        expect(uncache).toHaveBeenCalledWith(model);
        expect(stop).toHaveBeenCalled();
        expect(disposeFloor).toHaveBeenCalled();
        for (const geometry of geometries) expect(geometry.dispose).toHaveBeenCalled();
        for (const spy of materialSpies) expect(spy).toHaveBeenCalled();
        expect(scene.children).toHaveLength(0);
        expect(scene.background).toBeNull();
    });

    it('is safe before a character is set and safe to call twice', () => {
        const { scene, dancing } = setup();
        dancing.dispose();
        expect(() => dancing.dispose()).not.toThrow();
        expect(scene.children).toHaveLength(0);
    });
});

describe('real RobotExpressive.glb', () => {
    it('loads, frames fully, dances and disposes', async () => {
        const file = readFileSync(new URL('./assets/RobotExpressive.glb', import.meta.url));
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

        for (const aspect of [16 / 9, 9 / 16]) {
            const scene = new THREE.Scene();
            const camera = makeCamera(aspect);
            const dancing = new DancingCharacterScene(scene, camera, settings());
            // A fresh parse per aspect, because the scene takes ownership and disposes the model.
            const parsed = await new GLTFLoader().parseAsync(bytes, '');
            const model = parsed.scene;
            dancing.setCharacter(model, parsed.animations);
            const bindBox = modelBox(model);
            // At scale ~0 during the fade the box is tiny, so check the target size via the scene's own measurement.
            run(dancing, 12, () => makeFrame({ dt: 0.1 }));
            const box = modelBox(model);
            expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(1);
            expect(bindBox).toBeDefined();
            for (let i = 0; i < 100; i++) {
                dancing.update(makeFrame({ dt: 0.05, settings: settings({ orbitSpeed: 2 }) }));
                expectBoxInView(modelBox(model), camera);
            }
            const names = new Set<string>();
            model.traverse((object) => {
                const mesh = object as THREE.Mesh;
                if (mesh.isMesh) for (const material of [mesh.material].flat()) names.add(material.name);
            });
            expect(names).toEqual(new Set(['Main', 'Grey', 'Black']));
            dancing.dispose();
            expect(scene.children).toHaveLength(0);
        }
    });
});
