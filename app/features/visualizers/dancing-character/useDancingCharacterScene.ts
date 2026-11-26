import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { BassBump, hubLowEnd } from '~/features/audio/hub/bassBump';
import type { AudioHubReader } from '~/features/audio/hub/types';
import { disposeDancingCharacterAssets, isAbortError, loadDancingCharacterAssets } from './dancingCharacterAssets';
import { CHARACTER_REGISTRY, DEFAULT_CHARACTER_ID, findCharacter, type CharacterEntry } from './characterRegistry';
import { DANCER_BUMP, MAX_FRAME_DT } from './dancingCharacterConfig';
import type { DancingCharacterSettings } from './dancingCharacterControls';
import { DancingCharacterScene, type DancingCharacterFrame } from './dancingCharacterScene';
import { useLatestRef } from '~/hooks/useLatestRef';
import { useThreeScene } from '~/hooks/useThreeScene';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { registerTelemetryProbe, tickTelemetry } from '~/features/audio/devTelemetry';
import { onRecordingClock } from '~/features/audio/devRecordingClock';
import { createOrbitView } from '~/lib/three/orbitView';
import type { EnhancedGraphicsStatus } from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { useEnhancedGraphics } from '~/features/settings/useEnhancedGraphics';
import { FrameRateMonitor, isSlowNoticeDismissed, SLOW_FRAME_OPTIONS } from '~/features/settings/frameRateMonitor';
import type { EnhancedLook } from './enhanced/dancingCharacterEnhanced';

const CAMERA_FOV = 40;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;

// 'loading' until the model arrives; then 'ready' or 'modelFailed' (nothing to show).
export type DancingCharacterLoadStatus = 'loading' | 'ready' | 'modelFailed';

interface DancingCharacterSceneOptions {
    // Only used to notice a new source; the bass itself comes from the hub.
    analyser: AnalyserNode | undefined;
    // The shared audio hub: a stable instance, so the scene reads its snapshot directly without a ref.
    hub: AudioHubReader;
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
    // The enhanced look's progress, or undefined while the standard look is on. Called when a scene is built and from
    // asset callbacks, never from the render loop.
    onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void;
    // Called once when the enhanced look has been running slowly (see FrameRateMonitor); never in standard mode.
    onSlowFrames?: () => void;
}

// Where the camera was when a scene was torn down, so a rebuild (the graphics toggle) does not throw the view away.
interface CameraPose {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
}

// A figure that dances to the music, rendered into `containerRef`.
export function useDancingCharacterScene(
    containerRef: RefObject<HTMLElement | null>,
    {
        analyser,
        hub,
        rhythm,
        valuesRef,
        cameraLocked,
        reducedMotion,
        onViewChanged,
        onStatus,
        onCharacterProblem,
        registry = CHARACTER_REGISTRY,
        onEnhancedStatus,
        onSlowFrames,
    }: DancingCharacterSceneOptions,
): { resetView: () => void } {
    // The preference is the only input that rebuilds the scene: antialiasing is a renderer constructor setting.
    const enhanced = useEnhancedGraphics();
    const onEnhancedStatusRef = useLatestRef(onEnhancedStatus);
    const onSlowFramesRef = useLatestRef(onSlowFrames);
    const poseRef = useRef<CameraPose | undefined>(undefined);
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const reducedMotionRef = useLatestRef(reducedMotion);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const onStatusRef = useLatestRef(onStatus);
    const onCharacterProblemRef = useLatestRef(onCharacterProblem);
    const resetViewRef = useRef<() => void>(() => {});

    useThreeScene(
        containerRef,
        ({ scene, renderer, size, signal }) => {
            const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, CAMERA_NEAR, CAMERA_FAR);

            // DEV only: when this scene was built and when its latest model finished parsing, on the page clock
            // (`performance.now()`, ms; NaN until the model is in). The probe turns them into the recording's own `t` clock.
            const sceneBuiltMs = import.meta.env.DEV ? performance.now() : NaN;
            let modelParsedMs = NaN;

            // Built before the orbit view: the scene writes the starting camera pose, and that pose is what Reset view
            // returns to.
            const character = new DancingCharacterScene(scene, camera, valuesRef.current, {
                reducedMotion: reducedMotionRef.current,
            });
            const orbit = createOrbitView(camera, renderer.domElement, {
                locked: cameraLockedRef.current,
                onViewChanged: (changed) => onViewChangedRef.current(changed),
            });
            // A rebuild for the graphics toggle keeps the view the visitor had. This comes after the orbit view is made so
            // Reset view still returns to the starting pose, not to the restored one. The orbit target is not reachable
            // from here (the orbit view keeps it private), so only the camera's position and aim are carried over.
            const savedPose = poseRef.current;
            if (savedPose) {
                camera.position.copy(savedPose.position);
                camera.quaternion.copy(savedPose.quaternion);
            }
            // Reset view and relocking share this: the orbit view goes back to its starting pose and the character's own
            // azimuth and distance follow it.
            const resetCamera = () => {
                orbit.reset();
                character.resetOrbit();
            };
            resetViewRef.current = resetCamera;
            // The lock as of the previous frame, to notice the moment it goes from unlocked to locked.
            let wasLocked = cameraLockedRef.current;

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

            // The enhanced look, once its chunk has arrived, and the model on screen that it has to be told about. Both
            // stay undefined in standard mode, which never imports the chunk.
            let look: EnhancedLook | undefined;
            let currentModel: THREE.Object3D | undefined;
            // Measures the enhanced look's frame rate only; standard mode has no monitor and no sampling.
            const monitor = enhanced ? new FrameRateMonitor(SLOW_FRAME_OPTIONS) : undefined;

            // A load that failed for any reason: say why, and ask the page to put the default back in the control. The
            // figure on screen (the previous one, or none yet) stays; the default then loads like any other choice.
            const failLoad = (
                entry: CharacterEntry | undefined,
                id: string,
                problem: string,
                missing: string[] = [],
            ) => {
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
                        if (import.meta.env.DEV) modelParsedMs = performance.now();
                        // The previous model is disposed inside setCharacter, after the new one is ready to show.
                        const { danced, missing } = character.setCharacter(
                            assets.model,
                            assets.dances,
                            entry.bodyMaterialNames,
                        );
                        shownId = id;
                        currentModel = assets.model;
                        look?.onModelChanged(assets.model);
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

            if (!enhanced) {
                onEnhancedStatusRef.current?.(undefined);
            } else {
                onEnhancedStatusRef.current?.('loading');
                // The chunk (and the assets it fetches) is only requested when the visitor chose the enhanced look.
                import('./enhanced/dancingCharacterEnhanced')
                    .then((module) => {
                        if (signal.aborted) return;
                        look = module.createEnhancedLook({
                            renderer,
                            scene,
                            club: character.clubSet,
                            keyLight: character.keyLight,
                            signal,
                            onStatus: (status) => {
                                // A new look phase is a new thing to measure.
                                monitor?.restartWarmup();
                                onEnhancedStatusRef.current?.(status);
                            },
                        });
                        look.apply();
                        if (currentModel) look.onModelChanged(currentModel);
                    })
                    .catch((error: unknown) => {
                        if (signal.aborted) return;
                        // The standard scene keeps rendering; the stored preference is the visitor's to change.
                        console.warn('Enhanced graphics could not be started, using the standard look.', error);
                        look?.dispose();
                        look = undefined;
                        onEnhancedStatusRef.current?.('error');
                    });
            }

            // The snapshot is only refreshed by update(), so it may be stale (the hub started, or this page was left and
            // revisited). Catch up first so the first frame does not read an old low end.
            hub.update();
            let boundAnalyser: AnalyserNode | undefined;
            // The bass envelope over the hub's gate-input bass. A new source gets a fresh one so the old source's levels are
            // not carried over; it is replaced only then, never per frame.
            const newBump = () => new BassBump(DANCER_BUMP);
            let bump = newBump();
            // This frame's gate-input bass before the envelope, and the hub's normalized low end (the input before S4): DEV
            // telemetry records both so a recording can be replayed through other envelopes.
            let gateLevel = 0;
            let lowEnd = 0;
            // One frame object reused every frame so the loop allocates nothing.
            const frame: DancingCharacterFrame = {
                dt: 0,
                gateDt: 0,
                rhythm: rhythm.state,
                bass: 0,
                settings: valuesRef.current,
                cameraLocked: true,
                danceSelection: valuesRef.current.dance,
            };

            // DEV only: the gate's input is the frame's bass (the hub's gate-input bass through the bump envelope); the rest
            // is read from the scene after its update.
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
                        'gridMoves',
                        'octaveHolds',
                        'barVetoes',
                        'lowEnd',
                        'gateBass',
                        'beatsPerLoop',
                        'placedKicks',
                        'phaseOnsets',
                        'sceneBuiltAt',
                        'modelParsedAt',
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
                        out[25] = analysis?.beat.phaseShiftCount ?? 0;
                        out[26] = analysis?.tempo.octaveHoldCount ?? 0;
                        out[27] = analysis?.tempo.barVetoCount ?? 0;
                        out[28] = lowEnd;
                        out[29] = gateLevel;
                        out[30] = character.timing.beatsPerLoop;
                        out[31] = gate.placedKickCount;
                        out[32] = rhythm.phaseOnsets;
                        out[33] = onRecordingClock(sceneBuiltMs, analyserRef.current?.context.currentTime);
                        out[34] = onRecordingClock(modelParsedMs, analyserRef.current?.context.currentTime);
                    },
                );
            }

            return {
                camera,

                update: (_time, delta) => {
                    const locked = cameraLockedRef.current;
                    orbit.setLocked(locked);
                    // Locking again puts the camera back on the dancer, so it also returns to its starting spot, exactly as
                    // Reset view does; otherwise the dragged pose would stay and Reset view would still show.
                    if (locked && !wasLocked) resetCamera();
                    wasLocked = locked;

                    // A different character chosen in the panel: start loading it. The old one stays on screen until the
                    // new one is ready. A choice that just failed is skipped until the control has been put back.
                    const wanted = valuesRef.current.character;
                    if (wanted !== failedId) {
                        failedId = '';
                        if (wanted !== requestedId) loadCharacter(wanted);
                    }

                    // A new source: keep the scene and start the bass envelope afresh.
                    const source = analyserRef.current;
                    if (source !== boundAnalyser) {
                        bump = newBump();
                        boundAnalyser = source;
                        if (source) character.restartDance();
                    }

                    rhythm.updatePhase();
                    hub.update();
                    frame.dt = Math.min(delta / 1000, MAX_FRAME_DT);
                    // The gate keeps its own clock and needs the real gap (the scene makes it finite and at least 0).
                    frame.gateDt = delta / 1000;
                    frame.rhythm = rhythm.state;
                    // With no source the hub has nothing to read, so the gate sees silence.
                    lowEnd = source ? hubLowEnd(hub.snapshot.bands) : 0;
                    gateLevel = source ? hub.snapshot.gateBass.pulse : 0;
                    frame.bass = source ? bump.step(gateLevel, frame.dt) : 0;
                    frame.settings = valuesRef.current;
                    frame.danceSelection = valuesRef.current.dance;
                    frame.cameraLocked = cameraLockedRef.current;
                    character.update(frame);

                    if (monitor?.sample(delta, document.visibilityState === 'hidden') && !isSlowNoticeDismissed()) {
                        onSlowFramesRef.current?.();
                    }

                    if (import.meta.env.DEV) {
                        tickTelemetry(delta / 1000);
                    }
                },

                resize: () => {
                    character.resize();
                    look?.resize();
                },

                dispose: () => {
                    poseRef.current = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
                    loadController?.abort();
                    look?.dispose();
                    orbit.dispose();
                    character.dispose();
                    unregisterProbe?.();
                },
            };
        },
        { antialias: enhanced },
    );

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}
