// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { Color, type InstancedMesh, type PerspectiveCamera, type Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import type { EnhancedGraphicsStatus } from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { dismissSlowNotice, resetSlowNoticeDismissed } from '~/features/settings/frameRateMonitor';
import { FakeAudioHub } from '~/test/fakeAudioHub';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import { CubeGrid } from './cubeGrid';
import { cubesEnhancedControls, type CubesEnhancedControlValues } from './cubesControls';
import type { CubesEnhancedLookOptions } from './enhanced/cubesEnhancedTypes';
import type { LoadCubesEnhancedResult } from './enhanced/loadCubesEnhanced';
import { useCubesScene } from './useCubesScene';

// The enhanced look has its own spec; here only how the hook drives it matters. Each test settles the load itself.
const enhancedMock = vi.hoisted(() => ({
    loadCubesEnhanced: vi.fn(),
}));
vi.mock('./enhanced/loadCubesEnhanced', () => ({ loadCubesEnhanced: enhancedMock.loadCubesEnhanced }));

class FakeLook {
    static instances: FakeLook[] = [];
    static failAt: 'construct' | 'attach' | undefined;
    readonly attach = vi.fn((_grid: unknown) => {
        if (FakeLook.failAt === 'attach') throw new Error('material failed');
    });
    readonly update = vi.fn();
    readonly render = vi.fn();
    readonly resize = vi.fn();
    readonly setReducedMotion = vi.fn();
    readonly dispose = vi.fn();
    constructor(readonly options: CubesEnhancedLookOptions) {
        if (FakeLook.failAt === 'construct') throw new Error('shader failed');
        FakeLook.instances.push(this);
    }
}

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

const probeRead = () => telemetry.register.mock.calls.at(-1)![2] as (out: Float32Array) => void;
function readProbe(width: number): Float32Array {
    const out = new Float32Array(width);
    probeRead()(out);
    return out;
}

function createAnalyser() {
    const context = new FakeAudioContext();
    const analyser = new FakeAnalyserNode(context);
    return { context, analyser, node: asWebAudio<AnalyserNode>(analyser) };
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

function mountScene(initial: Partial<Props> = {}, { width = 800, height = 600 } = {}) {
    const resizes = installFakeResizeObserver();
    const hub = new FakeAudioHub();
    const containerRef = { current: createContainer(width, height) };
    const valuesRef: { current: CubesEnhancedControlValues } = { current: defaultValues(cubesEnhancedControls) };
    const onViewChanged = vi.fn();
    const statuses: (EnhancedGraphicsStatus | undefined)[] = [];
    const onEnhancedStatus = vi.fn((status: EnhancedGraphicsStatus | undefined) => statuses.push(status));
    const onSlowFrames = vi.fn();

    const hook = renderHook(
        ({ analyser, cameraLocked, enhanced = false }: Props) =>
            useCubesScene(containerRef, {
                analyser,
                hub,
                valuesRef,
                cameraLocked,
                onViewChanged,
                enhanced,
                onEnhancedStatus,
                onSlowFrames,
            }),
        { initialProps: { analyser: undefined, cameraLocked: true, ...initial } as Props },
    );

    const renderer = FakeRenderer.last;
    // The hook renders `scene` with `camera` every frame, so the first render call reveals both.
    const frame = (time = 16) => renderer.renderFrame(time);
    frame(0);
    const [scene, camera] = renderer.render.mock.calls[0] as unknown as [Scene, PerspectiveCamera];
    const gridMesh = () =>
        scene.children.find((child): child is InstancedMesh => (child as InstancedMesh).isInstancedMesh);

    return {
        ...hook,
        renderer,
        scene,
        camera,
        gridMesh,
        frame,
        hub,
        valuesRef,
        onViewChanged,
        statuses,
        onSlowFrames,
        resizes,
        containerRef,
    };
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
            expect(scene.children.filter((child) => (child as { isLight?: boolean }).isLight)).toHaveLength(3);
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
            const hidden = room.children.filter((child) => child.position.z > 10);
            expect(hidden.length).toBeGreaterThan(0);
            expect(hidden.every((child) => !child.visible)).toBe(true);
        });
    });

    describe('frames without an analyser', () => {
        it('keeps rendering the resting grid and brings the hub up to date once per frame', () => {
            const { hub, frame, renderer, gridMesh } = mountScene();

            frame(16);
            frame(32);

            // One catch-up call when the scene is built, then one per frame.
            expect(hub.update).toHaveBeenCalledTimes(4);
            // Read at the tracker's render time: the scene passes no time of its own.
            expect(hub.update).toHaveBeenCalledWith();
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
        it('binds a new analyser: leaves its settings to its owner, reads the spectrum and raises the cubes the spectrum drives', () => {
            const { analyser, node } = createAnalyser();
            const { frame, gridMesh } = mountScene({ analyser: node });
            const calmZ = cubeZ(gridMesh(), 21 * 32 + 16);

            // A loud spectrum puts the center column well above its resting height.
            analyser.setByteFrequencyData(255);
            frame(16);
            frame(32);

            // The node's settings belong to whoever owns it; the scene must not touch them.
            expect(analyser.fftSize).toBe(2048);
            expect(analyser.smoothingTimeConstant).toBe(0.8);
            expect(analyser.getByteFrequencyData).toHaveBeenCalled();
            expect(cubeZ(gridMesh(), 21 * 32 + 16)).toBeGreaterThan(calmZ);
        });

        it('rebinds when the analyser changes: the new source is read', () => {
            const first = createAnalyser();
            const second = createAnalyser();
            const { frame, rerender } = mountScene({ analyser: first.node });

            rerender({ analyser: second.node, cameraLocked: true });
            second.analyser.setByteFrequencyData(200);
            frame(16);

            expect(second.analyser.fftSize).toBe(2048);
            expect(second.analyser.getByteFrequencyData).toHaveBeenCalled();
            // The columns need no tap: the scene never connects the analyser anywhere.
            expect(second.analyser.connect).not.toHaveBeenCalled();
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
        // A quiet bed, then a kick: the hub's low bands jump while the rest stays put.
        function kick(hub: FakeAudioHub, frame: (time?: number) => void) {
            hub.setGateBass(0.05);
            for (let i = 1; i <= 30; i++) frame(i * 16);
            hub.setGateBass(0.2);
            frame(31 * 16);
            frame(32 * 16);
            frame(33 * 16);
        }

        it('flashes the background with the resting color when the gate-input bass jumps', () => {
            const { hub, frame, scene, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, bgPulse: 1 };

            kick(hub, frame);

            const background = scene.background as Color;
            // The resting color is dark red, so the flash is red only.
            expect(background.r).toBeGreaterThan(0);
            expect(background.g).toBe(0);
            expect(background.b).toBe(0);
        });

        it('ignores the bands, the low end included: only the gate-input bass flashes it', () => {
            const { hub, frame, scene, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, bgPulse: 1 };

            // A silent gate-input bass under a loud low end and loud bands, which jump: nothing flashes.
            hub.setGateBass(0, 5);
            hub.setBands([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
            for (let i = 1; i <= 30; i++) frame(i * 16);
            hub.setBands([1, 1, 1, 1, 1, 1]);
            frame(31 * 16);
            frame(32 * 16);

            expect((scene.background as Color).getHex()).toBe(0x000000);
        });

        it('does not flash when the bass bump is switched off', () => {
            const { hub, frame, scene, valuesRef } = mountScene();
            valuesRef.current = { ...valuesRef.current, bassBump: false };

            kick(hub, frame);

            expect((scene.background as Color).getHex()).toBe(0x000000);
        });
    });

    describe('downbeat accent', () => {
        function downbeat(hub: FakeAudioHub, barLocked: boolean): void {
            hub.snapshot.beat.barLocked = barLocked;
            hub.snapshot.beat.downbeatCount += 1;
        }

        it('lifts the resting cubes on a downbeat of a confident meter, then fades', () => {
            const { hub, frame, gridMesh } = mountScene();

            downbeat(hub, true);
            frame(16);
            const lifted = cubeZ(gridMesh(), CORNER_CUBE);
            frame(32);
            const fading = cubeZ(gridMesh(), CORNER_CUBE);

            // 1 * 0.9 decay * 0.35 accent * 2 backdrop lift
            expect(lifted).toBeCloseTo(0.63);
            expect(fading).toBeCloseTo(0.567);
        });

        it('ignores a downbeat while the bar is not locked', () => {
            const { hub, frame, gridMesh } = mountScene();

            downbeat(hub, false);
            frame(16);

            expect(cubeZ(gridMesh(), CORNER_CUBE)).toBe(0);
        });

        it('does not accent a count the hub already held when the scene was built', () => {
            const hub = new FakeAudioHub();
            hub.snapshot.beat.downbeatCount = 7;
            hub.snapshot.beat.barLocked = true;
            installFakeResizeObserver();
            renderHook(() =>
                useCubesScene(
                    { current: createContainer(800, 600) },
                    {
                        analyser: undefined,
                        hub,
                        valuesRef: { current: defaultValues(cubesEnhancedControls) },
                        cameraLocked: true,
                        onViewChanged: vi.fn(),
                        enhanced: false,
                    },
                ),
            );
            const renderer = FakeRenderer.last;
            renderer.renderFrame(0);
            renderer.renderFrame(16);
            const [scene] = renderer.render.mock.calls[0] as unknown as [Scene];
            const mesh = scene.children.find(
                (child): child is InstancedMesh => (child as InstancedMesh).isInstancedMesh,
            );

            expect(cubeZ(mesh, CORNER_CUBE)).toBe(0);
        });

        it('does not accent downbeats the hub counted while nobody was updating it', () => {
            const hub = new FakeAudioHub();
            hub.snapshot.beat.barLocked = true;
            // A real hub catches up on its first update after a stale period, so the count moves then.
            hub.update.mockImplementationOnce(() => {
                hub.snapshot.beat.downbeatCount += 3;
            });
            installFakeResizeObserver();
            renderHook(() =>
                useCubesScene(
                    { current: createContainer(800, 600) },
                    {
                        analyser: undefined,
                        hub,
                        valuesRef: { current: defaultValues(cubesEnhancedControls) },
                        cameraLocked: true,
                        onViewChanged: vi.fn(),
                        enhanced: false,
                    },
                ),
            );
            const renderer = FakeRenderer.last;
            renderer.renderFrame(0);
            renderer.renderFrame(16);
            const [scene] = renderer.render.mock.calls[0] as unknown as [Scene];
            const mesh = scene.children.find(
                (child): child is InstancedMesh => (child as InstancedMesh).isInstancedMesh,
            );

            expect(cubeZ(mesh, CORNER_CUBE)).toBe(0);
        });

        it('accents each new downbeat once, not every frame', () => {
            const { hub, frame, gridMesh } = mountScene();
            downbeat(hub, true);
            frame(16);
            frame(32);
            const afterTwo = cubeZ(gridMesh(), CORNER_CUBE);

            // The counter has not moved, so the accent keeps decaying instead of restarting.
            frame(48);
            expect(cubeZ(gridMesh(), CORNER_CUBE)).toBeLessThan(afterTwo);

            downbeat(hub, true);
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
            expect(scene.children.filter((child) => (child as InstancedMesh).isInstancedMesh)).toHaveLength(1);
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
            const { result } = renderHook(() =>
                useCubesScene(
                    { current: null },
                    {
                        analyser: undefined,
                        hub: new FakeAudioHub(),
                        valuesRef: { current: defaultValues(cubesEnhancedControls) },
                        cameraLocked: true,
                        onViewChanged: vi.fn(),
                        enhanced: false,
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

    describe('telemetry probe', () => {
        beforeEach(() => {
            telemetry.register.mockClear();
            telemetry.unregister.mockClear();
            telemetry.tick.mockClear();
        });

        it('registers the cubes columns and reads rest values before the hub has data', () => {
            mountScene();

            expect(telemetry.register).toHaveBeenCalledWith(
                'cubes',
                ['in', 'fast', 'slow', 'ratio', 'out'],
                expect.any(Function),
            );
            expect(Array.from(readProbe(5))).toEqual([0, 0, 0, 1, 0]);
        });

        it('reads the bass envelope values and ticks with the frame time in seconds', () => {
            const { hub, frame } = mountScene();
            hub.setGateBass(0.05);
            for (let i = 1; i <= 30; i++) frame(i * 16);
            hub.setGateBass(0.25);
            frame(31 * 16);
            frame(32 * 16);

            const [input, fast, slow, ratio, out] = readProbe(5);
            expect(input).toBe(0.25);
            expect(fast).toBeGreaterThan(0.1);
            // The slow follower starts at 0, as BassPulse's does, and is still climbing.
            expect(slow).toBeGreaterThan(0);
            expect(slow).toBeLessThan(fast);
            expect(ratio).toBeGreaterThan(1.15);
            expect(out).toBeGreaterThan(0);
            expect(telemetry.tick).toHaveBeenLastCalledWith(0.016);
        });

        it('unregisters when the scene is torn down', () => {
            const { unmount } = mountScene();
            expect(telemetry.unregister).not.toHaveBeenCalled();

            unmount();

            expect(telemetry.unregister).toHaveBeenCalledTimes(1);
        });
    });

    describe('unmount', () => {
        it('frees the renderer, the grid and the controls', () => {
            const { node } = createAnalyser();
            const { unmount, renderer, scene, gridMesh, frame, camera } = mountScene({
                analyser: node,
                cameraLocked: false,
            });
            frame(16);
            const mesh = gridMesh();
            expect(mesh).toBeDefined();

            unmount();

            expect(renderer.dispose).toHaveBeenCalledTimes(1);
            expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
            expect(scene.children).not.toContain(mesh);
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

    describe('enhanced graphics', () => {
        interface PendingLoad {
            signal: AbortSignal;
            settle: (result: LoadCubesEnhancedResult) => void;
        }
        const loads: PendingLoad[] = [];
        const ok = { ok: true, Look: FakeLook } as unknown as LoadCubesEnhancedResult;
        const failed: LoadCubesEnhancedResult = { ok: false };
        const basic: Props = { analyser: undefined, cameraLocked: true, enhanced: false };
        const on: Props = { ...basic, enhanced: true };

        // Settles a load the way the real loader would, and lets the hook's continuation run.
        const settle = (result: LoadCubesEnhancedResult, index = loads.length - 1) =>
            act(async () => loads[index].settle(result));

        const look = () => FakeLook.instances.at(-1)!;

        beforeEach(() => {
            loads.length = 0;
            FakeLook.instances = [];
            FakeLook.failAt = undefined;
            enhancedMock.loadCubesEnhanced.mockReset();
            // Unlike the real loader, an abort does not settle it: that lets a test deliver a late result on purpose.
            enhancedMock.loadCubesEnhanced.mockImplementation(
                (signal: AbortSignal) =>
                    new Promise<LoadCubesEnhancedResult>((resolve) => loads.push({ signal, settle: resolve })),
            );
            resetSlowNoticeDismissed();
        });

        afterEach(() => {
            vi.restoreAllMocks();
            Reflect.deleteProperty(window, 'matchMedia');
        });

        function installMatchMedia(matches: boolean) {
            const listeners = new Set<(event: { matches: boolean }) => void>();
            const query = {
                matches,
                addEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
                    listeners.add(listener);
                }),
                removeEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
                    listeners.delete(listener);
                }),
            };
            window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia;
            return {
                query,
                listeners,
                fire: (next: boolean) => listeners.forEach((listener) => listener({ matches: next })),
            };
        }

        it('never loads the look or touches the grid material while the flag is off', () => {
            const override = vi.spyOn(CubeGrid.prototype, 'setMaterialOverride');
            const { frame, renderer, statuses, onSlowFrames } = mountScene();

            for (let i = 1; i <= 120; i++) frame(i * 100);

            expect(enhancedMock.loadCubesEnhanced).not.toHaveBeenCalled();
            expect(override).not.toHaveBeenCalled();
            expect(statuses).toEqual([undefined]);
            // Plain rendering, even when frames are slow: the monitor only watches the enhanced look.
            expect(renderer.render).toHaveBeenCalledTimes(121);
            expect(onSlowFrames).not.toHaveBeenCalled();
        });

        it('keeps the basic look rendering while loading, then renders through the look once it is ready', async () => {
            const { frame, renderer, statuses, hub, valuesRef, scene, camera } = mountScene({ enhanced: true });
            expect(statuses).toEqual([undefined, 'loading']);
            expect(enhancedMock.loadCubesEnhanced).toHaveBeenCalledTimes(1);
            const before = renderer.render.mock.calls.length;
            frame(16);
            expect(renderer.render.mock.calls.length).toBe(before + 1);

            await settle(ok);

            expect(statuses).toEqual([undefined, 'loading', 'ready']);
            expect(look().options).toMatchObject({
                renderer,
                scene,
                camera,
                size: { width: 800, height: 600 },
                reducedMotion: false,
            });
            expect(look().options.lights.key.isDirectionalLight).toBe(true);
            expect(look().options.lights.fill.isDirectionalLight).toBe(true);
            expect(look().options.lights.ambient.isAmbientLight).toBe(true);
            expect(look().attach).toHaveBeenCalledTimes(1);

            hub.snapshot.beat.locked = true;
            hub.snapshot.beat.phase = 0.25;
            hub.snapshot.beat.barLocked = true;
            hub.snapshot.beat.barPhase = 0.5;
            valuesRef.current = { ...valuesRef.current, glow: 0.2, particles: 0.3, cameraMotion: 0.4 };
            const rendersBefore = renderer.render.mock.calls.length;
            frame(32);
            frame(48);

            expect(renderer.render.mock.calls.length).toBe(rendersBefore);
            expect(look().render).toHaveBeenCalledTimes(2);
            expect(look().update).toHaveBeenCalledTimes(2);
            const [fxFrame, settings] = look().update.mock.calls[1];
            expect(fxFrame).toMatchObject({
                bands: null,
                beatPhase: 0.25,
                barPhase: 0.5,
                barLocked: true,
                dt: 0.016,
            });
            expect(settings).toMatchObject({ glow: 0.2, particles: 0.3, cameraMotion: 0.4 });
            expect(settings.restingColor).toBeInstanceOf(Color);
            expect(settings.raisedColor).toBeInstanceOf(Color);
        });

        it('hands the look the same frame and settings objects every frame (no allocation)', async () => {
            const { frame } = mountScene({ enhanced: true });
            await settle(ok);

            frame(16);
            frame(32);

            const [first, second] = look().update.mock.calls;
            expect(second[0]).toBe(first[0]);
            expect(second[1]).toBe(first[1]);
        });

        it('passes the hook levels as bands with an analyser, and null phases while the beat is not locked', async () => {
            const { analyser, node } = createAnalyser();
            const { frame, hub } = mountScene({ analyser: node, enhanced: true });
            await settle(ok);
            analyser.setByteFrequencyData(255);
            hub.snapshot.beat.phase = 0.7;
            hub.snapshot.beat.barPhase = 0.9;
            hub.setGateBass(0.4);

            frame(16);

            const [fxFrame] = look().update.mock.calls[0];
            expect(fxFrame.bands).toBeInstanceOf(Float32Array);
            expect(fxFrame.beatPhase).toBeNull();
            expect(fxFrame.barPhase).toBeNull();
            expect(fxFrame.barLocked).toBe(false);
            expect(fxFrame.bassFlash).toBeGreaterThanOrEqual(0);
            expect(fxFrame.bassFlash).toBeLessThanOrEqual(1);
        });

        it('reads an undefined phase as null even while locked', async () => {
            const { frame, hub } = mountScene({ enhanced: true });
            await settle(ok);
            hub.snapshot.beat.locked = true;
            hub.snapshot.beat.barLocked = true;

            frame(16);

            const [fxFrame] = look().update.mock.calls[0];
            expect(fxFrame.beatPhase).toBeNull();
            expect(fxFrame.barPhase).toBeNull();
        });

        it('adds and removes the look on a toggle round trip without rebuilding the scene', async () => {
            const { rerender, frame, renderer, statuses, gridMesh } = mountScene();
            const mesh = gridMesh();
            frame(16);

            rerender(on);
            expect(statuses).toEqual([undefined, 'loading']);
            await settle(ok);
            expect(statuses).toEqual([undefined, 'loading', 'ready']);
            const first = look();

            rerender(basic);
            expect(first.dispose).toHaveBeenCalledTimes(1);
            expect(statuses).toEqual([undefined, 'loading', 'ready', undefined]);
            const rendersBefore = renderer.render.mock.calls.length;
            frame(32);
            expect(renderer.render.mock.calls.length).toBe(rendersBefore + 1);
            expect(first.render).not.toHaveBeenCalled();

            rerender(on);
            await settle(ok);
            expect(FakeLook.instances).toHaveLength(2);
            expect(look()).not.toBe(first);
            expect(statuses).toEqual([undefined, 'loading', 'ready', undefined, 'loading', 'ready']);

            // One renderer and one grid throughout: nothing was rebuilt.
            expect(FakeRenderer.instances.filter((instance) => instance === renderer)).toHaveLength(1);
            expect(gridMesh()).toBe(mesh);
        });

        it('ignores a load that finishes after the look was turned off, and has aborted it', async () => {
            const { rerender, statuses } = mountScene({ enhanced: true });
            const [pending] = loads;

            rerender(basic);
            expect(pending.signal.aborted).toBe(true);
            expect(statuses).toEqual([undefined, 'loading', undefined]);
            await settle(ok, 0);

            expect(FakeLook.instances).toHaveLength(0);
            expect(statuses).toEqual([undefined, 'loading', undefined]);
        });

        it('uses only the newest load when the toggle flips off and on while loading', async () => {
            const { rerender, statuses } = mountScene({ enhanced: true });

            rerender(basic);
            rerender(on);
            expect(loads).toHaveLength(2);
            expect(loads[0].signal.aborted).toBe(true);
            expect(loads[1].signal.aborted).toBe(false);

            await settle(ok, 0);
            expect(FakeLook.instances).toHaveLength(0);
            await settle(ok, 1);

            expect(FakeLook.instances).toHaveLength(1);
            expect(statuses.at(-1)).toBe('ready');
        });

        it('aborts a pending load on teardown and ignores its late result', async () => {
            const { unmount, statuses } = mountScene({ enhanced: true });
            const [pending] = loads;

            unmount();
            expect(pending.signal.aborted).toBe(true);
            await settle(ok, 0);

            expect(FakeLook.instances).toHaveLength(0);
            expect(statuses).toEqual([undefined, 'loading']);
        });

        it('disposes the look on teardown, before the grid it draws', async () => {
            const { unmount } = mountScene({ enhanced: true });
            await settle(ok);
            const override = vi.spyOn(CubeGrid.prototype, 'dispose');
            look().dispose.mockImplementation(() => expect(override).not.toHaveBeenCalled());

            unmount();

            expect(look().dispose).toHaveBeenCalledTimes(1);
            expect(override).toHaveBeenCalledTimes(1);
        });

        it('reports error and keeps the basic look when the load fails', async () => {
            const { statuses, frame, renderer } = mountScene({ enhanced: true });

            await settle(failed);

            expect(statuses).toEqual([undefined, 'loading', 'error']);
            const before = renderer.render.mock.calls.length;
            frame(16);
            expect(renderer.render.mock.calls.length).toBe(before + 1);
        });

        it('retries on the next toggle after an error', async () => {
            const { rerender, statuses } = mountScene({ enhanced: true });
            await settle(failed);

            rerender(basic);
            rerender(on);
            await settle(ok);

            expect(statuses).toEqual([undefined, 'loading', 'error', undefined, 'loading', 'ready']);
        });

        it.each(['construct', 'attach'] as const)('reports error when the look fails at %s', async (failAt) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            FakeLook.failAt = failAt;
            const { statuses, frame, renderer } = mountScene({ enhanced: true });

            await settle(ok);

            expect(statuses).toEqual([undefined, 'loading', 'error']);
            expect(warn).toHaveBeenCalledTimes(1);
            // A look that was built before it failed is freed.
            if (failAt === 'attach') expect(look().dispose).toHaveBeenCalledTimes(1);
            const before = renderer.render.mock.calls.length;
            frame(16);
            expect(renderer.render.mock.calls.length).toBe(before + 1);
        });

        it('re-attaches the look to a rebuilt grid and resizes it on every resize', async () => {
            const { resizes, gridMesh } = mountScene({ enhanced: true });
            await settle(ok);
            const first = gridMesh();
            expect(look().attach).toHaveBeenCalledTimes(1);

            resizes.resize(1200, 600);
            expect(look().attach).toHaveBeenCalledTimes(2);
            expect((look().attach.mock.calls[1][0] as CubeGrid).mesh).toBe(gridMesh());
            expect(gridMesh()).not.toBe(first);
            expect(look().resize).toHaveBeenLastCalledWith(1200, 600);

            // The grid keeps its size here, so it is not re-attached, but the look still follows the view.
            resizes.resize(1201, 600);
            expect(look().attach).toHaveBeenCalledTimes(2);
            expect(look().resize).toHaveBeenLastCalledWith(1201, 600);
        });

        it('builds a look that arrives after a resize at the new size', async () => {
            const { resizes } = mountScene({ enhanced: true });
            resizes.resize(1200, 600);

            await settle(ok);

            expect(look().options.size).toEqual({ width: 1200, height: 600 });
        });

        it('does not touch a look in basic mode on resize', () => {
            const { resizes } = mountScene();

            expect(() => resizes.resize(1200, 600)).not.toThrow();
        });

        describe('reduced motion', () => {
            it('starts the look with the preference and follows it live', async () => {
                const media = installMatchMedia(true);
                const { unmount } = mountScene({ enhanced: true });
                await settle(ok);
                expect(media.query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
                expect(look().options.reducedMotion).toBe(true);

                media.fire(false);
                expect(look().setReducedMotion).toHaveBeenLastCalledWith(false);
                media.fire(true);
                expect(look().setReducedMotion).toHaveBeenLastCalledWith(true);

                unmount();
                expect(media.listeners.size).toBe(0);
            });

            it('uses the latest preference for a look built later', async () => {
                const media = installMatchMedia(false);
                mountScene({ enhanced: true });
                media.fire(true);

                await settle(ok);

                expect(look().options.reducedMotion).toBe(true);
            });

            it('follows the preference in basic mode without a look', () => {
                const media = installMatchMedia(false);
                mountScene();

                expect(() => media.fire(true)).not.toThrow();
            });
        });

        describe('slow frames', () => {
            // 10 fps: past the 4 s warm-up, then a full 5 s window below the 40 fps threshold.
            const runSlow = (frame: (time: number) => void) => {
                for (let i = 1; i <= 120; i++) frame(i * 100);
            };

            it('calls onSlowFrames once while the look runs slowly', async () => {
                const { frame, onSlowFrames } = mountScene({ enhanced: true });
                await settle(ok);

                runSlow(frame);

                expect(onSlowFrames).toHaveBeenCalledTimes(1);
            });

            it('does not sample while the look is still loading', () => {
                const { frame, onSlowFrames } = mountScene({ enhanced: true });

                runSlow(frame);

                expect(onSlowFrames).not.toHaveBeenCalled();
            });

            it('stays quiet once the notice was dismissed for this visit', async () => {
                dismissSlowNotice();
                const { frame, onSlowFrames } = mountScene({ enhanced: true });
                await settle(ok);

                runSlow(frame);

                expect(onSlowFrames).not.toHaveBeenCalled();
            });

            it('does not fire for a healthy frame rate', async () => {
                const { frame, onSlowFrames } = mountScene({ enhanced: true });
                await settle(ok);

                for (let i = 1; i <= 1000; i++) frame(i * 16);

                expect(onSlowFrames).not.toHaveBeenCalled();
            });

            it('restarts the warm-up when the status changes', async () => {
                const { frame, onSlowFrames, rerender } = mountScene({ enhanced: true });
                await settle(ok);
                for (let i = 1; i <= 80; i++) frame(i * 100);

                // Off and on again: the measurement starts over, so the earlier slow frames do not count.
                rerender(basic);
                rerender(on);
                await settle(ok);
                for (let i = 81; i <= 120; i++) frame(i * 100);

                expect(onSlowFrames).not.toHaveBeenCalled();
            });
        });
    });
});
