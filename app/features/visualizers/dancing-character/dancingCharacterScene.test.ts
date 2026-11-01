import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRhythmState } from '~/features/rhythm/types';
import type { RhythmState } from '~/features/rhythm/types';
import { dancingCharacterControls, type DancingCharacterSettings } from './dancingCharacterControls';
import {
    ACCENT_EASE_SECONDS,
    CALM_DANCE_WEIGHT,
    CAMERA_ELEVATION,
    DANCE_CLIP_BEATS,
    DANCE_CLIP_DURATION,
    DANCE_REQUIRED_BONES,
    FADE_IN_SECONDS,
    CLUB_BACKGROUND,
    CLUB_REDUCED_MOTION_FLASH_STRENGTH,
    DOLLY_MAX_FRACTION,
    NOMINAL_CHARACTER_SIZE,
} from './dancingCharacterConfig';
import { ClubSet } from './dancingCharacterClub';
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

// A rig with the dancer's bone names (a flat skeleton under `root`), one skinned box bound to the root bone and the
// model's one 'Skin' material, plus a plain mesh with a material the tint must leave alone. Pass bone names to build a
// rig that lacks some of them.
function makeModel(boneNames: readonly string[] = DANCE_REQUIRED_BONES): {
    model: THREE.Group;
    materials: Record<string, THREE.Material>;
} {
    const model = new THREE.Group();
    const materials = {
        Skin: new THREE.MeshStandardMaterial({ name: 'Skin', color: '#808080' }),
        Eyes: new THREE.MeshStandardMaterial({ name: 'Eyes', color: '#101010' }),
    };
    const bones = boneNames.map((name) => {
        const bone = new THREE.Bone();
        bone.name = name;
        return bone;
    });
    for (const bone of bones.slice(1)) bones[0].add(bone);
    const geometry = new THREE.BoxGeometry(1, 3, 1);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute(
        'skinWeight',
        new THREE.Float32BufferAttribute(
            Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
            4,
        ),
    );
    const body = new THREE.SkinnedMesh(geometry, materials.Skin);
    body.add(bones[0]);
    body.bind(new THREE.Skeleton(bones));
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), materials.Eyes);
    eyes.position.y = 1;
    model.add(body, eyes);
    return { model, materials };
}

// The base action's loop position (0..1), read from the scene so the tests need not decode a pose.
function actions(dancing: DancingCharacterScene): {
    baseAction: THREE.AnimationAction | null;
    accentAction: THREE.AnimationAction | null;
} {
    return dancing as unknown as {
        baseAction: THREE.AnimationAction | null;
        accentAction: THREE.AnimationAction | null;
    };
}

// A rhythm the dance locks to: 120 BPM with a confident 4/4 meter at the given bar position.
function lockedRhythm(barPhase: number): RhythmState {
    const rhythm = createRhythmState();
    rhythm.bpm = 120;
    rhythm.tempoConfidence = 0.5;
    rhythm.beatsPerBar = 4;
    rhythm.meterConfidence = 0.9;
    rhythm.beatPhase = (barPhase * 4) % 1;
    rhythm.barPhase = barPhase;
    return rhythm;
}

function clipPhase(dancing: DancingCharacterScene): number {
    return actions(dancing).baseAction!.time / DANCE_CLIP_DURATION;
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
    it('builds the dark club, adds lights and the ring and frames the nominal box', () => {
        const { scene, camera, dancing } = setup();
        expect((scene.background as THREE.Color).getHexString()).toBe(new THREE.Color(CLUB_BACKGROUND).getHexString());
        expect(scene.fog).toBeInstanceOf(THREE.Fog);
        // Hemisphere, key and rim, plus the club's two color-spill lights.
        expect(scene.children.filter((child) => (child as THREE.Light).isLight)).toHaveLength(5);
        // The LED floor (one instanced mesh), four spotlight cones and the bass ring.
        expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(6);
        expect(scene.children.filter((child) => (child as THREE.InstancedMesh).isInstancedMesh)).toHaveLength(1);
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
        const { width, height, depth } = NOMINAL_CHARACTER_SIZE;
        const box = new THREE.Box3(
            new THREE.Vector3(-width / 2, -height / 2, -depth / 2),
            new THREE.Vector3(width / 2, height / 2, depth / 2),
        );
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
        const { model } = makeModel();
        dancing.setCharacter(model);
        expect(scene.children).toContain(model);
        // Run past the fade-in so the model is full size.
        run(dancing, 12, () => makeFrame({ dt: 0.1, settings: settings({ autoOrbit: false }) }));

        const box = modelBox(model);
        expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(0.05);
        expectBoxInView(box, camera);
    });

    it('frames the model at every orbit angle with the real camera pose from update', () => {
        const { camera, dancing } = setup({ autoOrbit: true, orbitSpeed: 2 });
        const { model } = makeModel();
        dancing.setCharacter(model);
        for (let i = 0; i < 200; i++) {
            dancing.update(makeFrame({ dt: 0.05, settings: settings({ autoOrbit: true, orbitSpeed: 2 }) }));
            if (i > 15) expectBoxInView(modelBox(model), camera);
        }
    });

    it('moves the LED floor and the ring to the feet', () => {
        const { scene, dancing } = setup();
        const { model } = makeModel();
        const floor = scene.children.find((child) => (child as THREE.InstancedMesh).isInstancedMesh)!;
        const ring = scene.children.find(
            (child) => (child as THREE.Mesh).geometry?.type === 'RingGeometry',
        ) as THREE.Mesh;
        const before = floor.position.y;
        dancing.setCharacter(model);
        // The makeModel rig is 3 m tall, taller than the nominal dancer, so the feet move down.
        expect(floor.position.y).toBeLessThan(before);
        expect(floor.position.y).toBeGreaterThan(-3);
        expect(floor.position.y).toBeLessThan(0);
        expect(ring.position.y).toBeCloseTo(floor.position.y + 0.01);
    });

    it('clones the materials, so the input model keeps its colors, and tints Skin only', () => {
        const { dancing } = setup({ bodyColor: '#ff0000' });
        const { model, materials } = makeModel();
        dancing.setCharacter(model);
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ff0000' }) }));

        const used = new Map<string, THREE.MeshStandardMaterial>();
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            for (const material of [mesh.material].flat())
                used.set(material.name, material as THREE.MeshStandardMaterial);
        });
        for (const name of ['Skin', 'Eyes']) expect(used.get(name)).not.toBe(materials[name]);

        const original = new THREE.Color('#808080');
        expect(used.get('Skin')!.color.r).toBeCloseTo(original.r);
        expect(used.get('Skin')!.color.g).toBeCloseTo(0);
        expect(used.get('Skin')!.color.b).toBeCloseTo(0);
        expect(used.get('Eyes')!.color.getHexString()).toBe(new THREE.Color('#101010').getHexString());
        // The shared originals are untouched.
        expect((materials.Skin as THREE.MeshStandardMaterial).color.getHexString()).toBe(original.getHexString());
    });

    it('does not compound the body color and returns to the original when set back to white', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#808080' }) }));
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ffffff' }) }));
        const main = (model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(main.color.getHexString()).toBe(new THREE.Color('#808080').getHexString());
    });

    it('applies a new tint to the next character', () => {
        const { dancing } = setup();
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#00ff00' }) }));
        const { model } = makeModel();
        dancing.setCharacter(model);
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#00ff00' }) }));
        const main = (model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(main.color.r).toBeCloseTo(0);
    });

    it('keeps the rest pose, without a mixer, when the rig lacks a bone the dance drives', () => {
        const { dancing } = setup();
        const still = makeModel(DANCE_REQUIRED_BONES.filter((name) => name !== 'head'));
        dancing.setCharacter(still.model);
        expect(actions(dancing).baseAction).toBeNull();
        expect(actions(dancing).accentAction).toBeNull();
        const root = still.model.getObjectByName('root')!;
        const rest = root.position.clone();
        run(dancing, 30, () => makeFrame({ rhythm: lockedRhythm(0.3) }));
        expect(root.position.toArray()).toEqual(rest.toArray());
        // The scene still renders and frames the figure.
        expect(still.model.scale.y).toBeGreaterThan(0.01);
        expect(() => dancing.dispose()).not.toThrow();
    });

    it('skips materials that are not standard and meshes without names in the tint list', () => {
        const { dancing } = setup();
        const model = new THREE.Group();
        const basic = new THREE.MeshBasicMaterial({ name: 'Skin' });
        model.add(new THREE.Mesh(new THREE.BoxGeometry(), basic), new THREE.Group());
        expect(() => dancing.setCharacter(model)).not.toThrow();
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ff0000' }) }));
    });

    it('fades the model in over FADE_IN_SECONDS', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
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
        dancing.setCharacter(first.model);
        const clonedMaterial = (first.model.children[0] as THREE.Mesh).material as THREE.Material;
        const disposeMaterial = vi.spyOn(clonedMaterial, 'dispose');

        const second = makeModel();
        dancing.setCharacter(second.model);
        expect(disposeGeometry).toHaveBeenCalled();
        expect(disposeMaterial).toHaveBeenCalled();
        expect(scene.children).not.toContain(first.model);
        expect(scene.children).toContain(second.model);
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
        const { model } = makeModel();
        dancing.setCharacter(model);
        const before = clipPhase(dancing);
        run(dancing, 30, () => makeFrame());
        expect(clipPhase(dancing)).not.toBe(before);
    });

    it('converges the beat slot to the beat phase with a confident locked rhythm', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
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
        // 120 BPM normalizes to itself and is the native tempo; one loop is four beats.
        const slot = (clipPhase(dancing) * DANCE_CLIP_BEATS) % 1;
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
        const { model } = makeModel();
        fast.dancing.setCharacter(model);
        run(fast.dancing, 600, () => makeFrame({ rhythm }));
        const unwrapped = (camera: THREE.PerspectiveCamera) => Math.abs(azimuthOf(camera));
        expect(unwrapped(fast.camera)).not.toBeCloseTo(unwrapped(unknown.camera), 3);
    });

    it('clamps huge frame steps', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
        dancing.update(makeFrame({ dt: 100 }));
        expect(clipPhase(dancing)).toBeLessThan(0.1);
        dancing.update(makeFrame({ dt: -1 }));
    });
});

describe('dance layers', () => {
    const lockedButNoBar = (): RhythmState => {
        const rhythm = lockedRhythm(0.3);
        rhythm.meterConfidence = 0;
        return rhythm;
    };

    function loaded(rhythm: () => RhythmState, frames: number) {
        const rig = setup({ autoOrbit: false });
        const { model } = makeModel();
        rig.dancing.setCharacter(model);
        const layers = actions(rig.dancing);
        run(rig.dancing, frames, () => makeFrame({ rhythm: rhythm(), settings: settings({ autoOrbit: false }) }));
        return { ...rig, base: layers.baseAction!, accent: layers.accentAction! };
    }

    it('plays both actions together, looping', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
        const { baseAction, accentAction } = actions(dancing);
        for (const action of [baseAction!, accentAction!]) {
            expect(action.loop).toBe(THREE.LoopRepeat);
            expect(action.isRunning()).toBe(true);
        }
        expect(accentAction!.getClip().blendMode).toBe(THREE.AdditiveAnimationBlendMode);
        expect(baseAction!.weight).toBe(CALM_DANCE_WEIGHT);
        expect(accentAction!.weight).toBe(0);
    });

    it('follows the dance weight on the base: a gentle bounce while the tempo is unknown, full while locked', () => {
        const calm = loaded(() => createRhythmState(), 300);
        expect(calm.base.weight).toBeCloseTo(CALM_DANCE_WEIGHT, 2);
        const locked = loaded(lockedButNoBar, 300);
        expect(locked.base.weight).toBeCloseTo(1, 2);
    });

    it('shows no accents unless the bar is locked', () => {
        expect(loaded(() => createRhythmState(), 300).accent.weight).toBe(0);
        expect(loaded(lockedButNoBar, 300).accent.weight).toBe(0);
    });

    it('eases the accents in toward the dance weight once the bar is locked, and back out when it is lost', () => {
        const rig = setup({ autoOrbit: false });
        const { model } = makeModel();
        rig.dancing.setCharacter(model);
        const { baseAction, accentAction } = actions(rig.dancing);
        const frame = (rhythm: RhythmState) => makeFrame({ rhythm, settings: settings({ autoOrbit: false }) });

        // Lock the tempo first so the dance weight is already 1.
        run(rig.dancing, 300, () => frame(lockedButNoBar()));
        expect(baseAction!.weight).toBeCloseTo(1, 2);

        // One time constant gets about 63 percent of the way, never a jump.
        run(rig.dancing, Math.round(ACCENT_EASE_SECONDS * 60), () => frame(lockedRhythm(0.3)));
        expect(accentAction!.weight).toBeGreaterThan(0.5);
        expect(accentAction!.weight).toBeLessThan(0.75);
        let previous = accentAction!.weight;
        for (let i = 0; i < 300; i++) {
            rig.dancing.update(frame(lockedRhythm(0.3)));
            expect(accentAction!.weight).toBeGreaterThanOrEqual(previous);
            expect(accentAction!.weight).toBeLessThanOrEqual(baseAction!.weight + 1e-9);
            previous = accentAction!.weight;
        }
        expect(accentAction!.weight).toBeCloseTo(baseAction!.weight, 2);

        // Losing the bar fades them out without leaving the tempo lock.
        run(rig.dancing, 300, () => frame(lockedButNoBar()));
        expect(accentAction!.weight).toBeLessThan(0.01);
        expect(baseAction!.weight).toBeCloseTo(1, 2);
    });

    it('keeps both actions at the same time through phase nudges and wraps', () => {
        const rig = setup({ autoOrbit: false });
        const { model } = makeModel();
        rig.dancing.setCharacter(model);
        const { baseAction, accentAction } = actions(rig.dancing);
        let time = 0;
        for (let i = 0; i < 600; i++) {
            time += 1 / 60;
            // A bar that runs at a different pace than the clip, so nudges of both signs happen.
            const rhythm = lockedRhythm((time * 0.7 + 0.3) % 1);
            rig.dancing.update(makeFrame({ rhythm, settings: settings({ autoOrbit: false }) }));
            expect(accentAction!.time).toBe(baseAction!.time);
            expect(baseAction!.time).toBeGreaterThanOrEqual(0);
            expect(baseAction!.time).toBeLessThan(DANCE_CLIP_DURATION);
        }
    });

    it('re-samples the framing box from the dance with both layers at full weight, then restores the weights', () => {
        const seen: { base: number; accent: number }[] = [];
        const rig = setup();
        const { model } = makeModel();
        const original = THREE.AnimationMixer.prototype.setTime;
        vi.spyOn(THREE.AnimationMixer.prototype, 'setTime').mockImplementation(function (
            this: THREE.AnimationMixer,
            time: number,
        ) {
            const layers = actions(rig.dancing);
            if (layers.baseAction && layers.accentAction) {
                seen.push({ base: layers.baseAction.weight, accent: layers.accentAction.weight });
            }
            return original.call(this, time);
        });
        rig.dancing.setCharacter(model);
        const sampled = seen.filter((weights) => weights.base === 1 && weights.accent === 1);
        expect(sampled.length).toBeGreaterThanOrEqual(32);
        const layers = actions(rig.dancing);
        expect(layers.baseAction!.weight).toBe(CALM_DANCE_WEIGHT);
        expect(layers.accentAction!.weight).toBe(0);
        expect(layers.baseAction!.time).toBe(0);
    });

    it('frees the mixer and the actions on dispose', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
        dancing.dispose();
        expect(actions(dancing).baseAction).toBeNull();
        expect(actions(dancing).accentAction).toBeNull();
    });
});

// A locked 120 BPM rhythm at the given frame (a beat every 30 frames at 60 fps).
function beatRhythm(frame: number): RhythmState {
    const beat = frame / 30;
    const rhythm = lockedRhythm((beat / 4) % 1);
    rhythm.beatCount = Math.floor(beat);
    return rhythm;
}

describe('bass', () => {
    const WARM_UP_FRAMES = 30 * 8;

    // Six beats of on-beat kicks open the bass gate and two silent beats let its tail die away; the last frame is the next beat with the given bass, after
    // silence so it counts as a fresh kick.
    function settled(bass: number, overrides: Partial<DancingCharacterSettings> = {}) {
        const rig = setup(overrides);
        const { model } = makeModel();
        rig.dancing.setCharacter(model);
        for (let i = 0; i < WARM_UP_FRAMES; i++) {
            rig.dancing.update(
                makeFrame({
                    bass: i < 30 * 6 && i % 30 < 4 ? 1 : 0,
                    rhythm: beatRhythm(i),
                    settings: settings(overrides),
                }),
            );
        }
        const rest = distanceOf(rig.camera);
        rig.dancing.update(makeFrame({ bass, rhythm: beatRhythm(WARM_UP_FRAMES), settings: settings(overrides) }));
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

    it('keeps the model its size and on the floor, shows the ring and pulls the camera in at bass 1', () => {
        const { model, ring, camera, rest } = settled(1, { autoOrbit: false });
        const { model: still } = settled(0, { autoOrbit: false });
        expect(model.scale.toArray()).toEqual([1, 1, 1]);
        expect(model.position.toArray()).toEqual(still.position.toArray());
        expect(ring.visible).toBe(true);
        expect(ring.material.opacity).toBeGreaterThan(0.5);
        expect(ring.scale.x).toBeGreaterThan(1.5);
        expect(distanceOf(camera) / rest).toBeCloseTo(1 - 0.6 * DOLLY_MAX_FRACTION, 3);
    });

    it('returns the camera to the fitted distance when the bass falls to 0', () => {
        const { camera, dancing, rest } = settled(1, { autoOrbit: false });
        expect(distanceOf(camera)).toBeLessThan(rest);
        run(dancing, 90, () =>
            makeFrame({ bass: 0, rhythm: beatRhythm(WARM_UP_FRAMES + 1), settings: settings({ autoOrbit: false }) }),
        );
        expect(distanceOf(camera)).toBeCloseTo(rest);
    });

    it('ignores a stray bass bump while no tempo is locked', () => {
        const { camera, scene, dancing } = setup({ autoOrbit: false });
        dancing.setCharacter(makeModel().model);
        const rim = scene.children.find((child) => (child as THREE.PointLight).isPointLight) as THREE.PointLight;
        const ring = scene.children.find(
            (child) => (child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry.type === 'RingGeometry',
        ) as THREE.Mesh;
        run(dancing, 60, () => makeFrame({ settings: settings({ autoOrbit: false }) }));
        const rest = distanceOf(camera);
        const rimRest = rim.intensity;
        run(dancing, 30, () => makeFrame({ bass: 1, settings: settings({ autoOrbit: false }) }));
        expect(distanceOf(camera)).toBeCloseTo(rest);
        expect(ring.visible).toBe(false);
        expect(rim.intensity).toBe(rimRest);
    });

    it('writes nothing to the camera while it is unlocked, whatever the bass', () => {
        const { camera, dancing } = settled(0, { autoOrbit: false });
        camera.position.set(1, 2, 3);
        dancing.update(makeFrame({ bass: 1, cameraLocked: false, settings: settings({ autoOrbit: false }) }));
        expect(camera.position.toArray()).toEqual([1, 2, 3]);
    });

    it('does not move the camera when the camera bump is 0 but still shows the ring', () => {
        const { ring, camera, rest } = settled(1, { bassCameraStrength: 0, autoOrbit: false });
        expect(distanceOf(camera)).toBeCloseTo(rest);
        expect(ring.visible).toBe(true);
    });

    it('has no effect when the bass strength is 0', () => {
        const { model, ring, camera, rest } = settled(1, { bassStrength: 0, autoOrbit: false });
        expect(model.scale.y).toBe(1);
        expect(ring.material.opacity).toBe(0);
        expect(distanceOf(camera)).toBeCloseTo(rest * (1 - 0.6 * DOLLY_MAX_FRACTION), 1);
    });
});

describe('colors', () => {
    it('applies the accent color to the ring and rim light and both colors to the club, and re-applies on change', () => {
        const setColors = vi.spyOn(ClubSet.prototype, 'setColors');
        const { scene, dancing } = setup({ accentColor: '#00ff00', floorColor: '#0000ff' });
        const ring = scene.children.find((c) => (c as THREE.Mesh).geometry?.type === 'RingGeometry') as THREE.Mesh<
            THREE.RingGeometry,
            THREE.MeshBasicMaterial
        >;
        // The club adds its own point lights first; the rim light is the last one.
        const rim = scene.children.filter((c) => (c as THREE.PointLight).isPointLight).at(-1) as THREE.PointLight;
        expect(ring.material.color.getHexString()).toBe(new THREE.Color('#00ff00').getHexString());
        expect(rim.color.getHexString()).toBe(new THREE.Color('#00ff00').getHexString());
        expect(setColors).toHaveBeenLastCalledWith('#0000ff', '#00ff00');
        const calls = setColors.mock.calls.length;

        // Unchanged settings do no color work.
        dancing.update(makeFrame({ settings: settings({ accentColor: '#00ff00', floorColor: '#0000ff' }) }));
        expect(setColors).toHaveBeenCalledTimes(calls);

        dancing.update(makeFrame({ settings: settings({ accentColor: '#ff0000', floorColor: '#ffffff' }) }));
        expect(setColors).toHaveBeenLastCalledWith('#ffffff', '#ff0000');
        expect(ring.material.color.getHexString()).toBe(new THREE.Color('#ff0000').getHexString());
        expect(rim.color.getHexString()).toBe(new THREE.Color('#ff0000').getHexString());

        // Only the floor changes: the club hears about it, the ring keeps its color.
        dancing.update(makeFrame({ settings: settings({ accentColor: '#ff0000', floorColor: '#123456' }) }));
        expect(setColors).toHaveBeenLastCalledWith('#123456', '#ff0000');
        expect(ring.material.color.getHexString()).toBe(new THREE.Color('#ff0000').getHexString());
    });
});

describe('club', () => {
    it('feeds the club the beat phase, bass and dance weight each frame', () => {
        const update = vi.spyOn(ClubSet.prototype, 'update');
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model);
        update.mockClear();

        dancing.update(makeFrame({ rhythm: lockedRhythm(0.3), bass: 0.8 }));

        expect(update).toHaveBeenCalledTimes(1);
        const [beatPhase, bass, weight, dt] = update.mock.calls[0];
        expect(beatPhase).toBeCloseTo((0.3 * 4) % 1);
        // The bass gate is still closed on a first frame, so the club gets 0 (the gate has its own specs).
        expect(bass).toBe(0);
        expect(weight).toBeGreaterThan(CALM_DANCE_WEIGHT);
        expect(dt).toBeCloseTo(1 / 60);
    });

    it('passes the calm weight and no beat phase when nothing is known or there is no rig', () => {
        const update = vi.spyOn(ClubSet.prototype, 'update');
        const { dancing } = setup();
        // A model whose rig lacks the dance bones keeps its rest pose and has no mixer.
        dancing.setCharacter(makeModel(['root']).model);
        update.mockClear();

        dancing.update(makeFrame({ bass: 0.2 }));

        expect(update).toHaveBeenCalledWith(undefined, 0, CALM_DANCE_WEIGHT, expect.any(Number));
    });

    it('lowers the flash strength only under reduced motion', () => {
        const setFlashStrength = vi.spyOn(ClubSet.prototype, 'setFlashStrength');
        setup();
        expect(setFlashStrength).not.toHaveBeenCalled();

        new DancingCharacterScene(new THREE.Scene(), makeCamera(), settings(), { reducedMotion: true });
        expect(setFlashStrength).toHaveBeenCalledWith(CLUB_REDUCED_MOTION_FLASH_STRENGTH);
    });
});

describe('dispose', () => {
    it('frees geometries, materials, skeletons and the mixer cache and removes everything it added', () => {
        const { scene, dancing } = setup();
        const clubDispose = vi.spyOn(ClubSet.prototype, 'dispose');

        const { model } = makeModel();
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
        dancing.setCharacter(model);
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            geometries.push(mesh.geometry);
            vi.spyOn(mesh.geometry, 'dispose');
            for (const material of [mesh.material].flat()) materialSpies.push(vi.spyOn(material, 'dispose'));
        });
        const uncache = vi.spyOn(THREE.AnimationMixer.prototype, 'uncacheRoot');
        const stop = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');
        const floor = scene.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
        const disposeFloor = vi.spyOn(floor.geometry, 'dispose');

        dancing.dispose();
        expect(clubDispose).toHaveBeenCalled();
        expect(disposeSkeleton).toHaveBeenCalled();
        expect(uncache).toHaveBeenCalledWith(model);
        expect(stop).toHaveBeenCalled();
        expect(disposeFloor).toHaveBeenCalled();
        for (const geometry of geometries) expect(geometry.dispose).toHaveBeenCalled();
        for (const spy of materialSpies) expect(spy).toHaveBeenCalled();
        expect(scene.children).toHaveLength(0);
        expect(scene.background).toBeNull();
        expect(scene.fog).toBeNull();
    });

    it('is safe before a character is set and safe to call twice', () => {
        const { scene, dancing } = setup();
        dancing.dispose();
        expect(() => dancing.dispose()).not.toThrow();
        expect(scene.children).toHaveLength(0);
    });
});

describe('real MakeHumanDancer.glb', () => {
    async function parse() {
        const file = readFileSync(new URL('./assets/MakeHumanDancer.glb', import.meta.url));
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        // GLTFLoader decodes the garment textures through an <img> element, which the node environment lacks. This
        // stand-in answers "loaded", so the loader builds its Texture objects; it is removed again right after.
        vi.stubGlobal('self', globalThis);
        vi.stubGlobal('document', {
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
            // A fresh parse per use, because the scene takes ownership and disposes the model.
            return (await new GLTFLoader().parseAsync(bytes, '')).scene;
        } finally {
            vi.unstubAllGlobals();
        }
    }

    function meshesOf(model: THREE.Group): THREE.SkinnedMesh[] {
        const meshes: THREE.SkinnedMesh[] = [];
        model.traverse((object) => {
            if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
        });
        return meshes;
    }

    it('is dressed: several skinned meshes share one skeleton and the garments carry textures', async () => {
        const model = await parse();
        const meshes = meshesOf(model);
        expect(meshes.map((mesh) => mesh.name).sort()).toEqual(['Body', 'Eyes', 'Hair', 'Outfit', 'Shoes']);
        for (const mesh of meshes) expect(mesh.skeleton.bones).toEqual(meshes[0].skeleton.bones);
        const material = (name: string) =>
            meshes.find((mesh) => mesh.name === name)!.material as THREE.MeshStandardMaterial;
        expect(material('Body').map).toBeNull();
        for (const name of ['Outfit', 'Shoes', 'Hair', 'Eyes'])
            expect(material(name).map).toBeInstanceOf(THREE.Texture);
        // The hair is a cutout card, drawn from both sides.
        expect(material('Hair').alphaTest).toBeGreaterThan(0);
        expect(material('Hair').side).toBe(THREE.DoubleSide);
    });

    it('hands the dance every bone once, however many meshes share the skeleton', async () => {
        const { dancing } = setup();
        const collect = (dancing as unknown as { collectBones(model: THREE.Group): THREE.Bone[] }).collectBones;
        const bones = collect.call(dancing, await parse());
        expect(bones).toHaveLength(163);
        expect(new Set(bones).size).toBe(163);
    });

    it('tints only the Skin material when the body color changes', async () => {
        const { dancing } = setup();
        const model = await parse();
        dancing.setCharacter(model);
        const colors = (name: string) =>
            (meshesOf(model).find((mesh) => mesh.name === name)!.material as THREE.MeshStandardMaterial).color;
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ff0000' }) }));
        expect(colors('Body').getHexString()).not.toBe('ffffff');
        for (const name of ['Outfit', 'Shoes', 'Hair', 'Eyes']) expect(colors(name).getHexString()).toBe('ffffff');
        dancing.dispose();
    });

    it('frees the garment textures along with the geometries and materials', async () => {
        const { dancing } = setup();
        const model = await parse();
        dancing.setCharacter(model);
        const textures = new Set<THREE.Texture>();
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh) {
                const map = (mesh.material as THREE.MeshStandardMaterial).map;
                if (map) textures.add(map);
            }
        });
        expect(textures.size).toBe(4);
        const spies = [...textures].map((texture) => vi.spyOn(texture, 'dispose'));
        dancing.dispose();
        for (const spy of spies) expect(spy).toHaveBeenCalled();
    });

    it('loads, dances with every layer, frames fully at both aspects and disposes', async () => {
        for (const aspect of [16 / 9, 9 / 16]) {
            const scene = new THREE.Scene();
            const camera = makeCamera(aspect);
            const dancing = new DancingCharacterScene(scene, camera, settings());
            const model = await parse();
            dancing.setCharacter(model);
            expect(actions(dancing).baseAction).not.toBeNull();
            // Past the fade-in, locked to a bar so the accents show.
            run(dancing, 12, () => makeFrame({ dt: 0.1, rhythm: lockedRhythm(0.3) }));
            expect(modelBox(model).getCenter(new THREE.Vector3()).length()).toBeLessThan(0.2);
            for (let i = 0; i < 100; i++) {
                const rhythm = lockedRhythm((i * 0.05 * 0.5) % 1);
                dancing.update(makeFrame({ dt: 0.05, rhythm, settings: settings({ orbitSpeed: 2 }) }));
                expectBoxInView(modelBox(model), camera);
            }
            expect(actions(dancing).accentAction!.weight).toBeGreaterThan(0.5);
            const names = new Set<string>();
            model.traverse((object) => {
                const mesh = object as THREE.Mesh;
                if (mesh.isMesh) for (const material of [mesh.material].flat()) names.add(material.name);
            });
            expect(names).toEqual(new Set(['Skin', 'Outfit', 'Shoes', 'Hair', 'Eyes']));
            dancing.dispose();
            expect(scene.children).toHaveLength(0);
        }
    });

    it('has a dance that fits NOMINAL_CHARACTER_SIZE with both layers at full weight', async () => {
        const model = await parse();
        const { dancing } = setup();
        dancing.setCharacter(model);
        // The scene keeps the box it measured; read it back rather than re-deriving the sampling.
        const box = (dancing as unknown as { framingBox: THREE.Box3 }).framingBox;
        const size = box.getSize(new THREE.Vector3());
        expect(Math.abs(size.x - NOMINAL_CHARACTER_SIZE.width)).toBeLessThan(0.06);
        expect(Math.abs(size.y - NOMINAL_CHARACTER_SIZE.height)).toBeLessThan(0.06);
        expect(Math.abs(size.z - NOMINAL_CHARACTER_SIZE.depth)).toBeLessThan(0.06);
        dancing.dispose();
    });
});
