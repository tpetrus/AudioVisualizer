// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { Color, type InstancedMesh, type PerspectiveCamera, type Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { METER_VISUAL_CONFIDENCE } from '~/features/rhythm/rhythmConfig';
import { asTracker, FakeRhythmTracker } from '~/test/fakeEngines';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import { cubesControls, type CubesControlValues } from './cubesControls';
import { useCubesScene } from './useCubesScene';

// vi.mock is hoisted, so the fakes are loaded with a dynamic import inside the factory (see fakeThree.ts).
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

function createAnalyser() {
    const context = new FakeAudioContext();
    const analyser = new FakeAnalyserNode(context);
    return { context, analyser, node: asWebAudio<AnalyserNode>(analyser) };
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

function mountScene(initial: Partial<Props> = {}, { width = 800, height = 600 } = {}) {
    const resizes = installFakeResizeObserver();
    const tracker = new FakeRhythmTracker();
    const containerRef = { current: createContainer(width, height) };
    const valuesRef: { current: CubesControlValues } = { current: defaultValues(cubesControls) };
    const onViewChanged = vi.fn();

    const hook = renderHook(
        ({ analyser, cameraLocked }: Props) =>
            useCubesScene(containerRef, { analyser, rhythm: asTracker(tracker), valuesRef, cameraLocked, onViewChanged }),
        { initialProps: { analyser: undefined, cameraLocked: true, ...initial } as Props },
    );

    const renderer = FakeRenderer.last;
    // The hook renders `scene` with `camera` every frame, so the first render call reveals both.
    const frame = (time = 16) => renderer.renderFrame(time);
    frame(0);
    const [scene, camera] = renderer.render.mock.calls[0] as unknown as [Scene, PerspectiveCamera];
    const gridMesh = () => scene.children.find((child): child is InstancedMesh => (child as InstancedMesh).isInstancedMesh);

    return { ...hook, renderer, scene, camera, gridMesh, frame, tracker, valuesRef, onViewChanged, resizes, containerRef };
}

// z of cube number `index`, read from its instance matrix (translation z is element 14 of a column-major matrix).
function cubeZ(mesh: InstancedMesh | undefined, index: number): number {
    if (!mesh) throw new Error('grid mesh missing');
    return mesh.instanceMatrix.array[index * 16 + 14];
}

function scroll(element: HTMLElement, deltaY: number): void {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
}

// Resting-cube lift caused by the downbeat accent, measured on a far-corner cube that no band can raise.
const CORNER_CUBE = 0;

describe('useCubesScene', () => {
    describe('building the scene', () => {
        it('renders a lit scene with a black background, an environment map and a grid sized for the view', () => {
            const { renderer, scene, camera, gridMesh, containerRef } = mountScene();

            expect(containerRef.current.contains(renderer.domElement)).toBe(true);
            expect(scene.background).toBeInstanceOf(Color);
            expect(scene.environment).not.toBeNull();
            expect(scene.children.filter(child => (child as { isLight?: boolean }).isLight)).toHaveLength(3);
            expect(camera.position.z).toBe(32);
            expect(camera.fov).toBe(50);
            // 800x600 at this fov shows 30 rows; the grid adds a margin of 2 rows and columns around the view.
            expect(gridMesh()?.count).toBe(42 * 32);
        });

        it('hides the room panel behind the camera and frees the temporary room scene', async () => {
            const { FakePmrem } = await import('~/test/fakeThree');
            mountScene();

            const pmrem = FakePmrem.instances[0];
            expect(pmrem.fromScene).toHaveBeenCalledWith(expect.objectContaining({ isScene: true }), 0.04);
            expect(pmrem.dispose).toHaveBeenCalledTimes(1);
            const room = pmrem.fromScene.mock.calls[0][0] as Scene;
            const hidden = room.children.filter(child => child.position.z > 10);
            expect(hidden.length).toBeGreaterThan(0);
            expect(hidden.every(child => !child.visible)).toBe(true);
        });
    });

    describe('frames without an analyser', () => {
        it('keeps rendering the resting grid and advances the rhythm phase every frame', () => {
            const { tracker, frame, renderer, gridMesh } = mountScene();

            frame(16);
            frame(32);

            expect(tracker.updatePhase).toHaveBeenCalledTimes(3);
            expect(renderer.render).toHaveBeenCalledTimes(3);
            expect(cubeZ(gridMesh(), CORNER_CUBE)).toBe(0);
        });

        it('follows the colors and look values the controls currently hold', () => {
            const { frame, valuesRef, scene } = mountScene();

            valuesRef.current = { ...valuesRef.current, bassBump: false, restingColor: '#00ff00' };
            frame(16);

            // With the bass bump off the background never flashes, whatever the resting color is.
            expect((scene.background as Color).getHex()).toBe(0x000000);
        });
    });

    describe('audio', () => {
        it('binds a new analyser: sets its window, reads the spectrum and raises the cubes the spectrum drives', () => {
            const { analyser, node } = createAnalyser();
            const { frame, gridMesh } = mountScene({ analyser: node });
            const calmZ = cubeZ(gridMesh(), 21 * 32 + 16);

            // A loud spectrum puts the center column well above its resting height.
            analyser.setByteFrequencyData(255);
            frame(16);
            frame(32);

            expect(analyser.fftSize).toBe(2048);
            expect(analyser.smoothingTimeConstant).toBe(0.5);
            expect(analyser.getByteFrequencyData).toHaveBeenCalled();
            expect(cubeZ(gridMesh(), 21 * 32 + 16)).toBeGreaterThan(calmZ);
        });

        it('taps the analyser for the bass pulse once, however many frames run', () => {
            const { context, analyser, node } = createAnalyser();
            const { frame } = mountScene({ analyser: node });

            frame(16);
            frame(32);

            expect(context.createBiquadFilter).toHaveBeenCalledTimes(2);
            expect(context.createdAnalysers).toHaveLength(1);
            expect(analyser.connect).toHaveBeenCalledTimes(1);
        });

        it('rebinds when the analyser changes: the old bass tap is released and the new source is read', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { frame, rerender } = mountScene({ analyser: first.node });
            const firstFilter = first.context.createdFilters[0];

            rerender({ analyser: second.node, cameraLocked: true });
            second.analyser.setByteFrequencyData(200);
            frame(16);

            expect(second.analyser.fftSize).toBe(2048);
            expect(second.analyser.getByteFrequencyData).toHaveBeenCalled();
            expect(first.analyser.disconnect).toHaveBeenCalledWith(firstFilter);
            expect(second.analyser.connect).toHaveBeenCalledTimes(1);
        });

        it('keeps the scene when the source goes away and keeps reading nothing from it', () => {
            const { analyser, node } = createAnalyser();
            const { frame, rerender, renderer } = mountScene({ analyser: node });
            const reads = analyser.getByteFrequencyData.mock.calls.length;

            rerender({ analyser: undefined, cameraLocked: true });
            frame(16);

            expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(reads);
            expect(renderer.render).toHaveBeenCalledTimes(2);
        });
    });

    describe('bass pulse', () => {
        it('flashes the background with the resting color when the bass jumps', () => {
            const { context, node } = createAnalyser();
            const { frame, scene, valuesRef } = mountScene({ analyser: node });
            valuesRef.current = { ...valuesRef.current, bgPulse: 1 };
            const bassTap = context.createdAnalysers[0];

            bassTap.setFloatTimeDomainData(0.5);
            frame(16);
            frame(32);
            frame(48);

            const background = scene.background as Color;
            // The resting color is dark red, so the flash is red only.
            expect(background.r).toBeGreaterThan(0);
            expect(background.g).toBe(0);
            expect(background.b).toBe(0);
        });

        it('does not flash when the bass bump is switched off', () => {
            const { context, node } = createAnalyser();
            const { frame, scene, valuesRef } = mountScene({ analyser: node });
            valuesRef.current = { ...valuesRef.current, bassBump: false };
            context.createdAnalysers[0].setFloatTimeDomainData(0.5);

            frame(16);
            frame(32);
            frame(48);

            expect((scene.background as Color).getHex()).toBe(0x000000);
        });
    });

    describe('downbeat accent', () => {
        function downbeat(tracker: FakeRhythmTracker, beatsPerBar: 3 | 4 | undefined, meterConfidence: number): void {
            tracker.state.beatsPerBar = beatsPerBar;
            tracker.state.meterConfidence = meterConfidence;
            tracker.state.downbeatCount += 1;
        }

        it('lifts the resting cubes on a downbeat of a confident meter, then fades', () => {
            const { tracker, frame, gridMesh } = mountScene();

            downbeat(tracker, 4, METER_VISUAL_CONFIDENCE);
            frame(16);
            const lifted = cubeZ(gridMesh(), CORNER_CUBE);
            frame(32);
            const fading = cubeZ(gridMesh(), CORNER_CUBE);

            // 1 * 0.9 decay * 0.35 accent * 2 backdrop lift
            expect(lifted).toBeCloseTo(0.63);
            expect(fading).toBeCloseTo(0.567);
        });

        it.each([
            { name: 'an unconfident meter', beatsPerBar: 4 as const, confidence: METER_VISUAL_CONFIDENCE - 0.01 },
            { name: 'an unknown meter', beatsPerBar: undefined, confidence: 1 },
        ])('ignores a downbeat of $name', ({ beatsPerBar, confidence }) => {
            const { tracker, frame, gridMesh } = mountScene();

            downbeat(tracker, beatsPerBar, confidence);
            frame(16);

            expect(cubeZ(gridMesh(), CORNER_CUBE)).toBe(0);
        });

        it('accents each new downbeat once, not every frame', () => {
            const { tracker, frame, gridMesh } = mountScene();
            downbeat(tracker, 3, 0.9);
            frame(16);
            frame(32);
            const afterTwo = cubeZ(gridMesh(), CORNER_CUBE);

            // The counter has not moved, so the accent keeps decaying instead of restarting.
            frame(48);
            expect(cubeZ(gridMesh(), CORNER_CUBE)).toBeLessThan(afterTwo);

            downbeat(tracker, 3, 0.9);
            frame(64);
            expect(cubeZ(gridMesh(), CORNER_CUBE)).toBeCloseTo(0.63);
        });
    });

    describe('resizing', () => {
        it('rebuilds the grid when the view needs a different number of columns', () => {
            const { resizes, gridMesh, scene } = mountScene();
            const before = gridMesh();

            resizes.resize(1200, 600);

            const after = gridMesh();
            expect(after).not.toBe(before);
            expect(scene.children.filter(child => (child as InstancedMesh).isInstancedMesh)).toHaveLength(1);
            // aspect 2: 60 columns of visible width plus the margin
            expect(after?.count).toBe(62 * 32);
        });

        it('keeps the grid when a resize leaves it the same size', () => {
            const { resizes, gridMesh } = mountScene();
            const before = gridMesh();

            resizes.resize(801, 600);

            expect(gridMesh()).toBe(before);
        });

        it('lays the spectrum out over the new column count while an analyser is bound', () => {
            const { analyser, node } = createAnalyser();
            const { resizes, frame, gridMesh } = mountScene({ analyser: node });
            analyser.setByteFrequencyData(255);
            frame(16);

            resizes.resize(1200, 600);
            frame(32);

            const mesh = gridMesh();
            const values = Array.from(mesh?.instanceMatrix.array ?? []);
            expect(values.every(Number.isFinite)).toBe(true);
            expect(cubeZ(mesh, 31 * 32 + 16)).toBeGreaterThan(0);
        });

        it('rebuilds the grid without an analyser too', () => {
            const { resizes, frame, gridMesh } = mountScene();

            resizes.resize(1200, 600);
            frame(16);

            expect(gridMesh()?.count).toBe(62 * 32);
        });
    });

    describe('camera controls', () => {
        it('starts locked, unlocks on the next frame and reports a moved view', () => {
            const { renderer, camera, rerender, frame, onViewChanged } = mountScene();
            scroll(renderer.domElement, 1000);
            expect(camera.position.z).toBe(32);

            rerender({ analyser: undefined, cameraLocked: false });
            frame(16);
            scroll(renderer.domElement, 1000);

            expect(camera.position.z).toBeGreaterThan(32);
            expect(onViewChanged).toHaveBeenCalledWith(true);
        });

        it('locks again when the lock is switched back on', () => {
            const { renderer, camera, rerender, frame } = mountScene({ cameraLocked: false });
            frame(16);
            rerender({ analyser: undefined, cameraLocked: true });
            frame(32);

            scroll(renderer.domElement, 1000);

            expect(camera.position.z).toBe(32);
        });

        it('resetView puts the camera back and reports an unchanged view', () => {
            const { renderer, camera, result, onViewChanged } = mountScene({ cameraLocked: false });
            scroll(renderer.domElement, 1000);
            expect(onViewChanged).toHaveBeenLastCalledWith(true);

            result.current.resetView();

            expect(camera.position.z).toBeCloseTo(32);
            expect(onViewChanged).toHaveBeenLastCalledWith(false);
        });

        it('resetView does nothing while there is no container to build a scene in', () => {
            const { result } = renderHook(() => useCubesScene(
                { current: null },
                {
                    analyser: undefined,
                    rhythm: asTracker(new FakeRhythmTracker()),
                    valuesRef: { current: defaultValues(cubesControls) },
                    cameraLocked: true,
                    onViewChanged: vi.fn(),
                },
            ));

            expect(() => result.current.resetView()).not.toThrow();
        });

        it('returns the same resetView on every render', () => {
            const { result, rerender } = mountScene();
            const first = result.current.resetView;

            rerender({ analyser: undefined, cameraLocked: true });

            expect(result.current.resetView).toBe(first);
        });
    });

    describe('unmount', () => {
        it('frees the renderer, the grid, the bass tap and the controls', () => {
            const { context, analyser, node } = createAnalyser();
            const { unmount, renderer, scene, gridMesh, frame, camera } = mountScene({ analyser: node, cameraLocked: false });
            frame(16);
            const mesh = gridMesh();
            expect(mesh).toBeDefined();
            const bassTap = context.createdAnalysers[0];

            unmount();

            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            expect(scene.children).not.toContain(mesh);
            expect(analyser.disconnect).toHaveBeenCalledWith(context.createdFilters[0]);
            expect(bassTap.disconnect).toHaveBeenCalled();
            // The orbit controls stop listening, so late input cannot move the camera of a dead scene.
            scroll(renderer.domElement, 1000);
            expect(camera.position.z).toBe(32);
        });

        it('unmounts cleanly when no analyser was ever bound', () => {
            const { unmount, renderer } = mountScene();

            expect(() => unmount()).not.toThrow();
            expect(renderer.dispose).toHaveBeenCalledTimes(1);
        });
    });
});
