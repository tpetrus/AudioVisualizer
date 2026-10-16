import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { type BinRange, createBandBins, updateBandLevels } from './bands';
import { BassPulse } from './bassPulse';
import { CubeGrid, gridSizeForView } from './cubeGrid';
import type { CubesControlValues } from './cubesControls';
import { useLatestRef } from '~/hooks/useLatestRef';
import useThreeScene from '~/hooks/useThreeScene';
import createOrbitView from '~/lib/three/orbitView';
import disposeScene from '~/lib/three/disposeScene';

const CAMERA_FOV = 50;
const CAMERA_DISTANCE = 32;
// Frequency data: 2048 samples gives ~23 Hz bins, enough to separate bass notes.
const FFT_SIZE = 2048;
const ANALYSER_SMOOTHING = 0.5;
// The background flash is capped below full brightness so the cubes stay readable against it.
const MAX_BACKGROUND_FLASH = 0.6;
// How far resting cubes rise toward the viewer on a full-strength bass hit.
const MAX_BACKDROP_LIFT = 2;

interface CubesSceneOptions {
    analyser: AnalyserNode | undefined;
    valuesRef: { readonly current: CubesControlValues };
    // Locked means the picture can't be dragged, rotated or zoomed.
    cameraLocked: boolean;
    onViewChanged: (changed: boolean) => void;
}

// Audio-reactive grid of glass cubes rendered into `containerRef`.
export function useCubesScene(
    containerRef: RefObject<HTMLElement | null>,
    { analyser, valuesRef, cameraLocked, onViewChanged }: CubesSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const resetViewRef = useRef<() => void>(() => { });

    useThreeScene(containerRef, ({ scene, renderer, size }) => {
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, 1, 500);
        camera.position.set(0, 0, CAMERA_DISTANCE);

        // The background flashes a tint of the resting-cube color on bass hits.
        const backgroundColor = new THREE.Color(0x000000);
        scene.background = backgroundColor;
        scene.environment = createEnvironment(renderer);
        addLights(scene);

        const orbit = createOrbitView(camera, renderer.domElement, {
            locked: cameraLockedRef.current,
            onViewChanged: changed => onViewChangedRef.current(changed),
        });
        resetViewRef.current = orbit.reset;

        let grid = new CubeGrid(gridSizeForView(CAMERA_FOV, CAMERA_DISTANCE, camera.aspect));
        scene.add(grid.mesh);

        // Audio state, rebuilt whenever the analyser changes.
        let boundAnalyser: AnalyserNode | undefined;
        let spectrum = new Uint8Array(0);
        let bins: BinRange[] = [];
        let levels = new Float32Array(grid.bandCount);
        let bass: BassPulse | undefined;
        const restingColor = new THREE.Color();
        const raisedColor = new THREE.Color();

        const bandBinsFor = (source: AnalyserNode) =>
            createBandBins(grid.bandCount, source.context.sampleRate, source.fftSize);

        const bindAudio = (source: AnalyserNode) => {
            source.fftSize = FFT_SIZE;
            source.smoothingTimeConstant = ANALYSER_SMOOTHING;
            spectrum = new Uint8Array(source.frequencyBinCount);
            bins = bandBinsFor(source);
            bass?.dispose();
            bass = new BassPulse(source);
            boundAnalyser = source;
        };

        return {
            camera,

            update: () => {
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

                const bump = bass?.update() ?? 0;
                const pulse = values.bassBump ? bump * values.bgPulse : 0;
                backgroundColor.copy(restingColor).multiplyScalar(pulse * MAX_BACKGROUND_FLASH);

                grid.update(levels, {
                    depth: values.depth,
                    spin: values.spin,
                    restingColor,
                    raisedColor,
                    backdropLift: pulse * MAX_BACKDROP_LIFT,
                });
            },

            resize: () => {
                const next = gridSizeForView(CAMERA_FOV, CAMERA_DISTANCE, camera.aspect);
                if (next.columns === grid.columns && next.rows === grid.rows) {
                    return;
                }
                grid.dispose();
                grid = new CubeGrid(next);
                scene.add(grid.mesh);
                // The band layout depends on the column count.
                levels = new Float32Array(grid.bandCount);
                if (boundAnalyser) {
                    bins = bandBinsFor(boundAnalyser);
                }
            },

            dispose: () => {
                orbit.dispose();
                grid.dispose();
                bass?.dispose();
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
        .filter(child => child.position.z > 10)
        .forEach(child => {
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
function addLights(scene: THREE.Scene): void {
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(-6, 8, 10);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaab4ff, 0.5);
    fillLight.position.set(8, -3, 6);
    scene.add(fillLight);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}