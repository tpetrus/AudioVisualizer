import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { BassPulse } from '~/features/rhythm/bassPulse';
import { disposeDancingCharacterAssets, isAbortError, loadDancingCharacterAssets } from './dancingCharacterAssets';
import { MAX_FRAME_DT } from './dancingCharacterConfig';
import type { DancingCharacterSettings } from './dancingCharacterControls';
import { DancingCharacterScene, type DancingCharacterFrame } from './dancingCharacterScene';
import { useLatestRef } from '~/hooks/useLatestRef';
import { useThreeScene } from '~/hooks/useThreeScene';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { registerTelemetryProbe, tickTelemetry } from '~/features/audio/devTelemetry';
import { createOrbitView } from '~/lib/three/orbitView';

const CAMERA_FOV = 40;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;

// 'loading' until the model arrives; then 'ready' or 'modelFailed' (nothing to show).
export type DancingCharacterLoadStatus = 'loading' | 'ready' | 'modelFailed';

interface DancingCharacterSceneOptions {
    analyser: AnalyserNode | undefined;
    // The app-wide rhythm tracker: a stable instance, so the scene reads its state without a ref.
    rhythm: RhythmTracker;
    valuesRef: { readonly current: DancingCharacterSettings };
    // Locked means the picture can't be dragged, rotated or zoomed.
    cameraLocked: boolean;
    onViewChanged: (changed: boolean) => void;
    // True when the visitor asked for reduced motion; the club's flashes are then softer.
    reducedMotion: boolean;
    // Called from the load callbacks, never from the render loop.
    onStatus: (status: DancingCharacterLoadStatus) => void;
}

// A figure that dances to the music, rendered into `containerRef`.
export function useDancingCharacterScene(
    containerRef: RefObject<HTMLElement | null>,
    { analyser, rhythm, valuesRef, cameraLocked, reducedMotion, onViewChanged, onStatus }: DancingCharacterSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const reducedMotionRef = useLatestRef(reducedMotion);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const onStatusRef = useLatestRef(onStatus);
    const resetViewRef = useRef<() => void>(() => {});

    useThreeScene(containerRef, ({ scene, renderer, size, signal }) => {
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, CAMERA_NEAR, CAMERA_FAR);

        // Built before the orbit view: the scene writes the starting camera pose, and that pose is what Reset view
        // returns to.
        const character = new DancingCharacterScene(scene, camera, valuesRef.current, {
            reducedMotion: reducedMotionRef.current,
        });
        const orbit = createOrbitView(camera, renderer.domElement, {
            locked: cameraLockedRef.current,
            onViewChanged: (changed) => onViewChangedRef.current(changed),
        });
        resetViewRef.current = () => {
            orbit.reset();
            character.resetOrbit();
        };

        onStatusRef.current('loading');
        loadDancingCharacterAssets(signal)
            .then((assets) => {
                // Torn down while loading (or StrictMode's first mount): nothing owns the assets, so free them.
                if (signal.aborted) {
                    disposeDancingCharacterAssets(assets);
                    return;
                }
                character.setCharacter(assets.model);
                onStatusRef.current('ready');
            })
            .catch((error: unknown) => {
                if (signal.aborted || isAbortError(error)) return;
                onStatusRef.current('modelFailed');
            });

        let boundAnalyser: AnalyserNode | undefined;
        let bass: BassPulse | undefined;
        // One frame object reused every frame so the loop allocates nothing.
        const frame: DancingCharacterFrame = {
            dt: 0,
            rhythm: rhythm.state,
            bass: 0,
            settings: valuesRef.current,
            cameraLocked: true,
        };

        // DEV only: the gate's input is the frame's raw bass; the rest is read from the scene after its update.
        let unregisterProbe: (() => void) | undefined;
        if (import.meta.env.DEV) {
            unregisterProbe = registerTelemetryProbe(
                'dancing-character',
                [
                    'in',
                    'out',
                    'gateOpen',
                    'gateScore',
                    'gateWeight',
                    'tempoLocked',
                    'bpm',
                    'rawBeatBpm',
                    'rawTempoBpm',
                    'heldTempoBpm',
                    'tempoConfidence',
                    'meterConfidence',
                    'beatsPerBar',
                    'beatPhase',
                    'barPhase',
                    'beatCount',
                    'songChanges',
                    'gridEpoch',
                    'timeScale',
                    'phaseNudge',
                    'meterLocked',
                    'clipPhase',
                    'bumpCount',
                    'kickPhaseOffset',
                ],
                (out) => {
                    const gate = character.bassGate;
                    const state = rhythm.state;
                    const analysis = rhythm.analysis;
                    out[0] = frame.bass;
                    out[1] = character.gateOutput;
                    out[2] = gate.open ? 1 : 0;
                    out[3] = gate.score;
                    out[4] = gate.weight;
                    out[5] = character.gateTempoLocked ? 1 : 0;
                    out[6] = state.bpm;
                    out[7] = analysis?.rawBeatBpm ?? 0;
                    out[8] = analysis?.rawTempoBpm ?? 0;
                    out[9] = analysis?.heldTempoBpm ?? 0;
                    out[10] = state.tempoConfidence;
                    out[11] = state.meterConfidence;
                    out[12] = state.beatsPerBar ?? NaN;
                    out[13] = state.beatPhase ?? NaN;
                    out[14] = state.barPhase ?? NaN;
                    out[15] = state.beatCount;
                    out[16] = state.songChangeCount;
                    out[17] = analysis?.gridEpoch ?? 0;
                    out[18] = character.timing.timeScale;
                    out[19] = character.timing.phaseNudge;
                    out[20] = character.timingState.meterLocked ? 1 : 0;
                    out[21] = character.clipPhase;
                    out[22] = gate.bumpCount;
                    out[23] = gate.kickOffset;
                },
            );
        }

        return {
            camera,

            update: (_time, delta) => {
                orbit.setLocked(cameraLockedRef.current);

                // A new source: keep the scene and just rebind the bass tap.
                const source = analyserRef.current;
                if (source !== boundAnalyser) {
                    bass?.dispose();
                    bass = source ? new BassPulse(source) : undefined;
                    boundAnalyser = source;
                }

                rhythm.updatePhase();
                frame.dt = Math.min(delta / 1000, MAX_FRAME_DT);
                frame.rhythm = rhythm.state;
                frame.bass = bass?.update() ?? 0;
                frame.settings = valuesRef.current;
                frame.cameraLocked = cameraLockedRef.current;
                character.update(frame);

                if (import.meta.env.DEV) {
                    tickTelemetry(delta / 1000);
                }
            },

            resize: () => character.resize(),

            dispose: () => {
                orbit.dispose();
                bass?.dispose();
                character.dispose();
                unregisterProbe?.();
            },
        };
    });

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}
