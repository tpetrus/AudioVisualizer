// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { ENHANCED_GRAPHICS_KEY, setEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { BANDS } from './trioColorWaveConfig';
import { trioAllControls, type TrioAllControlValues } from './trioLookControls';
import { FORCE_HARDWARE_FLAG } from './trioLookMode';
import type { TrioEnhancedLook, TrioEnhancedLookOptions } from './enhanced/trioEnhancedTypes';
import { useTrioColorWaveScene } from './useTrioColorWaveScene';

// The enhanced look switches on and off inside one scene. The real look has its own spec; here a fake stands in for it,
// and the lazy chunk is a promise the test settles by hand.
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

vi.mock('~/features/audio/devTelemetry', () => ({ registerTelemetryProbe: () => () => {}, tickTelemetry: () => {} }));

// FakeRenderer has no WebGL context, so without this it would always count as hardware.
const budget = vi.hoisted(() => ({ software: false }));
vi.mock('~/lib/three/renderBudget', () => ({ isSoftwareRenderer: () => budget.software }));

interface FakeLook extends TrioEnhancedLook {
    render: ReturnType<typeof vi.fn<(dt: number) => void>>;
    setSize: ReturnType<typeof vi.fn<(size: { width: number; height: number }) => void>>;
    setMix: ReturnType<typeof vi.fn<(mix: number) => void>>;
    dispose: ReturnType<typeof vi.fn<() => void>>;
}

const newLook = (): FakeLook => ({ render: vi.fn(), setSize: vi.fn(), setMix: vi.fn(), dispose: vi.fn() });

const windowFlags = window as unknown as Record<string, unknown>;

function mountEnhanced(options: { rhythm?: object } = {}) {
    const resizes = installFakeResizeObserver();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    const valuesRef: { current: TrioAllControlValues } = { current: defaultValues(trioAllControls) };
    const looks: FakeLook[] = [];
    const created: TrioEnhancedLookOptions[] = [];
    const createTrioEnhancedLook = vi.fn((lookOptions: TrioEnhancedLookOptions) => {
        created.push(lookOptions);
        const look = newLook();
        looks.push(look);
        return look;
    });
    // Each call to the loader is one load the test settles by hand.
    const pending: { resolve: () => void; reject: (error: unknown) => void }[] = [];
    const loadEnhancedLook = vi.fn(
        () =>
            new Promise<{ createTrioEnhancedLook: typeof createTrioEnhancedLook }>((resolve, reject) => {
                pending.push({ resolve: () => resolve({ createTrioEnhancedLook }), reject });
            }),
    );
    const onEnhancedStatus = vi.fn();
    const renderersBefore = FakeRenderer.instances.length;

    const hook = renderHook(() =>
        useTrioColorWaveScene(
            { current: container },
            {
                analyser: undefined,
                valuesRef,
                rhythm: options.rhythm as never,
                onEnhancedStatus,
                loadEnhancedLook,
                cameraLocked: true,
                onViewChanged: vi.fn(),
            },
        ),
    );
    const renderer = FakeRenderer.last;
    let time = 0;
    const frame = (deltaMs = 16) => {
        time += deltaMs;
        renderer.renderFrame(time);
    };
    // Runs the action, then lets the load's promise callbacks run.
    const settle = (action: () => void) => act(async () => action());

    return {
        ...hook,
        renderer,
        container,
        resizes,
        valuesRef,
        looks,
        created,
        pending,
        createTrioEnhancedLook,
        loadEnhancedLook,
        onEnhancedStatus,
        statuses: () => onEnhancedStatus.mock.calls.map(([status]) => status),
        frame,
        settle,
        newRenderers: () => FakeRenderer.instances.length - renderersBefore,
    };
}

// Starts the first load and completes it, leaving the look live at mix 0.
async function reachEnhanced(scene: ReturnType<typeof mountEnhanced>) {
    setEnhancedGraphics(true);
    await scene.settle(() => scene.pending[0].resolve());
    return scene.looks[0];
}

describe('useTrioColorWaveScene enhanced look', () => {
    beforeEach(() => {
        localStorage.clear();
        budget.software = false;
        delete windowFlags[FORCE_HARDWARE_FLAG];
    });
    afterEach(() => {
        localStorage.clear();
        delete windowFlags[FORCE_HARDWARE_FLAG];
        vi.restoreAllMocks();
    });

    describe('standard', () => {
        it('draws with the renderer, loads nothing and reports nothing while the preference is off', () => {
            const scene = mountEnhanced();

            scene.frame();

            expect(scene.renderer.render).toHaveBeenCalledTimes(1);
            expect(scene.loadEnhancedLook).not.toHaveBeenCalled();
            expect(scene.onEnhancedStatus).not.toHaveBeenCalled();
        });

        it('keeps the standard look on a software renderer however the preference is set', () => {
            budget.software = true;
            localStorage.setItem(ENHANCED_GRAPHICS_KEY, 'true');
            const scene = mountEnhanced();

            setEnhancedGraphics(true);
            scene.frame();

            expect(scene.loadEnhancedLook).not.toHaveBeenCalled();
            expect(scene.renderer.render).toHaveBeenCalledTimes(1);
            expect(scene.onEnhancedStatus).not.toHaveBeenCalled();
        });

        it('lets the e2e force flag override the software check', async () => {
            budget.software = true;
            windowFlags[FORCE_HARDWARE_FLAG] = true;
            const scene = mountEnhanced();

            setEnhancedGraphics(true);
            await scene.settle(() => scene.pending[0].resolve());

            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);
            expect(scene.statuses()).toEqual(['loading', 'ready']);
        });
    });

    describe('turning on', () => {
        it('reads a preference that is already on when the scene is built', () => {
            localStorage.setItem(ENHANCED_GRAPHICS_KEY, 'true');
            const scene = mountEnhanced();

            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);
            expect(scene.statuses()).toEqual(['loading']);
        });

        it('keeps drawing standard while loading, then creates the look from the scene pieces at mix 0', async () => {
            const rhythm = {};
            const scene = mountEnhanced({ rhythm });

            setEnhancedGraphics(true);
            scene.frame();
            expect(scene.statuses()).toEqual(['loading']);
            expect(scene.renderer.render).toHaveBeenCalledTimes(1);

            await scene.settle(() => scene.pending[0].resolve());

            expect(scene.statuses()).toEqual(['loading', 'ready']);
            const [options] = scene.created;
            expect(options.renderer).toBe(scene.renderer);
            expect(options.size).toEqual({ width: 800, height: 600 });
            expect(options.valuesRef).toBe(scene.valuesRef);
            expect(options.rhythm).toBe(rhythm);
            // One flags mesh per band, the very meshes the scene draws.
            const [drawnScene, drawnCamera] = scene.renderer.render.mock.calls[0] as unknown as [Scene, unknown];
            expect(options.scene).toBe(drawnScene);
            expect(options.camera).toBe(drawnCamera);
            expect(options.sheets).toHaveLength(BANDS.length);
            options.sheets.forEach((flags) => expect(drawnScene.children).toContain(flags.mesh));
            expect(scene.looks[0].setMix).toHaveBeenCalledWith(0);
        });

        it('draws through the look from then on, with the frame time in seconds', async () => {
            const scene = mountEnhanced();
            const look = await reachEnhanced(scene);
            // The first frame has no delta, so it only starts the clock.
            scene.frame();
            scene.renderer.render.mockClear();

            scene.frame(50);

            expect(look.render).toHaveBeenLastCalledWith(0.05);
            expect(scene.renderer.render).not.toHaveBeenCalled();
        });

        it('mixes the look in over a quarter of a second of frame time', async () => {
            const scene = mountEnhanced();
            const look = await reachEnhanced(scene);
            // The first frame has no delta, so it only starts the clock.
            scene.frame();
            look.setMix.mockClear();

            scene.frame(100);
            expect(look.setMix).toHaveBeenLastCalledWith(0.4);
            scene.frame(100);
            expect(look.setMix).toHaveBeenLastCalledWith(0.8);
            scene.frame(100);
            expect(look.setMix).toHaveBeenLastCalledWith(1);
            look.setMix.mockClear();
            scene.frame(100);

            expect(look.setMix).not.toHaveBeenCalled();
        });

        it('passes the live reduced-motion query, or a false stand-in without matchMedia', async () => {
            const query = { matches: true };
            const matchMedia = vi.fn(() => query);
            vi.stubGlobal('matchMedia', matchMedia);
            const withQuery = mountEnhanced();
            await reachEnhanced(withQuery);
            expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
            expect(withQuery.created[0].reducedMotion).toBe(query);
            withQuery.unmount();
            localStorage.clear();

            vi.stubGlobal('matchMedia', undefined);
            const without = mountEnhanced();
            await reachEnhanced(without);
            expect(without.created[0].reducedMotion.matches).toBe(false);
        });

        it('reports each status once, however often the same preference is announced', async () => {
            const scene = mountEnhanced();

            setEnhancedGraphics(true);
            setEnhancedGraphics(true);
            await scene.settle(() => scene.pending[0].resolve());
            setEnhancedGraphics(true);
            scene.frame();
            scene.frame();

            expect(scene.statuses()).toEqual(['loading', 'ready']);
            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);
        });
    });

    describe('turning off', () => {
        it('fades the look out, then disposes it and draws standard again', async () => {
            const scene = mountEnhanced();
            const look = await reachEnhanced(scene);
            scene.frame();
            scene.frame(250);
            look.setMix.mockClear();

            setEnhancedGraphics(false);
            expect(scene.statuses()).toEqual(['loading', 'ready', undefined]);
            scene.frame(100);
            expect(look.setMix).toHaveBeenLastCalledWith(0.6);
            expect(look.dispose).not.toHaveBeenCalled();
            scene.frame(100);
            expect(look.setMix).toHaveBeenLastCalledWith(expect.closeTo(0.2));
            scene.renderer.render.mockClear();
            look.render.mockClear();
            scene.frame(100);

            expect(look.setMix).toHaveBeenLastCalledWith(0);
            expect(look.dispose).toHaveBeenCalledTimes(1);
            expect(look.render).not.toHaveBeenCalled();
            expect(scene.renderer.render).toHaveBeenCalledTimes(1);
            expect(scene.statuses()).toEqual(['loading', 'ready', undefined]);
        });

        it('ramps back up on the same look when turned on again during the fade', async () => {
            const scene = mountEnhanced();
            const look = await reachEnhanced(scene);
            scene.frame();
            scene.frame(250);
            setEnhancedGraphics(false);
            scene.frame(100);

            setEnhancedGraphics(true);
            look.setMix.mockClear();
            scene.frame(50);
            scene.frame(200);

            expect(scene.createTrioEnhancedLook).toHaveBeenCalledTimes(1);
            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);
            expect(look.dispose).not.toHaveBeenCalled();
            expect(look.setMix).toHaveBeenNthCalledWith(1, expect.closeTo(0.8));
            expect(look.setMix).toHaveBeenLastCalledWith(1);
            expect(scene.statuses()).toEqual(['loading', 'ready', undefined, 'ready']);
        });

        it('never uses a look whose load finishes after the preference went off', async () => {
            const scene = mountEnhanced();
            setEnhancedGraphics(true);

            setEnhancedGraphics(false);
            await scene.settle(() => scene.pending[0].resolve());
            scene.frame();

            expect(scene.statuses()).toEqual(['loading', undefined]);
            expect(scene.createTrioEnhancedLook).not.toHaveBeenCalled();
            expect(scene.renderer.render).toHaveBeenCalledTimes(1);
        });

        it('starts a fresh load when it is turned on again after an abandoned one', async () => {
            const scene = mountEnhanced();
            setEnhancedGraphics(true);
            setEnhancedGraphics(false);
            setEnhancedGraphics(true);

            await scene.settle(() => {
                scene.pending[0].resolve();
                scene.pending[1].resolve();
            });

            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(2);
            expect(scene.createTrioEnhancedLook).toHaveBeenCalledTimes(1);
            expect(scene.statuses()).toEqual(['loading', undefined, 'loading', 'ready']);
        });
    });

    describe('failure', () => {
        it('warns once, reports an error and keeps drawing standard when the import fails', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const scene = mountEnhanced();
            setEnhancedGraphics(true);

            await scene.settle(() => scene.pending[0].reject(new Error('offline')));
            scene.frame();
            scene.frame();

            expect(warn).toHaveBeenCalledTimes(1);
            expect(scene.statuses()).toEqual(['loading', 'error']);
            expect(scene.renderer.render).toHaveBeenCalledTimes(2);
        });

        it('treats a look that fails to build the same way, and retries on the next off-to-on toggle only', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const scene = mountEnhanced();
            scene.createTrioEnhancedLook.mockImplementationOnce(() => {
                throw new Error('no shader');
            });
            setEnhancedGraphics(true);
            await scene.settle(() => scene.pending[0].resolve());
            expect(scene.statuses()).toEqual(['loading', 'error']);
            expect(warn).toHaveBeenCalledTimes(1);

            // Still on: announcing it again must not retry.
            setEnhancedGraphics(true);
            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);

            setEnhancedGraphics(false);
            setEnhancedGraphics(true);
            await scene.settle(() => scene.pending[1].resolve());

            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(2);
            expect(scene.statuses()).toEqual(['loading', 'error', undefined, 'loading', 'ready']);
        });

        it('ignores a failure of a load that was already abandoned', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const scene = mountEnhanced();
            setEnhancedGraphics(true);
            setEnhancedGraphics(false);

            await scene.settle(() => scene.pending[0].reject(new Error('late')));

            expect(warn).not.toHaveBeenCalled();
            expect(scene.statuses()).toEqual(['loading', undefined]);
        });
    });

    describe('context loss', () => {
        it('disposes the live look and falls back to standard for good', async () => {
            const scene = mountEnhanced();
            const look = await reachEnhanced(scene);
            scene.renderer.render.mockClear();

            scene.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
            scene.frame();
            setEnhancedGraphics(false);
            setEnhancedGraphics(true);

            expect(look.dispose).toHaveBeenCalledTimes(1);
            expect(scene.renderer.render).toHaveBeenCalledTimes(1);
            expect(scene.statuses()).toEqual(['loading', 'ready', undefined]);
            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);
        });

        it('abandons a load that is still running', async () => {
            const scene = mountEnhanced();
            setEnhancedGraphics(true);

            scene.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
            await scene.settle(() => scene.pending[0].resolve());

            expect(scene.createTrioEnhancedLook).not.toHaveBeenCalled();
            expect(scene.statuses()).toEqual(['loading', undefined]);
        });
    });

    describe('resizing', () => {
        it('hands a look built later the current size, and forwards later sizes to it', async () => {
            const scene = mountEnhanced();
            setEnhancedGraphics(true);
            scene.resizes.resize(1000, 500);
            await scene.settle(() => scene.pending[0].resolve());
            const look = scene.looks[0];
            expect(scene.created[0].size).toEqual({ width: 1000, height: 500 });

            scene.resizes.resize(640, 480);

            expect(look.setSize).toHaveBeenCalledWith({ width: 640, height: 480 });
        });

        it('has nothing to forward to in standard mode', () => {
            const scene = mountEnhanced();

            expect(() => scene.resizes.resize(640, 480)).not.toThrow();
        });
    });

    describe('teardown and rebuilds', () => {
        it('disposes the look, unsubscribes, removes the listener and reports standard', async () => {
            const scene = mountEnhanced();
            const look = await reachEnhanced(scene);
            const removeListener = vi.spyOn(scene.renderer.domElement, 'removeEventListener');

            scene.unmount();

            expect(look.dispose).toHaveBeenCalledTimes(1);
            expect(removeListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
            expect(scene.statuses().at(-1)).toBeUndefined();
            setEnhancedGraphics(false);
            setEnhancedGraphics(true);
            expect(scene.loadEnhancedLook).toHaveBeenCalledTimes(1);
        });

        it('abandons a load that finishes after the scene is gone', async () => {
            const scene = mountEnhanced();
            setEnhancedGraphics(true);

            scene.unmount();
            await scene.settle(() => scene.pending[0].resolve());

            expect(scene.createTrioEnhancedLook).not.toHaveBeenCalled();
        });

        it('keeps one renderer and one canvas across five toggles', async () => {
            const scene = mountEnhanced();

            scene.frame();
            for (let cycle = 0; cycle < 5; cycle++) {
                setEnhancedGraphics(true);
                await scene.settle(() => scene.pending[cycle].resolve());
                scene.frame(300);
                setEnhancedGraphics(false);
                scene.frame(300);
            }

            expect(scene.newRenderers()).toBe(1);
            expect(scene.renderer.dispose).not.toHaveBeenCalled();
            expect(scene.container.querySelectorAll('canvas')).toHaveLength(1);
            expect(scene.looks).toHaveLength(5);
            scene.looks.forEach((look) => expect(look.dispose).toHaveBeenCalledTimes(1));
        });
    });
});
