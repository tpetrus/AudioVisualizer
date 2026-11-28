// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { PerspectiveCamera, Points, Scene, ShaderMaterial } from 'three';
import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { FakeAudioHub } from '~/test/fakeAudioHub';
import { asTracker, FakeRhythmTracker } from '~/test/fakeEngines';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import { BassBump, GATE_BASS_BUMP } from '~/features/audio/hub/bassBump';
import { getActivePlayback, type FilePlayback } from '~/features/audio/devFileSource';
import { bassInkConfig } from './bassInkConfig';
import { bassInkControls, type BassInkControlValues } from './bassInkControls';
import { MAX_HUE_CYCLES_PER_SECOND } from './bassInkColor';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { writeOrbitPose } from './bassInkOrbit';
import { FORMATION_COUNT, type DirectorCue, type PalettePair } from './bassInkTypes';
import { formationOuterRadius, grownFitScale } from './framing';
import { SprayPool } from './sprayPool';
import { pointCountFor } from './renderBudget';
import { useBassInkScene } from './useBassInkScene';

// vi.mock is hoisted, so the fakes are loaded with a dynamic import inside the factory (see fakeThree.ts).
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

// The file playback the recording's clock reads from; a spec sets what it returns.
vi.mock('~/features/audio/devFileSource', () => ({ getActivePlayback: vi.fn() }));

// The recorder has its own spec; here only what the scene registers and when it ticks matters.
const telemetry = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn(), tick: vi.fn() }));
vi.mock('~/features/audio/devTelemetry', () => ({
    registerTelemetryProbe: (...args: unknown[]) => {
        telemetry.register(...args);
        return telemetry.unregister;
    },
    tickTelemetry: telemetry.tick,
}));

// The bass gate has its own spec; here it is scripted: a spec sets `pulse` to make it start one beat pulse.
const gateScript = vi.hoisted(() => ({
    pulse: false,
    calls: [] as { bass: number; locked: boolean; dt: number }[],
}));
vi.mock('~/features/rhythm/bassGate', async (importOriginal) => {
    const actual = await importOriginal<typeof import('~/features/rhythm/bassGate')>();
    return {
        ...actual,
        stepBassGate: (
            bass: number,
            _rhythm: unknown,
            locked: boolean,
            state: { bumpCount: number; bumpTarget: number; weight: number },
            dt: number,
        ) => {
            gateScript.calls.push({ bass, locked, dt });
            if (gateScript.pulse) {
                gateScript.pulse = false;
                state.bumpCount++;
                state.bumpTarget = 0.9;
                state.weight = 1;
            }
            return 0;
        },
    };
});

// The director is scripted: a spec writes the cue it wants the scene to see.
const script = vi.hoisted(() => ({
    cue: {
        phase: 'groove',
        tension: 0,
        dropAt: -1,
        formationIndex: 0,
        nextFormationIndex: 1,
        paletteIndex: 0,
        transitionStart: -1,
        transitionSeconds: 2,
        transitionCount: 0,
    } as DirectorCue,
}));
vi.mock('./setDirector', () => ({
    SetDirector: class {
        cue = script.cue;
        phaseCode = 2;
        update = vi.fn(() => this.cue);
    },
}));

// The cloud has its own spec; here only how the scene drives it matters.
interface FakeCloud {
    object: { rotation: { x: number; y: number; z: number } };
    pointCount: number;
    seed: number;
    maxPointSize: number;
    options: { swellAmplitude?: number; displacementScale?: number; alphaScale?: number } | undefined;
    preparedIndex: number;
    readonly surfaceScale: number;
    transitioning: boolean;
    prepareFormation: ReturnType<typeof vi.fn>;
    beginTransition: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setTexture: ReturnType<typeof vi.fn>;
    setPunch: ReturnType<typeof vi.fn>;
    setSwell: ReturnType<typeof vi.fn>;
    setFlow: ReturnType<typeof vi.fn>;
    setSpectrum: ReturnType<typeof vi.fn>;
    setViewport: ReturnType<typeof vi.fn>;
    setRadius: ReturnType<typeof vi.fn>;
    setFormationAlpha: ReturnType<typeof vi.fn>;
    activeIndex: number;
    blendProgress: number;
    showFormation: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    restPosition: ReturnType<typeof vi.fn>;
}
// `fail` makes the next cloud's constructor throw, to check what a setup that throws leaves behind.
const clouds = vi.hoisted(() => ({ instances: [] as unknown[], fail: false }));
vi.mock('./inkCloud', async () => {
    const { Object3D } = await import('three');
    const { bassInkSceneConfig: sceneConfig } = await import('./bassInkSceneConfig');
    return {
        InkCloud: class {
            object = new Object3D();
            // The real getter's squeeze term alone (no breath, punch or swell), driven by the director's tension.
            get surfaceScale(): number {
                return 1 - script.cue.tension * sceneConfig.cloud.tensionSqueeze;
            }
            preparedIndex = -1;
            transitioning = false;
            prepareFormation = vi.fn((index: number) => {
                this.preparedIndex = index;
            });
            beginTransition = vi.fn();
            update = vi.fn();
            setTexture = vi.fn();
            setPunch = vi.fn();
            setSwell = vi.fn();
            setFlow = vi.fn();
            setSpectrum = vi.fn();
            setViewport = vi.fn();
            setRadius = vi.fn();
            setFormationAlpha = vi.fn();
            activeIndex = 0;
            blendProgress = 0;
            showFormation = vi.fn();
            dispose = vi.fn();
            // A unit point on the x axis, enough for the spray to leave from.
            restPosition = vi.fn((_index: number, out: Float32Array) => {
                out[0] = 1;
                out[1] = 0;
                out[2] = 0;
            });
            constructor(
                public pointCount: number,
                public seed: number,
                public maxPointSize: number,
                public options?: { swellAmplitude?: number; displacementScale?: number; alphaScale?: number },
            ) {
                if (clouds.fail) {
                    clouds.fail = false;
                    throw new Error('cloud failed');
                }
                clouds.instances.push(this);
            }
        },
    };
});
// The post-processing has its own spec; here it records how the scene drives it. Its render still draws plainly, so
// the specs that read the renderer's calls keep working.
const posts = vi.hoisted(() => ({ instances: [] as unknown[] }));
vi.mock('./bassInkPost', () => ({
    BassInkPost: class {
        active = false;
        apply = vi.fn();
        setSize = vi.fn();
        dispose = vi.fn();
        render = vi.fn(() => {
            (this.renderer as { render: (scene: unknown, camera: unknown) => void }).render(this.scene, this.camera);
        });
        constructor(
            public renderer: unknown,
            public scene: unknown,
            public camera: unknown,
            public size: { width: number; height: number },
            public software: boolean,
        ) {
            posts.instances.push(this);
        }
    },
}));
// The enhanced look has its own spec; here it records how the scene drives it. `enhancedModule.fail` makes the next
// build throw.
const enhancedModule = vi.hoisted(() => ({
    handles: [] as unknown[],
    fail: false,
}));
vi.mock('./enhanced/bassInkEnhanced', () => ({
    buildBassInkEnhanced: vi.fn((context: unknown, materials: unknown) => {
        if (enhancedModule.fail) throw new Error('build failed');
        const handle = {
            context,
            materials,
            enabled: false,
            failed: false,
            renderScale: 1,
            setEnabled: vi.fn((on: boolean) => {
                handle.enabled = on;
            }),
            setMaterials: vi.fn(),
            setSize: vi.fn(),
            setGlow: vi.fn(),
            step: vi.fn(),
            dispose: vi.fn(),
        };
        enhancedModule.handles.push(handle);
        return handle;
    }),
}));
interface FakeEnhanced {
    enabled: boolean;
    failed: boolean;
    renderScale: number;
    setEnabled: ReturnType<typeof vi.fn>;
    setMaterials: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    setGlow: ReturnType<typeof vi.fn>;
    step: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
}
const enhancedHandles = () => enhancedModule.handles as FakeEnhanced[];
// Forces the software-renderer answer for the specs that need it.
const software = vi.hoisted(() => ({ value: false }));
vi.mock('./renderBudget', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./renderBudget')>();
    return {
        ...actual,
        isSoftwareRenderer: vi.fn(
            (renderer: Parameters<typeof actual.isSoftwareRenderer>[0]) =>
                software.value || actual.isSoftwareRenderer(renderer),
        ),
    };
});
// Lets the dynamic import and its handlers run.
const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
};

interface FakePost {
    active: boolean;
    apply: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    size: { width: number; height: number };
    software: boolean;
}
const currentPost = () => posts.instances.at(-1) as FakePost;

// The shell is built without options and the core with them, so most specs read the shell through these two.
const everyCloud = () => clouds.instances as FakeCloud[];
const allClouds = () => everyCloud().filter((cloud) => cloud.options === undefined);
const allCores = () => everyCloud().filter((cloud) => cloud.options !== undefined);
const currentCloud = () => allClouds().at(-1)!;
const currentCore = () => allCores().at(-1)!;
// The core's object is the fake core's own; the spray is the one child whose material has the spray's alpha uniform
// (the dust has none), so neither is found by its place in the scene's child list.
const sprayOf = (scene: Scene) =>
    scene.children.find((child) => {
        const material = (child as unknown as { material?: { uniforms?: Record<string, unknown> } }).material;
        return material?.uniforms !== undefined && 'uAlphaScale' in material.uniforms;
    })!;

const probeRead = () => telemetry.register.mock.calls.at(-1)![2] as (out: Float32Array) => void;
function readProbe(): Float32Array {
    const out = new Float32Array(33);
    probeRead()(out);
    return out;
}

// The shell's share of the density control's total: the core takes the rest.
const shellPoints = (total: number) => Math.round(total * (1 - bassInkSceneConfig.core.pointShare));

function createAnalyser() {
    const context = new FakeAudioContext();
    const analyser = new FakeAnalyserNode(context);
    return { analyser, node: asWebAudio<AnalyserNode>(analyser) };
}

interface Props {
    analyser: AnalyserNode | undefined;
    cameraLocked: boolean;
    enhanced?: boolean;
}

function createContainer(width: number, height: number): HTMLDivElement {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: width });
    Object.defineProperty(container, 'clientHeight', { value: height });
    return container;
}

function mountScene(initial: Partial<Props> = {}) {
    const resizes = installFakeResizeObserver();
    const tracker = new FakeRhythmTracker();
    const hub = new FakeAudioHub();
    const containerRef = { current: createContainer(800, 600) };
    const valuesRef: { current: BassInkControlValues } = { current: defaultValues(bassInkControls) };
    const onViewChanged = vi.fn();
    const onEnhancedStatus = vi.fn();

    const hook = renderHook(
        ({ analyser, cameraLocked, enhanced }: Props) =>
            useBassInkScene(containerRef, {
                analyser,
                hub,
                rhythm: asTracker(tracker),
                valuesRef,
                cameraLocked,
                onViewChanged,
                enhanced,
                onEnhancedStatus,
            }),
        { initialProps: { analyser: undefined, cameraLocked: true, ...initial } as Props },
    );

    const renderer = FakeRenderer.last;
    let time = 0;
    // Advances by `milliseconds` (16 ms per frame by default).
    const frame = (milliseconds = 16) => {
        renderer.renderFrame(time);
        time += milliseconds;
    };
    frame();
    const [scene, camera] = renderer.render.mock.calls[0] as unknown as [Scene, PerspectiveCamera];
    return {
        ...hook,
        renderer,
        scene,
        camera,
        frame,
        tracker,
        hub,
        valuesRef,
        onViewChanged,
        onEnhancedStatus,
        resizes,
        containerRef,
    };
}

// The palette and the cue time the cloud was last updated with, as copies (the scene reuses one palette object).
function lastUpdate() {
    const args = currentCloud().update.mock.calls.at(-1)!;
    const palette = args[3] as PalettePair;
    return {
        cue: args[0] as DirectorCue,
        breathing: args[1] as number,
        kicks: args[2] as { count: number; strengths: Float32Array },
        core: Array.from(palette.core),
        brightness: args[4] as number,
        time: args[5] as number,
    };
}

function scroll(element: HTMLElement, deltaY: number): void {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
}

describe('useBassInkScene', () => {
    beforeEach(() => {
        clouds.instances = [];
        posts.instances = [];
        gateScript.pulse = false;
        gateScript.calls = [];
        telemetry.register.mockClear();
        telemetry.unregister.mockClear();
        telemetry.tick.mockClear();
        Object.assign(script.cue, {
            phase: 'groove',
            tension: 0,
            dropAt: -1,
            formationIndex: 0,
            nextFormationIndex: 1,
            paletteIndex: 0,
            transitionStart: -1,
            transitionSeconds: 2,
            transitionCount: 0,
        });
    });

    describe('building the scene', () => {
        it('renders one canvas with a black background and a camera at the configured distance', () => {
            const { renderer, scene, camera, containerRef } = mountScene();

            expect(containerRef.current.querySelectorAll('canvas')).toHaveLength(1);
            expect(containerRef.current.contains(renderer.domElement)).toBe(true);
            expect(scene.background).not.toBeNull();
            expect(camera.position.z).toBe(bassInkSceneConfig.camera.distance);
            expect(camera.fov).toBe(bassInkSceneConfig.camera.fov);
        });

        it('builds one cloud sized from the density, with the fallback point size on a renderer without a context', () => {
            const { scene } = mountScene();

            expect(allClouds()).toHaveLength(1);
            const cloud = currentCloud();
            expect(cloud.pointCount).toBe(shellPoints(pointCountFor(0.8, false)));
            expect(cloud.seed).toBe(bassInkConfig.director.formationSeed);
            expect(cloud.maxPointSize).toBe(bassInkSceneConfig.points.fallbackMaxPointSize);
            expect(scene.children).toContain(cloud.object);
            expect(cloud.object.rotation.x).toBe(bassInkSceneConfig.cloud.tilt);
            expect(cloud.setViewport).toHaveBeenCalledWith(expect.any(Number), bassInkSceneConfig.camera.fov);
        });

        it('feeds the new height to the cloud when the view is resized', () => {
            const { resizes, frame } = mountScene();
            const calls = currentCloud().setViewport.mock.calls.length;

            resizes.resize(1000, 900);
            frame();

            expect(currentCloud().setViewport.mock.calls.length).toBe(calls + 1);
            expect(currentCloud().setViewport.mock.calls.at(-1)![0]).toBeGreaterThanOrEqual(900);
        });
    });

    describe('fitting the cloud to the view', () => {
        const radiusOf = (cloud: FakeCloud) => cloud.setRadius.mock.calls.at(-1)![0] as number;

        it('sets a fitted radius on mount that keeps the pulsing cloud inside the view', () => {
            mountScene();
            const first = currentCloud().setRadius.mock.calls[0][0] as number;
            // The fit leaves room for every pulse, so the resting cloud is smaller than the unfitted radius ...
            expect(first).toBeGreaterThan(1);
            expect(first).toBeLessThan(bassInkSceneConfig.cloud.radius);
            // ... and it is the solved fit of one of the formations for the 800 x 600 view the scene is mounted in.
            const { fov, distance } = bassInkSceneConfig.camera;
            const fits = Array.from({ length: FORMATION_COUNT }, (_, index) => {
                const outer = formationOuterRadius(index, bassInkConfig.director.formationSeed);
                return (
                    bassInkSceneConfig.cloud.radius *
                    grownFitScale(
                        outer,
                        bassInkSceneConfig.cloud.formationGrowth[index],
                        distance,
                        fov,
                        800 / 600,
                        bassInkSceneConfig.cloud.fill,
                    )
                );
            });
            expect(fits.some((fit) => Math.abs(fit - first) < 1e-9)).toBe(true);
        });

        it('refits the radius on resize and leaves the camera where it was', () => {
            const { resizes, frame, camera } = mountScene();
            frame();
            const before = radiusOf(currentCloud());
            const position = camera.position.clone();

            // A portrait view: the width is now the smaller dimension, so the cloud must shrink to fit it.
            resizes.resize(500, 1000);
            const after = radiusOf(currentCloud());

            expect(after).toBeLessThan(before);
            expect(camera.position.equals(position)).toBe(true);
            // The orbit has moved it a hair along its circle by now, which keeps it at the same distance.
            expect(camera.position.length()).toBeCloseTo(bassInkSceneConfig.camera.distance, 9);
        });

        it('keeps the previous fit when a resize gives no width or no height', () => {
            const { resizes, frame } = mountScene();
            frame();
            const before = radiusOf(currentCloud());
            resizes.resize(0, 600);
            resizes.resize(800, 0);
            resizes.resize(0, 0);
            const after = radiusOf(currentCloud());
            expect(Number.isFinite(after)).toBe(true);
            expect(after).toBeGreaterThan(0);
            expect(after).toBe(before);
        });

        it('treats a view with no height as square instead of dividing by zero', () => {
            const { resizes } = mountScene();
            resizes.resize(800, 0);
            expect(Number.isFinite(radiusOf(currentCloud()))).toBe(true);
        });

        it('blends the fits of the two formations during a fade and aims at the prepared one after a bake', () => {
            const { frame } = mountScene();
            const cloud = currentCloud();
            cloud.activeIndex = 0;
            cloud.preparedIndex = 1;
            cloud.transitioning = true;
            cloud.blendProgress = 0;
            for (let i = 0; i < 200; i++) frame();
            const atStart = radiusOf(cloud);
            cloud.blendProgress = 1;
            for (let i = 0; i < 200; i++) frame();
            const atEnd = radiusOf(cloud);
            expect(atEnd).not.toBe(atStart);

            // Halfway through the fade the smoothstep is exactly 0.5, so the fit is the mean of the two fits.
            cloud.blendProgress = 0.5;
            for (let i = 0; i < 200; i++) frame();
            expect(radiusOf(cloud)).toBeCloseTo((atStart + atEnd) / 2, 4);
            cloud.blendProgress = 1;
            for (let i = 0; i < 200; i++) frame();

            cloud.activeIndex = -1;
            cloud.transitioning = false;
            // The scene prepares the director's next formation (1) again, and the fit aims at it.
            for (let i = 0; i < 120; i++) frame();
            expect(radiusOf(cloud)).toBeCloseTo(atEnd, 1);

            // Nothing prepared either: it holds the last fit.
            cloud.prepareFormation.mockImplementation(() => {});
            cloud.preparedIndex = -1;
            frame();
            expect(radiusOf(cloud)).toBeCloseTo(atEnd, 1);
        });

        it('blends the formation brightness like the fit, so a transition never steps the light', () => {
            const { frame } = mountScene();
            const cloud = currentCloud();
            const alphaOf = () => cloud.setFormationAlpha.mock.calls.at(-1)![0] as number;
            const [sphere, torus] = bassInkSceneConfig.cloud.formationAlpha;
            // Mounted on the sphere: its brightness at once.
            expect(cloud.setFormationAlpha.mock.calls[0][0]).toBe(sphere);

            cloud.preparedIndex = 1;
            cloud.transitioning = true;
            cloud.blendProgress = 0.5;
            for (let i = 0; i < 200; i++) frame();
            expect(alphaOf()).toBeCloseTo((sphere + torus) / 2, 4);

            // One frame of a jump in the target moves the brightness only part of the way.
            cloud.blendProgress = 1;
            const before = alphaOf();
            frame(16);
            expect(alphaOf()).toBeLessThan(before);
            expect(alphaOf()).toBeGreaterThan(torus);
            for (let i = 0; i < 200; i++) frame();
            expect(alphaOf()).toBeCloseTo(torus, 4);
        });

        it('refits a cloud rebuilt for a density change', () => {
            const { frame, valuesRef } = mountScene();
            frame();
            valuesRef.current = { ...valuesRef.current, density: 0.5 };
            frame();
            for (let i = 0; i < 5; i++) frame(100);

            expect(allClouds()).toHaveLength(2);
            expect(currentCloud().setRadius).toHaveBeenCalled();
            expect(currentCloud().setFormationAlpha).toHaveBeenCalled();
        });
    });

    describe('frames', () => {
        it('updates the same cloud every frame, on a scene clock built from clamped deltas', () => {
            const { frame } = mountScene();
            const first = lastUpdate();
            expect(first.time).toBe(0);

            frame(16);
            frame(5000);
            frame(16);

            expect(allClouds()).toHaveLength(1);
            expect(currentCloud().update).toHaveBeenCalledTimes(4);
            // 16 ms, then a 5 s stall clamped to the maximum, then 16 ms again.
            expect(lastUpdate().time).toBeCloseTo(0.016 + bassInkSceneConfig.maxFrameDeltaSeconds + 0.016, 6);
        });

        it('steps the gate by the real frame gap, not the clamped one, and never by a negative or non-finite one', () => {
            const { renderer } = mountScene();
            gateScript.calls = [];

            renderer.renderFrame(16);
            renderer.renderFrame(5016);
            // Everything else keeps the clamped delta.
            expect(lastUpdate().time).toBeCloseTo(0.016 + bassInkSceneConfig.maxFrameDeltaSeconds, 6);
            // A clock that goes backwards, and a time that is not a number: the gate gets 0 for both.
            renderer.renderFrame(1000);
            renderer.renderFrame(Number.NaN);

            expect(gateScript.calls.map((call) => call.dt)).toEqual([0.016, 5, 0, 0]);
        });

        it('advances the rhythm phase and hands the cloud the director cue and the followed band levels', () => {
            const { frame, tracker, valuesRef } = mountScene();
            tracker.state.bandOnsets[1] = 0.4;
            tracker.state.bandOnsets[2] = 0.7;
            valuesRef.current = { ...valuesRef.current, turbulence: 1.5 };
            const { turbulence, sparkle } = bassInkSceneConfig;

            frame(16);

            expect(tracker.updatePhase).toHaveBeenCalled();
            expect(lastUpdate().cue).toBe(script.cue);
            // One 16 ms attack step toward each onset, not a jump to it.
            const [mid, high, multiplier] = currentCloud().setTexture.mock.calls.at(-1)!;
            expect([mid, high, multiplier]).toEqual([
                expect.closeTo(0.4 * (1 - Math.exp(-0.016 / turbulence.midAttackSeconds)), 6),
                expect.closeTo(0.7 * (1 - Math.exp(-0.016 / sparkle.attackSeconds)) * valuesRef.current.intensity, 6),
                1.5,
            ]);
        });

        it('lets the band levels swell over a busy passage and settle slowly after it', () => {
            const { frame, tracker } = mountScene();
            tracker.state.bandOnsets[1] = 1;
            for (let i = 0; i < 300; i++) {
                frame(16);
            }
            const swollen = currentCloud().setTexture.mock.calls.at(-1)![0] as number;
            expect(swollen).toBeGreaterThan(0.99);

            tracker.state.bandOnsets[1] = 0;
            frame(16);
            const after = currentCloud().setTexture.mock.calls.at(-1)![0] as number;
            // The release is slower than the attack, so one quiet frame barely lowers it.
            expect(after).toBeGreaterThan(0.98);
        });

        it('swings the view to new offsets over a director transition and the core and spray follow', () => {
            const { frame, scene, valuesRef } = mountScene();
            // Drift 0 would hold the view, so use a full-swing control value.
            valuesRef.current = { ...valuesRef.current, cameraDrift: 1 };
            frame();
            const shell = currentCloud().object.rotation;
            const tilt = bassInkSceneConfig.cloud.tilt;
            expect(shell.x).toBe(tilt);
            // No section change yet, so the whole turn is drift. Frames after this one add a known step each.
            let drift = shell.y;
            const step = bassInkSceneConfig.camera.driftSpeed * 1 * 0.016;

            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.02;
            script.cue.transitionSeconds = 2;
            const seen: number[] = [];
            for (let i = 0; i < 220; i++) {
                frame(16);
                drift += step;
                if (i < 20) seen.push(shell.y);
            }
            expect(Math.abs(shell.x - tilt)).toBeLessThanOrEqual(bassInkSceneConfig.view.tiltSwing + 1e-9);
            expect(shell.x).not.toBe(tilt);
            // The turn is the accumulated drift plus the current view offset, so an offset that leaked into the drift
            // would show as a difference here.
            const yawOffset = readProbe()[28];
            expect(yawOffset).not.toBe(0);
            expect(shell.y).toBeCloseTo(drift + yawOffset, 6);
            // The core and the spray follow the shell exactly.
            for (const follower of [currentCore().object, sprayOf(scene)]) {
                expect(follower.rotation.x).toBe(shell.x);
                expect(follower.rotation.y).toBe(shell.y);
            }
            // The turn changed gradually, not in one step.
            expect(seen[0]).not.toBe(seen.at(-1));
        });

        it('keeps the plain tilt and no yaw offset when the camera drift is 0', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, cameraDrift: 0 };
            frame();
            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.02;
            script.cue.transitionSeconds = 2;
            for (let i = 0; i < 200; i++) frame(16);
            const shell = currentCloud().object.rotation;
            expect(shell.x).toBe(bassInkSceneConfig.cloud.tilt);
            expect(shell.y).toBe(0);
            const probe = readProbe();
            expect(probe[27]).toBe(0);
            expect(probe[28]).toBe(0);
        });

        it('reports the swing offsets in the viewTilt and viewYaw columns', () => {
            const { frame } = mountScene();
            frame();
            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.02;
            script.cue.transitionSeconds = 2;
            for (let i = 0; i < 200; i++) frame(16);
            const probe = readProbe();
            const shell = currentCloud().object.rotation;
            expect(probe[27]).toBeCloseTo(shell.x - bassInkSceneConfig.cloud.tilt, 6);
            expect(probe[28]).not.toBe(0);
        });

        it('turns the cloud object by the camera drift and not at all when it is 0', () => {
            const { frame, valuesRef } = mountScene();
            const object = currentCloud().object;
            valuesRef.current = { ...valuesRef.current, cameraDrift: 1 };
            frame(1000);
            frame(100);

            // The first frame ran 16 ms, the second a stall clamped to the maximum.
            expect(object.rotation.y).toBeCloseTo(bassInkSceneConfig.camera.driftSpeed * (0.016 + 0.1), 6);

            valuesRef.current = { ...valuesRef.current, cameraDrift: 0 };
            const turned = object.rotation.y;
            frame(100);
            expect(object.rotation.y).toBe(turned);
        });

        it('records a kick only for a bass gate pulse, not for a raw kick onset', () => {
            const { frame, tracker, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, intensity: 1 };
            frame();

            // A loud onset off the learned beat place: the gate does not pulse, so nothing happens.
            tracker.state.bandOnsets[0] = 0.9;
            frame();
            expect(lastUpdate().kicks.count).toBe(0);
            expect(lastUpdate().brightness).toBe(0);

            gateScript.pulse = true;
            frame();
            expect(lastUpdate().kicks.count).toBe(1);
            expect(lastUpdate().kicks.strengths[0]).toBeCloseTo(0.9, 6);
            expect(lastUpdate().brightness).toBeGreaterThan(0);
        });

        it('punches the cloud on the beat only once the tempo is locked', () => {
            const { frame, tracker } = mountScene();
            frame();
            expect(currentCloud().setPunch).toHaveBeenLastCalledWith(0);

            tracker.state.bpm = 120;
            tracker.state.beatPhase = 0;
            tracker.state.tempoConfidence = 0.9;
            const punches: number[] = [];
            for (let i = 0; i < 240; i++) {
                frame(16);
                punches.push(currentCloud().setPunch.mock.calls.at(-1)![0] as number);
            }
            expect(Math.max(...punches)).toBeGreaterThan(0.5);
            expect(Math.min(...punches.slice(120))).toBeLessThan(0.05);
        });

        it('swells the cloud on a hub bass pulse with the tempo unlocked, and reports swell and glow', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            // A steady bassline first, so the unseeded envelope has settled and the pulse stands out.
            hub.setGateBass(0.1);
            for (let i = 0; i < 600; i++) frame(16);
            expect(gateScript.calls.at(-1)!.locked).toBe(false);
            // The bump has decayed to (almost) nothing on a steady bass, so the cloud is at rest.
            expect(currentCloud().setSwell.mock.calls.at(-1)![0]).toBeLessThan(1e-6);

            hub.setGateBass(0.16);
            const swells: number[] = [];
            for (let i = 0; i < 3; i++) {
                frame(16);
                swells.push(currentCloud().setSwell.mock.calls.at(-1)![0] as number);
            }
            expect(Math.max(...swells)).toBeGreaterThan(0.3);
            expect(gateScript.calls.at(-1)!.locked).toBe(false);
            const probe = readProbe();
            expect(probe[20]).toBeCloseTo(swells[2], 6);
            expect(probe[21]).toBeCloseTo(swells[2], 6);
        });

        it('follows the shared bump as it is, with no shaper of its own, and reports it in telemetry', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            hub.setGateBass(0.1);
            for (let i = 0; i < 600; i++) frame(16);
            // The swell is the bump itself (like the cubes), with no running level of its own: instant feedback matters
            // more than accuracy, so only the shared envelope shapes it and it follows the bump down as well as up.
            hub.setGateBass(0.3);
            let peak = 0;
            for (let i = 0; i < 20; i++) {
                frame(16);
                peak = Math.max(peak, currentCloud().setSwell.mock.calls.at(-1)![0] as number);
            }
            expect(peak).toBeGreaterThan(0.3);
            for (let i = 0; i < 300; i++) frame(16);
            const held = currentCloud().setSwell.mock.calls.at(-1)![0] as number;
            expect(held).toBeLessThan(peak);
            expect(readProbe()[20]).toBeCloseTo(held, 6);
            expect(readProbe()[21]).toBeCloseTo(held, 6);
        });

        it('advances the disc flow each frame in 0..1, faster while the bass swells', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            const flow = () => currentCloud().setFlow.mock.calls.at(-1)![0] as number;
            hub.setGateBass(0.1);
            for (let i = 0; i < 600; i++) frame(16);
            expect(currentCloud().setSwell.mock.calls.at(-1)![0]).toBeLessThan(1e-6);
            // At rest it moves at the configured speed (wrapped, so compare the step modulo 1).
            const step = () => {
                const before = flow();
                frame(16);
                return (((flow() - before) % 1) + 1) % 1;
            };
            const { speed, swellGain } = bassInkSceneConfig.discFlow;
            expect(step()).toBeCloseTo(speed * 0.016, 6);

            hub.setGateBass(0.3);
            let fastest = 0;
            for (let i = 0; i < 20; i++) {
                const swell = currentCloud().setSwell.mock.calls.at(-1)![0] as number;
                fastest = Math.max(fastest, step());
                expect(flow()).toBeGreaterThanOrEqual(0);
                expect(flow()).toBeLessThan(1);
                expect(Number.isFinite(swell)).toBe(true);
            }
            expect(fastest).toBeGreaterThan(speed * 0.016 + swellGain * 0.3 * 0.016);
            // The core is a sphere and never flows, so it is never given the phase.
            expect(currentCore().setFlow).not.toHaveBeenCalled();
        });

        it('lights the cloud on a bass pulse through the brightness mix, and not at intensity 0', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            hub.setGateBass(0.1);
            for (let i = 0; i < 600; i++) frame(16);
            hub.setGateBass(0.16);
            for (let i = 0; i < 4; i++) frame(16);
            expect(lastUpdate().brightness).toBeGreaterThan(0);
        });

        it('shows no bass glow at intensity 0', () => {
            const { node } = createAnalyser();
            const { frame, hub, valuesRef } = mountScene({ analyser: node });
            valuesRef.current = { ...valuesRef.current, intensity: 0 };
            hub.setGateBass(0.1);
            for (let i = 0; i < 600; i++) frame(16);
            hub.setGateBass(0.16);
            for (let i = 0; i < 4; i++) frame(16);
            expect(lastUpdate().brightness).toBe(0);
        });

        it('gives the gate the tempo lock of the breathing clock', () => {
            const { frame, tracker } = mountScene();
            frame();
            expect(gateScript.calls.at(-1)!.locked).toBe(false);

            tracker.state.bpm = 128;
            tracker.state.beatPhase = 0.2;
            tracker.state.tempoConfidence = 0.9;
            frame();
            expect(gateScript.calls.at(-1)!.locked).toBe(true);
        });

        it('shows no flash at all with the intensity at 0', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, intensity: 0 };
            frame();
            gateScript.pulse = true;
            frame();
            script.cue.dropAt = 1;
            script.cue.tension = 1;
            frame();

            expect(lastUpdate().kicks.count).toBe(1);
            expect(lastUpdate().brightness).toBe(0);
        });
    });

    describe('audio', () => {
        it('reads the bass level from the frequency data of the bound analyser', () => {
            const { analyser, node } = createAnalyser();
            const { frame } = mountScene({ analyser: node });
            analyser.setByteFrequencyData(51);

            frame();

            expect(node.fftSize).toBe(2048);
            expect(analyser.getByteFrequencyData).toHaveBeenCalled();
            expect(readProbe()[0]).toBeCloseTo(0.2, 6);
        });

        it('reports no bass level while there is no analyser', () => {
            const { frame } = mountScene();
            frame();

            expect(readProbe()[0]).toBe(0);
        });

        it('rebinds to a new analyser without rebuilding the scene', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { frame, rerender, renderer } = mountScene({ analyser: first.node });
            frame();

            rerender({ analyser: second.node, cameraLocked: true });
            second.analyser.setByteFrequencyData(102);
            frame();

            expect(second.analyser.getByteFrequencyData).toHaveBeenCalled();
            expect(readProbe()[0]).toBeCloseTo(0.4, 6);
            expect(allClouds()).toHaveLength(1);
            expect(FakeRenderer.instances).toEqual([renderer]);
        });

        it('builds no filters and no taps of its own for the gate', () => {
            const { analyser, node } = createAnalyser();
            const { frame, unmount } = mountScene({ analyser: node });
            frame();
            unmount();

            expect(analyser.context.createBiquadFilter).not.toHaveBeenCalled();
            expect(analyser.connect).not.toHaveBeenCalled();
        });

        it('feeds the gate the hub gate bass through the bump envelope', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            frame();
            expect(gateScript.calls.at(-1)!.bass).toBe(0);

            hub.setGateBass(0.5);
            // The reference envelope sees the same input and delta, so a raw pulse passing straight through would differ.
            const reference = new BassBump(GATE_BASS_BUMP);
            let differsFromRaw = false;
            for (let i = 0; i < 10; i++) {
                frame();
                const expected = reference.step(0.5, 0.016);
                expect(readProbe()[17]).toBeCloseTo(expected, 6);
                expect(gateScript.calls.at(-1)!.bass).toBeCloseTo(expected, 9);
                if (Math.abs(expected - 0.5) > 1e-6) differsFromRaw = true;
            }
            expect(differsFromRaw).toBe(true);
        });

        it('reports the raw hub gate bass before the envelope, and 0 without a source', () => {
            const { node } = createAnalyser();
            const withSource = mountScene({ analyser: node });
            withSource.hub.setGateBass(0.5);
            withSource.frame();
            expect(readProbe()[18]).toBeCloseTo(0.5, 6);
            withSource.unmount();

            const bare = mountScene();
            bare.hub.setGateBass(0.9);
            bare.frame();
            expect(readProbe()[18]).toBe(0);
        });

        it('feeds the gate nothing without a source even when the hub reports bass', () => {
            const { frame, hub } = mountScene();
            hub.setGateBass(0.9);
            frame();
            frame();
            expect(gateScript.calls.at(-1)!.bass).toBe(0);
            expect(readProbe()[17]).toBe(0);
        });

        it('starts a fresh envelope for a new source', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { frame, hub, rerender } = mountScene({ analyser: first.node });
            hub.setGateBass(0.5);
            frame();
            const firstFrame = gateScript.calls.at(-1)!.bass;
            for (let i = 0; i < 30; i++) frame();
            const settled = gateScript.calls.at(-1)!.bass;
            expect(settled).not.toBeCloseTo(firstFrame, 6);

            rerender({ analyser: second.node, cameraLocked: true });
            frame();
            // A fresh envelope has no history, so its first frame matches the very first frame of the old one.
            expect(gateScript.calls.at(-1)!.bass).toBeCloseTo(firstFrame, 9);
        });

        it('starts a fresh envelope when the source goes away and comes back', () => {
            const { node } = createAnalyser();
            const { frame, hub, rerender } = mountScene({ analyser: node });
            hub.setGateBass(0.5);
            frame();
            const firstFrame = gateScript.calls.at(-1)!.bass;
            for (let i = 0; i < 30; i++) frame();

            rerender({ analyser: undefined, cameraLocked: true });
            frame();
            rerender({ analyser: node, cameraLocked: true });
            frame();
            expect(gateScript.calls.at(-1)!.bass).toBeCloseTo(firstFrame, 9);
        });

        it('brings the hub up to date at build and once per frame', () => {
            const { hub, frame } = mountScene();
            // One call at build, one for the first frame already drawn by mountScene.
            expect(hub.update).toHaveBeenCalledTimes(2);

            frame();
            frame();
            expect(hub.update).toHaveBeenCalledTimes(4);
        });

        it('ripples the spectrum of the bound source through the cloud, one new row per frame', () => {
            const { analyser, node } = createAnalyser();
            const { frame } = mountScene({ analyser: node });
            analyser.setByteFrequencyData(120);
            frame();
            const [texture, firstHead, span] = currentCloud().setSpectrum.mock.calls.at(-1)!;
            frame();
            const [sameTexture, nextHead] = currentCloud().setSpectrum.mock.calls.at(-1)!;

            expect(sameTexture).toBe(texture);
            const rows = bassInkSceneConfig.spectrum.rows;
            expect(nextHead).toBeCloseTo(((firstHead as number) + 1 / rows) % 1, 9);
            expect(span).toBeCloseTo((rows - 1) / rows, 9);
        });

        it('keeps the spectrum moving to flat while there is no source', () => {
            const { frame } = mountScene();
            frame();
            const [, firstHead] = currentCloud().setSpectrum.mock.calls.at(-1)!;
            frame();
            const [, nextHead] = currentCloud().setSpectrum.mock.calls.at(-1)!;
            expect(nextHead).not.toBe(firstHead);
        });

        it('frees the spectrum texture on unmount', () => {
            const { frame, unmount } = mountScene();
            frame();
            const texture = currentCloud().setSpectrum.mock.calls.at(-1)![0] as {
                addEventListener: (type: string, listener: () => void) => void;
            };
            let disposed = false;
            texture.addEventListener('dispose', () => {
                disposed = true;
            });
            unmount();
            expect(disposed).toBe(true);
        });

        it('feeds the gate nothing while there is no source', () => {
            const { frame } = mountScene();
            frame();
            expect(gateScript.calls.at(-1)!.bass).toBe(0);
        });

        it('keeps reading nothing after the source goes away', () => {
            const { analyser, node } = createAnalyser();
            const { frame, hub, rerender } = mountScene({ analyser: node });
            analyser.setByteFrequencyData(120);
            hub.setGateBass(0.5);
            frame();

            rerender({ analyser: undefined, cameraLocked: true });
            frame();

            expect(readProbe()[0]).toBe(0);
            expect(readProbe()[17]).toBe(0);
        });
    });

    describe('formations and transitions', () => {
        it('prepares the director next formation ahead of time, once', () => {
            const { frame } = mountScene();

            frame();
            frame();

            expect(currentCloud().prepareFormation).toHaveBeenCalledTimes(1);
            expect(currentCloud().prepareFormation).toHaveBeenCalledWith(1, expect.any(Number));
            expect(currentCloud().beginTransition).not.toHaveBeenCalled();
        });

        it('prepares a changed next formation but never while a fade is running', () => {
            const { frame } = mountScene();
            frame();
            script.cue.nextFormationIndex = 3;
            frame();
            expect(currentCloud().prepareFormation).toHaveBeenLastCalledWith(3, expect.any(Number));

            currentCloud().transitioning = true;
            script.cue.nextFormationIndex = 2;
            frame();

            expect(currentCloud().prepareFormation).toHaveBeenCalledTimes(2);
        });

        it('begins a transition with the cue timing when the counter changes, once', () => {
            const { frame } = mountScene();
            frame();

            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.02;
            script.cue.transitionSeconds = 2;
            frame();
            frame();

            expect(currentCloud().beginTransition).toHaveBeenCalledTimes(1);
            expect(currentCloud().beginTransition).toHaveBeenCalledWith(0.02, 2);
        });

        it('prepares the target first when a transition starts before the cloud had it', () => {
            const { frame } = mountScene();
            frame();
            const cloud = currentCloud();
            cloud.transitioning = true;
            script.cue.nextFormationIndex = 2;
            script.cue.transitionCount = 1;
            script.cue.transitionStart = 1;

            frame();

            expect(cloud.prepareFormation).toHaveBeenLastCalledWith(2, expect.any(Number));
            const prepared = cloud.prepareFormation.mock.invocationCallOrder.at(-1)!;
            expect(prepared).toBeLessThan(cloud.beginTransition.mock.invocationCallOrder[0]);
        });

        it('shows a color picker change made as a transition starts at full strength on the next frame', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 0, colorA: '#ff0000' };
            frame();
            expect(lastUpdate().core[1]).toBeCloseTo(0, 5);

            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.016;
            script.cue.transitionSeconds = 2;
            valuesRef.current = { ...valuesRef.current, colorA: '#00ff00' };
            frame();

            // The transition is only just under way, yet the new color is already whole, with no blend.
            expect(currentCloud().beginTransition).toHaveBeenCalledTimes(1);
            expect(lastUpdate().core[0]).toBeCloseTo(0, 5);
            expect(lastUpdate().core[1]).toBeCloseTo(1, 5);
        });
    });

    describe('picked colors', () => {
        it('shows a changed color picker on the next frame, with no transition', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 0, colorA: '#ff0000' };
            frame();
            expect(lastUpdate().core[0]).toBeCloseTo(1, 5);
            expect(lastUpdate().core[1]).toBeCloseTo(0, 5);

            valuesRef.current = { ...valuesRef.current, colorA: '#0000ff' };
            frame();

            expect(lastUpdate().core[0]).toBeCloseTo(0, 5);
            expect(lastUpdate().core[2]).toBeCloseTo(1, 5);
        });

        it('ignores the director palette index', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 0 };
            frame();
            const before = lastUpdate().core;
            script.cue.paletteIndex = 7;
            frame();
            expect(lastUpdate().core).toEqual(before);
        });

        it('keeps the palette fixed across frames at color speed 0', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 0 };
            frame();
            const first = lastUpdate().core;
            for (let i = 0; i < 30; i++) frame();
            expect(lastUpdate().core).toEqual(first);
        });

        it('changes the color by a bounded step per frame when the color speed changes mid-run', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 0.2 };
            for (let i = 0; i < 20; i++) frame();
            let previous = Array.from(lastUpdate().core);
            // A channel moves at most 3 per unit of phase (three gradient segments), and the phase moves
            // speed * MAX_HUE_CYCLES_PER_SECOND * dt per frame, so a speed change cannot jump the hue.
            const bound = 3 * MAX_HUE_CYCLES_PER_SECOND * 1 * 0.016 + 1e-6;
            for (const speed of [1, 0.1, 1, 0]) {
                valuesRef.current = { ...valuesRef.current, colorSpeed: speed };
                for (let i = 0; i < 40; i++) {
                    frame(16);
                    const now = Array.from(lastUpdate().core);
                    for (let c = 0; c < 3; c++) expect(Math.abs(now[c] - previous[c])).toBeLessThanOrEqual(bound);
                    previous = now;
                }
            }
        });

        it('cycles the palette at color speed above 0', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 1 };
            frame();
            const first = lastUpdate().core;
            for (let i = 0; i < 30; i++) frame();
            expect(lastUpdate().core).not.toEqual(first);
        });
    });

    describe('density', () => {
        it('rebuilds the cloud when the density changes, on the formation the director is on', () => {
            const { frame, scene, valuesRef } = mountScene();
            frame();
            const old = currentCloud();
            script.cue.formationIndex = 2;

            valuesRef.current = { ...valuesRef.current, density: 0.5, cameraDrift: 1 };
            frame();
            for (let i = 0; i < 5; i++) frame(100);

            expect(allClouds()).toHaveLength(2);
            expect(old.dispose).toHaveBeenCalledTimes(1);
            expect(scene.children).not.toContain(old.object);
            const next = currentCloud();
            expect(scene.children).toContain(next.object);
            expect(next.pointCount).toBe(shellPoints(pointCountFor(0.5, false)));
            expect(next.showFormation).toHaveBeenCalledWith(2, bassInkConfig.director.formationSeed);
            // The old cloud keeps turning while the rebuild waits, so the new one carries on from where it stood.
            // The drift is carried in the scene, not read back from the old object, so the turn never restarts.
            expect(old.object.rotation.y).toBeGreaterThan(0.01);
            expect(next.object.rotation.y).toBeGreaterThanOrEqual(old.object.rotation.y);
            expect(next.object.rotation.y).toBeCloseTo(old.object.rotation.y, 1);
            expect(next.update).toHaveBeenCalled();
        });

        it('rebuilds once after a drag settles, keeping the seed and disposing the old cloud once', () => {
            const { frame, valuesRef } = mountScene();
            const old = currentCloud();
            for (const density of [0.3, 0.35, 0.4, 0.45, 0.5]) {
                valuesRef.current = { ...valuesRef.current, density };
                frame(40);
            }
            expect(allClouds()).toHaveLength(1);
            expect(old.dispose).not.toHaveBeenCalled();

            for (let i = 0; i < 5; i++) frame(100);

            expect(allClouds()).toHaveLength(2);
            expect(old.dispose).toHaveBeenCalledTimes(1);
            expect(currentCloud().pointCount).toBe(shellPoints(pointCountFor(0.5, false)));
            expect(currentCloud().showFormation).toHaveBeenCalledWith(
                expect.any(Number),
                bassInkConfig.director.formationSeed,
            );
        });

        it('waits for a running fade before rebuilding', () => {
            const { frame, valuesRef } = mountScene();
            const old = currentCloud();
            old.transitioning = true;
            valuesRef.current = { ...valuesRef.current, density: 0.5 };
            for (let i = 0; i < 3; i++) frame(100);
            for (let i = 0; i < 3; i++) frame(100);
            expect(allClouds()).toHaveLength(1);

            old.transitioning = false;
            frame();
            expect(allClouds()).toHaveLength(2);
        });

        it('keeps the cloud while the density stays put', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, intensity: 0.2 };
            frame();
            frame();

            expect(allClouds()).toHaveLength(1);
        });
    });

    describe('camera controls', () => {
        it('starts locked, unlocks on the next frame and reports a moved view', () => {
            const { renderer, camera, rerender, frame, onViewChanged } = mountScene();
            scroll(renderer.domElement, 1000);
            expect(camera.position.z).toBe(bassInkSceneConfig.camera.distance);

            rerender({ analyser: undefined, cameraLocked: false });
            frame();
            scroll(renderer.domElement, 1000);

            expect(camera.position.z).toBeGreaterThan(bassInkSceneConfig.camera.distance);
            expect(onViewChanged).toHaveBeenCalledWith(true);
        });

        it('resetView puts the camera back and reports an unchanged view', () => {
            const { renderer, camera, result, onViewChanged } = mountScene({ cameraLocked: false });
            scroll(renderer.domElement, 1000);

            result.current.resetView();

            expect(camera.position.z).toBeCloseTo(bassInkSceneConfig.camera.distance);
            expect(onViewChanged).toHaveBeenLastCalledWith(false);
        });

        it('resetView does nothing while there is no container to build a scene in', () => {
            const { result } = renderHook(() =>
                useBassInkScene(
                    { current: null },
                    {
                        analyser: undefined,
                        hub: new FakeAudioHub(),
                        rhythm: asTracker(new FakeRhythmTracker()),
                        valuesRef: { current: defaultValues(bassInkControls) },
                        cameraLocked: true,
                        onViewChanged: vi.fn(),
                    },
                ),
            );

            expect(() => result.current.resetView()).not.toThrow();
        });
    });

    describe('the camera orbit', () => {
        const { camera: cameraConfig, orbit: orbitConfig } = bassInkSceneConfig;
        const defaultDrift = defaultValues(bassInkControls).cameraDrift;

        // Runs `frames` frames of 16 ms.
        function run(frame: () => void, frames: number): void {
            for (let i = 0; i < frames; i++) frame();
        }
        const angleOf = () => readProbe()[29];
        const speedOf = () => readProbe()[30];

        it('starts at the default pose', () => {
            const { camera } = mountScene();
            expect(camera.position.x).toBe(0);
            expect(camera.position.y).toBe(0);
            expect(camera.position.z).toBeCloseTo(cameraConfig.distance, 6);
        });

        it('orbits at the floor speed in silence, on the circle writeOrbitPose draws', () => {
            const { camera, frame } = mountScene();
            run(frame, 600);

            expect(speedOf()).toBeCloseTo(defaultDrift * orbitConfig.floorSpeed, 6);
            expect(angleOf()).toBeGreaterThan(0);
            expect(camera.position.x).not.toBe(0);
            expect(camera.position.length()).toBeCloseTo(cameraConfig.distance, 6);
            const expected = new Vector3();
            writeOrbitPose(expected, angleOf(), orbitConfig.tilt, cameraConfig.distance);
            expect(camera.position.distanceTo(expected)).toBeLessThan(1e-5);
        });

        it('orbits faster with a louder spectrum', () => {
            const quiet = createAnalyser();
            const first = mountScene({ analyser: quiet.node });
            quiet.analyser.setByteFrequencyData(0);
            run(first.frame, 600);
            const quietSpeed = speedOf();
            first.unmount();

            const full = createAnalyser();
            const second = mountScene({ analyser: full.node });
            full.analyser.setByteFrequencyData(200);
            run(second.frame, 600);

            expect(speedOf()).toBeGreaterThan(quietSpeed);
            expect(speedOf()).toBeCloseTo(defaultDrift * orbitConfig.capSpeed, 6);
        });

        it('does not move the camera at camera drift 0', () => {
            const { camera, frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, cameraDrift: 0 };
            run(frame, 120);

            expect(speedOf()).toBe(0);
            expect(angleOf()).toBe(0);
            expect(camera.position.x).toBe(0);
            expect(camera.position.z).toBeCloseTo(cameraConfig.distance, 6);
        });

        describe('reduced motion', () => {
            type Listener = (event: { matches: boolean }) => void;
            let listeners: Listener[];
            let matches: boolean;
            let removed: number;

            beforeEach(() => {
                listeners = [];
                removed = 0;
                matches = true;
                vi.stubGlobal(
                    'matchMedia',
                    vi.fn(() => ({
                        get matches() {
                            return matches;
                        },
                        addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
                        removeEventListener: (_type: string, listener: Listener) => {
                            removed++;
                            listeners = listeners.filter((l) => l !== listener);
                        },
                    })),
                );
            });
            afterEach(() => {
                vi.unstubAllGlobals();
            });

            it('keeps the camera still and reacts to a live change', () => {
                const { camera, frame } = mountScene();
                run(frame, 120);
                expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
                expect(angleOf()).toBe(0);
                expect(camera.position.x).toBe(0);

                listeners.forEach((listener) => listener({ matches: false }));
                run(frame, 120);
                expect(angleOf()).toBeGreaterThan(0);
                const stopped = angleOf();

                listeners.forEach((listener) => listener({ matches: true }));
                run(frame, 30);
                expect(speedOf()).toBe(0);
                expect(angleOf()).toBe(stopped);
            });

            it('removes its listener on unmount', () => {
                const { unmount } = mountScene();
                expect(listeners).toHaveLength(1);

                unmount();

                expect(removed).toBe(1);
                expect(listeners).toHaveLength(0);
            });

            it('adds no listener when the setup throws after reading the preference', () => {
                const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
                clouds.fail = true;
                try {
                    expect(() => mountScene()).toThrow('cloud failed');
                } finally {
                    quiet.mockRestore();
                    clouds.fail = false;
                }
                expect(window.matchMedia).toHaveBeenCalled();
                expect(listeners).toHaveLength(0);
            });
        });

        it('treats a missing matchMedia as no preference', () => {
            vi.stubGlobal('matchMedia', undefined);
            try {
                const { frame } = mountScene();
                run(frame, 60);
                expect(angleOf()).toBeGreaterThan(0);
            } finally {
                vi.unstubAllGlobals();
            }
        });

        it('leaves the camera to the controls while unlocked and starts over when locked again', () => {
            const { camera, frame, rerender, renderer } = mountScene();
            run(frame, 200);
            expect(angleOf()).toBeGreaterThan(0);

            rerender({ analyser: undefined, cameraLocked: false });
            frame();
            const angle = angleOf();
            const held = camera.position.clone();
            run(frame, 60);
            expect(angleOf()).toBe(angle);
            expect(camera.position.equals(held)).toBe(true);
            scroll(renderer.domElement, 1000);
            expect(camera.position.length()).toBeGreaterThan(cameraConfig.distance);

            rerender({ analyser: undefined, cameraLocked: true });
            frame();
            // The relock frame resets, then advances once from the starting pose.
            expect(angleOf()).toBeLessThan(angle);
            expect(angleOf()).toBeLessThanOrEqual(orbitConfig.maxStepPerFrame);
            expect(camera.position.length()).toBeCloseTo(cameraConfig.distance, 6);
        });

        it('Reset view puts the camera back at the default pose with the orbit started over', () => {
            const { camera, frame, result, onViewChanged } = mountScene();
            run(frame, 200);
            expect(camera.position.x).not.toBe(0);

            result.current.resetView();

            expect(camera.position.x).toBe(0);
            expect(camera.position.y).toBe(0);
            expect(camera.position.z).toBeCloseTo(cameraConfig.distance, 9);
            expect(angleOf()).toBe(0);
            expect(speedOf()).toBe(0);
            expect(onViewChanged).not.toHaveBeenCalled();
        });

        it('never reports a changed view by itself', () => {
            const { frame, onViewChanged } = mountScene();
            run(frame, 600);

            expect(onViewChanged).not.toHaveBeenCalled();
        });
    });

    describe('telemetry probe', () => {
        it('registers the columns and ticks every frame with the delta in seconds', () => {
            const { frame } = mountScene();
            frame(16);

            expect(telemetry.register).toHaveBeenCalledWith(
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
                    'viewTilt',
                    'viewYaw',
                    'orbitAngle',
                    'orbitSpeed',
                    'enhancedActive',
                    'renderScale',
                ],
                expect.any(Function),
            );
            expect(telemetry.tick).toHaveBeenLastCalledWith(0.016);
        });

        it('reports the director phase, tension, novelty, energy and kick count', () => {
            const { frame, tracker, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, intensity: 1 };
            tracker.state.novelty = 0.6;
            script.cue.tension = 0.3;
            tracker.state.tempoConfidence = 0.7;
            tracker.state.beatCount = 12;
            tracker.state.bandOnsets[1] = 1;
            frame();
            gateScript.pulse = true;
            frame();

            const row = readProbe();

            expect(row[1]).toBeGreaterThan(0);
            expect(row[5]).toBeCloseTo(0.6, 6);
            expect(row[6]).toBe(2);
            expect(row[7]).toBeCloseTo(0.3, 6);
            expect(row[8]).toBeGreaterThan(0);
            expect(row[10]).toBe(1);
            expect(row[13]).toBeCloseTo(0.7, 6);
            expect(row[14]).toBe(12);
            expect(row[15]).toBeGreaterThan(0);
            expect(row[16]).toBe(0);
            expect(row[17]).toBe(0);
        });

        it('appends the fit multiplier and hue phase after glow', () => {
            const { frame, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, colorSpeed: 1 };
            for (let i = 0; i < 10; i++) frame();
            const row = readProbe();
            expect(row[22]).toBeCloseTo(
                (currentCloud().setRadius.mock.calls.at(-1)![0] as number) / bassInkSceneConfig.cloud.radius,
                6,
            );
            expect(row[23]).toBeGreaterThan(0);
            expect(row[23]).toBeLessThan(1);
        });
    });

    describe('the scene build mark', () => {
        let position = 12;
        let clock: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            position = 12;
            vi.mocked(getActivePlayback).mockImplementation(
                () => ({ position: () => position }) as unknown as FilePlayback,
            );
            clock = vi.spyOn(performance, 'now').mockReturnValue(100_000);
        });

        afterEach(() => {
            vi.mocked(getActivePlayback).mockReset();
            clock.mockRestore();
        });

        it('puts the scene build on the recording clock, before the track started when it was built earlier', () => {
            const { frame } = mountScene();
            // Built at page time 100 s; this row is read 2.5 s later, 12 s into the track: built 9.5 s into it.
            clock.mockReturnValue(102_500);
            frame();

            expect(readProbe()[19]).toBeCloseTo(12 - 2.5, 6);
            position = 1;
            expect(readProbe()[19]).toBeCloseTo(1 - 2.5, 6);
        });

        it('uses the audio context clock when no file is playing, and NaN with no source at all', () => {
            vi.mocked(getActivePlayback).mockReturnValue(undefined);
            const { node, analyser } = createAnalyser();
            const { frame } = mountScene({ analyser: node });
            frame();
            (analyser.context as unknown as { currentTime: number }).currentTime = 30;

            expect(readProbe()[19]).toBeCloseTo(30, 6);

            const bare = mountScene();
            bare.frame();
            expect(readProbe()[19]).toBeNaN();
        });
    });

    describe('the core, the dust and the spray', () => {
        // The scene adds the shell, the core, the dust and the spray in this order.
        const sprayAlphaScale = (scene: Scene) =>
            (sprayOf(scene) as unknown as { material: { uniforms: { uAlphaScale: { value: number } } } }).material
                .uniforms.uAlphaScale.value;
        const geometryOf = (object: unknown) => (object as { geometry: { dispose: () => void } }).geometry;

        // Settles a steady bassline, then hits it, which pushes the swell through the spray arm level.
        function hitBass(frame: (milliseconds?: number) => void, hub: FakeAudioHub) {
            hub.setGateBass(0.1);
            for (let i = 0; i < 600; i++) frame(16);
            hub.setGateBass(0.3);
            for (let i = 0; i < 4; i++) frame(16);
        }

        it('adds the shell, the core, the dust and the spray to the scene', () => {
            const { scene } = mountScene();

            expect(scene.children).toHaveLength(4);
            expect(scene.children[0]).toBe(currentCloud().object);
            expect(scene.children[1]).toBe(currentCore().object);
        });

        it('splits the old total between the shell and the core', () => {
            mountScene();

            const total = pointCountFor(0.8, false);
            expect(currentCloud().pointCount + currentCore().pointCount).toBe(total);
            expect(currentCore().pointCount).toBeGreaterThan(0);
            expect(currentCore().options).toEqual({
                swellAmplitude: bassInkSceneConfig.core.swellAmplitude,
                displacementScale: bassInkSceneConfig.core.displacementScale,
                alphaScale: bassInkSceneConfig.core.alphaScale,
            });
        });

        it('sets the core radius to the shell fit times the radius scale, also after a resize', () => {
            const { resizes, frame } = mountScene();
            const radiusScale = bassInkSceneConfig.core.radiusScale;
            const fitOf = () =>
                (currentCloud().setRadius.mock.calls.at(-1)![0] as number) / bassInkSceneConfig.cloud.radius;

            expect(currentCore().setRadius.mock.calls.at(-1)![0]).toBeCloseTo(
                bassInkSceneConfig.cloud.radius * fitOf() * radiusScale,
                9,
            );

            resizes.resize(1000, 400);
            frame();

            expect(currentCore().setRadius.mock.calls.at(-1)![0]).toBeCloseTo(
                bassInkSceneConfig.cloud.radius * fitOf() * radiusScale,
                9,
            );
            expect(currentCore().setViewport.mock.calls.at(-1)![0]).toBeGreaterThanOrEqual(400);
        });

        it('keeps the core on its formation through a director transition', () => {
            const { frame } = mountScene();
            const core = currentCore();
            script.cue.formationIndex = 2;
            script.cue.nextFormationIndex = 3;
            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0;
            for (let i = 0; i < 5; i++) frame();

            // The shell transitions; the core is shown the core formation once and is never prepared.
            expect(currentCloud().beginTransition).toHaveBeenCalled();
            expect(core.showFormation).toHaveBeenCalledTimes(1);
            expect(core.showFormation).toHaveBeenCalledWith(
                bassInkSceneConfig.core.formation,
                bassInkConfig.director.formationSeed,
            );
            expect(core.prepareFormation).not.toHaveBeenCalled();
            expect(core.beginTransition).not.toHaveBeenCalled();
            // It still gets the same cue as the shell every frame.
            expect(core.update.mock.calls.at(-1)![0]).toBe(currentCloud().update.mock.calls.at(-1)![0]);
        });

        it('gives the core the same per-frame values as the shell', () => {
            const { frame } = mountScene();
            frame();

            const shell = currentCloud();
            const core = currentCore();
            for (const name of ['setPunch', 'setSwell', 'setTexture', 'setSpectrum'] as const) {
                expect(core[name].mock.calls.at(-1)).toEqual(shell[name].mock.calls.at(-1));
            }
            expect(core.update.mock.calls.at(-1)).toEqual(shell.update.mock.calls.at(-1));
        });

        it('fires a spray burst on a hub bass pulse with the tempo unlocked, and reports it', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            expect(readProbe()[24]).toBe(0);

            hitBass(frame, hub);

            expect(gateScript.calls.at(-1)!.locked).toBe(false);
            const probe = readProbe();
            expect(probe[24]).toBeGreaterThanOrEqual(1);
            expect(probe[25]).toBeGreaterThan(0);
            expect(currentCloud().restPosition).toHaveBeenCalled();
        });

        it('throws each burst from the current shell radius, and sizes the core from the same radius', () => {
            const { node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node });
            const emit = vi.spyOn(SprayPool.prototype, 'emit');
            try {
                hitBass(frame, hub);

                expect(emit).toHaveBeenCalled();
                const [source, radius] = emit.mock.calls.at(-1)!;
                expect(source).toBe(currentCloud());
                const shellRadius = currentCloud().setRadius.mock.calls.at(-1)![0] as number;
                expect(radius).toBe(shellRadius);
                expect(shellRadius).toBeGreaterThan(1);
                expect(currentCore().setRadius.mock.calls.at(-1)![0]).toBeCloseTo(
                    shellRadius * bassInkSceneConfig.core.radiusScale,
                    9,
                );
            } finally {
                emit.mockRestore();
            }
        });

        it('shows no spray at intensity 0', () => {
            const { node } = createAnalyser();
            const { frame, hub, scene, valuesRef } = mountScene({ analyser: node });
            hitBass(frame, hub);
            expect(sprayAlphaScale(scene)).toBeGreaterThan(0);

            valuesRef.current = { ...valuesRef.current, intensity: 0 };
            frame();

            expect(sprayAlphaScale(scene)).toBe(0);
        });

        it('turns the core and the spray with the shell, and the dust not at all', () => {
            const { frame, scene, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, cameraDrift: 1 };
            for (let i = 0; i < 10; i++) frame();

            const shell = currentCloud().object.rotation;
            expect(shell.y).toBeGreaterThan(0);
            for (const follower of [currentCore().object, sprayOf(scene)]) {
                const turned = follower.rotation;
                expect(turned.x).toBe(shell.x);
                expect(turned.y).toBe(shell.y);
                expect(turned.z).toBe(shell.z);
            }
            // The dust drifts on its own slow clock and never copies the shell.
            const dust = scene.children.find(
                (child) =>
                    child !== currentCloud().object && child !== currentCore().object && child !== sprayOf(scene),
            )!;
            expect(dust.rotation.y).not.toBe(shell.y);
        });

        it('rebuilds the shell, core and dust on a density change, keeping the spray and the rotation shared', () => {
            const { frame, scene, valuesRef } = mountScene();
            frame();
            const [oldShell, oldCore, oldDust, oldSpray] = [...scene.children];
            const dustDispose = vi.spyOn(geometryOf(oldDust), 'dispose');
            const sprayDispose = vi.spyOn(geometryOf(oldSpray), 'dispose');
            currentCloud().object.rotation.y = 1.25;

            valuesRef.current = { ...valuesRef.current, density: 0.5 };
            for (let i = 0; i < 6; i++) frame(100);

            expect(allClouds()).toHaveLength(2);
            expect(allCores()).toHaveLength(2);
            for (const old of [oldShell, oldCore, oldDust]) expect(scene.children).not.toContain(old);
            // The spray pool does not depend on density, so the same object stays and is not freed.
            expect(sprayOf(scene)).toBe(oldSpray);
            expect(scene.children).toHaveLength(4);
            expect(dustDispose).toHaveBeenCalledTimes(1);
            expect(sprayDispose).not.toHaveBeenCalled();
            expect(allCores()[0].dispose).toHaveBeenCalledTimes(1);
            expect(allClouds()[0].dispose).toHaveBeenCalledTimes(1);
            const total = pointCountFor(0.5, false);
            expect(currentCloud().pointCount + currentCore().pointCount).toBe(total);
            expect(currentCore().showFormation).toHaveBeenCalledWith(
                bassInkSceneConfig.core.formation,
                bassInkConfig.director.formationSeed,
            );
            expect(currentCore().setRadius).toHaveBeenCalled();
            expect(currentCore().object.rotation.y).toBe(currentCloud().object.rotation.y);
            expect(sprayOf(scene).rotation.y).toBe(currentCloud().object.rotation.y);
        });

        // A rebuild must not move the view: the drift is carried across it and the offset keeps easing on its own.
        it('keeps the rotation continuous across a density rebuild while a section swing is held', () => {
            const { frame, scene, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, cameraDrift: 1 };
            frame();
            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.02;
            script.cue.transitionSeconds = 2;
            // Let the swing ease in until it is clearly nonzero and has nearly settled.
            for (let i = 0; i < 400; i++) frame(16);
            expect(Math.abs(readProbe()[28])).toBeGreaterThan(0.01);
            const before = currentCloud();
            const turnBefore = before.object.rotation.y;
            const oldCore = currentCore();

            valuesRef.current = { ...valuesRef.current, density: 0.5 };
            // The rebuild waits for the density to settle, and the view keeps turning while it does.
            const ys: number[] = [];
            for (let i = 0; i < 40; i++) {
                frame(16);
                ys.push(currentCloud().object.rotation.y);
            }

            expect(allClouds()).toHaveLength(2);
            expect(currentCloud()).not.toBe(before);
            expect(currentCore()).not.toBe(oldCore);
            // Each frame moves the turn by a small step and none by a jump, across the rebuild too.
            const biggestStep = Math.max(...ys.map((y, i) => Math.abs(y - (i === 0 ? turnBefore : ys[i - 1]))));
            expect(biggestStep).toBeLessThan(0.01);
            // The new objects carry the same rotation as the shell.
            expect(currentCore().object.rotation.y).toBe(currentCloud().object.rotation.y);
            expect(sprayOf(scene).rotation.y).toBe(currentCloud().object.rotation.y);
        });

        it('keeps the spray and its burst count, and the dust phase, across a density rebuild', () => {
            const { node } = createAnalyser();
            const { frame, hub, scene, valuesRef } = mountScene({ analyser: node });
            hitBass(frame, hub);
            const spray = sprayOf(scene);
            const bursts = readProbe()[24];
            expect(bursts).toBeGreaterThanOrEqual(1);
            // The dust is the one child that is neither the shell, the core nor the spray.
            const dustOf = () =>
                scene.children.find(
                    (child) =>
                        child !== sprayOf(scene) &&
                        ![...allClouds(), ...allCores()].some((cloud) => cloud.object === child),
                ) as Points;
            const phaseOf = () => (dustOf().material as ShaderMaterial).uniforms.uPhase.value as number;
            const oldDust = dustOf();
            // Pin the phase to a value a restart could not reach by chance.
            const phaseBefore = phaseOf();
            expect(phaseBefore).toBeGreaterThan(0.01);

            valuesRef.current = { ...valuesRef.current, density: 0.5 };
            for (let i = 0; i < 6; i++) frame(100);

            expect(dustOf()).not.toBe(oldDust);
            expect(sprayOf(scene)).toBe(spray);
            expect(readProbe()[24]).toBeGreaterThanOrEqual(bursts);
            // The twinkle goes on from where it was; a reset to 0 would read near 0 here instead.
            const advance = (phaseOf() - phaseBefore + 1) % 1;
            expect(advance).toBeLessThan(0.5);
            expect(advance).toBeGreaterThan(0);
        });

        it('throws bursts from the squeezed surface at full tension, not the rest radius', () => {
            const { node } = createAnalyser();
            const { frame, hub, scene } = mountScene({ analyser: node });
            script.cue.tension = 1;
            expect(currentCloud().surfaceScale).toBeCloseTo(1 - bassInkSceneConfig.cloud.tensionSqueeze, 9);
            hitBass(frame, hub);

            const shellRadius = currentCloud().setRadius.mock.calls.at(-1)![0] as number;
            const limit = shellRadius * Math.min(1, currentCloud().surfaceScale);
            const origins = (sprayOf(scene) as unknown as Points).geometry.getAttribute('position')
                .array as Float32Array;
            let farthest = 0;
            for (let i = 0; i < origins.length; i += 3) {
                farthest = Math.max(farthest, Math.hypot(origins[i], origins[i + 1], origins[i + 2]));
            }
            expect(farthest).toBeGreaterThan(0);
            expect(limit).toBeLessThan(shellRadius);
            expect(farthest).toBeLessThanOrEqual(limit + 1e-4);
        });

        it('frees the core, the dust and the spray on unmount', () => {
            const { unmount, scene, frame } = mountScene();
            frame();
            const dustDispose = vi.spyOn(geometryOf(scene.children[2]), 'dispose');
            const sprayDispose = vi.spyOn(geometryOf(scene.children[3]), 'dispose');
            const core = currentCore();

            unmount();

            expect(core.dispose).toHaveBeenCalledTimes(1);
            // The scene teardown walks the children as well, so a second dispose is harmless.
            expect(dustDispose).toHaveBeenCalled();
            expect(sprayDispose).toHaveBeenCalled();
        });
    });

    describe('post-processing', () => {
        it('draws each frame through the post, built after the camera at the view size', () => {
            const { renderer, scene, camera } = mountScene();
            const post = currentPost();

            expect(posts.instances).toHaveLength(1);
            expect(post.size).toEqual({ width: 800, height: 600 });
            expect(post.software).toBe(false);
            expect(post.render).toHaveBeenCalled();
            expect(renderer.render).toHaveBeenCalledWith(scene, camera);
        });

        it('hands the trails and glow control values to the post every frame', () => {
            const { frame, valuesRef } = mountScene();
            const post = currentPost();
            expect(post.apply).toHaveBeenLastCalledWith({ trails: 0.4, glow: 0.4 });

            valuesRef.current = { ...valuesRef.current, trails: 0, glow: 0.85 };
            frame();

            expect(post.apply).toHaveBeenLastCalledWith({ trails: 0, glow: 0.85 });
        });

        it('reuses one settings object, so applying allocates nothing', () => {
            const { frame } = mountScene();
            frame();
            const post = currentPost();

            expect(post.apply.mock.calls.at(-1)![0]).toBe(post.apply.mock.calls.at(-2)![0]);
        });

        it('sizes the post on resize and ignores a collapsed view', () => {
            const { resizes } = mountScene();
            const post = currentPost();

            resizes.resize(1000, 900);
            expect(post.setSize).toHaveBeenLastCalledWith({ width: 1000, height: 900 });

            post.setSize.mockClear();
            resizes.resize(0, 0);
            expect(post.setSize).not.toHaveBeenCalled();
        });

        it('disposes the post once on unmount', () => {
            const { unmount, frame } = mountScene();
            frame();
            const post = currentPost();

            unmount();

            expect(post.dispose).toHaveBeenCalledTimes(1);
        });

        it('appends postActive, viewTilt and viewYaw before the orbit columns', () => {
            const { frame } = mountScene();
            frame();
            const columns = telemetry.register.mock.calls.at(-1)![1] as string[];
            expect(columns.at(-1)).toBe('renderScale');
            expect(columns.at(-2)).toBe('enhancedActive');
            expect(columns.at(-3)).toBe('orbitSpeed');
            expect(columns.at(-4)).toBe('orbitAngle');
            expect(columns.at(-5)).toBe('viewYaw');
            expect(columns.at(-6)).toBe('viewTilt');
            expect(columns.at(-7)).toBe('postActive');
            expect(columns.at(-8)).toBe('sprayLive');

            currentPost().active = true;
            expect(readProbe()[26]).toBe(1);
            currentPost().active = false;
            expect(readProbe()[26]).toBe(0);
        });
    });

    describe('enhanced graphics', () => {
        beforeEach(() => {
            enhancedModule.handles.length = 0;
            enhancedModule.fail = false;
            software.value = false;
        });

        it('never loads the enhanced look while the preference is off', async () => {
            const { frame, onEnhancedStatus } = mountScene();
            frame();
            await settle();
            frame();
            expect(enhancedHandles()).toHaveLength(0);
            expect(onEnhancedStatus).not.toHaveBeenCalled();
            expect(readProbe()[31]).toBe(0);
            expect(readProbe()[32]).toBe(1);
        });

        it('loads once, builds once and switches in place, keeping the camera and the renderer', async () => {
            const { frame, onEnhancedStatus, rerender, camera, renderer } = mountScene({ enhanced: true });
            frame();
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('loading');
            await settle();
            frame();
            expect(enhancedHandles()).toHaveLength(1);
            const handle = enhancedHandles()[0];
            expect(handle.setEnabled).toHaveBeenLastCalledWith(true);
            expect(handle.step).toHaveBeenCalled();
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('ready');
            expect(readProbe()[31]).toBe(1);

            // Unlocked, so the orbit leaves the camera alone and any move would come from the toggle.
            rerender({ analyser: undefined, cameraLocked: false, enhanced: true });
            frame();
            const pose = camera.position.clone();
            rerender({ analyser: undefined, cameraLocked: false, enhanced: false });
            frame();
            expect(handle.setEnabled).toHaveBeenLastCalledWith(false);
            expect(onEnhancedStatus).toHaveBeenLastCalledWith(undefined);
            expect(readProbe()[31]).toBe(0);
            expect(camera.position.distanceTo(pose)).toBeLessThan(1e-9);

            rerender({ analyser: undefined, cameraLocked: false, enhanced: true });
            frame();
            await settle();
            frame();
            expect(enhancedHandles()).toHaveLength(1);
            expect(handle.setEnabled).toHaveBeenLastCalledWith(true);
            expect(FakeRenderer.last).toBe(renderer);
            // The status is reported on change only, never per frame.
            const calls = onEnhancedStatus.mock.calls.map((call) => call[0] as unknown);
            expect(calls).toEqual(['loading', 'ready', undefined, 'ready']);
        });

        it('hands the Glow control to the look every frame while it is on', async () => {
            const { frame, valuesRef } = mountScene({ enhanced: true });
            frame();
            await settle();
            frame();
            const handle = enhancedHandles()[0];
            expect(handle.setGlow).toHaveBeenLastCalledWith(valuesRef.current.glow);
            valuesRef.current = { ...valuesRef.current, glow: 0 };
            frame();
            expect(handle.setGlow).toHaveBeenLastCalledWith(0);
        });

        it('never loads it on a software renderer, and reports no status', async () => {
            software.value = true;
            const { frame, onEnhancedStatus } = mountScene({ enhanced: true });
            frame();
            await settle();
            frame();
            expect(enhancedHandles()).toHaveLength(0);
            expect(onEnhancedStatus).not.toHaveBeenCalled();
        });

        it('keeps the standard look with one warning when the build fails, and retries after off and on', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            enhancedModule.fail = true;
            const { frame, onEnhancedStatus, rerender } = mountScene({ enhanced: true });
            frame();
            await settle();
            frame();
            frame();
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('error');
            expect(warn).toHaveBeenCalledTimes(1);
            expect(enhancedHandles()).toHaveLength(0);

            enhancedModule.fail = false;
            rerender({ analyser: undefined, cameraLocked: true, enhanced: false });
            frame();
            rerender({ analyser: undefined, cameraLocked: true, enhanced: true });
            frame();
            await settle();
            frame();
            expect(enhancedHandles()).toHaveLength(1);
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('ready');
            warn.mockRestore();
        });

        it('reports an error once the look failed a shader, and never turns it back on', async () => {
            const { frame, onEnhancedStatus, rerender } = mountScene({ enhanced: true });
            frame();
            await settle();
            frame();
            const handle = enhancedHandles()[0];
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('ready');

            // The look switched itself off while rendering.
            handle.failed = true;
            handle.enabled = false;
            const calls = handle.setEnabled.mock.calls.length;
            frame();
            frame();
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('error');
            expect(handle.setEnabled.mock.calls.slice(calls)).not.toContainEqual([true]);

            // Off clears the status; on again reports the error again, with no new build.
            rerender({ analyser: undefined, cameraLocked: true, enhanced: false });
            frame();
            expect(onEnhancedStatus).toHaveBeenLastCalledWith(undefined);
            rerender({ analyser: undefined, cameraLocked: true, enhanced: true });
            frame();
            await settle();
            frame();
            expect(onEnhancedStatus).toHaveBeenLastCalledWith('error');
            expect(enhancedHandles()).toHaveLength(1);
        });

        it('drops an import that resolves after unmount, building nothing', async () => {
            const { frame, unmount } = mountScene({ enhanced: true });
            frame();
            unmount();
            await settle();
            expect(enhancedHandles()).toHaveLength(0);
        });

        it('hands a rebuilt cloud to the look, resizes it and frees it before the post on unmount', async () => {
            const { frame, valuesRef, resizes, unmount } = mountScene({ enhanced: true });
            frame();
            await settle();
            frame();
            const handle = enhancedHandles()[0];

            valuesRef.current = { ...valuesRef.current, density: 0.3 };
            for (let i = 0; i < 40; i++) frame();
            expect(handle.setMaterials).toHaveBeenCalledTimes(1);

            resizes.resize(640, 480);
            expect(handle.setSize).toHaveBeenLastCalledWith({ width: 640, height: 480 });

            const post = currentPost();
            unmount();
            expect(handle.dispose).toHaveBeenCalledTimes(1);
            expect(handle.dispose.mock.invocationCallOrder[0]).toBeLessThan(post.dispose.mock.invocationCallOrder[0]);
        });
    });

    describe('unmount', () => {
        it('frees the renderer, the cloud, the probe and the controls', () => {
            const { unmount, renderer, camera, frame } = mountScene({ cameraLocked: false });
            frame();
            const cloud = currentCloud();

            unmount();

            expect(cloud.dispose).toHaveBeenCalledTimes(1);
            expect(telemetry.unregister).toHaveBeenCalledTimes(1);
            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            // The orbit controls stop listening, so late input cannot move the camera of a dead scene.
            scroll(renderer.domElement, 1000);
            expect(camera.position.z).toBe(bassInkSceneConfig.camera.distance);
        });
    });
});
