import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { BassPulse } from '~/features/rhythm/bassPulse';
import { disposeDancingCharacterAssets, isAbortError, loadDancingCharacterAssets } from './dancingCharacterAssets';
import { CHARACTER_REGISTRY, DEFAULT_CHARACTER_ID, findCharacter, type CharacterEntry } from './characterRegistry';
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
    // A message when a chosen character could not be used (the page then puts the default back in the control), and
    // null once a character loaded fine. Called from the load callbacks, never from the render loop.
    onCharacterProblem: (message: string | null) => void;
    // The characters that can be chosen; the real list unless a spec injects its own.
    registry?: readonly CharacterEntry[];
}

// A figure that dances to the music, rendered into `containerRef`.
export function useDancingCharacterScene(
    containerRef: RefObject<HTMLElement | null>,
    {
        analyser,
        rhythm,
        valuesRef,
        cameraLocked,
        reducedMotion,
        onViewChanged,
        onStatus,
        onCharacterProblem,
        registry = CHARACTER_REGISTRY,
    }: DancingCharacterSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const reducedMotionRef = useLatestRef(reducedMotion);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const onStatusRef = useLatestRef(onStatus);
    const onCharacterProblemRef = useLatestRef(onCharacterProblem);
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

        // The character on screen, the one being loaded or last asked for, and one whose load just failed. Plain locals:
        // the render loop compares them with the control value every frame without touching React state.
        let shownId = '';
        let requestedId = '';
        let failedId = '';
        // True from a failure until the next load starts: that load is the one restoring the default.
        let restoring = false;
        // Each load has its own controller and an increasing token, so a result that arrives after a newer request (or
        // after teardown) is recognized and freed instead of replacing the newer character.
        let loadToken = 0;
        let loadController: AbortController | undefined;

        // A load that failed for any reason: say why, and ask the page to put the default back in the control. The
        // figure on screen (the previous one, or none yet) stays; the default then loads like any other choice.
        const failLoad = (entry: CharacterEntry | undefined, id: string, problem: string, missing: string[] = []) => {
            failedId = id;
            requestedId = shownId;
            console.error(
                `Dancing character "${entry?.title ?? id}" failed: ${problem}` +
                    (missing.length > 0 ? `; missing bones: ${missing.join(', ')}` : ''),
            );
            if (id === DEFAULT_CHARACTER_ID) {
                // Nothing to fall back to: with no figure on screen the page shows its failure note.
                if (shownId === '') onStatusRef.current('modelFailed');
                return;
            }
            restoring = true;
            onCharacterProblemRef.current(
                `${entry?.title ?? id} couldn't be loaded, so the default character is back.`,
            );
        };

        const loadCharacter = (id: string) => {
            // The load that puts the default back after a failure keeps the message; any other choice clears it.
            if (!(restoring && id === DEFAULT_CHARACTER_ID)) onCharacterProblemRef.current(null);
            restoring = false;
            requestedId = id;
            const token = ++loadToken;
            loadController?.abort();
            const entry = findCharacter(id, registry);
            if (!entry) {
                failLoad(undefined, id, 'it is not in the character list');
                return;
            }
            const controller = new AbortController();
            loadController = controller;
            loadDancingCharacterAssets(controller.signal, entry.urls)
                .then((assets) => {
                    // Torn down or superseded while loading (or StrictMode's first mount): nothing owns the assets, so
                    // free them.
                    if (signal.aborted || token !== loadToken) {
                        disposeDancingCharacterAssets(assets);
                        return;
                    }
                    // The previous model is disposed inside setCharacter, after the new one is ready to show.
                    const { danced, missing } = character.setCharacter(
                        assets.model,
                        assets.dances,
                        entry.bodyMaterialNames,
                    );
                    shownId = id;
                    if (!danced && id !== DEFAULT_CHARACTER_ID) {
                        failLoad(entry, id, 'it cannot dance', missing);
                        return;
                    }
                    if (!danced)
                        console.error(`Dancing character "${entry.title}" cannot dance: ${missing.join(', ')}`);
                    onStatusRef.current('ready');
                })
                .catch((error: unknown) => {
                    if (signal.aborted || token !== loadToken || isAbortError(error)) return;
                    failLoad(entry, id, 'its files could not be loaded');
                });
        };

        onStatusRef.current('loading');
        loadCharacter(valuesRef.current.character);

        let boundAnalyser: AnalyserNode | undefined;
        let bass: BassPulse | undefined;
        // One frame object reused every frame so the loop allocates nothing.
        const frame: DancingCharacterFrame = {
            dt: 0,
            rhythm: rhythm.state,
            bass: 0,
            settings: valuesRef.current,
            cameraLocked: true,
            danceSelection: valuesRef.current.dance,
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
                    'rivalBpm',
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
                    out[24] = analysis?.rivalBpm ?? 0;
                },
            );
        }

        return {
            camera,

            update: (_time, delta) => {
                orbit.setLocked(cameraLockedRef.current);

                // A different character chosen in the panel: start loading it. The old one stays on screen until the
                // new one is ready. A choice that just failed is skipped until the control has been put back.
                const wanted = valuesRef.current.character;
                if (wanted !== failedId) {
                    failedId = '';
                    if (wanted !== requestedId) loadCharacter(wanted);
                }

                // A new source: keep the scene and just rebind the bass tap.
                const source = analyserRef.current;
                if (source !== boundAnalyser) {
                    bass?.dispose();
                    bass = source ? new BassPulse(source) : undefined;
                    boundAnalyser = source;
                    if (source) character.restartDance();
                }

                rhythm.updatePhase();
                frame.dt = Math.min(delta / 1000, MAX_FRAME_DT);
                frame.rhythm = rhythm.state;
                frame.bass = bass?.update() ?? 0;
                frame.settings = valuesRef.current;
                frame.danceSelection = valuesRef.current.dance;
                frame.cameraLocked = cameraLockedRef.current;
                character.update(frame);

                if (import.meta.env.DEV) {
                    tickTelemetry(delta / 1000);
                }
            },

            resize: () => character.resize(),

            dispose: () => {
                loadController?.abort();
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
