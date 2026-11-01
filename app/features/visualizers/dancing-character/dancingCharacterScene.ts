import * as THREE from 'three';
import type { RhythmState } from '~/features/rhythm/types';
import { disposeScene } from '~/lib/three/disposeScene';
import {
    BASS_LIFT,
    BASS_SQUASH,
    BODY_MATERIAL_NAMES,
    CAMERA_ELEVATION,
    DANCE_CLIP_NAME,
    FADE_IN_SECONDS,
    FALLBACK_BACKGROUND,
    MAX_FRAME_DT,
    MAX_ZOOM_KICK,
    NOMINAL_CHARACTER_SIZE,
} from './dancingCharacterConfig';
import type { DancingCharacterSettings } from './dancingCharacterControls';
import { computeFraming } from './dancingCharacterFraming';
import { orbitAngularSpeed } from './dancingCharacterOrbit';
import {
    computeDanceTiming,
    createDanceTimingState,
    type DanceTimingInput,
    type DanceTimingOutput,
} from './dancingCharacterSync';

export interface DancingCharacterFrame {
    // Seconds since the last frame.
    dt: number;
    // Read only; the caller has already called tracker.updatePhase().
    rhythm: RhythmState;
    // 0..1 from DancingCharacterBassPulse (0 when there is no source).
    bass: number;
    settings: DancingCharacterSettings;
    cameraLocked: boolean;
}

// Look-and-feel numbers that only this scene uses; the shared tuning constants are in dancingCharacterConfig.ts.

// Floor disc radius: wide enough to fill the lower part of the view at any orbit angle without showing its edge.
const FLOOR_RADIUS = 6;
// The floor and ring sit this far above the feet so they never z-fight with the soles or with each other.
const FLOOR_LIFT = 0.01;
const RING_LIFT = 0.02;
// The bass ring starts just outside the dancer's feet and grows outward with the bass.
const RING_INNER_RADIUS = 1;
const RING_OUTER_RADIUS = 1.15;
const RING_GROWTH = 1.5;
const RING_MAX_OPACITY = 0.8;
// Rim light: a dim base so the accent color always tints the edges, plus a flash on the bass (point light units).
const RIM_BASE_INTENSITY = 12;
const RIM_FLASH_INTENSITY = 40;
// The bass bump setting goes up to 2, so the pulse is bounded at that.
const MAX_BASS_BUMP = 2;
// Poses sampled across the clip to find the box the camera must fit.
const MEASURE_SAMPLES = 16;
// Smallest scale during the fade-in; zero would make the model matrix singular.
const MIN_FADE_SCALE = 0.001;

interface TintedMaterial {
    material: THREE.MeshStandardMaterial;
    // The material's color as shipped, so the body color multiplies it instead of compounding frame after frame.
    original: THREE.Color;
}

function isStandardMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
    return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
}

export class DancingCharacterScene {
    readonly lookTarget = new THREE.Vector3(0, 0, 0);

    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly fallbackBackground = new THREE.Color(FALLBACK_BACKGROUND);
    private readonly lights: THREE.Object3D[] = [];
    private readonly rimLight: THREE.PointLight;
    private readonly floor: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
    private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

    private skybox: THREE.Texture | null = null;

    // Camera state.
    private readonly framingBox = new THREE.Box3();
    private readonly framingCenter = new THREE.Vector3();
    private azimuth = 0;
    private orbitSpeed = 0;
    private distance = 1;
    private distanceZoom = NaN;
    private distanceAspect = NaN;
    private zoom: number;

    // Character state.
    private model: THREE.Group | null = null;
    private mixer: THREE.AnimationMixer | null = null;
    private action: THREE.AnimationAction | null = null;
    private clipDuration = 1;
    private baseScale = 1;
    private baseX = 0;
    private baseY = 0;
    private baseZ = 0;
    private fadeElapsed = 0;
    private tinted: TintedMaterial[] = [];

    // Per-frame scratch, preallocated so update() allocates nothing.
    private readonly timingState = createDanceTimingState();
    private readonly timingInput: DanceTimingInput = {
        bpm: 0,
        tempoConfidence: 0,
        beatPhase: undefined,
        songChangeCount: 0,
        clipPhase: 0,
        danceSpeed: 1,
        dt: 0,
    };
    private readonly timingOutput: DanceTimingOutput = { timeScale: 1, phaseNudge: 0, normalizedBpm: undefined };
    private readonly bodyTint = new THREE.Color();
    private lastBodyColor = '';
    private lastAccentColor = '';
    private lastFloorColor = '';
    private disposed = false;

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, settings: DancingCharacterSettings) {
        this.scene = scene;
        this.camera = camera;
        this.zoom = settings.zoom;

        scene.background = this.fallbackBackground;

        const hemisphere = new THREE.HemisphereLight(0xffffff, 0x445566, 1.2);
        const key = new THREE.DirectionalLight(0xffffff, 2);
        key.position.set(3, 6, 4);
        // Behind and to the side of the default view, so the accent color outlines the dancer.
        this.rimLight = new THREE.PointLight(0xffffff, RIM_BASE_INTENSITY, 0, 2);
        this.rimLight.position.set(-2.5, 1.5, -2.5);
        this.lights.push(hemisphere, key, this.rimLight);
        scene.add(hemisphere, key, this.rimLight);

        this.floor = new THREE.Mesh(
            new THREE.CircleGeometry(FLOOR_RADIUS, 48).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
        );
        this.ring = new THREE.Mesh(
            new THREE.RingGeometry(RING_INNER_RADIUS, RING_OUTER_RADIUS, 64).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            }),
        );
        this.ring.visible = false;
        scene.add(this.floor, this.ring);

        // Until a model loads, frame a box the size of the robot so the camera starts in a sensible place.
        const { width, height, depth } = NOMINAL_CHARACTER_SIZE;
        this.framingBox.min.set(-width / 2, -height / 2, -depth / 2);
        this.framingBox.max.set(width / 2, height / 2, depth / 2);
        this.placeFloor(-height / 2);

        this.applyColors(settings);
        this.refreshDistance();
        this.writeCameraPose(0);
    }

    setSkybox(texture: THREE.Texture | null): void {
        this.skybox?.dispose();
        this.skybox = texture;
        // A missing texture keeps the flat color, so the page still looks intentional.
        this.scene.background = texture ?? this.fallbackBackground;
    }

    setCharacter(model: THREE.Group, clips: THREE.AnimationClip[]): void {
        this.disposeCharacter();

        // The loader's materials may be shared with the caller, so tint copies, never the originals.
        this.tinted = [];
        model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            const cloned = Array.isArray(mesh.material)
                ? mesh.material.map((material) => material.clone())
                : mesh.material.clone();
            mesh.material = cloned;
            for (const material of Array.isArray(cloned) ? cloned : [cloned]) {
                if (
                    isStandardMaterial(material) &&
                    (BODY_MATERIAL_NAMES as readonly string[]).includes(material.name)
                ) {
                    this.tinted.push({ material, original: material.color.clone() });
                }
            }
        });
        this.lastBodyColor = '';

        this.model = model;
        this.scene.add(model);

        const clip = clips.find((candidate) => candidate.name === DANCE_CLIP_NAME) ?? clips[0];
        if (clip) {
            this.mixer = new THREE.AnimationMixer(model);
            this.action = this.mixer.clipAction(clip);
            this.action.setLoop(THREE.LoopRepeat, Infinity);
            this.action.play();
            this.clipDuration = clip.duration;
        }

        // Measure at the model's own scale across the whole dance (the arms swing outside the bind pose), then move
        // the framing center to the world origin, which is where the orbit controls look.
        model.position.set(0, 0, 0);
        this.baseScale = model.scale.x;
        const box = this.measureDance(model);
        const height = box.max.y - box.min.y;
        computeFraming(box, this.camera.fov, this.camera.aspect, this.zoom, this.framingCenter);
        this.baseX = -this.framingCenter.x;
        this.baseY = -this.framingCenter.y;
        this.baseZ = -this.framingCenter.z;
        box.translate(this.framingCenter.negate());
        this.placeFloor(-height / 2);
        this.distanceZoom = NaN;

        this.timingState.locked = false;
        this.fadeElapsed = 0;
        this.applyModelTransform(0, 0);
        this.refreshDistance();
    }

    // Unions the model's box over evenly spaced moments of the clip into `framingBox`, then rewinds to the start. Runs
    // once per load, so the temporary box is fine.
    private measureDance(model: THREE.Group): THREE.Box3 {
        const box = this.framingBox;
        const samples = this.mixer ? MEASURE_SAMPLES : 1;
        const pose = new THREE.Box3();
        for (let i = 0; i < samples; i++) {
            this.mixer?.setTime((this.clipDuration * i) / samples);
            model.updateMatrixWorld(true);
            pose.setFromObject(model);
            if (i === 0) box.copy(pose);
            else box.union(pose);
        }
        // Rewinding also applies the first pose, so the model is not left in its bind pose until the next frame.
        this.mixer?.setTime(0);
        model.updateMatrixWorld(true);
        return box;
    }

    update(frame: DancingCharacterFrame): void {
        const dt = Math.min(Math.max(frame.dt, 0), MAX_FRAME_DT);
        const { settings, rhythm } = frame;
        this.zoom = settings.zoom;

        // 1. Dance.
        const timing = this.timingOutput;
        timing.normalizedBpm = undefined;
        if (this.mixer && this.action) {
            const input = this.timingInput;
            input.bpm = rhythm.bpm;
            input.tempoConfidence = rhythm.tempoConfidence;
            input.beatPhase = rhythm.beatPhase;
            input.songChangeCount = rhythm.songChangeCount;
            input.clipPhase = this.action.time / this.clipDuration;
            input.danceSpeed = settings.danceSpeed;
            input.dt = dt;
            computeDanceTiming(input, this.timingState, timing);
            // One update carries both the normal advance and the beat-phase nudge; the action's own timeScale stays 1.
            this.mixer.update(dt * timing.timeScale + timing.phaseNudge * this.clipDuration);
        }

        // 2. Bass.
        const bump = Math.min(Math.max(frame.bass * settings.bassStrength, 0), MAX_BASS_BUMP);
        const kick = bump * MAX_ZOOM_KICK;
        this.ring.visible = bump > 0;
        this.ring.material.opacity = Math.min(1, bump) * RING_MAX_OPACITY;
        this.ring.scale.setScalar(1 + bump * RING_GROWTH);
        this.rimLight.intensity = RIM_BASE_INTENSITY + bump * RIM_FLASH_INTENSITY;
        if (this.model) {
            this.fadeElapsed += dt;
            this.applyModelTransform(bump, Math.min(1, this.fadeElapsed / FADE_IN_SECONDS));
        }

        // 3. Camera. Unlocked means the orbit controls own the camera, so nothing is written and nothing advances.
        if (frame.cameraLocked) {
            this.orbitSpeed = orbitAngularSpeed(
                timing.normalizedBpm,
                settings.autoOrbit ? settings.orbitSpeed : 0,
                this.orbitSpeed,
                dt,
            );
            this.azimuth += this.orbitSpeed * dt;
            this.refreshDistance();
            this.writeCameraPose(kick);
        }

        // 4. Colors.
        this.applyColors(settings);
    }

    resize(): void {
        this.distanceAspect = NaN;
    }

    resetOrbit(): void {
        this.azimuth = 0;
        this.orbitSpeed = 0;
        this.refreshDistance();
        this.writeCameraPose(0);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposeCharacter();
        this.skybox?.dispose();
        this.skybox = null;
        this.scene.background = null;
        this.floor.geometry.dispose();
        this.floor.material.dispose();
        this.ring.geometry.dispose();
        this.ring.material.dispose();
        this.scene.remove(this.floor, this.ring, ...this.lights);
    }

    private disposeCharacter(): void {
        const model = this.model;
        if (!model) return;
        this.mixer?.stopAllAction();
        this.mixer?.uncacheRoot(model);
        model.traverse((object) => {
            if ((object as THREE.SkinnedMesh).isSkinnedMesh) (object as THREE.SkinnedMesh).skeleton.dispose();
        });
        this.scene.remove(model);
        // disposeScene only traverses and reads `environment`/`background` (absent on a Group, so skipped), but it is
        // typed for a Scene; the cast avoids changing that shared helper for one caller.
        disposeScene(model as unknown as THREE.Scene);
        this.model = null;
        this.mixer = null;
        this.action = null;
        this.tinted = [];
    }

    private placeFloor(feetY: number): void {
        this.floor.position.y = feetY + FLOOR_LIFT;
        this.ring.position.y = feetY + RING_LIFT;
    }

    // Squash and bounce, with the fade-in (a smoothstep from nearly nothing to full size) on top.
    private applyModelTransform(bump: number, fade: number): void {
        const model = this.model;
        if (!model) return;
        const scale = this.baseScale * Math.max(MIN_FADE_SCALE, fade * fade * (3 - 2 * fade));
        const wide = 1 + (bump * BASS_SQUASH) / 2;
        model.scale.set(scale * wide, scale * (1 - bump * BASS_SQUASH), scale * wide);
        model.position.set(this.baseX, this.baseY + bump * BASS_LIFT, this.baseZ);
    }

    // The fitted distance only changes with the zoom or the aspect ratio, so it is cached between frames.
    private refreshDistance(): void {
        if (this.zoom === this.distanceZoom && this.camera.aspect === this.distanceAspect) return;
        this.distance = computeFraming(
            this.framingBox,
            this.camera.fov,
            this.camera.aspect,
            this.zoom,
            this.framingCenter,
        );
        this.distanceZoom = this.zoom;
        this.distanceAspect = this.camera.aspect;
    }

    private writeCameraPose(kick: number): void {
        const distance = this.distance * (1 - kick);
        const horizontal = Math.cos(CAMERA_ELEVATION) * distance;
        this.camera.position.set(
            Math.sin(this.azimuth) * horizontal,
            Math.sin(CAMERA_ELEVATION) * distance,
            Math.cos(this.azimuth) * horizontal,
        );
        this.camera.lookAt(this.lookTarget);
    }

    // Colors change rarely, so each string is compared with the last applied one before any color work happens.
    private applyColors(settings: DancingCharacterSettings): void {
        if (settings.floorColor !== this.lastFloorColor) {
            this.lastFloorColor = settings.floorColor;
            this.floor.material.color.set(settings.floorColor);
        }
        if (settings.accentColor !== this.lastAccentColor) {
            this.lastAccentColor = settings.accentColor;
            this.ring.material.color.set(settings.accentColor);
            this.rimLight.color.set(settings.accentColor);
        }
        if (settings.bodyColor !== this.lastBodyColor) {
            this.lastBodyColor = settings.bodyColor;
            this.bodyTint.set(settings.bodyColor);
            for (const { material, original } of this.tinted) {
                material.color.copy(original).multiply(this.bodyTint);
            }
        }
    }
}
