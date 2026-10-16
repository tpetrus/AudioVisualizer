// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRenderer } from '~/test/fakeThree';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { useThreeScene, type SceneContext, type SceneHandle, type SceneSetup } from './useThreeScene';

// vi.mock is hoisted, so the fakes are loaded with a dynamic import inside the factory (see fakeThree.ts).
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

function createContainer(width: number, height: number): HTMLDivElement {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: width });
    Object.defineProperty(container, 'clientHeight', { value: height });
    return container;
}

// Mounts the hook around a container of the given size and returns what a test usually needs.
function mount(setup: SceneSetup, { width = 400, height = 300, antialias }: { width?: number; height?: number; antialias?: boolean } = {}) {
    const resizes = installFakeResizeObserver();
    const container = createContainer(width, height);
    const containerRef = { current: container };
    const hook = renderHook(() => useThreeScene(containerRef, setup, { antialias }));
    return { ...hook, container, resizes };
}

describe('useThreeScene', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates the renderer, sizes it without inline styles and appends a block-level canvas', () => {
        const camera = new PerspectiveCamera();
        const { container } = mount(() => ({ camera }));

        const renderer = FakeRenderer.last;
        expect(renderer.setSize).toHaveBeenCalledWith(400, 300, false);
        expect(container.contains(renderer.domElement)).toBe(true);
        expect(renderer.domElement.style.display).toBe('block');
        expect(renderer.domElement.style.width).toBe('100%');
        expect(renderer.domElement.style.height).toBe('100%');
        expect(camera.aspect).toBeCloseTo(4 / 3);
        expect(renderer.parameters).toEqual({ antialias: false });
    });

    it('passes the antialias option to the renderer and rebuilds the scene when it changes', () => {
        const resizes = installFakeResizeObserver();
        // A stable ref, like a real useRef: a new object per render would itself retrigger the effect.
        const containerRef = { current: createContainer(400, 300) };
        const setup = vi.fn<SceneSetup>(() => ({ camera: new PerspectiveCamera() }));
        const { rerender } = renderHook(({ antialias }) => useThreeScene(containerRef, setup, { antialias }), {
            initialProps: { antialias: true },
        });

        expect(FakeRenderer.last.parameters).toEqual({ antialias: true });
        rerender({ antialias: false });

        expect(FakeRenderer.instances).toHaveLength(2);
        expect(FakeRenderer.instances[0].dispose).toHaveBeenCalledTimes(1);
        expect(FakeRenderer.last.parameters).toEqual({ antialias: false });
        expect(resizes.instances).toHaveLength(2);
    });

    it.each([
        { devicePixelRatio: 1, expected: 1 },
        { devicePixelRatio: 1.5, expected: 1.5 },
        { devicePixelRatio: 3, expected: 2 },
    ])('uses a pixel ratio of $expected on a $devicePixelRatio device (capped at 2)', ({ devicePixelRatio, expected }) => {
        vi.stubGlobal('devicePixelRatio', devicePixelRatio);
        mount(() => ({ camera: new PerspectiveCamera() }));

        expect(FakeRenderer.last.setPixelRatio).toHaveBeenCalledWith(expected);
    });

    it('does nothing when the container ref is empty', () => {
        const resizes = installFakeResizeObserver();
        const setup = vi.fn<SceneSetup>(() => ({ camera: new PerspectiveCamera() }));

        const { unmount } = renderHook(() => useThreeScene({ current: null }, setup));

        expect(setup).not.toHaveBeenCalled();
        expect(FakeRenderer.instances).toHaveLength(0);
        expect(resizes.instances).toHaveLength(0);
        expect(() => unmount()).not.toThrow();
    });

    it('hands setup the scene, renderer, initial size and an abort signal', () => {
        let received: SceneContext | undefined;
        mount(context => {
            received = context;
            return { camera: new PerspectiveCamera() };
        });

        expect(received?.renderer).toBe(FakeRenderer.last);
        expect(received?.scene.isScene).toBe(true);
        expect(received?.size).toEqual({ width: 400, height: 300 });
        expect(received?.signal.aborted).toBe(false);
    });

    describe('when setup throws', () => {
        it('frees the renderer, rethrows and never attaches a canvas', () => {
            // React logs the uncaught effect error; the noise is not what is under test.
            vi.spyOn(console, 'error').mockImplementation(() => { });
            const container = createContainer(400, 300);
            installFakeResizeObserver();
            const failure = new Error('setup failed');

            expect(() => renderHook(() => useThreeScene({ current: container }, () => { throw failure; }))).toThrow(failure);

            const renderer = FakeRenderer.last;
            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            expect(container.querySelector('canvas')).toBeNull();
            expect(renderer.animationLoop).toBeNull();
        });
    });

    describe('render loop', () => {
        it('calls update with the time and the delta since the previous frame, then renders', () => {
            const camera = new PerspectiveCamera();
            const update = vi.fn();
            mount(() => ({ camera, update }));
            const renderer = FakeRenderer.last;

            renderer.renderFrame(100);
            renderer.renderFrame(116);
            renderer.renderFrame(150);

            expect(update.mock.calls).toEqual([[100, 0], [116, 16], [150, 34]]);
            expect(renderer.render).toHaveBeenCalledTimes(3);
            expect(renderer.render).toHaveBeenLastCalledWith(expect.objectContaining({ isScene: true }), camera);
        });

        it('renders even when the handle has no update', () => {
            mount(() => ({ camera: new PerspectiveCamera() }));
            const renderer = FakeRenderer.last;

            renderer.renderFrame(0);

            expect(renderer.render).toHaveBeenCalledTimes(1);
        });

        it('builds the scene once and calls the latest setup function only on a rebuild', () => {
            const resizes = installFakeResizeObserver();
            const containerRef = { current: createContainer(400, 300) };
            const first = vi.fn<SceneSetup>(() => ({ camera: new PerspectiveCamera() }));
            const second = vi.fn<SceneSetup>(() => ({ camera: new PerspectiveCamera() }));
            const { rerender } = renderHook(({ setup }) => useThreeScene(containerRef, setup), {
                initialProps: { setup: first },
            });

            rerender({ setup: second });

            expect(first).toHaveBeenCalledTimes(1);
            expect(second).not.toHaveBeenCalled();
            expect(FakeRenderer.instances).toHaveLength(1);
            expect(resizes.instances).toHaveLength(1);
        });
    });

    describe('resizing', () => {
        it('updates the renderer, the camera aspect and the handle', () => {
            const camera = new PerspectiveCamera();
            const resize = vi.fn();
            const { resizes } = mount(() => ({ camera, resize }));
            const renderer = FakeRenderer.last;

            resizes.resize(800, 400);

            expect(renderer.setSize).toHaveBeenLastCalledWith(800, 400, false);
            expect(camera.aspect).toBe(2);
            expect(resize).toHaveBeenCalledWith({ width: 800, height: 400 });
        });

        it('rounds fractional sizes', () => {
            const resize = vi.fn();
            const { resizes } = mount(() => ({ camera: new PerspectiveCamera(), resize }));

            resizes.resize(799.6, 400.4);

            expect(resize).toHaveBeenCalledWith({ width: 800, height: 400 });
        });

        it('works for a handle without a resize callback', () => {
            const camera = new PerspectiveCamera();
            const { resizes } = mount(() => ({ camera }));

            resizes.resize(600, 300);

            expect(camera.aspect).toBe(2);
        });

        it.each([
            { name: 'zero width', width: 0, height: 300 },
            { name: 'zero height', width: 400, height: 0 },
            { name: 'a size that rounds to zero', width: 0.4, height: 300 },
            { name: 'the unchanged size', width: 400, height: 300 },
            { name: 'the unchanged size after rounding', width: 400.2, height: 299.8 },
        ])('ignores $name', ({ width, height }) => {
            const resize = vi.fn();
            const camera = new PerspectiveCamera();
            const { resizes } = mount(() => ({ camera, resize }));
            const renderer = FakeRenderer.last;
            const callsBefore = renderer.setSize.mock.calls.length;

            resizes.resize(width, height);

            expect(renderer.setSize).toHaveBeenCalledTimes(callsBefore);
            expect(resize).not.toHaveBeenCalled();
        });

        it('compares against the latest size, not the first one', () => {
            const resize = vi.fn();
            const { resizes } = mount(() => ({ camera: new PerspectiveCamera(), resize }));

            resizes.resize(800, 400);
            resizes.resize(800, 400);
            resizes.resize(400, 300);

            expect(resize).toHaveBeenCalledTimes(2);
            expect(resize).toHaveBeenLastCalledWith({ width: 400, height: 300 });
        });
    });

    describe('container without a size', () => {
        it('leaves the camera aspect alone until the container has a size', () => {
            const camera = new PerspectiveCamera();
            const initialAspect = camera.aspect;
            const { resizes } = mount(() => ({ camera }), { width: 0, height: 0 });
            expect(camera.aspect).toBe(initialAspect);

            resizes.resize(500, 250);

            expect(camera.aspect).toBe(2);
        });
    });

    describe('empty-container warning', () => {
        const warning = 'useThreeScene: the container has no size.  Give it an explicit width and height.';

        it.each([
            { name: 'width', width: 0, height: 300 },
            { name: 'height', width: 400, height: 0 },
            { name: 'both', width: 0, height: 0 },
        ])('warns in development when the $name is 0', ({ width, height }) => {
            vi.stubEnv('DEV', true);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

            mount(() => ({ camera: new PerspectiveCamera() }), { width, height });

            expect(warn).toHaveBeenCalledWith(warning);
        });

        it('does not warn in development when the container has a size', () => {
            vi.stubEnv('DEV', true);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

            mount(() => ({ camera: new PerspectiveCamera() }));

            expect(warn).not.toHaveBeenCalled();
        });

        // Regression: `dev && width === 0 || height === 0` warned in production whenever the height was 0.
        it.each([
            { name: 'width', width: 0, height: 300 },
            { name: 'height', width: 400, height: 0 },
            { name: 'both', width: 0, height: 0 },
        ])('never warns in production when the $name is 0', ({ width, height }) => {
            vi.stubEnv('DEV', false);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

            mount(() => ({ camera: new PerspectiveCamera() }), { width, height });

            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe('unmount', () => {
        it('stops the loop, disconnects the observer, aborts the signal, disposes the handle and frees the renderer', () => {
            const order: string[] = [];
            let signal: AbortSignal | undefined;
            const handle: SceneHandle = {
                camera: new PerspectiveCamera(),
                update: vi.fn(),
                dispose: vi.fn(() => order.push('handle.dispose')),
            };
            const { unmount, container, resizes } = mount(context => {
                signal = context.signal;
                return handle;
            });
            const renderer = FakeRenderer.last;
            renderer.dispose.mockImplementation(() => { order.push('renderer.dispose'); });
            expect(container.querySelector('canvas')).not.toBeNull();

            unmount();

            expect(renderer.animationLoop).toBeNull();
            expect(resizes.last.disconnect).toHaveBeenCalledTimes(1);
            expect(signal?.aborted).toBe(true);
            expect(handle.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            expect(container.querySelector('canvas')).toBeNull();
            // The handle may still use the scene while it disposes, so it goes before the renderer.
            expect(order).toEqual(['handle.dispose', 'renderer.dispose']);
        });

        it('disposes the scene content, and tolerates a handle without dispose', () => {
            const geometry = new BoxGeometry();
            const geometryDispose = vi.spyOn(geometry, 'dispose');
            const { unmount } = mount(({ scene }) => {
                scene.add(new Mesh(geometry, new MeshBasicMaterial()));
                return { camera: new PerspectiveCamera() };
            });

            expect(() => unmount()).not.toThrow();
            expect(geometryDispose).toHaveBeenCalledTimes(1);
            expect(FakeRenderer.last.dispose).toHaveBeenCalledTimes(1);
        });

        it('ignores resizes after unmount', () => {
            const resize = vi.fn();
            const { unmount, resizes } = mount(() => ({ camera: new PerspectiveCamera(), resize }));

            unmount();
            resizes.resize(800, 400);

            expect(resize).not.toHaveBeenCalled();
        });
    });
});
