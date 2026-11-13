// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { PerspectiveCamera, Scene } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { asTracker, FakeRhythmTracker } from '~/test/fakeEngines';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import { bassInkConfig } from './bassInkConfig';
import { bassInkControls, type BassInkControlValues } from './bassInkControls';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import type { DirectorCue, PalettePair } from './bassInkTypes';
import { writePalette } from './chromaPalette';
import { pointCountFor } from './renderBudget';
import { useBassInkScene } from './useBassInkScene';

// vi.mock is hoisted, so the fakes are loaded with a dynamic import inside the factory (see fakeThree.ts).
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

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
const gateScript = vi.hoisted(() => ({ pulse: false, calls: [] as { bass: number; locked: boolean }[] }));
vi.mock('~/features/rhythm/bassGate', async (importOriginal) => {
    const actual = await importOriginal<typeof import('~/features/rhythm/bassGate')>();
    return {
        ...actual,
        stepBassGate: (
            bass: number,
            _rhythm: unknown,
            locked: boolean,
            state: { bumpCount: number; bumpTarget: number; weight: number },
        ) => {
            gateScript.calls.push({ bass, locked });
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
    object: { rotation: { x: number; y: number } };
    pointCount: number;
    seed: number;
    maxPointSize: number;
    preparedIndex: number;
    transitioning: boolean;
    prepareFormation: ReturnType<typeof vi.fn>;
    beginTransition: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setTexture: ReturnType<typeof vi.fn>;
    setPunch: ReturnType<typeof vi.fn>;
    setSpectrum: ReturnType<typeof vi.fn>;
    setViewport: ReturnType<typeof vi.fn>;
    showFormation: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
}
const clouds = vi.hoisted(() => ({ instances: [] as unknown[] }));
vi.mock('./inkCloud', async () => {
    const { Object3D } = await import('three');
    return {
        InkCloud: class {
            object = new Object3D();
            preparedIndex = -1;
            transitioning = false;
            prepareFormation = vi.fn((index: number) => {
                this.preparedIndex = index;
            });
            beginTransition = vi.fn();
            update = vi.fn();
            setTexture = vi.fn();
            setPunch = vi.fn();
            setSpectrum = vi.fn();
            setViewport = vi.fn();
            showFormation = vi.fn();
            dispose = vi.fn();
            constructor(
                public pointCount: number,
                public seed: number,
                public maxPointSize: number,
            ) {
                clouds.instances.push(this);
            }
        },
    };
});
const allClouds = () => clouds.instances as FakeCloud[];
const currentCloud = () => allClouds().at(-1)!;

const probeRead = () => telemetry.register.mock.calls.at(-1)![2] as (out: Float32Array) => void;
function readProbe(): Float32Array {
    const out = new Float32Array(18);
    probeRead()(out);
    return out;
}

function createAnalyser() {
    const context = new FakeAudioContext();
    const analyser = new FakeAnalyserNode(context);
    return { analyser, node: asWebAudio<AnalyserNode>(analyser) };
}

interface Props {
    analyser: AnalyserNode | undefined;
    cameraLocked: boolean;
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
    const containerRef = { current: createContainer(800, 600) };
    const valuesRef: { current: BassInkControlValues } = { current: defaultValues(bassInkControls) };
    const onViewChanged = vi.fn();

    const hook = renderHook(
        ({ analyser, cameraLocked }: Props) =>
            useBassInkScene(containerRef, {
                analyser,
                rhythm: asTracker(tracker),
                valuesRef,
                cameraLocked,
                onViewChanged,
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
    return { ...hook, renderer, scene, camera, frame, tracker, valuesRef, onViewChanged, resizes, containerRef };
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
            expect(cloud.pointCount).toBe(pointCountFor(0.8, false));
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

        it('taps the bass of each bound source for the gate and releases every tap', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { frame, rerender, unmount } = mountScene({ analyser: first.node });
            frame();
            expect(first.analyser.context.createBiquadFilter).toHaveBeenCalledTimes(2);
            expect(first.analyser.connect).toHaveBeenCalledTimes(1);

            rerender({ analyser: second.node, cameraLocked: true });
            frame();
            // The old source no longer feeds a tap of a scene that has moved on.
            expect(first.analyser.disconnect).toHaveBeenCalledTimes(1);
            expect(second.analyser.connect).toHaveBeenCalledTimes(1);

            unmount();
            expect(second.analyser.disconnect).toHaveBeenCalledTimes(1);
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
            const { frame, rerender } = mountScene({ analyser: node });
            analyser.setFloatTimeDomainData(0.5);
            frame();

            rerender({ analyser: undefined, cameraLocked: true });
            frame();

            expect(readProbe()[0]).toBe(0);
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

        it('fades the palette from the previous pair to the latest one across the transition', () => {
            const { frame } = mountScene();
            frame();
            const start = Array.from(lastUpdate().core);
            const target: PalettePair = { core: new Float32Array(3), edge: new Float32Array(3) };
            writePalette(5, target);
            expect(Array.from(target.core)).not.toEqual(start);

            script.cue.paletteIndex = 5;
            script.cue.transitionCount = 1;
            script.cue.transitionStart = 0.016;
            script.cue.transitionSeconds = 1;
            // Frames are clamped to 0.1 s, so the one second transition takes about ten of them.
            for (let i = 0; i < 5; i++) frame(100);
            const halfway = lastUpdate().core;
            for (let i = 0; i < 8; i++) frame(100);
            const done = lastUpdate().core;

            for (let i = 0; i < 3; i++) {
                expect(halfway[i]).toBeGreaterThanOrEqual(Math.min(start[i], target.core[i]) - 1e-6);
                expect(halfway[i]).toBeLessThanOrEqual(Math.max(start[i], target.core[i]) + 1e-6);
                expect(done[i]).toBeCloseTo(target.core[i], 5);
            }
            expect(halfway).not.toEqual(done);
        });

        it('keeps the palette when a transition has zero length', () => {
            const { frame } = mountScene();
            frame();
            script.cue.paletteIndex = 7;
            script.cue.transitionCount = 1;
            script.cue.transitionSeconds = 0;

            frame();

            const target: PalettePair = { core: new Float32Array(3), edge: new Float32Array(3) };
            writePalette(7, target);
            expect(lastUpdate().core[0]).toBeCloseTo(target.core[0], 6);
        });
    });

    describe('density', () => {
        it('rebuilds the cloud when the density changes, on the formation the director is on', () => {
            const { frame, scene, valuesRef } = mountScene();
            frame();
            const old = currentCloud();
            old.object.rotation.y = 1.25;
            script.cue.formationIndex = 2;

            valuesRef.current = { ...valuesRef.current, density: 0.5 };
            frame();

            expect(allClouds()).toHaveLength(2);
            expect(old.dispose).toHaveBeenCalledTimes(1);
            expect(scene.children).not.toContain(old.object);
            const next = currentCloud();
            expect(scene.children).toContain(next.object);
            expect(next.pointCount).toBe(pointCountFor(0.5, false));
            expect(next.showFormation).toHaveBeenCalledWith(2, bassInkConfig.director.formationSeed);
            expect(next.object.rotation.y).toBeCloseTo(1.25, 2);
            expect(next.update).toHaveBeenCalled();
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
