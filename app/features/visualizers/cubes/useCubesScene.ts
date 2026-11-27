import { type RefObject, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { type BinRange, createBandBins, updateBandLevels } from './bands';
import { CubeGrid, gridSizeForView } from './cubeGrid';
import { createCubesBassEnvelope, stepCubesBass } from './cubesBass';
import type { CubesEnhancedControlValues } from './cubesControls';
import type {
    CubesEnhancedLookApi,
    CubesEnhancedSettings,
    CubesFxFrame,
    CubesLights,
} from './enhanced/cubesEnhancedTypes';
import { loadCubesEnhanced } from './enhanced/loadCubesEnhanced';
import { useLatestRef } from '~/hooks/useLatestRef';
import { useThreeScene } from '~/hooks/useThreeScene';
import type { EnhancedGraphicsStatus } from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { FrameRateMonitor, isSlowNoticeDismissed, SLOW_FRAME_OPTIONS } from '~/features/settings/frameRateMonitor';
import type { AudioHubReader } from '~/features/audio/hub/types';
import { registerTelemetryProbe, tickTelemetry } from '~/features/audio/devTelemetry';
import { createOrbitView } from '~/lib/three/orbitView';
import { disposeScene } from '~/lib/three/disposeScene';

const CAMERA_FOV = 50;
const CAMERA_DISTANCE = 32;
// Frequency data: 2048 samples gives ~23 Hz bins, enough to separate bass notes.
// The background flash is capped below full brightness so the cubes stay readable against it.
const MAX_BACKGROUND_FLASH = 0.6;
// Linear colors are encoded to sRGB for display, so a flash scaled linearly would look far brighter than its factor.
// Raising the factor to this power keeps the on-screen brightness proportional to it.
const DISPLAY_GAMMA = 2.2;
// The environment map is shown at this strength. The sRGB output brightens its grey reflections, so at full strength
// they wash the colors out. (Scene.environmentIntensity is what applies here; a material's envMapIntensity is
// ignored for a scene environment.)
const ENVIRONMENT_INTENSITY = 0.3;
// Light intensities are in physical units. A factor of PI converts the old per-light values (the migration guide's
// rule), and the rest compensates for sRGB output darkening lit surfaces compared with the old output of raw values.
// Tuned by rendering fixed levels and matching the on-screen colors of the old (three 0.141) look.
const LIGHT_SCALE = 5 * Math.PI;
// How far resting cubes rise toward the viewer on a full-strength bass hit.
const MAX_BACKDROP_LIFT = 2;
// A confident downbeat adds this fraction of a full bass hit to the backdrop lift, then fades by this factor per
// frame (about a third of a second at 60 fps). Kept small so it accents the bar without hiding the bass.
const DOWNBEAT_ACCENT_LIFT = 0.35;
const DOWNBEAT_ACCENT_DECAY = 0.9;

interface CubesSceneOptions {
    analyser: AnalyserNode | undefined;
    // The app-wide audio hub: a stable instance, so the scene reads its snapshot without a ref.
    hub: AudioHubReader;
    // The superset of the standard values: the Enhanced controls are only read while the enhanced look is active.
    valuesRef: { readonly current: CubesEnhancedControlValues };
    // Locked means the picture can't be dragged, rotated or zoomed.
    cameraLocked: boolean;
    onViewChanged: (changed: boolean) => void;
    // The visitor's enhanced-graphics choice. Changing it never rebuilds the scene: the look is added or removed.
    enhanced: boolean;
    // The enhanced look's progress, undefined in standard mode. It changes a few times per toggle, never per frame.
    onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void;
    // Called once per warm-up cycle when the enhanced look has been running slowly; never in standard mode.
    onSlowFrames?: () => void;
}

// Audio-reactive grid of glass cubes rendered into `containerRef`.
export function useCubesScene(
    containerRef: RefObject<HTMLElement | null>,
    {
        analyser,
        hub,
        valuesRef,
        cameraLocked,
        onViewChanged,
        enhanced,
        onEnhancedStatus,
        onSlowFrames,
    }: CubesSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const enhancedRef = useLatestRef(enhanced);
    const onEnhancedStatusRef = useLatestRef(onEnhancedStatus);
    const onSlowFramesRef = useLatestRef(onSlowFrames);
    const resetViewRef = useRef<() => void>(() => {});
    // Set by the scene: adds or removes the enhanced look without rebuilding anything.
    const setEnhancedRef = useRef<(on: boolean) => void>(() => {});

    // On mount this runs before the scene exists (a no-op), and the scene applies the current value itself when it is
    // built; afterwards this follows the toggle.
    useEffect(() => {
        setEnhancedRef.current(enhanced);
    }, [enhanced]);

    useThreeScene(containerRef, ({ scene, renderer, size, signal }) => {
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, 1, 500);
        camera.position.set(0, 0, CAMERA_DISTANCE);

        // The background flashes a tint of the resting-cube color on bass hits.
        const backgroundColor = new THREE.Color(0x000000);
        scene.background = backgroundColor;
        scene.environment = createEnvironment(renderer);
        scene.environmentIntensity = ENVIRONMENT_INTENSITY;
        const lights = addLights(scene);

        const orbit = createOrbitView(camera, renderer.domElement, {
            locked: cameraLockedRef.current,
            onViewChanged: (changed) => onViewChangedRef.current(changed),
        });
        resetViewRef.current = orbit.reset;

        let grid = new CubeGrid(gridSizeForView(CAMERA_FOV, CAMERA_DISTANCE, camera.aspect));
        scene.add(grid.mesh);

        // Audio state, rebuilt whenever the analyser changes.
        let boundAnalyser: AnalyserNode | undefined;
        let spectrum = new Uint8Array(0);
        let bins: BinRange[] = [];
        let levels = new Float32Array(grid.bandCount);
        const bass = createCubesBassEnvelope();
        const restingColor = new THREE.Color();
        const raisedColor = new THREE.Color();

        const { snapshot } = hub;
        // The snapshot is only refreshed by update(), so it may be stale (the hub started, or this page was left and
        // revisited). Catch up first, or the first frame would see the gap as a new downbeat and accent it.
        hub.update();
        // Compared with the snapshot's counter each frame to notice a downbeat without events or allocation.
        let seenDownbeats = snapshot.beat.downbeatCount;
        let downbeatAccent = 0;

        const bandBinsFor = (source: AnalyserNode) =>
            createBandBins(grid.bandCount, source.context.sampleRate, source.fftSize);

        // DEV only: reports the bass envelope's latest values to the telemetry recorder (zeros until the hub has data).
        let unregisterProbe: (() => void) | undefined;
        if (import.meta.env.DEV) {
            unregisterProbe = registerTelemetryProbe('cubes', ['in', 'fast', 'slow', 'ratio', 'out'], (out) => {
                out[0] = bass.input;
                out[1] = bass.fast;
                out[2] = bass.slow;
                out[3] = bass.ratio;
                out[4] = bass.pulse;
            });
        }

        const bindAudio = (source: AnalyserNode) => {
            spectrum = new Uint8Array(source.frequencyBinCount);
            bins = bandBinsFor(source);
            boundAnalyser = source;
        };

        // The enhanced look. It exists only between a successful load and the next toggle-off (or teardown); until then
        // the basic look keeps rendering. Everything below is preallocated, so the per-frame path allocates nothing.
        let look: CubesEnhancedLookApi | undefined;
        let wanted = false;
        let loadController: AbortController | undefined;
        // The latest CSS size, for a look that is built after a resize.
        let viewSize = size;
        const monitor = new FrameRateMonitor(SLOW_FRAME_OPTIONS);
        const fxFrame: CubesFxFrame = {
            bands: null,
            bassFlash: 0,
            beatPhase: null,
            barPhase: null,
            barLocked: false,
            dt: 0,
        };
        const fxSettings: CubesEnhancedSettings = { glow: 0, particles: 0, cameraMotion: 0, restingColor, raisedColor };

        // Reduced motion is followed live, so the look calms down or comes back without a reload.
        const motionQuery =
            typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
        let reducedMotion = motionQuery?.matches ?? false;
        const onMotionChange = (event: MediaQueryListEvent) => {
            reducedMotion = event.matches;
            look?.setReducedMotion(reducedMotion);
        };
        motionQuery?.addEventListener('change', onMotionChange);

        // A new look phase is a new thing to measure, so every status change restarts the monitor's warm-up.
        const reportStatus = (status: EnhancedGraphicsStatus | undefined) => {
            monitor.restartWarmup();
            onEnhancedStatusRef.current?.(status);
        };

        const stopEnhanced = () => {
            loadController?.abort();
            loadController = undefined;
            look?.dispose();
            look = undefined;
        };

        const startEnhanced = () => {
            const controller = new AbortController();
            loadController = controller;
            // The scene's teardown cancels a pending load too.
            const abortWithScene = () => controller.abort();
            signal.addEventListener('abort', abortWithScene, { once: true });
            reportStatus('loading');
            void loadCubesEnhanced(controller.signal).then((result) => {
                signal.removeEventListener('abort', abortWithScene);
                // Turned off (or the scene went away) while loading: the result is not wanted any more.
                if (controller.signal.aborted) return;
                loadController = undefined;
                if (!result.ok) {
                    // The basic look keeps rendering; the stored preference is the visitor's to change.
                    reportStatus('error');
                    return;
                }
                try {
                    look = new result.Look({ renderer, scene, camera, lights, size: viewSize, reducedMotion });
                    look.attach(grid);
                } catch (error) {
                    console.warn('Enhanced cubes could not be started, using the basic look.', error);
                    look?.dispose();
                    look = undefined;
                    reportStatus('error');
                    return;
                }
                reportStatus('ready');
            });
        };

        setEnhancedRef.current = (on) => {
            if (on === wanted) return;
            wanted = on;
            if (on) {
                startEnhanced();
            } else {
                stopEnhanced();
                reportStatus(undefined);
            }
        };
        // The scene may be built with the look already wanted; basic mode reports no status.
        onEnhancedStatusRef.current?.(undefined);
        setEnhancedRef.current(enhancedRef.current);

        return {
            camera,

            update: (_time, delta) => {
                const values = valuesRef.current;
                orbit.setLocked(cameraLockedRef.current);
                restingColor.set(values.restingColor);
                raisedColor.set(values.raisedColor);

                const source = analyserRef.current;
                if (source) {
                    // A new source: keep the scene and just rebind.
                    if (source !== boundAnalyser) {
                        bindAudio(source);
                    }
                    source.getByteFrequencyData(spectrum);
                    updateBandLevels(levels, spectrum, bins, {
                        sensitivity: values.sensitivity,
                        gate: values.threshold,
                        smoothing: values.smoothing,
                    });
                }

                hub.update();
                const { beat } = snapshot;
                if (beat.downbeatCount !== seenDownbeats) {
                    seenDownbeats = beat.downbeatCount;
                    // Only a meter the tracker is sure about gets an accent; a guessed bar would pulse on the wrong beat.
                    if (beat.barLocked) {
                        downbeatAccent = 1;
                    }
                }
                downbeatAccent *= DOWNBEAT_ACCENT_DECAY;

                const pulse = stepCubesBass(bass, snapshot.gateBass, delta / 1000, values);
                backgroundColor.copy(restingColor).multiplyScalar((pulse * MAX_BACKGROUND_FLASH) ** DISPLAY_GAMMA);

                grid.update(levels, {
                    depth: values.depth,
                    spin: values.spin,
                    restingColor,
                    raisedColor,
                    backdropLift: (pulse + downbeatAccent * DOWNBEAT_ACCENT_LIFT) * MAX_BACKDROP_LIFT,
                });

                if (look) {
                    fxFrame.bands = source ? levels : null;
                    fxFrame.bassFlash = pulse;
                    fxFrame.beatPhase = beat.locked ? (beat.phase ?? null) : null;
                    fxFrame.barPhase = beat.barLocked ? (beat.barPhase ?? null) : null;
                    fxFrame.barLocked = beat.barLocked;
                    fxFrame.dt = delta / 1000;
                    fxSettings.glow = values.glow;
                    fxSettings.particles = values.particles;
                    fxSettings.cameraMotion = values.cameraMotion;
                    look.update(fxFrame, fxSettings);

                    if (monitor.sample(delta, document.hidden) && !isSlowNoticeDismissed()) {
                        onSlowFramesRef.current?.();
                    }
                }

                if (import.meta.env.DEV) {
                    tickTelemetry(delta / 1000);
                }
            },

            // The look draws through its own composer (post-processing); without it this is the plain render.
            render: () => {
                if (look) {
                    look.render();
                } else {
                    renderer.render(scene, camera);
                }
            },

            resize: (next) => {
                viewSize = next;
                const gridSize = gridSizeForView(CAMERA_FOV, CAMERA_DISTANCE, camera.aspect);
                if (gridSize.columns !== grid.columns || gridSize.rows !== grid.rows) {
                    grid.dispose();
                    grid = new CubeGrid(gridSize);
                    scene.add(grid.mesh);
                    // The band layout depends on the column count.
                    levels = new Float32Array(grid.bandCount);
                    if (boundAnalyser) {
                        bins = bandBinsFor(boundAnalyser);
                    }
                    // The new grid has the plain glass material until the look applies its own.
                    look?.attach(grid);
                }
                look?.resize(next.width, next.height);
            },

            dispose: () => {
                setEnhancedRef.current = () => {};
                motionQuery?.removeEventListener('change', onMotionChange);
                stopEnhanced();
                orbit.dispose();
                grid.dispose();
                unregisterProbe?.();
            },
        };
    });

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}

// The reflections come from a studio-style environment map, not from the black background.
function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
    const room = new RoomEnvironment();
    // The room's light panel behind the camera mirrors off the cubes' front faces as a glare at the top of the
    // screen, so it is hidden. Hidden rather than removed, so disposeScene(room) below still frees it.
    room.children
        .filter((child) => child.position.z > 10)
        .forEach((child) => {
            child.visible = false;
        });

    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    disposeScene(room); // the room is only needed to render the map
    return texture;
}

// A strong key light from the upper left and a dim fill from the right, so the faces of tilted cubes
// are shaded differently and read as solid shapes.
// The lights are returned so the enhanced look can retune them and put them back.
function addLights(scene: THREE.Scene): CubesLights {
    const key = new THREE.DirectionalLight(0xffffff, 1.6 * LIGHT_SCALE);
    key.position.set(-6, 8, 10);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xaab4ff, 0.5 * LIGHT_SCALE);
    fill.position.set(8, -3, 6);
    scene.add(fill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.25 * LIGHT_SCALE);
    scene.add(ambient);

    return { key, fill, ambient };
}
