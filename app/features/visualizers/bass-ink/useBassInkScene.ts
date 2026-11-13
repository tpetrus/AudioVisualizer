import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { bassInkConfig } from './bassInkConfig';
import type { BassInkControlValues } from './bassInkControls';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { PalettePair } from './bassInkTypes';
import { BrightnessMix } from './brightnessMix';
import { blendPalette, writePalette } from './chromaPalette';
import { bassBinCount, bassLevel, EnergyTracker, followLevel } from './energyEnvelope';
import { InkCloud } from './inkCloud';
import { KickRing } from './kickRing';
import { advance, beatPunch, createMotionClock } from './motionClock';
import { isSoftwareRenderer, maxPointSize, pointCountFor } from './renderBudget';
import { SetDirector } from './setDirector';
import { SpectrumField } from './spectrumField';
import { registerTelemetryProbe, tickTelemetry } from '~/features/audio/devTelemetry';
import { createBassGateState, stepBassGate } from '~/features/rhythm/bassGate';
import { BassPulse } from '~/features/rhythm/bassPulse';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { useLatestRef } from '~/hooks/useLatestRef';
import { useThreeScene } from '~/hooks/useThreeScene';
import { createOrbitView } from '~/lib/three/orbitView';

// Frequency data: 2048 samples gives bins of about 23 Hz, so the bass below 120 Hz spans about five of them.
// useThreeScene renders at most at this pixel ratio, and gl_PointSize is in drawing-buffer pixels.
const MAX_PIXEL_RATIO = 2;

interface BassInkSceneOptions {
    analyser: AnalyserNode | undefined;
    // The app-wide rhythm tracker: a stable instance, so the scene reads its state without a ref.
    rhythm: RhythmTracker;
    valuesRef: { readonly current: BassInkControlValues };
    // Locked means the picture can't be dragged, rotated or zoomed.
    cameraLocked: boolean;
    onViewChanged: (changed: boolean) => void;
}

function createPalette(): PalettePair {
    return { core: new Float32Array(3), edge: new Float32Array(3) };
}

function copyPalette(from: PalettePair, to: PalettePair): void {
    to.core.set(from.core);
    to.edge.set(from.edge);
}

// A cloud of ink-like points that breathes with the tempo, ripples on every kick, tightens during a build and reforms
// into a new shape on the drop.
export function useBassInkScene(
    containerRef: RefObject<HTMLElement | null>,
    { analyser, rhythm, valuesRef, cameraLocked, onViewChanged }: BassInkSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const resetViewRef = useRef<() => void>(() => {});

    useThreeScene(containerRef, ({ scene, renderer, size }) => {
        const { camera: cameraConfig, maxFrameDeltaSeconds } = bassInkSceneConfig;
        const camera = new THREE.PerspectiveCamera(
            cameraConfig.fov,
            size.width / size.height,
            cameraConfig.near,
            cameraConfig.far,
        );
        camera.position.set(0, 0, cameraConfig.distance);
        scene.background = new THREE.Color(0x000000);

        const orbit = createOrbitView(camera, renderer.domElement, {
            locked: cameraLockedRef.current,
            onViewChanged: (changed) => onViewChangedRef.current(changed),
        });
        resetViewRef.current = orbit.reset;

        const software = isSoftwareRenderer(renderer);
        const pointSizeLimit = maxPointSize(renderer);
        const formationSeed = bassInkConfig.director.formationSeed;
        const pixelHeight = (height: number) => height * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

        // Set logic: all of it framework-free and preallocated.
        const energy = new EnergyTracker();
        const kickRing = new KickRing();
        const director = new SetDirector();
        const clock = createMotionClock();
        const brightnessMix = new BrightnessMix();
        // Shared with the dancing character: learns where the bassline's kick sits in the beat and pulses there.
        const bassGate = createBassGateState();
        const field = new SpectrumField();
        // The oldest row a point reads, as a texture-coordinate distance back from the newest one.
        const spectrumSpan = (field.rows - 1) / field.rows;
        const cue = director.cue;

        let cloud = new InkCloud(pointCountFor(valuesRef.current.density, software), formationSeed, pointSizeLimit);
        // Kept current by resize, for clouds built later.
        let viewHeight = size.height;
        cloud.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
        cloud.object.rotation.x = bassInkSceneConfig.cloud.tilt;
        scene.add(cloud.object);

        // The palette fades from the previous pair to the latest one across each transition.
        const paletteFrom = createPalette();
        const paletteTo = createPalette();
        const paletteShown = createPalette();
        writePalette(cue.paletteIndex, paletteShown);
        copyPalette(paletteShown, paletteFrom);
        copyPalette(paletteShown, paletteTo);
        let paletteStart = 0;
        let paletteSeconds = 0;

        // Compared with the cue's counter each frame to notice a new transition without events or allocation.
        let seenTransitions = cue.transitionCount;

        // Audio state, rebuilt whenever the analyser changes.
        let boundAnalyser: AnalyserNode | undefined;
        let bassPulse: BassPulse | undefined;
        let spectrum = new Uint8Array(0);
        let bassBins = 1;
        let sceneTime = 0;
        let lastLevel = 0;
        let lastBrightness = 0;
        let lastKickStrength = 0;
        let lastBassPulse = 0;
        // Followed mid and high band levels for the swirl and the glints.
        let midLevel = 0;
        let highLevel = 0;

        // DEV only: reports the set logic's latest values to the telemetry recorder.
        let unregisterProbe: (() => void) | undefined;
        if (import.meta.env.DEV) {
            unregisterProbe = registerTelemetryProbe(
                'bass-ink',
                [
                    'in',
                    'out',
                    'fast',
                    'slow',
                    'ratio',
                    'novelty',
                    'phase',
                    'tension',
                    'grants',
                    'lockWeight',
                    'kicks',
                    'transitions',
                    'formation',
                    'tempoConf',
                    'beats',
                    'mid',
                    'gateOpen',
                    'gateIn',
                ],
                (out) => {
                    out[0] = lastLevel;
                    out[1] = lastBrightness;
                    out[2] = energy.fast;
                    out[3] = energy.slow;
                    out[4] = energy.ratio;
                    out[5] = rhythm.state.novelty;
                    out[6] = director.phaseCode;
                    out[7] = cue.tension;
                    out[8] = brightnessMix.grantCount;
                    out[9] = clock.beatLockWeight;
                    out[10] = kickRing.count;
                    out[11] = cue.transitionCount;
                    out[12] = cue.formationIndex;
                    out[13] = rhythm.state.tempoConfidence;
                    out[14] = rhythm.state.beatCount;
                    out[15] = midLevel;
                    out[16] = bassGate.open ? 1 : 0;
                    out[17] = lastBassPulse;
                },
            );
        }

        const bindAudio = (source: AnalyserNode) => {
            spectrum = new Uint8Array(source.frequencyBinCount);
            bassBins = bassBinCount(source.context.sampleRate, source.fftSize, bassInkConfig.energy.bassCutoffHz);
            // A different source is different music: forget the old loudness history.
            energy.reset();
            field.reset();
            bassPulse?.dispose();
            bassPulse = new BassPulse(source);
            boundAnalyser = source;
        };

        return {
            camera,

            update: (_time, delta) => {
                const values = valuesRef.current;
                orbit.setLocked(cameraLockedRef.current);

                // The scene clock sums clamped deltas, so a stall cannot make the envelopes or the fades jump.
                const dt = Math.min(delta / 1000, maxFrameDeltaSeconds);
                sceneTime += dt;
                const now = sceneTime;

                const source = analyserRef.current;
                if (source) {
                    // A new source: keep the scene and just rebind.
                    if (source !== boundAnalyser) {
                        bindAudio(source);
                    }
                    source.getByteFrequencyData(spectrum);
                    lastLevel = bassLevel(spectrum, bassBins);
                    field.update(spectrum, source.context.sampleRate / source.fftSize, dt);
                } else {
                    lastLevel = 0;
                    field.fade(dt);
                }
                energy.update(lastLevel, dt);

                rhythm.updatePhase();
                const state = rhythm.state;
                const breathing = advance(clock, state, dt);
                // The gate trusts the beat exactly when the breathing does, so the two never disagree about the tempo.
                lastBassPulse = source && bassPulse ? bassPulse.update() : 0;
                stepBassGate(lastBassPulse, state, clock.locked, bassGate, dt);
                const kickFired = kickRing.update(bassGate, now);
                if (kickFired) {
                    lastKickStrength = kickRing.strengths[(kickRing.count - 1) % kickRing.strengths.length];
                }
                director.update(state, energy, now);

                // A density change is rare (the settings are used before the set), so it simply rebuilds the cloud.
                const wantedPoints = pointCountFor(values.density, software);
                if (wantedPoints !== cloud.pointCount) {
                    const turned = cloud.object.rotation.y;
                    scene.remove(cloud.object);
                    cloud.dispose();
                    cloud = new InkCloud(wantedPoints, formationSeed, pointSizeLimit);
                    cloud.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
                    cloud.object.rotation.set(bassInkSceneConfig.cloud.tilt, turned, 0);
                    // A rebuilt cloud shows the formation the director is on, so nothing seems to change.
                    cloud.showFormation(cue.formationIndex, formationSeed);
                    scene.add(cloud.object);
                }

                // Fill the next formation ahead of time, while no fade is running.
                if (!cloud.transitioning && cloud.preparedIndex !== cue.nextFormationIndex) {
                    cloud.prepareFormation(cue.nextFormationIndex, formationSeed + cue.transitionCount);
                }
                if (cue.transitionCount !== seenTransitions) {
                    seenTransitions = cue.transitionCount;
                    // The target is the director's next formation; a restart mid-fade bakes the picture first.
                    if (cloud.preparedIndex !== cue.nextFormationIndex) {
                        cloud.prepareFormation(cue.nextFormationIndex, formationSeed + cue.transitionCount);
                    }
                    cloud.beginTransition(cue.transitionStart, cue.transitionSeconds);
                    copyPalette(paletteShown, paletteFrom);
                    writePalette(cue.paletteIndex, paletteTo);
                    paletteStart = cue.transitionStart;
                    paletteSeconds = cue.transitionSeconds;
                }
                const paletteProgress = paletteSeconds > 0 ? (now - paletteStart) / paletteSeconds : 1;
                blendPalette(paletteFrom, paletteTo, Math.min(1, Math.max(0, paletteProgress)), paletteShown);

                lastBrightness = brightnessMix.update(cue, kickFired, lastKickStrength, now, dt, values.intensity);

                const { turbulence, sparkle } = bassInkSceneConfig;
                midLevel = followLevel(
                    midLevel,
                    state.bandOnsets[1],
                    turbulence.midAttackSeconds,
                    turbulence.midReleaseSeconds,
                    dt,
                );
                highLevel = followLevel(
                    highLevel,
                    state.bandOnsets[2],
                    sparkle.attackSeconds,
                    sparkle.releaseSeconds,
                    dt,
                );
                // The glints add a little light, so they follow the flash intensity like every other brightness term.
                cloud.setTexture(midLevel, highLevel * values.intensity, values.turbulence);
                // The punch fades with the bass, so a breakdown with the bass pulled out calms down with it.
                cloud.setSpectrum(field.texture, field.headCoordinate, spectrumSpan);
                cloud.setPunch(beatPunch(clock) * Math.min(1, energy.ratio));
                cloud.update(cue, breathing, kickRing, paletteShown, lastBrightness, now);
                // The cloud turns slowly; rotating the object (not the camera) keeps the orbit's reset position.
                cloud.object.rotation.y += values.cameraDrift * cameraConfig.driftSpeed * dt;

                if (import.meta.env.DEV) {
                    tickTelemetry(delta / 1000);
                }
            },

            resize: (next) => {
                viewHeight = next.height;
                cloud.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
            },

            dispose: () => {
                orbit.dispose();
                bassPulse?.dispose();
                field.dispose();
                cloud.dispose();
                unregisterProbe?.();
            },
        };
    });

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}
