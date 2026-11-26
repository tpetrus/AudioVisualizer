import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { bassInkConfig } from './bassInkConfig';
import type { BassInkControlValues } from './bassInkControls';
import { BassInkPost, type PostSettings } from './bassInkPost';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { FORMATION_COUNT, type PalettePair } from './bassInkTypes';
import { swellFromBump, type BassSwell } from './bassInkBass';
import { BrightnessMix } from './brightnessMix';
import { advanceHuePhase, writeCustomPalette } from './bassInkColor';
import { bassBinCount, bassLevel, EnergyTracker, followLevel } from './energyEnvelope';
import { fitScale, formationOuterRadius } from './framing';
import { DustField } from './dustField';
import { InkCloud } from './inkCloud';
import { KickRing } from './kickRing';
import { advance, beatPunch, createMotionClock } from './motionClock';
import { isSoftwareRenderer, maxPointSize, pointCountFor } from './renderBudget';
import { SetDirector } from './setDirector';
import { SpectrumField } from './spectrumField';
import { SprayPool, SprayTrigger } from './sprayPool';
import { BassBump, GATE_BASS_BUMP } from '~/features/audio/hub/bassBump';
import type { AudioHubReader } from '~/features/audio/hub/types';
import { registerTelemetryProbe, tickTelemetry } from '~/features/audio/devTelemetry';
import { onRecordingClock } from '~/features/audio/devRecordingClock';
import { createBassGateState, stepBassGate } from '~/features/rhythm/bassGate';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { useLatestRef } from '~/hooks/useLatestRef';
import { useThreeScene } from '~/hooks/useThreeScene';
import { createOrbitView } from '~/lib/three/orbitView';

// Frequency data: 2048 samples gives bins of about 23 Hz, so the bass below 120 Hz spans about five of them.
// useThreeScene renders at most at this pixel ratio, and gl_PointSize is in drawing-buffer pixels.
const MAX_PIXEL_RATIO = 2;
// The density slider must rest this long before the cloud is rebuilt.
const DENSITY_SETTLE_SECONDS = 0.25;
// The fit follows a change of target (a formation baked mid-fade) with this time constant, so the size never jumps.
const FIT_FOLLOW_SECONDS = 0.15;

interface BassInkSceneOptions {
    // Still owned for the spectrum field and the energy level; the gate's bass comes from the hub.
    analyser: AnalyserNode | undefined;
    // The app-wide audio hub: a stable instance, so the scene reads its snapshot without a ref.
    hub: AudioHubReader;
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

// A cloud of ink-like points that breathes with the tempo, ripples on every kick, tightens during a build and reforms
// into a new shape on the drop.
export function useBassInkScene(
    containerRef: RefObject<HTMLElement | null>,
    { analyser, hub, rhythm, valuesRef, cameraLocked, onViewChanged }: BassInkSceneOptions,
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
        // Trails and a glow over the picture. One settings object is reused so applying them allocates nothing.
        const post = new BassInkPost(renderer, scene, camera, size, software);
        const postSettings: PostSettings = { trails: 0, glow: 0 };
        const pointSizeLimit = maxPointSize(renderer);
        const formationSeed = bassInkConfig.director.formationSeed;
        const pixelHeight = (height: number) => height * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

        // DEV only: when this scene was built, on the page clock (`performance.now()`, ms); the probe turns it into the
        // recording's own `t` clock.
        const sceneBuiltMs = import.meta.env.DEV ? performance.now() : NaN;

        // Set logic: all of it framework-free and preallocated.
        const energy = new EnergyTracker();
        const kickRing = new KickRing();
        const director = new SetDirector();
        const clock = createMotionClock();
        const brightnessMix = new BrightnessMix();
        // Shared with the dancing character: learns where the bassline's kick sits in the beat and pulses there.
        const bassGate = createBassGateState();
        // The snapshot is only refreshed by update(), so it may be stale (the hub started, or this page was left and
        // revisited). Catch up first so the first frame does not read an old gate bass.
        hub.update();
        // The bass envelope over the hub's gate-input bass, the same one the dancing character uses. A new source gets a
        // fresh one so the old source's levels are not carried over; it is replaced only then, never per frame.
        const newBump = () => new BassBump(GATE_BASS_BUMP);
        let bump = newBump();
        // True while a source feeds the envelope, so one that goes away and comes back starts afresh too.
        let bumpHasSource = false;
        const field = new SpectrumField();
        // The oldest row a point reads, as a texture-coordinate distance back from the newest one.
        const spectrumSpan = (field.rows - 1) / field.rows;
        const cue = director.cue;

        const { core: coreConfig, dust: dustConfig, spray: sprayConfig } = bassInkSceneConfig;
        // The core takes its points out of the shell's, so the two together draw what the shell alone used to.
        const shellPointsFor = (total: number) => Math.round(total * (1 - coreConfig.pointShare));
        const dustPointsFor = (total: number) => {
            const wanted = Math.round(total * dustConfig.pointShare);
            return software ? Math.min(wanted, dustConfig.softwareCap) : wanted;
        };
        const sprayPoolSize = software ? sprayConfig.softwarePoolSize : sprayConfig.poolSize;
        const sprayPerBurst = software ? sprayConfig.softwarePerBurst : sprayConfig.perBurst;
        // Kept current by resize, for objects built later.
        let viewHeight = size.height;
        // The core is always the core formation: only the shell is ever prepared or transitioned (the core's update
        // reads the cue's tension only, never its formation), so it keeps this shape for its life.
        const buildCore = (total: number) => {
            const built = new InkCloud(total - shellPointsFor(total), formationSeed, pointSizeLimit, {
                swellAmplitude: coreConfig.swellAmplitude,
                displacementScale: coreConfig.displacementScale,
                alphaScale: coreConfig.alphaScale,
            });
            built.showFormation(coreConfig.formation, formationSeed);
            built.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
            return built;
        };
        const buildDust = (total: number) => {
            const built = new DustField(dustPointsFor(total), formationSeed, pointSizeLimit);
            built.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
            return built;
        };
        const buildSpray = () => {
            const built = new SprayPool(sprayPoolSize, formationSeed, pointSizeLimit);
            built.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
            return built;
        };

        // The density control's total; the shell, core, dust and spray sizes all derive from it.
        let builtTotal = pointCountFor(valuesRef.current.density, software);
        let cloud = new InkCloud(shellPointsFor(builtTotal), formationSeed, pointSizeLimit);
        let core = buildCore(builtTotal);
        let dust = buildDust(builtTotal);
        let spray = buildSpray();
        const sprayTrigger = new SprayTrigger();
        // The point count the slider asks for and how long it has held, for the rebuild's wait.
        let pendingPoints = builtTotal;
        let pendingSeconds = 0;
        cloud.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
        cloud.object.rotation.x = bassInkSceneConfig.cloud.tilt;
        // The core and the spray turn with the shell; the dust has its own slow drift.
        const syncRotation = () => {
            core.object.rotation.copy(cloud.object.rotation);
            spray.object.rotation.copy(cloud.object.rotation);
        };
        syncRotation();
        scene.add(cloud.object, core.object, dust.object, spray.object);

        // Fit the cloud to the view: the camera stays put and the cloud's world radius is scaled instead. Each formation
        // has its own outermost point, so each has its own fit, solved so the cloud stays on screen at the peak of every
        // pulse; the fits depend on the aspect, so they are redone on resize.
        // The extents are measured once here (allocating is fine on mount) and never per frame.
        const extents = Array.from({ length: FORMATION_COUNT }, (_, index) =>
            formationOuterRadius(index, formationSeed),
        );
        const fits = new Float64Array(FORMATION_COUNT);
        const computeFits = (width: number, height: number) => {
            const aspect = height > 0 ? width / height : 1;
            for (let i = 0; i < FORMATION_COUNT; i++) {
                fits[i] = fitScale(
                    extents[i],
                    cameraConfig.distance,
                    cameraConfig.fov,
                    aspect,
                    bassInkSceneConfig.cloud.fill,
                );
            }
        };
        // The fit for what the cloud shows now: a blend of the two formations while a fade runs, with the same smoothing
        // the shader applies. Right after a retarget froze a blend (no active formation) it aims at the prepared one.
        let fit = 1;
        // The shell's world radius as last given to setRadius, which spray bursts leave from.
        let shellRadius = bassInkSceneConfig.cloud.radius;
        const fitTarget = (): number => {
            const from = cloud.activeIndex;
            const to = cloud.preparedIndex;
            if (from < 0) {
                return to >= 0 ? fits[to] : fit;
            }
            if (!cloud.transitioning || to < 0) {
                return fits[from];
            }
            const t = cloud.blendProgress;
            return fits[from] + (fits[to] - fits[from]) * t * t * (3 - 2 * t);
        };
        // Sets the radius at once (mount, resize, a rebuilt cloud) or lets it follow over `dt` seconds.
        const applyFit = (dt: number) => {
            const target = fitTarget();
            fit = dt > 0 ? fit + (target - fit) * (1 - Math.exp(-dt / FIT_FOLLOW_SECONDS)) : target;
            shellRadius = bassInkSceneConfig.cloud.radius * fit;
            cloud.setRadius(shellRadius);
            // The core is a share of the shell's world radius (framing.ts checks its envelope at that size), not of the fit
            // multiplier.
            core.setRadius(shellRadius * coreConfig.radiusScale);
        };
        computeFits(size.width, size.height);
        applyFit(0);

        // The palette the cloud is drawn with. It is written straight from the pickers every frame and never faded
        // across a formation transition, so a picker change shows at full strength on the next frame.
        const paletteShown = createPalette();
        // The three picked colors (linear) and the hex strings they were parsed from, so a string is parsed only when
        // the control changes. Empty strings never match a control value, so the first write parses all three.
        const pickedColors = [new THREE.Color(), new THREE.Color(), new THREE.Color()] as const;
        const pickedHex = ['', '', ''];
        let huePhase = 0;
        const parsePicked = (index: number, hex: string) => {
            if (hex === pickedHex[index]) return;
            pickedHex[index] = hex;
            // Color.set reads a CSS hex as sRGB and stores it in linear light, as the cubes visualizer does.
            pickedColors[index].set(hex);
        };
        const writePicked = (out: PalettePair) => {
            const picked = valuesRef.current;
            parsePicked(0, picked.colorA);
            parsePicked(1, picked.colorB);
            parsePicked(2, picked.colorC);
            writeCustomPalette(pickedColors, huePhase, out);
        };
        writePicked(paletteShown);

        // Compared with the cue's counter each frame to notice a new transition without events or allocation.
        let seenTransitions = cue.transitionCount;

        // Audio state, rebuilt whenever the analyser changes.
        let boundAnalyser: AnalyserNode | undefined;
        let spectrum = new Uint8Array(0);
        let bassBins = 1;
        let sceneTime = 0;
        let lastLevel = 0;
        let lastBrightness = 0;
        let lastKickStrength = 0;
        let lastGateBass = 0;
        // The bass swell and glow derived from lastGateBass each frame; preallocated so nothing is created per frame.
        const swellOut: BassSwell = { swell: 0, glow: 0 };
        // The hub's gate bass before the envelope, kept to tell a weak hub signal from a weak envelope in telemetry.
        let lastGateRaw = 0;
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
                    'gateRaw',
                    'sceneBuiltAt',
                    'swell',
                    'glow',
                    'fit',
                    'huePhase',
                    'sprayBursts',
                    'sprayLive',
                    'postActive',
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
                    out[17] = lastGateBass;
                    out[18] = lastGateRaw;
                    out[19] = onRecordingClock(sceneBuiltMs, analyserRef.current?.context.currentTime);
                    out[20] = swellOut.swell;
                    out[21] = swellOut.glow;
                    // The applied radius over the base radius, and the color cycle's position.
                    out[22] = fit;
                    out[23] = huePhase;
                    out[24] = spray.burstCount;
                    out[25] = spray.liveCount;
                    out[26] = post.active ? 1 : 0;
                },
            );
        }

        const bindAudio = (source: AnalyserNode) => {
            spectrum = new Uint8Array(source.frequencyBinCount);
            bassBins = bassBinCount(source.context.sampleRate, source.fftSize, bassInkConfig.energy.bassCutoffHz);
            // A different source is different music: forget the old loudness history.
            energy.reset();
            field.reset();
            bump = newBump();
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
                // The gate keeps its own clock and needs the real gap, made finite and at least 0 (the dancer's rule).
                const rawDt = delta / 1000;
                const gateDt = Number.isFinite(rawDt) ? Math.max(rawDt, 0) : 0;
                const now = sceneTime;

                const source = analyserRef.current;
                if (source) {
                    // A new source: keep the scene and just rebind.
                    if (source !== boundAnalyser) {
                        bindAudio(source);
                    }
                    bumpHasSource = true;
                    source.getByteFrequencyData(spectrum);
                    lastLevel = bassLevel(spectrum, bassBins);
                    field.update(spectrum, source.context.sampleRate / source.fftSize, dt);
                } else {
                    lastLevel = 0;
                    field.fade(dt);
                    if (bumpHasSource) {
                        // The old source's levels must not seed the envelope of whatever comes next.
                        bump = newBump();
                        bumpHasSource = false;
                    }
                }
                energy.update(lastLevel, dt);

                rhythm.updatePhase();
                hub.update();
                const state = rhythm.state;
                const breathing = advance(clock, state, dt);
                // The gate trusts the beat exactly when the breathing does, so the two never disagree about the tempo.
                lastGateRaw = source ? hub.snapshot.gateBass.pulse : 0;
                lastGateBass = source ? bump.step(lastGateRaw, dt) : 0;
                swellFromBump(lastGateBass, swellOut);
                stepBassGate(lastGateBass, state, clock.locked, bassGate, gateDt);
                const kickFired = kickRing.update(bassGate, now);
                if (kickFired) {
                    lastKickStrength = kickRing.strengths[(kickRing.count - 1) % kickRing.strengths.length];
                }
                director.update(state, energy, now);

                // A density change rebuilds the cloud, but only once the slider has rested, so dragging it does not
                // recompile the shader on every step. The wait counts scene time, so no timer outlives the scene. A
                // fade in progress is never cut: the rebuild waits for it, which keeps its formation and its timing.
                const wantedPoints = pointCountFor(values.density, software);
                if (wantedPoints !== pendingPoints) {
                    pendingPoints = wantedPoints;
                    pendingSeconds = 0;
                } else {
                    pendingSeconds += dt;
                }
                if (wantedPoints !== builtTotal && pendingSeconds >= DENSITY_SETTLE_SECONDS && !cloud.transitioning) {
                    const turned = cloud.object.rotation.y;
                    // The new objects are built before the old ones are freed, so the shader programs are reused.
                    const next = new InkCloud(shellPointsFor(wantedPoints), formationSeed, pointSizeLimit);
                    const nextCore = buildCore(wantedPoints);
                    const nextDust = buildDust(wantedPoints);
                    const nextSpray = buildSpray();
                    scene.remove(cloud.object, core.object, dust.object, spray.object);
                    cloud.dispose();
                    core.dispose();
                    dust.dispose();
                    spray.dispose();
                    cloud = next;
                    core = nextCore;
                    dust = nextDust;
                    spray = nextSpray;
                    builtTotal = wantedPoints;
                    cloud.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
                    cloud.setSwell(swellOut.swell);
                    core.setSwell(swellOut.swell);
                    cloud.object.rotation.set(bassInkSceneConfig.cloud.tilt, turned, 0);
                    syncRotation();
                    // A rebuilt cloud shows the formation the director is on, so nothing seems to change.
                    cloud.showFormation(cue.formationIndex, formationSeed);
                    scene.add(cloud.object, core.object, dust.object, spray.object);
                    applyFit(0);
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
                }
                // The picked colors drive the palette every frame, with no fade over a transition, so a picker change
                // made at any moment shows at full strength on the next frame.
                huePhase = advanceHuePhase(huePhase, values.colorSpeed, dt);
                writePicked(paletteShown);

                brightnessMix.update(cue, kickFired, lastKickStrength, now, dt, values.intensity);
                // After the kick flash, so a kick and a bass pulse on one frame share the soft cap in that order.
                brightnessMix.requestBassGlow(swellOut.glow, now, values.intensity);
                lastBrightness = brightnessMix.level;

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
                core.setTexture(midLevel, highLevel * values.intensity, values.turbulence);
                // The punch fades with the bass, so a breakdown with the bass pulled out calms down with it.
                cloud.setSpectrum(field.texture, field.headCoordinate, spectrumSpan);
                core.setSpectrum(field.texture, field.headCoordinate, spectrumSpan);
                const punch = beatPunch(clock) * Math.min(1, energy.ratio);
                cloud.setPunch(punch);
                core.setPunch(punch);
                cloud.setSwell(swellOut.swell);
                core.setSwell(swellOut.swell);
                cloud.update(cue, breathing, kickRing, paletteShown, lastBrightness, now);
                core.update(cue, breathing, kickRing, paletteShown, lastBrightness, now);
                applyFit(dt);
                // The cloud turns slowly; rotating the object (not the camera) keeps the orbit's reset position.
                cloud.object.rotation.y += values.cameraDrift * cameraConfig.driftSpeed * dt;
                syncRotation();

                // A bass hit throws points off the shell, from where its points are now (its local, unrotated space).
                if (sprayTrigger.step(swellOut.swell, now)) {
                    spray.emit(cloud, shellRadius, sprayPerBurst, now, swellOut.swell);
                }
                spray.update(now, paletteShown, values.intensity);
                dust.update(now, highLevel, paletteShown);

                postSettings.trails = values.trails;
                postSettings.glow = values.glow;
                post.apply(postSettings);

                if (import.meta.env.DEV) {
                    tickTelemetry(delta / 1000);
                }
            },

            render: () => post.render(),

            resize: (next) => {
                // A hidden or collapsed container reports a zero side; keep the previous fit rather than fitting to 0.
                if (!(next.width > 0 && next.height > 0)) return;
                viewHeight = next.height;
                cloud.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
                core.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
                dust.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
                spray.setViewport(pixelHeight(viewHeight), cameraConfig.fov);
                computeFits(next.width, next.height);
                applyFit(0);
                post.setSize(next);
            },

            dispose: () => {
                orbit.dispose();
                field.dispose();
                cloud.dispose();
                core.dispose();
                dust.dispose();
                spray.dispose();
                post.dispose();
                unregisterProbe?.();
            },
        };
    });

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}
