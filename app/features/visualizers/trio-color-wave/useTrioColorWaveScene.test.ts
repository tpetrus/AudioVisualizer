// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { ACESFilmicToneMapping, Color, type Mesh, type PerspectiveCamera, type Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import { BANDS, BASE_HEIGHT, FLAG_DISTANCE, FLAG_WIDTH, SHEET_SPACING } from './trioColorWaveConfig';
import { trioColorWaveControls, type TrioColorWaveControlValues } from './trioColorWaveControls';
import { useTrioColorWaveScene } from './useTrioColorWaveScene';

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

function mountScene(initial: Partial<Props> = {}) {
    installFakeResizeObserver();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    const containerRef = { current: container };
    const valuesRef: { current: TrioColorWaveControlValues } = { current: defaultValues(trioColorWaveControls) };
    const onViewChanged = vi.fn();

    const hook = renderHook(
        ({ analyser, cameraLocked }: Props) =>
            useTrioColorWaveScene(containerRef, { analyser, valuesRef, cameraLocked, onViewChanged }),
        { initialProps: { analyser: undefined, cameraLocked: true, ...initial } as Props },
    );

    const renderer = FakeRenderer.last;
    const frame = (time = 16) => renderer.renderFrame(time);
    frame(0);
    const [scene, camera] = renderer.render.mock.calls[0] as unknown as [Scene, PerspectiveCamera];
    // Sheets in the order of BANDS: highs (front), mids, bass (back).
    const sheets = () => scene.children.filter((child): child is Mesh => (child as Mesh).isMesh);

    return { ...hook, renderer, scene, camera, sheets, frame, valuesRef, onViewChanged, container };
}

function heightsOf(sheet: Mesh): ArrayLike<number> {
    return sheet.geometry.getAttribute('instanceHeight').array;
}

// The front row is the one that follows the spectrum directly, so it is the first to rise.
function tallestBar(sheet: Mesh): number {
    return Math.max(...Array.from(heightsOf(sheet)));
}

function scroll(element: HTMLElement, deltaY: number): void {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
}

describe('useTrioColorWaveScene', () => {
    describe('building the scene', () => {
        it('sets up a black, tone-mapped scene with one sheet per band and a distant narrow camera', () => {
            const { renderer, scene, camera, sheets, container } = mountScene();

            expect(container.contains(renderer.domElement)).toBe(true);
            expect(renderer.toneMapping).toBe(ACESFilmicToneMapping);
            expect((scene.background as Color).getHex()).toBe(0x000000);
            expect(sheets()).toHaveLength(BANDS.length);
            expect(camera.fov).toBe(10);
            expect(camera.position.z).toBe(3800);
        });

        it('centers the sheets and stacks them back to front, shifted by the Move sliders', () => {
            const { sheets, frame, valuesRef } = mountScene();
            const centerX = (-(FLAG_WIDTH - 1) * FLAG_DISTANCE) / 2;
            sheets().forEach((sheet, index) => {
                expect(sheet.position.x).toBeCloseTo(centerX);
                expect(sheet.position.y).toBe(BASE_HEIGHT);
                expect(sheet.position.z).toBeCloseTo(-index * SHEET_SPACING);
            });

            valuesRef.current = { ...valuesRef.current, moveX: 100, moveY: -20 };
            frame(16);

            sheets().forEach((sheet) => {
                expect(sheet.position.x).toBeCloseTo(centerX + 100);
                expect(sheet.position.y).toBe(BASE_HEIGHT - 20);
            });
        });
    });

    describe('audio', () => {
        it('has no analysers and flat bars while no source is bound', () => {
            const { sheets, frame } = mountScene();

            frame(16);

            sheets().forEach((sheet) => expect(tallestBar(sheet)).toBe(0));
        });

        it("gives each sheet its own analyser tapped from the source, with that band's window", () => {
            const { context, analyser, node } = createAnalyser();
            mountScene({ analyser: node });

            expect(context.createdAnalysers).toHaveLength(BANDS.length);
            context.createdAnalysers.forEach((tap, index) => {
                expect(tap.fftSize).toBe(BANDS[index].fftSize);
                expect(tap.minDecibels).toBe(BANDS[index].minDecibels);
                expect(tap.maxDecibels).toBe(-20);
                expect(analyser.connect).toHaveBeenCalledWith(tap);
            });
        });

        it('binds once however many frames run', () => {
            const { context, node } = createAnalyser();
            const { frame } = mountScene({ analyser: node });

            frame(16);
            frame(32);

            expect(context.createdAnalysers).toHaveLength(BANDS.length);
        });

        it('raises the bars from the spectrum, never smoothing a band less than its minimum', () => {
            const { context, node } = createAnalyser();
            const { sheets, frame } = mountScene({ analyser: node });
            context.createdAnalysers.forEach((tap) => tap.setByteFrequencyData(255));

            frame(16);
            frame(32);

            sheets().forEach((sheet) => expect(tallestBar(sheet)).toBeGreaterThan(0));
            // Smoothing control defaults to 0.5: highs are held to 0.75, bass to 0.4 (below the control, so 0.5 wins).
            expect(context.createdAnalysers.map((tap) => tap.smoothingTimeConstant)).toEqual([0.75, 0.5, 0.5]);
        });

        it('rebinds when the analyser changes, releasing the previous taps', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { rerender, frame } = mountScene({ analyser: first.node });

            rerender({ analyser: second.node, cameraLocked: true });
            frame(16);

            first.context.createdAnalysers.forEach((tap) => {
                expect(first.analyser.disconnect).toHaveBeenCalledWith(tap);
                expect(tap.disconnect).toHaveBeenCalled();
            });
            expect(second.context.createdAnalysers).toHaveLength(BANDS.length);
        });

        it('keeps drawing when the source goes away, without rebinding or releasing the taps', () => {
            const { context, analyser, node } = createAnalyser();
            const { rerender, frame, renderer } = mountScene({ analyser: node });

            rerender({ analyser: undefined, cameraLocked: true });
            frame(16);

            expect(renderer.render).toHaveBeenCalledTimes(2);
            expect(context.createdAnalysers).toHaveLength(BANDS.length);
            expect(analyser.disconnect).not.toHaveBeenCalled();
        });
    });

    describe('camera controls', () => {
        it('starts locked, unlocks on the next frame and reports a moved view', () => {
            const { renderer, camera, rerender, frame, onViewChanged } = mountScene();
            scroll(renderer.domElement, 1000);
            expect(camera.position.z).toBe(3800);

            rerender({ analyser: undefined, cameraLocked: false });
            frame(16);
            scroll(renderer.domElement, 1000);

            expect(camera.position.z).toBeGreaterThan(3800);
            expect(onViewChanged).toHaveBeenCalledWith(true);
        });

        it('resetView puts the camera back and reports an unchanged view', () => {
            const { renderer, camera, result, onViewChanged } = mountScene({ cameraLocked: false });
            scroll(renderer.domElement, 1000);
            expect(onViewChanged).toHaveBeenLastCalledWith(true);

            result.current.resetView();

            expect(camera.position.z).toBeCloseTo(3800);
            expect(onViewChanged).toHaveBeenLastCalledWith(false);
        });

        it('resetView does nothing while there is no container to build a scene in', () => {
            const { result } = renderHook(() =>
                useTrioColorWaveScene(
                    { current: null },
                    {
                        analyser: undefined,
                        valuesRef: { current: defaultValues(trioColorWaveControls) },
                        cameraLocked: true,
                        onViewChanged: vi.fn(),
                    },
                ),
            );

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
        it('frees the renderer, the sheets, their taps and the controls', () => {
            const { context, analyser, node } = createAnalyser();
            const { unmount, renderer, scene, sheets, camera } = mountScene({ analyser: node, cameraLocked: false });
            const before = sheets();
            expect(before).toHaveLength(BANDS.length);

            unmount();

            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            expect(scene.children).toHaveLength(0);
            context.createdAnalysers.forEach((tap) => {
                expect(analyser.disconnect).toHaveBeenCalledWith(tap);
                expect(tap.disconnect).toHaveBeenCalled();
            });
            // The orbit controls stop listening, so late input cannot move the camera of a dead scene.
            scroll(renderer.domElement, 1000);
            expect(camera.position.z).toBe(3800);
        });

        it('unmounts cleanly when no analyser was ever bound', () => {
            const { unmount, renderer } = mountScene();

            expect(() => unmount()).not.toThrow();
            expect(renderer.dispose).toHaveBeenCalledTimes(1);
        });
    });
});
