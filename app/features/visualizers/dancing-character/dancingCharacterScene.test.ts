import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRhythmState } from '~/features/rhythm/types';
import type { RhythmState } from '~/features/rhythm/types';
import { dancingCharacterControls, type DancingCharacterSettings } from './dancingCharacterControls';
import {
    AUTO_DANCE,
    CALM_DANCE_ID,
    CALM_DANCE_WEIGHT,
    CALM_TIME_SCALE,
    CAMERA_ELEVATION,
    DANCE_CLOCK_SECONDS,
    DANCE_REQUIRED_BONES,
    DANCES,
    type DanceId,
    FADE_IN_SECONDS,
    CLUB_BACKGROUND,
    CLUB_REDUCED_MOTION_FLASH_STRENGTH,
    DOLLY_MAX_FRACTION,
    NOMINAL_CHARACTER_SIZE,
} from './dancingCharacterConfig';
import { pickDances } from './dancingCharacterAssets';
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

// Synthetic dances: one clip per registered dance, as long as the dance says, moving the root bone up by a distinct
// height, so no GLB is needed to tell which clip is playing. `ids` leaves the others out.
function makeDances(ids: readonly DanceId[] = DANCES.map((dance) => dance.id)): Map<DanceId, THREE.AnimationClip> {
    const dances = new Map<DanceId, THREE.AnimationClip>();
    for (const dance of DANCES) {
        if (!ids.includes(dance.id)) continue;
        const height = 0.01 * (DANCES.indexOf(dance) + 1);
        const track = new THREE.VectorKeyframeTrack(
            'root.position',
            [0, (dance.beats * 0.5) / 2, dance.beats * 0.5],
            [0, 0, 0, 0, height, 0, 0, 0, 0],
        );
        dances.set(dance.id, new THREE.AnimationClip(dance.id, dance.beats * 0.5, [track]));
    }
    return dances;
}

// The scene's private dance state, read so the tests need not decode a pose.
interface DanceInternals {
    danceActions: THREE.AnimationAction[];
    danceIds: DanceId[];
    danceTime: number;
    activeIndex: number;
}
function inner(dancing: DancingCharacterScene): DanceInternals {
    return dancing as unknown as DanceInternals;
}
// The action of a dance, by id.
function actionOf(dancing: DancingCharacterScene, id: DanceId): THREE.AnimationAction {
    const i = inner(dancing).danceIds.indexOf(id);
    return inner(dancing).danceActions[i];
}
function weightsOf(dancing: DancingCharacterScene): Record<string, number> {
    const { danceIds, danceActions } = inner(dancing);
    return Object.fromEntries(danceIds.map((id, i) => [id, danceActions[i].weight]));
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

// Where the shared clock is within its longest clip (0..1): the 8-beat dance's loop position.
function clipPhase(dancing: DancingCharacterScene): number {
    return inner(dancing).danceTime / DANCE_CLOCK_SECONDS;
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
    it('builds the dark club, adds lights and frames the nominal box', () => {
        const { scene, camera, dancing } = setup();
        expect((scene.background as THREE.Color).getHexString()).toBe(new THREE.Color(CLUB_BACKGROUND).getHexString());
        expect(scene.fog).toBeInstanceOf(THREE.Fog);
        // Hemisphere, key and rim, plus the club's two color-spill lights.
        expect(scene.children.filter((child) => (child as THREE.Light).isLight)).toHaveLength(5);
        // The LED floor (one instanced mesh), the plane under its seams, its frame's four bars and four spotlight cones.
        expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(10);
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
        const base = distanceOf(setup({ zoom: 1 }).camera);
        expect(distanceOf(setup({ zoom: 2 }).camera)).toBeCloseTo(base / 2);
    });
});

describe('setCharacter', () => {
    it.each([16 / 9, 9 / 16])('centers the model at the origin and frames it fully at aspect %f', (aspect) => {
        const { scene, camera, dancing } = setup({ autoOrbit: false }, aspect);
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
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
        dancing.setCharacter(model, makeDances());
        for (let i = 0; i < 200; i++) {
            dancing.update(makeFrame({ dt: 0.05, settings: settings({ autoOrbit: true, orbitSpeed: 2 }) }));
            if (i > 15) expectBoxInView(modelBox(model), camera);
        }
    });

    it('moves the LED floor to the feet', () => {
        const { scene, dancing } = setup();
        const { model } = makeModel();
        const floor = scene.children.find((child) => (child as THREE.InstancedMesh).isInstancedMesh)!;
        const before = floor.position.y;
        dancing.setCharacter(model, makeDances());
        // The makeModel rig is 3 m tall, taller than the nominal dancer, so the feet move down.
        expect(floor.position.y).toBeLessThan(before);
        expect(floor.position.y).toBeGreaterThan(-3);
        expect(floor.position.y).toBeLessThan(0);
    });

    it('clones the materials, so the input model keeps its colors, and tints Skin only', () => {
        const { dancing } = setup({ bodyColor: '#ff0000' });
        const { model, materials } = makeModel();
        dancing.setCharacter(model, makeDances());
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
        dancing.setCharacter(model, makeDances());
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#808080' }) }));
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ffffff' }) }));
        const main = (model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(main.color.getHexString()).toBe(new THREE.Color('#808080').getHexString());
    });

    it('applies a new tint to the next character', () => {
        const { dancing } = setup();
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#00ff00' }) }));
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#00ff00' }) }));
        const main = (model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(main.color.r).toBeCloseTo(0);
    });

    it('curls the hands once per load, with or without dances', () => {
        const bones = ['root', 'finger2-1L'];
        for (const dances of [makeDances(), undefined]) {
            const { dancing } = setup();
            const { model } = makeModel(bones);
            const finger = model.getObjectByName('finger2-1L')!;
            dancing.setCharacter(model, dances);
            const curled = finger.quaternion.clone();
            expect(curled.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.1);
            run(dancing, 5, () => makeFrame({ dt: 0.1 }));
            expect(finger.quaternion.equals(curled)).toBe(true);
        }
    });

    it('keeps the rest pose, without a mixer, when no dance loaded', () => {
        const { dancing } = setup();
        const still = makeModel();
        dancing.setCharacter(still.model);
        expect(inner(dancing).danceActions).toHaveLength(0);
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
        expect(() => dancing.setCharacter(model, makeDances())).not.toThrow();
        dancing.update(makeFrame({ settings: settings({ bodyColor: '#ff0000' }) }));
    });

    it('fades the model in over FADE_IN_SECONDS', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
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
        dancing.setCharacter(first.model, makeDances());
        const clonedMaterial = (first.model.children[0] as THREE.Mesh).material as THREE.Material;
        const disposeMaterial = vi.spyOn(clonedMaterial, 'dispose');

        const second = makeModel();
        dancing.setCharacter(second.model, makeDances());
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
        const { camera, dancing } = setup({ zoom: 1 });
        dancing.update(makeFrame({ settings: settings({ zoom: 1 }) }));
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
        dancing.setCharacter(model, makeDances());
        const before = clipPhase(dancing);
        run(dancing, 30, () => makeFrame());
        expect(clipPhase(dancing)).not.toBe(before);
    });

    it('converges the beat slot to the beat phase with a confident locked rhythm', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
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
        // 120 BPM normalizes to itself and is the native tempo; the calm dance's loop is eight beats.
        const slot = (clipPhase(dancing) * 8) % 1;
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
        fast.dancing.setCharacter(model, makeDances());
        run(fast.dancing, 600, () => makeFrame({ rhythm }));
        const unwrapped = (camera: THREE.PerspectiveCamera) => Math.abs(azimuthOf(camera));
        expect(unwrapped(fast.camera)).not.toBeCloseTo(unwrapped(unknown.camera), 3);
    });

    it('clamps huge frame steps', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
        dancing.update(makeFrame({ dt: 100 }));
        expect(clipPhase(dancing)).toBeLessThan(0.1);
        dancing.update(makeFrame({ dt: -1 }));
    });
});

describe('dances', () => {
    const lockedButNoBar = (): RhythmState => {
        const rhythm = lockedRhythm(0.3);
        rhythm.meterConfidence = 0;
        return rhythm;
    };
    const noOrbit = () => settings({ autoOrbit: false });

    function loaded(ids?: readonly DanceId[]) {
        const rig = setup({ autoOrbit: false });
        const { model } = makeModel();
        rig.dancing.setCharacter(model, makeDances(ids));
        return { ...rig, model };
    }

    // An unlocked 120 BPM rhythm whose beat count follows `frame` (a beat every 30 frames): every fourth beat is a bar
    // line for the director.
    function ticking(frame: number, songChangeCount = 0): RhythmState {
        const rhythm = createRhythmState();
        rhythm.beatCount = Math.floor(frame / 30);
        rhythm.songChangeCount = songChangeCount;
        return rhythm;
    }

    function step(dancing: DancingCharacterScene, frame: number, selection?: string, songs = 0): void {
        dancing.update(makeFrame({ rhythm: ticking(frame, songs), settings: noOrbit(), danceSelection: selection }));
    }

    it('plays every loaded dance as a looping action, the calm one at full weight', () => {
        const { dancing } = loaded();
        expect(inner(dancing).danceActions).toHaveLength(DANCES.length);
        for (const action of inner(dancing).danceActions) {
            expect(action.loop).toBe(THREE.LoopRepeat);
            expect(action.isRunning()).toBe(true);
        }
        expect(inner(dancing).danceIds).toEqual(DANCES.map((dance) => dance.id));
        expect(weightsOf(dancing)).toEqual({ lambada: 1, twist: 0, 'cabbage-patch': 0, salsa: 0 });
        expect(CALM_DANCE_ID).toBe('lambada');
    });

    it('starts on the first loaded dance when the calm one is missing', () => {
        const { dancing } = loaded(['salsa', 'twist']);
        expect(inner(dancing).danceIds).toEqual(['twist', 'salsa']);
        expect(weightsOf(dancing)).toEqual({ twist: 1, salsa: 0 });
    });

    it('keeps the full pose weight in the calm state: the dance never blends toward the rest pose', () => {
        const { dancing } = loaded();
        run(dancing, 300, () => makeFrame({ settings: noOrbit() }));
        expect(weightsOf(dancing).lambada).toBe(1);
        // The club still follows the dance weight, which eases toward its calm value.
        expect(dancing.timingState.danceWeight).toBeCloseTo(CALM_DANCE_WEIGHT, 2);
        run(dancing, 300, () => makeFrame({ rhythm: lockedButNoBar(), settings: noOrbit() }));
        expect(weightsOf(dancing).lambada).toBe(1);
        expect(dancing.timingState.danceWeight).toBeCloseTo(1, 2);
    });

    it('reads every action from one clock: time modulo the clip length, wrapping at the longest clip', () => {
        const { dancing } = loaded();
        for (let frame = 0; frame < 600; frame++) {
            dancing.update(makeFrame({ rhythm: lockedRhythm(((frame / 60) * 0.7 + 0.3) % 1), settings: noOrbit() }));
            const clock = inner(dancing).danceTime;
            expect(clock).toBeGreaterThanOrEqual(0);
            expect(clock).toBeLessThan(DANCE_CLOCK_SECONDS);
            for (const dance of DANCES) {
                const length = dance.beats * 0.5;
                expect(actionOf(dancing, dance.id).time).toBeCloseTo(clock % length, 9);
            }
        }
    });

    it('switches to a chosen dance only on the next bar line, and fades over one beat', () => {
        const { dancing } = loaded();
        // Four beats (120 frames) of the first bar: nothing switches before the bar line, wherever the choice comes in.
        for (let frame = 0; frame < 119; frame++) step(dancing, frame, frame < 10 ? CALM_DANCE_ID : 'salsa');
        expect(weightsOf(dancing)).toEqual({ lambada: 1, twist: 0, 'cabbage-patch': 0, salsa: 0 });

        // The fade begins on the fourth beat, and weights always sum to 1, rising and falling steadily over 30 frames.
        let previous = 0;
        let frame = 119;
        for (let i = 0; i < 40; i++, frame++) {
            step(dancing, frame, 'salsa');
            const weights = weightsOf(dancing);
            expect(weights.lambada + weights.salsa).toBeCloseTo(1, 9);
            expect(weights.twist + weights['cabbage-patch']).toBe(0);
            expect(weights.salsa).toBeGreaterThanOrEqual(previous);
            previous = weights.salsa;
            // Finished within a beat (30 frames of 1/60 s at time scale 1), not before.
            if (i === 10) expect(weights.salsa).toBeGreaterThan(0.2);
            if (i === 10) expect(weights.salsa).toBeLessThan(0.5);
        }
        expect(weightsOf(dancing)).toEqual({ lambada: 0, twist: 0, 'cabbage-patch': 0, salsa: 1 });
    });

    it('fades over 0.5 s of clip time: 30 frames at time scale 1, the 1 s cap at the slowest speed', () => {
        const fadeFrames = (danceSpeed: number) => {
            const rig = setup({ autoOrbit: false, danceSpeed });
            rig.dancing.setCharacter(makeModel().model, makeDances());
            const values = settings({ autoOrbit: false, danceSpeed });
            let count = 0;
            for (let frame = 0; frame < 400; frame++) {
                rig.dancing.update(makeFrame({ rhythm: ticking(frame), settings: values, danceSelection: 'salsa' }));
                const weight = weightsOf(rig.dancing).salsa;
                if (weight > 0 && weight < 1) count++;
            }
            return count;
        };
        expect(Math.abs(fadeFrames(1) - 30)).toBeLessThanOrEqual(1);
        expect(Math.abs(fadeFrames(0.5) - 60)).toBeLessThanOrEqual(2);
    });

    it('keeps the phase continuous across a switch between a 4-beat and an 8-beat dance, and back', () => {
        const { dancing } = loaded();
        const times: number[] = [];
        const record = (): void => {
            // Position inside the bar (2 s) read from whichever clip is at full weight (a fade reads both).
            const { danceIds, danceActions } = inner(dancing);
            for (let i = 0; i < danceIds.length; i++) {
                if (danceActions[i].weight > 0) {
                    expect(danceActions[i].time % 2).toBeCloseTo(inner(dancing).danceTime % 2, 9);
                }
            }
            times.push(inner(dancing).danceTime);
        };
        let frame = 0;
        // 8 -> 4 beats (lambada to salsa), then back (salsa to lambada), each on a bar line.
        for (; frame < 125; frame++) {
            step(dancing, frame, 'salsa');
            record();
        }
        expect(weightsOf(dancing).lambada).toBeLessThan(1);
        for (; frame < 245; frame++) {
            step(dancing, frame, CALM_DANCE_ID);
            record();
        }
        expect(weightsOf(dancing).lambada).toBeGreaterThan(0);
        for (; frame < 300; frame++) {
            step(dancing, frame, CALM_DANCE_ID);
            record();
        }
        expect(weightsOf(dancing)).toEqual({ lambada: 1, twist: 0, 'cabbage-patch': 0, salsa: 0 });
        // At time scale 1 the clock advanced by exactly one frame every frame, switches included, wrapping at 4 s.
        for (let i = 1; i < times.length; i++) {
            const delta = (times[i] - times[i - 1] + DANCE_CLOCK_SECONDS) % DANCE_CLOCK_SECONDS;
            expect(delta).toBeCloseTo(1 / 60, 9);
        }
    });

    it('rotates to the next dance in Auto after a song change, on the next bar line', () => {
        const { dancing } = loaded();
        for (let frame = 0; frame < 60; frame++) step(dancing, frame, AUTO_DANCE);
        // The song changes mid-bar: nothing moves until the bar line at frame 120.
        for (let frame = 60; frame < 119; frame++) step(dancing, frame, undefined, 1);
        expect(weightsOf(dancing).lambada).toBe(1);
        for (let frame = 119; frame < 160; frame++) step(dancing, frame, undefined, 1);
        expect(weightsOf(dancing)).toEqual({ lambada: 0, twist: 1, 'cabbage-patch': 0, salsa: 0 });
    });

    it('counts a locked meter by downbeats', () => {
        const { dancing } = loaded();
        const frameAt = (downbeats: number) => {
            const rhythm = lockedRhythm(0.5);
            rhythm.downbeatCount = downbeats;
            dancing.update(makeFrame({ rhythm, settings: noOrbit(), danceSelection: 'twist' }));
        };
        frameAt(0);
        frameAt(0);
        expect(weightsOf(dancing).twist).toBe(0);
        frameAt(1);
        frameAt(1);
        expect(weightsOf(dancing).twist).toBeGreaterThan(0);
    });

    it('restartDance rewinds the clock and the director, keeping the dance, the weights and the dance weight', () => {
        const { dancing } = loaded();
        run(dancing, 90, () => makeFrame({ rhythm: lockedRhythm(0.3), settings: noOrbit(), danceSelection: 'salsa' }));
        const weight = dancing.timingState.danceWeight;
        const weights = weightsOf(dancing);
        expect(inner(dancing).danceTime).toBeGreaterThan(0);
        expect(dancing.timingState.locked).toBe(true);

        dancing.restartDance();

        expect(inner(dancing).danceTime).toBe(0);
        for (const action of inner(dancing).danceActions) expect(action.time).toBe(0);
        expect(weightsOf(dancing)).toEqual(weights);
        expect(dancing.timingState.locked).toBe(false);
        expect(dancing.timingState.timeScale).toBe(CALM_TIME_SCALE);
        expect(dancing.timingState.danceWeight).toBe(weight);
    });

    it('restartDance does nothing to a scene without dances', () => {
        const { dancing } = setup();
        expect(() => dancing.restartDance()).not.toThrow();
        const bare = setup();
        bare.dancing.setCharacter(makeModel().model, new Map());
        expect(() => bare.dancing.restartDance()).not.toThrow();
    });

    it('renders and frames a model with an empty dance map, in its rest pose, ignoring the selection', () => {
        const rig = setup({ autoOrbit: false });
        const { model } = makeModel();
        const root = model.getObjectByName('root')!;
        const rest = root.position.toArray();
        rig.dancing.setCharacter(model, new Map());
        run(rig.dancing, 120, () =>
            makeFrame({ rhythm: lockedRhythm(0.3), settings: noOrbit(), danceSelection: 'salsa' }),
        );
        expect(root.position.toArray()).toEqual(rest);
        expect(model.scale.y).toBeGreaterThan(0.5);
        expect(() => rig.dancing.dispose()).not.toThrow();
    });

    it('takes the first dance of a partial map and never fades to one that did not load', () => {
        const { dancing } = loaded(['cabbage-patch']);
        for (let frame = 0; frame < 300; frame++) step(dancing, frame, 'twist');
        expect(weightsOf(dancing)).toEqual({ 'cabbage-patch': 1 });
    });

    it('measures the framing box over every clip, each alone at full weight, then restores the active dance', () => {
        const seen: number[][] = [];
        const rig = setup();
        const { model } = makeModel();
        const original = THREE.AnimationMixer.prototype.setTime;
        vi.spyOn(THREE.AnimationMixer.prototype, 'setTime').mockImplementation(function (
            this: THREE.AnimationMixer,
            time: number,
        ) {
            seen.push(inner(rig.dancing).danceActions.map((action) => action.weight));
            return original.call(this, time);
        });
        rig.dancing.setCharacter(model, makeDances());
        // Four samples per beat of each clip: 8 + 8 + 4 + 4 beats.
        expect(seen).toHaveLength(24 * 4);
        for (const weights of seen) expect(weights.filter((weight) => weight === 1)).toHaveLength(1);
        for (let clip = 0; clip < 4; clip++) {
            const count = seen.filter((weights) => weights[clip] === 1).length;
            expect(count).toBe(DANCES[clip].beats * 4);
        }
        expect(weightsOf(rig.dancing)).toEqual({ lambada: 1, twist: 0, 'cabbage-patch': 0, salsa: 0 });
        expect(inner(rig.dancing).danceTime).toBe(0);
        expect(actionOf(rig.dancing, 'lambada').time).toBe(0);
    });

    it('frees the mixer and the actions on dispose, and again when a new character replaces the first', () => {
        const { dancing } = loaded();
        dancing.dispose();
        expect(inner(dancing).danceActions).toHaveLength(0);

        const second = setup();
        second.dancing.setCharacter(makeModel().model, makeDances());
        const uncache = vi.spyOn(THREE.AnimationMixer.prototype, 'uncacheRoot');
        second.dancing.setCharacter(makeModel().model, makeDances(['salsa']));
        expect(uncache).toHaveBeenCalledTimes(1);
        expect(inner(second.dancing).danceIds).toEqual(['salsa']);
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
    // Sixteen beats of kicks right on the beat open the bass gate and let its slow fade-in finish.
    const WARM_UP_BEATS = 16;
    const kickAt = (frame: number) => (frame % 30 < 4 ? 1 : 0);

    // The club adds its own point lights first; the rim light is the last one.
    function rimOf(scene: THREE.Scene) {
        return scene.children.filter((child) => (child as THREE.PointLight).isPointLight).at(-1) as THREE.PointLight;
    }
    // The rim light's intensity with no bass, read from a fresh scene.
    const rimRest = () => rimOf(setup().scene).intensity;

    // Plays `beats` beats with `bassAt(frame)` from frame `from`, then returns where it stopped.
    function play(
        dancing: DancingCharacterScene,
        from: number,
        frames: number,
        bassAt: (frame: number) => number,
        overrides: Partial<DancingCharacterSettings>,
    ): number {
        for (let i = from; i < from + frames; i++) {
            dancing.update(makeFrame({ bass: bassAt(i), rhythm: beatRhythm(i), settings: settings(overrides) }));
        }
        return from + frames;
    }

    // A dancer whose bass gate has locked onto kicks on the beat, stopped `into` frames after the start of a beat
    // (3 is the peak of a bump, 20 is late in the beat when the bump has faded).
    function pulsing(overrides: Partial<DancingCharacterSettings> = {}, into = 3) {
        const rig = setup(overrides);
        const { model } = makeModel();
        rig.dancing.setCharacter(model, makeDances());
        play(rig.dancing, 0, 30 * WARM_UP_BEATS + into, kickAt, overrides);
        // The same run with no kicks gives the fitted distance the camera would be at without the bass.
        const quiet = setup(overrides);
        quiet.dancing.setCharacter(makeModel().model, makeDances());
        play(quiet.dancing, 0, 30 * WARM_UP_BEATS + into, () => 0, overrides);
        return { ...rig, model, rim: rimOf(rig.scene), rest: distanceOf(quiet.camera) };
    }

    it('does nothing without kicks', () => {
        const rig = setup({ autoOrbit: false });
        const { model } = makeModel();
        rig.dancing.setCharacter(model, makeDances());
        play(rig.dancing, 0, 30 * WARM_UP_BEATS, () => 0, { autoOrbit: false });
        expect(model.scale.toArray()).toEqual([1, 1, 1]);
        expect(rimOf(rig.scene).intensity).toBe(rimRest());
    });

    it('keeps the model its size and on the floor, flashes the rim light and pulls the camera in on the beat', () => {
        const { model, rim, camera, rest } = pulsing({ autoOrbit: false });
        expect(model.scale.toArray()).toEqual([1, 1, 1]);
        expect(rim.intensity).toBeGreaterThan(rimRest() + 20);
        // The default camera bump (0.4) at a full pulse pulls in by a tenth of the distance.
        expect(distanceOf(camera) / rest).toBeLessThan(1 - 0.5 * 0.4 * DOLLY_MAX_FRACTION);
    });

    it('lets the bump fade between beats', () => {
        const peak = pulsing({ autoOrbit: false }, 3);
        const late = pulsing({ autoOrbit: false }, 20);
        expect(late.rim.intensity).toBeLessThan(peak.rim.intensity);
        expect(distanceOf(late.camera)).toBeGreaterThan(distanceOf(peak.camera));
    });

    it('keeps pulsing on the beat through a stretch of masked kicks', () => {
        const overrides = { autoOrbit: false };
        const rig = pulsing(overrides, 0);
        // Eight beats with no kick heard at all: the pulse carries on from the beat clock.
        const end = play(rig.dancing, 30 * WARM_UP_BEATS, 30 * 8 + 3, () => 0, overrides);
        expect(end).toBeGreaterThan(0);
        expect(rig.rim.intensity).toBeGreaterThan(rimRest() + 20);
    });

    it('fades the bass out slowly once the kicks have been gone for a long time', () => {
        const overrides = { autoOrbit: false };
        const rig = pulsing(overrides, 0);
        play(rig.dancing, 30 * WARM_UP_BEATS, 30 * 40, () => 0, overrides);
        expect(rig.rim.intensity).toBe(rimRest());
        expect(distanceOf(rig.camera)).toBeCloseTo(rig.rest);
    });

    it('ignores a stray bass bump while no tempo is locked', () => {
        const { camera, scene, dancing } = setup({ autoOrbit: false });
        dancing.setCharacter(makeModel().model, makeDances());
        const rim = rimOf(scene);
        run(dancing, 60, () => makeFrame({ settings: settings({ autoOrbit: false }) }));
        const rest = distanceOf(camera);
        const rimRest = rim.intensity;
        run(dancing, 30, () => makeFrame({ bass: 1, settings: settings({ autoOrbit: false }) }));
        expect(distanceOf(camera)).toBeCloseTo(rest);
        expect(rim.intensity).toBe(rimRest);
    });

    it('writes nothing to the camera while it is unlocked, whatever the bass', () => {
        const { camera, dancing } = pulsing({ autoOrbit: false });
        camera.position.set(1, 2, 3);
        dancing.update(makeFrame({ bass: 1, cameraLocked: false, settings: settings({ autoOrbit: false }) }));
        expect(camera.position.toArray()).toEqual([1, 2, 3]);
    });

    it('does not move the camera when the camera bump is 0 but still flashes the rim light', () => {
        const { rim, camera, rest } = pulsing({ bassCameraStrength: 0, autoOrbit: false });
        expect(distanceOf(camera)).toBeCloseTo(rest);
        expect(rim.intensity).toBeGreaterThan(rimRest() + 20);
    });

    it('keeps the rim light steady when the bass glow is 0 but still bumps the camera', () => {
        const { rim, camera, rest } = pulsing({ bassStrength: 0, autoOrbit: false });
        expect(rim.intensity).toBe(rimRest());
        expect(distanceOf(camera)).toBeLessThan(rest);
    });
});

describe('bass gate telemetry', () => {
    it('exposes the gate output, tempo lock and state after an update', () => {
        const { dancing } = setup();
        expect(dancing.gateOutput).toBe(0);
        expect(dancing.gateTempoLocked).toBe(false);

        dancing.update(makeFrame({ bass: 1, rhythm: beatRhythm(0) }));

        expect(dancing.gateOutput).toBe(0);
        expect(dancing.bassGate.open).toBe(false);
        expect(dancing.bassGate.initialized).toBe(true);
    });
});

describe('dance telemetry', () => {
    it('shows a clip phase of 0 and no meter lock before a rig is loaded', () => {
        const { dancing } = setup();
        dancing.update(makeFrame());
        expect(dancing.clipPhase).toBe(0);
        expect(dancing.timingState.meterLocked).toBe(false);
        expect(dancing.timing.phaseNudge).toBe(0);
    });

    it('passes its clip position to the timing and exposes the result and meter lock', () => {
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
        run(dancing, 30, () => makeFrame());
        // The value given to the timing is the clip position read just before the update advanced it.
        expect(dancing.clipPhase).toBeGreaterThan(0);
        expect(dancing.clipPhase).toBeLessThan(1);
        expect(Number.isFinite(dancing.timing.timeScale)).toBe(true);
        expect(Number.isFinite(dancing.timing.phaseNudge)).toBe(true);
        expect(dancing.timingState.meterLocked).toBe(false);
    });
});

describe('colors', () => {
    // The club adds its own point lights first; the rim light is the last one.
    const rimOf = (scene: THREE.Scene) =>
        scene.children.filter((c) => (c as THREE.PointLight).isPointLight).at(-1) as THREE.PointLight;
    const hex = (color: string) => new THREE.Color(color).getHexString();

    it('uses the static accent for the club and the rim light when the rainbow is off, and re-applies on change', () => {
        const setFloor = vi.spyOn(ClubSet.prototype, 'setFloorColor');
        const setAccent = vi.spyOn(ClubSet.prototype, 'setAccentColor');
        const values = { accentRainbow: false, accentColor: '#00ff00', floorColor: '#0000ff' };
        const { scene, dancing } = setup(values);
        expect(rimOf(scene).color.getHexString()).toBe(hex('#00ff00'));
        expect(setAccent.mock.lastCall![0].getHexString()).toBe(hex('#00ff00'));
        expect(setFloor).toHaveBeenLastCalledWith('#0000ff');
        const floorCalls = setFloor.mock.calls.length;

        // An unchanged floor color does no floor work.
        dancing.update(makeFrame({ settings: settings(values) }));
        expect(setFloor).toHaveBeenCalledTimes(floorCalls);

        dancing.update(makeFrame({ settings: settings({ ...values, accentColor: '#ff0000', floorColor: '#ffffff' }) }));
        expect(setFloor).toHaveBeenLastCalledWith('#ffffff');
        expect(setAccent.mock.lastCall![0].getHexString()).toBe(hex('#ff0000'));
        expect(rimOf(scene).color.getHexString()).toBe(hex('#ff0000'));
    });

    it('cycles the accent through the hues in rainbow mode at the rainbow speed', () => {
        const setAccent = vi.spyOn(ClubSet.prototype, 'setAccentColor');
        const { scene, dancing } = setup();
        const hsl = { h: 0, s: 0, l: 0 };
        const hueAfter = (seconds: number, speed: number) => {
            for (let t = 0; t < seconds; t += 0.05) {
                dancing.update(makeFrame({ dt: 0.05, settings: settings({ rainbowSpeed: speed }) }));
            }
            return rimOf(scene).color.getHSL(hsl).h;
        };
        const start = hueAfter(0, 0.1);
        // A quarter of a cycle in 2.5 s at 0.1 cycles per second, and the club gets the same color as the rim light.
        const quarter = hueAfter(2.5, 0.1);
        expect(quarter - start).toBeCloseTo(0.25, 1);
        expect(setAccent.mock.lastCall![0].getHexString()).toBe(rimOf(scene).color.getHexString());
        // Twice the speed covers twice the hue in the same time.
        const before = rimOf(scene).color.getHSL(hsl).h;
        const after = hueAfter(1, 0.2);
        expect(after - before).toBeCloseTo(0.2, 1);
    });

    it('switches from the rainbow to the static accent and back', () => {
        const { scene, dancing } = setup();
        dancing.update(makeFrame({ dt: 1, settings: settings() }));
        dancing.update(makeFrame({ settings: settings({ accentRainbow: false, accentColor: '#123456' }) }));
        expect(rimOf(scene).color.getHexString()).toBe(hex('#123456'));
        dancing.update(makeFrame({ dt: 1, settings: settings() }));
        expect(rimOf(scene).color.getHexString()).not.toBe(hex('#123456'));
        dancing.update(makeFrame({ settings: settings({ accentRainbow: false, accentColor: '#123456' }) }));
        expect(rimOf(scene).color.getHexString()).toBe(hex('#123456'));
    });
});

describe('club', () => {
    it('feeds the club the beat phase, bass and dance weight each frame', () => {
        const update = vi.spyOn(ClubSet.prototype, 'update');
        const { dancing } = setup();
        const { model } = makeModel();
        dancing.setCharacter(model, makeDances());
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
        dancing.setCharacter(makeModel(['root']).model, new Map());
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
        dancing.setCharacter(model, makeDances());
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

    // The real dance clips, parsed from the dances file and kept only if the loader's checks accept them.
    async function parseDances() {
        const file = readFileSync(new URL('./assets/MakeHumanDances.glb', import.meta.url));
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        return pickDances((await new GLTFLoader().parseAsync(bytes, '')).animations);
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

    it('loads, dances, frames fully at both aspects and disposes', async () => {
        for (const aspect of [16 / 9, 9 / 16]) {
            const scene = new THREE.Scene();
            const camera = makeCamera(aspect);
            const dancing = new DancingCharacterScene(scene, camera, settings());
            const model = await parse();
            dancing.setCharacter(model, await parseDances());
            expect(inner(dancing).danceActions).toHaveLength(4);
            // Past the fade-in, locked to a bar.
            run(dancing, 12, () => makeFrame({ dt: 0.1, rhythm: lockedRhythm(0.3) }));
            expect(modelBox(model).getCenter(new THREE.Vector3()).length()).toBeLessThan(0.2);
            for (let i = 0; i < 100; i++) {
                const rhythm = lockedRhythm((i * 0.05 * 0.5) % 1);
                dancing.update(makeFrame({ dt: 0.05, rhythm, settings: settings({ orbitSpeed: 2 }) }));
                expectBoxInView(modelBox(model), camera);
            }
            expect(weightsOf(dancing)[CALM_DANCE_ID]).toBe(1);
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

    it('accepts all four real clips with the loader checks', async () => {
        expect([...(await parseDances()).keys()]).toEqual(DANCES.map((dance) => dance.id));
    });

    it('has dances that fit NOMINAL_CHARACTER_SIZE, the box over every clip', async () => {
        const model = await parse();
        const { dancing } = setup();
        dancing.setCharacter(model, await parseDances());
        // The scene keeps the box it measured; read it back rather than re-deriving the sampling.
        const box = (dancing as unknown as { framingBox: THREE.Box3 }).framingBox;
        const size = box.getSize(new THREE.Vector3());
        expect(Math.abs(size.x - NOMINAL_CHARACTER_SIZE.width)).toBeLessThan(0.06);
        expect(Math.abs(size.y - NOMINAL_CHARACTER_SIZE.height)).toBeLessThan(0.06);
        expect(Math.abs(size.z - NOMINAL_CHARACTER_SIZE.depth)).toBeLessThan(0.06);
        dancing.dispose();
    });
});
