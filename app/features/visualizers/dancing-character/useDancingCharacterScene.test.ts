// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Group, PerspectiveCamera } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { asTracker, FakeRhythmTracker } from '~/test/fakeEngines';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import type { DancingCharacterAssets } from './dancingCharacterAssets';
import { loadDancingCharacterAssets, disposeDancingCharacterAssets } from './dancingCharacterAssets';
import { dancingCharacterControls, type DancingCharacterSettings } from './dancingCharacterControls';
import type { DancingCharacterFrame } from './dancingCharacterScene';
import { useDancingCharacterScene, type DancingCharacterLoadStatus } from './useDancingCharacterScene';

// vi.mock is hoisted, so the fakes are loaded with a dynamic import inside the factory (see fakeThree.ts).
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

// The loader, the character scene and the shared cubes BassPulse have their own specs; here only the hook's wiring matters.
vi.mock('./dancingCharacterAssets', () => ({
    loadDancingCharacterAssets: vi.fn(),
    disposeDancingCharacterAssets: vi.fn(),
    isAbortError: (error: unknown) => (error as { name?: string }).name === 'AbortError',
}));

const { scenes, pulses } = vi.hoisted(() => ({
    scenes: [] as unknown[],
    pulses: [] as Array<{ source: unknown; update: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('./dancingCharacterScene', () => ({
    DancingCharacterScene: class {
        // Frames are copied on the way in: the hook reuses one object, so a spy would only ever see the last values.
        readonly frames: DancingCharacterFrame[] = [];
        readonly update = vi.fn((frame: DancingCharacterFrame) => {
            this.frames.push({ ...frame });
        });
        readonly setCharacter = vi.fn();
        readonly resize = vi.fn();
        readonly resetOrbit = vi.fn();
        readonly dispose = vi.fn();
        constructor(
            readonly scene: unknown,
            readonly camera: unknown,
            readonly settings: unknown,
            readonly options: unknown,
        ) {
            scenes.push(this as unknown as Record<string, unknown>);
        }
    },
}));

vi.mock('~/features/visualizers/cubes/bassPulse', () => ({
    BassPulse: class {
        level = 0;
        readonly update = vi.fn(() => this.level);
        readonly dispose = vi.fn();
        constructor(readonly source: unknown) {
            pulses.push(this as never);
        }
    },
}));

interface FakeCharacterScene {
    frames: DancingCharacterFrame[];
    update: ReturnType<typeof vi.fn>;
    options: { reducedMotion?: boolean };
    setCharacter: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    resetOrbit: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    camera: PerspectiveCamera;
    settings: DancingCharacterSettings;
}
const character = (index = scenes.length - 1) => scenes[index] as unknown as FakeCharacterScene;

interface Deferred {
    resolve: (assets: DancingCharacterAssets) => void;
    reject: (error: unknown) => void;
    signal: AbortSignal;
}
const loads: Deferred[] = [];

function makeAssets(): DancingCharacterAssets {
    return { model: { name: 'model' } as unknown as Group };
}

interface Props {
    analyser: AnalyserNode | undefined;
    cameraLocked: boolean;
    reducedMotion?: boolean;
}

function mountScene(initial: Partial<Props> = {}) {
    const resizes = installFakeResizeObserver();
    const tracker = new FakeRhythmTracker();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    const containerRef = { current: container };
    const valuesRef: { current: DancingCharacterSettings } = { current: defaultValues(dancingCharacterControls) };
    const onViewChanged = vi.fn();
    const statuses: DancingCharacterLoadStatus[] = [];
    const onStatus = vi.fn((status: DancingCharacterLoadStatus) => statuses.push(status));

    const hook = renderHook(
        ({ analyser, cameraLocked, reducedMotion }: Props) =>
            useDancingCharacterScene(containerRef, {
                analyser,
                rhythm: asTracker(tracker),
                valuesRef,
                cameraLocked,
                reducedMotion: reducedMotion ?? false,
                onViewChanged,
                onStatus,
            }),
        { initialProps: { analyser: undefined, cameraLocked: true, reducedMotion: false, ...initial } as Props },
    );

    const renderer = FakeRenderer.last;
    return { ...hook, renderer, tracker, valuesRef, onViewChanged, onStatus, statuses, resizes, container };
}

// Lets the promise callbacks the hook attached run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useDancingCharacterScene', () => {
    beforeEach(() => {
        scenes.length = 0;
        pulses.length = 0;
        loads.length = 0;
        vi.mocked(loadDancingCharacterAssets).mockReset();
        vi.mocked(disposeDancingCharacterAssets).mockReset();
        vi.mocked(loadDancingCharacterAssets).mockImplementation(
            (signal) =>
                new Promise<DancingCharacterAssets>((resolve, reject) => {
                    loads.push({ resolve, reject, signal });
                }),
        );
    });

    describe('loading', () => {
        it('reports loading at setup and starts a single load', () => {
            const { statuses } = mountScene();

            expect(statuses).toEqual(['loading']);
            expect(loadDancingCharacterAssets).toHaveBeenCalledTimes(1);
        });

        it('hands the model to the scene and reports ready', async () => {
            const { statuses } = mountScene();
            const assets = makeAssets();

            loads[0].resolve(assets);
            await flush();

            expect(character().setCharacter).toHaveBeenCalledWith(assets.model);
            expect(statuses).toEqual(['loading', 'ready']);
        });

        it('tells the scene whether the visitor prefers reduced motion', () => {
            mountScene();
            expect(character().options).toEqual({ reducedMotion: false });

            mountScene({ reducedMotion: true });
            expect(character().options).toEqual({ reducedMotion: true });
        });

        it('reports modelFailed when the model cannot be loaded', async () => {
            const { statuses } = mountScene();

            loads[0].reject(new Error('404'));
            await flush();

            expect(statuses).toEqual(['loading', 'modelFailed']);
            expect(character().setCharacter).not.toHaveBeenCalled();
        });

        it('stays silent when the load rejects with an abort error', async () => {
            const { statuses } = mountScene();

            loads[0].reject(new DOMException('aborted', 'AbortError'));
            await flush();

            expect(statuses).toEqual(['loading']);
        });

        it('stays silent when unmounted mid-load and frees assets that arrive late', async () => {
            const { statuses, unmount } = mountScene();
            const assets = makeAssets();

            unmount();
            expect(loads[0].signal.aborted).toBe(true);
            loads[0].resolve(assets);
            await flush();

            expect(disposeDancingCharacterAssets).toHaveBeenCalledWith(assets);
            expect(character().setCharacter).not.toHaveBeenCalled();
            expect(statuses).toEqual(['loading']);
        });

        it('stays silent when a failure arrives after unmount', async () => {
            const { statuses, unmount } = mountScene();

            unmount();
            loads[0].reject(new Error('late failure'));
            await flush();

            expect(statuses).toEqual(['loading']);
        });
    });

    describe('frames', () => {
        it('builds the camera and the character once, and the camera starts from the container aspect', () => {
            mountScene();

            expect(scenes).toHaveLength(1);
            expect(character().camera.fov).toBe(40);
            expect(character().camera.aspect).toBeCloseTo(800 / 600);
        });

        it('advances the rhythm phase and passes the current settings to the character each frame', () => {
            const { renderer, tracker, valuesRef } = mountScene();
            const first = character();

            renderer.renderFrame(0);
            valuesRef.current = { ...valuesRef.current, danceSpeed: 2 };
            renderer.renderFrame(16);

            expect(tracker.updatePhase).toHaveBeenCalledTimes(2);
            expect(character()).toBe(first);
            expect(scenes).toHaveLength(1);
            expect(FakeRenderer.instances).toHaveLength(1);
            expect(first.frames[0].settings.danceSpeed).toBe(1);
            expect(first.frames[1].settings.danceSpeed).toBe(2);
            expect(first.frames[1].rhythm).toBe(tracker.state);
            expect(first.frames[1].dt).toBeCloseTo(0.016);
        });

        it('reuses one frame object and clamps long gaps between frames', () => {
            const { renderer } = mountScene();

            renderer.renderFrame(0);
            renderer.renderFrame(5000);

            const [frame] = character().update.mock.calls[0] as [DancingCharacterFrame];
            expect(character().update.mock.calls[1][0]).toBe(frame);
            expect(character().frames[0].dt).toBe(0);
            expect(character().frames[1].dt).toBe(0.1);
        });

        it('passes the camera lock to the frames as it changes', () => {
            const { renderer, rerender } = mountScene({ cameraLocked: true });

            renderer.renderFrame(0);
            rerender({ analyser: undefined, cameraLocked: false });
            renderer.renderFrame(16);

            expect(character().frames.map((frame) => frame.cameraLocked)).toEqual([true, false]);
            expect(scenes).toHaveLength(1);
        });

        it('sends zero bass without an analyser', () => {
            const { renderer } = mountScene();

            renderer.renderFrame(0);

            expect(pulses).toHaveLength(0);
            expect(character().frames[0].bass).toBe(0);
        });
    });

    describe('bass pulse', () => {
        const createAnalyser = () => asWebAudio<AnalyserNode>(new FakeAnalyserNode(new FakeAudioContext()));

        it('is created for the analyser and its level reaches the frames', () => {
            const analyser = createAnalyser();
            const { renderer } = mountScene({ analyser });

            renderer.renderFrame(0);
            pulses[0].update.mockReturnValue(0.7);
            renderer.renderFrame(16);

            expect(pulses).toHaveLength(1);
            expect(pulses[0].source).toBe(analyser);
            expect(character().frames.map((frame) => frame.bass)).toEqual([0, 0.7]);
        });

        it('is rebound when the analyser changes and dropped when it goes away', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { renderer, rerender } = mountScene({ analyser: first });
            renderer.renderFrame(0);

            rerender({ analyser: second, cameraLocked: true });
            renderer.renderFrame(16);
            renderer.renderFrame(32);

            expect(pulses).toHaveLength(2);
            expect(pulses[0].dispose).toHaveBeenCalledTimes(1);
            expect(pulses[1].source).toBe(second);

            rerender({ analyser: undefined, cameraLocked: true });
            renderer.renderFrame(48);

            expect(pulses[1].dispose).toHaveBeenCalledTimes(1);
            expect(character().frames[3].bass).toBe(0);
        });

        it('is disposed on unmount', () => {
            const { renderer, unmount } = mountScene({ analyser: createAnalyser() });
            renderer.renderFrame(0);

            unmount();

            expect(pulses[0].dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('view and lifecycle', () => {
        it('resets the orbit view and the character azimuth together', () => {
            const { result, renderer } = mountScene();
            renderer.renderFrame(0);
            const camera = character().camera;
            const start = camera.position.clone();
            camera.position.set(start.x + 5, start.y, start.z);

            result.current.resetView();

            expect(camera.position.distanceTo(start)).toBeLessThan(1e-9);
            expect(character().resetOrbit).toHaveBeenCalledTimes(1);
        });

        it('reports a moved view once the unlocked camera is scrolled', () => {
            const { renderer, onViewChanged } = mountScene({ cameraLocked: false });
            renderer.renderFrame(0);
            // The character scene is mocked, so nothing has placed the camera; zooming needs a distance to change.
            character().camera.position.set(0, 0, 10);

            renderer.domElement.dispatchEvent(
                new WheelEvent('wheel', { deltaY: 1000, bubbles: true, cancelable: true }),
            );

            expect(onViewChanged).toHaveBeenCalledWith(true);
        });

        it('resetView does nothing while there is no container to build a scene in', () => {
            const { result } = renderHook(() =>
                useDancingCharacterScene(
                    { current: null },
                    {
                        analyser: undefined,
                        rhythm: asTracker(new FakeRhythmTracker()),
                        valuesRef: { current: defaultValues(dancingCharacterControls) },
                        cameraLocked: true,
                        reducedMotion: false,
                        onViewChanged: vi.fn(),
                        onStatus: vi.fn(),
                    },
                ),
            );

            expect(() => result.current.resetView()).not.toThrow();
        });

        it('forwards container resizes to the character', () => {
            const { resizes } = mountScene();

            resizes.resize(400, 300);

            expect(character().resize).toHaveBeenCalledTimes(1);
        });

        it('disposes the character and the renderer on unmount', () => {
            const { renderer, unmount, container } = mountScene();

            unmount();

            expect(character().dispose).toHaveBeenCalledTimes(1);
            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            expect(container.contains(renderer.domElement)).toBe(false);
        });
    });
});
