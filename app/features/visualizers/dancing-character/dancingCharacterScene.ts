import * as THREE from 'three';
import type { RhythmState } from '~/features/rhythm/types';
import { disposeScene } from '~/lib/three/disposeScene';
import {
    ACCENT_EASE_SECONDS,
    BODY_MATERIAL_NAMES,
    CALM_DANCE_WEIGHT,
    CAMERA_ELEVATION,
    CLUB_REDUCED_MOTION_FLASH_STRENGTH,
    DANCE_CLIP_BEATS,
    DANCE_CLIP_DURATION,
    FADE_IN_SECONDS,
    MAX_FRAME_DT,
    NOMINAL_CHARACTER_SIZE,
} from './dancingCharacterConfig';
import { ClubSet } from './dancingCharacterClub';
import { buildDanceClip } from './dancingCharacterDanceClip';
import type { DancingCharacterSettings } from './dancingCharacterControls';
import { computeFraming } from './dancingCharacterFraming';
import { stepCameraDolly } from './dancingCharacterCamera';
import { createBassGateState, forgetBassline, stepBassGate } from '~/features/rhythm/bassGate';
import { orbitAngularSpeed } from './dancingCharacterOrbit';
import { computeDanceTiming, createDanceTimingResult, createDanceTimingState } from './dancingCharacterSync';

export interface DancingCharacterFrame {
    // Seconds since the last frame.
    dt: number;
    // Read only; the caller has already called tracker.updatePhase().
    rhythm: RhythmState;
    // 0..1 from BassPulse (0 when there is no source).
    bass: number;
    settings: DancingCharacterSettings;
    cameraLocked: boolean;
}

// Look-and-feel numbers that only this scene uses; the shared tuning constants are in dancingCharacterConfig.ts.

// The rainbow accent's saturation and lightness: vivid, and bright enough to read on the dark floor.
const RAINBOW_SATURATION = 0.9;
const RAINBOW_LIGHTNESS = 0.6;
// The hemisphere light is only a faint fill: the club is dark.
const HEMISPHERE_INTENSITY = 0.35;
// Rim light: a dim base so the accent color always tints the edges, plus a flash on the bass (point light units).
const RIM_BASE_INTENSITY = 12;
const RIM_FLASH_INTENSITY = 40;
// The bass bump setting goes up to 2, so the pulse is bounded at that.
const MAX_BASS_BUMP = 2;
// Poses sampled across the clip to find the box the camera must fit: eight per beat, which reaches every peak.
const MEASURE_SAMPLES = 32;
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

export interface DancingCharacterSceneOptions {
    // True when the visitor asked the system for reduced motion: the club's flashes then show at a lower strength.
    reducedMotion?: boolean;
}

export class DancingCharacterScene {
    readonly lookTarget = new THREE.Vector3(0, 0, 0);

    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly club: ClubSet;
    private readonly lights: THREE.Object3D[] = [];
    private readonly rimLight: THREE.PointLight;

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
    private baseAction: THREE.AnimationAction | null = null;
    private accentAction: THREE.AnimationAction | null = null;
    private accentWeight = 0;
    private baseScale = 1;
    private baseX = 0;
    private baseY = 0;
    private baseZ = 0;
    private fadeElapsed = 0;
    private tinted: TintedMaterial[] = [];

    // Per-frame scratch, preallocated so update() allocates nothing.
    // The timing state and result, the clip position given to the timing this frame, the bass gate and its latest
    // output and tempo lock are public only so DEV telemetry can read them.
    public readonly timingState = createDanceTimingState();
    public readonly timing = createDanceTimingResult();
    public clipPhase = 0;
    public readonly bassGate = createBassGateState();
    public gateOutput = 0;
    public gateTempoLocked = false;
    private readonly bodyTint = new THREE.Color();
    private lastBodyColor = '';
    private lastAccentColor = '';
    // The accent shared by the club's ripple and the rim light, and the rainbow's current hue (0..1).
    private readonly accent = new THREE.Color();
    private accentHue = 0;
    private lastFloorColor = '';
    private disposed = false;

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        settings: DancingCharacterSettings,
        options: DancingCharacterSceneOptions = {},
    ) {
        this.scene = scene;
        this.camera = camera;
        this.zoom = settings.zoom;

        // The club owns the background and the haze; the lights below keep the dancer clearly lit in the dark room.
        this.club = new ClubSet(scene);
        if (options.reducedMotion) this.club.setFlashStrength(CLUB_REDUCED_MOTION_FLASH_STRENGTH);

        // Dim, so the room reads as dark; the key light does the work on the dancer.
        const hemisphere = new THREE.HemisphereLight(0xffffff, 0x223344, HEMISPHERE_INTENSITY);
        const key = new THREE.DirectionalLight(0xffffff, 2);
        key.position.set(3, 6, 4);
        // Behind and to the side of the default view, so the accent color outlines the dancer.
        this.rimLight = new THREE.PointLight(0xffffff, RIM_BASE_INTENSITY, 0, 2);
        this.rimLight.position.set(-2.5, 1.5, -2.5);
        this.lights.push(hemisphere, key, this.rimLight);
        scene.add(hemisphere, key, this.rimLight);

        // Until a model loads, frame a box the size of the dancer so the camera starts in a sensible place.
        const { width, height, depth } = NOMINAL_CHARACTER_SIZE;
        this.framingBox.min.set(-width / 2, -height / 2, -depth / 2);
        this.framingBox.max.set(width / 2, height / 2, depth / 2);
        this.placeFloor(-height / 2);

        this.applyColors(settings, 0);
        this.refreshDistance();
        this.writeCameraPose(0);
    }

    setCharacter(model: THREE.Group): void {
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

        // The model has no animation of its own: the dance is built for its bones. A rig without them keeps the rest
        // pose (no mixer), which still renders, only without a dance.
        const clips = buildDanceClip(this.collectBones(model));
        if (clips) {
            this.mixer = new THREE.AnimationMixer(model);
            this.baseAction = this.mixer.clipAction(clips.base);
            this.accentAction = this.mixer.clipAction(clips.accents);
            // Both layers start together and are advanced by the same update, so they stay in phase.
            for (const action of [this.baseAction, this.accentAction]) {
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
            }
        }
        this.accentWeight = 0;

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
        forgetBassline(this.bassGate);
        this.fadeElapsed = 0;
        this.applyModelTransform(0);
        this.refreshDistance();
    }

    // The bones of the model's skeleton, in skeleton order. The dressed dancer has several skinned meshes that all share
    // one skeleton, so a bone is collected once however many meshes use it. Runs once per load.
    private collectBones(model: THREE.Group): THREE.Bone[] {
        const bones = new Set<THREE.Bone>();
        model.traverse((object) => {
            if (!(object as THREE.SkinnedMesh).isSkinnedMesh) return;
            for (const bone of (object as THREE.SkinnedMesh).skeleton.bones) bones.add(bone);
        });
        return [...bones];
    }

    // Unions the model's box over evenly spaced moments of the clip into `framingBox`, then rewinds to the start. Both
    // layers are at full weight while measuring, so the box holds the widest the dance ever gets; their weights are
    // put back afterwards. Runs once per load, so the temporary box is fine.
    private measureDance(model: THREE.Group): THREE.Box3 {
        const box = this.framingBox;
        const samples = this.mixer ? MEASURE_SAMPLES : 1;
        const pose = new THREE.Box3();
        if (this.baseAction && this.accentAction) {
            this.baseAction.weight = 1;
            this.accentAction.weight = 1;
        }
        for (let i = 0; i < samples; i++) {
            this.mixer?.setTime((DANCE_CLIP_DURATION * i) / samples);
            model.updateMatrixWorld(true);
            // Precise: a skinned mesh caches its bounding box, so the default mode would measure the first pose 16
            // times. The precise mode skins every vertex, which for this 16,000-vertex dressed figure costs little, once
            // per load.
            pose.setFromObject(model, true);
            if (i === 0) box.copy(pose);
            else box.union(pose);
        }
        if (this.baseAction && this.accentAction) {
            this.baseAction.weight = CALM_DANCE_WEIGHT;
            this.accentAction.weight = 0;
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
        const timing = this.timing;
        timing.normalizedBpm = undefined;
        if (this.mixer && this.baseAction && this.accentAction) {
            this.clipPhase = this.baseAction.time / DANCE_CLIP_DURATION;
            computeDanceTiming(rhythm, DANCE_CLIP_BEATS, this.clipPhase, settings, this.timingState, dt, timing);
            // Weights below 1 blend toward the rest pose, so the calm state is a gentler bounce at the native rate. The
            // accents are only wanted while the bar is known, and ease in and out so they never pop.
            this.baseAction.weight = timing.danceWeight;
            const accentTarget = timing.barLocked ? timing.danceWeight : 0;
            this.accentWeight += (accentTarget - this.accentWeight) * (1 - Math.exp(-dt / ACCENT_EASE_SECONDS));
            this.accentAction.weight = this.accentWeight;
            // One update carries both the normal advance and the beat-phase nudge; the actions' own timeScale stays 1.
            this.mixer.update(dt * timing.timeScale + timing.phaseNudge * DANCE_CLIP_DURATION);
        }

        // The raw bass is shown only once its kicks keep landing on the locked beat, so stray bass never moves anything.
        // Without a rig the timing result still says whether the tempo is locked (it stays undefined).
        const tempoLocked = timing.normalizedBpm !== undefined;
        const bass = stepBassGate(frame.bass, rhythm, tempoLocked, this.bassGate, dt);
        this.gateOutput = bass;
        this.gateTempoLocked = tempoLocked;

        // The club: floor ripple and lights follow the beat phase, the flashes follow the gated bass. With no mixer (no
        // rig) the dancer is calm, so the club is too.
        this.club.update(rhythm.beatPhase, bass, this.mixer ? timing.danceWeight : CALM_DANCE_WEIGHT, dt);

        // 2. Bass.
        const bump = Math.min(Math.max(bass * settings.bassStrength, 0), MAX_BASS_BUMP);
        this.rimLight.intensity = RIM_BASE_INTENSITY + bump * RIM_FLASH_INTENSITY;
        if (this.model) {
            this.fadeElapsed += dt;
            this.applyModelTransform(Math.min(1, this.fadeElapsed / FADE_IN_SECONDS));
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
            this.writeCameraPose(stepCameraDolly(bass, settings.bassCameraStrength, this.distance));
        }

        // 4. Colors.
        this.applyColors(settings, dt);
    }

    resize(): void {
        this.distanceAspect = NaN;
    }

    // Starts the dance over for a new source, so a track gets the same dance however long the page was open and whatever
    // played before: the clip position would otherwise carry over, and the bar lock takes seconds to correct it. Called
    // only when the source changes, and the weight is left to ease, so this is never a visible pop during a song.
    restartDance(): void {
        if (this.baseAction && this.accentAction) {
            this.baseAction.time = 0;
            this.accentAction.time = 0;
        }
        Object.assign(this.timingState, createDanceTimingState(), { danceWeight: this.timingState.danceWeight });
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
        this.club.dispose();
        this.scene.remove(...this.lights);
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
        this.baseAction = null;
        this.accentAction = null;
        this.tinted = [];
    }

    private placeFloor(feetY: number): void {
        this.club.setFloorY(feetY);
    }

    // Only the fade-in (a smoothstep from nearly nothing to full size) changes the model's size. The bass never scales
    // or lifts the dancer: she stays the same size with her feet on the floor, and the bass shows in the camera bump,
    // the rim light and the club's lights instead.
    private applyModelTransform(fade: number): void {
        const model = this.model;
        if (!model) return;
        model.scale.setScalar(this.baseScale * Math.max(MIN_FADE_SCALE, fade * fade * (3 - 2 * fade)));
        model.position.set(this.baseX, this.baseY, this.baseZ);
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

    // `dolly` is how far the bass pulls the camera in, in scene units, on top of the fitted distance.
    private writeCameraPose(dolly: number): void {
        const distance = this.distance - dolly;
        const horizontal = Math.cos(CAMERA_ELEVATION) * distance;
        this.camera.position.set(
            Math.sin(this.azimuth) * horizontal,
            Math.sin(CAMERA_ELEVATION) * distance,
            Math.cos(this.azimuth) * horizontal,
        );
        this.camera.lookAt(this.lookTarget);
    }

    // The floor and skin colors change rarely, so each string is compared with the last applied one before any color
    // work happens. The accent either cycles through the hues (rainbow, `rainbowSpeed` full cycles per second) or is
    // the static accent color; either way the club's ripple and the rim light share it.
    private applyColors(settings: DancingCharacterSettings, dt: number): void {
        if (settings.floorColor !== this.lastFloorColor) {
            this.lastFloorColor = settings.floorColor;
            this.club.setFloorColor(settings.floorColor);
        }
        if (settings.accentRainbow) {
            this.accentHue = (this.accentHue + Math.max(0, settings.rainbowSpeed) * Math.max(0, dt)) % 1;
            this.accent.setHSL(this.accentHue, RAINBOW_SATURATION, RAINBOW_LIGHTNESS);
            this.lastAccentColor = '';
        } else if (settings.accentColor !== this.lastAccentColor) {
            this.lastAccentColor = settings.accentColor;
            this.accent.set(settings.accentColor);
        }
        this.club.setAccentColor(this.accent);
        this.club.setRainbow(settings.accentRainbow, this.accentHue);
        this.rimLight.color.copy(this.accent);
        if (settings.bodyColor !== this.lastBodyColor) {
            this.lastBodyColor = settings.bodyColor;
            this.bodyTint.set(settings.bodyColor);
            for (const { material, original } of this.tinted) {
                material.color.copy(original).multiply(this.bodyTint);
            }
        }
    }
}
