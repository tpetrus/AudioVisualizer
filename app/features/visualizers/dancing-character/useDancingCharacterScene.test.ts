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
import { CHARACTER_REGISTRY, DEFAULT_CHARACTER_ID, type CharacterEntry } from './characterRegistry';
import { dancingCharacterControls, type DancingCharacterSettings } from './dancingCharacterControls';
import type { DancingCharacterFrame } from './dancingCharacterScene';
import { useDancingCharacterScene, type DancingCharacterLoadStatus } from './useDancingCharacterScene';

// vi.mock is hoisted, so the fakes are loaded with a dynamic import inside the factory (see fakeThree.ts).
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

// The loader, the character scene and the shared BassPulse have their own specs; here only the hook's wiring matters.
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
        readonly setCharacter = vi.fn(() => ({ danced: true, missing: [] as string[] }));
        readonly resize = vi.fn();
        readonly resetOrbit = vi.fn();
        readonly restartDance = vi.fn();
        readonly dispose = vi.fn();
        // What the DEV probe reads from the real scene.
        readonly timing = { timeScale: 0, phaseNudge: 0 };
        readonly timingState = { meterLocked: false };
        clipPhase = 0;
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

vi.mock('~/features/rhythm/bassPulse', () => ({
    BassPulse: class {
        level = 0;
        readonly update = vi.fn(() => this.level);
        readonly dispose = vi.fn();
        constructor(readonly source: unknown) {
            pulses.push(this as never);
        }
    },
}));

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
    return { model: { name: 'model' } as unknown as Group, dances: new Map() };
}

interface Props {
    analyser: AnalyserNode | undefined;
    cameraLocked: boolean;
    reducedMotion?: boolean;
    registry?: readonly CharacterEntry[];
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
    const onCharacterProblem = vi.fn();
    const onStatus = vi.fn((status: DancingCharacterLoadStatus) => statuses.push(status));

    const hook = renderHook(
        ({ analyser, cameraLocked, reducedMotion, registry }: Props) =>
            useDancingCharacterScene(containerRef, {
                analyser,
                rhythm: asTracker(tracker),
                valuesRef,
                cameraLocked,
                reducedMotion: reducedMotion ?? false,
                onViewChanged,
                onStatus,
                onCharacterProblem,
                registry,
            }),
        { initialProps: { analyser: undefined, cameraLocked: true, reducedMotion: false, ...initial } as Props },
    );

    const renderer = FakeRenderer.last;
    return {
        ...hook,
        renderer,
        tracker,
        valuesRef,
        onViewChanged,
        onStatus,
        onCharacterProblem,
        statuses,
        resizes,
        container,
    };
}

// Lets the promise callbacks the hook attached run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeEntry = (id: string): CharacterEntry => ({
    id,
    title: `Character ${id}`,
    author: '',
    license: 'CC0',
    licenseVersion: '1.0',
    sourceUrl: `https://example.test/${id}`,
    modifiedNote: 'Changed.',
    urls: { model: `${id}-model.glb`, dances: `${id}-dances.glb` },
    bodyMaterialNames: [`${id}-skin`],
});
const FAKE_REGISTRY = [makeEntry(DEFAULT_CHARACTER_ID), makeEntry('robot'), makeEntry('fox')];

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

            expect(character().setCharacter).toHaveBeenCalledWith(
                assets.model,
                assets.dances,
                CHARACTER_REGISTRY[0].bodyMaterialNames,
            );
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

    describe('switching characters', () => {
        // Mounts with the fake registry, loads the default, and returns helpers for choosing a character.
        async function mountLoaded() {
            const mounted = mountScene({ registry: FAKE_REGISTRY });
            const first = makeAssets();
            loads[0].resolve(first);
            await flush();
            const choose = (id: string) => {
                mounted.valuesRef.current = { ...mounted.valuesRef.current, character: id };
                mounted.renderer.renderFrame(0);
            };
            return { ...mounted, first, choose };
        }

        it('loads the default character from its registry urls at mount', () => {
            mountScene({ registry: FAKE_REGISTRY });

            expect(loadDancingCharacterAssets).toHaveBeenCalledWith(expect.any(AbortSignal), FAKE_REGISTRY[0].urls);
        });

        it('loads a newly chosen character once, keeps the old model until it arrives, and then swaps', async () => {
            const { choose, onStatus } = await mountLoaded();

            choose('robot');
            choose('robot');

            expect(loadDancingCharacterAssets).toHaveBeenCalledTimes(2);
            expect(loadDancingCharacterAssets).toHaveBeenLastCalledWith(expect.any(AbortSignal), FAKE_REGISTRY[1].urls);
            expect(character().setCharacter).toHaveBeenCalledTimes(1);

            const robot = makeAssets();
            loads[1].resolve(robot);
            await flush();

            // The scene disposes the model it replaces inside setCharacter; the hook only hands over the new one.
            expect(character().setCharacter).toHaveBeenLastCalledWith(robot.model, robot.dances, ['robot-skin']);
            expect(onStatus).toHaveBeenLastCalledWith('ready');
        });

        it('ignores a stale load that arrives after a newer request, and frees its assets', async () => {
            const { choose } = await mountLoaded();

            choose('robot');
            choose('fox');
            expect(loads[1].signal.aborted).toBe(true);

            const stale = makeAssets();
            const fresh = makeAssets();
            loads[2].resolve(fresh);
            await flush();
            loads[1].resolve(stale);
            await flush();

            expect(disposeDancingCharacterAssets).toHaveBeenCalledWith(stale);
            expect(character().setCharacter).toHaveBeenCalledTimes(2);
            expect(character().setCharacter).toHaveBeenLastCalledWith(fresh.model, fresh.dances, ['fox-skin']);
        });

        it('ignores the failure of a superseded load', async () => {
            const { choose, onCharacterProblem } = await mountLoaded();

            choose('robot');
            choose('fox');
            loads[1].reject(new Error('404'));
            await flush();

            expect(onCharacterProblem).not.toHaveBeenCalledWith(expect.stringContaining('robot'));
        });

        it('on a load error names the problem, logs it and asks for the default back without retrying', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { choose, onCharacterProblem } = await mountLoaded();

            choose('robot');
            loads[1].reject(new Error('404'));
            await flush();
            // Until the page puts the default back the control still says robot; that is not retried.
            choose('robot');

            expect(onCharacterProblem).toHaveBeenLastCalledWith(expect.stringContaining('Character robot'));
            expect(error).toHaveBeenCalledWith(expect.stringContaining('Character robot'));
            expect(loadDancingCharacterAssets).toHaveBeenCalledTimes(2);
            error.mockRestore();
        });

        it('when the new model cannot dance logs its missing bones and loads the default again', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { choose, onCharacterProblem } = await mountLoaded();
            character().setCharacter.mockReturnValueOnce({ danced: false, missing: ['spine01', 'root'] });

            choose('robot');
            loads[1].resolve(makeAssets());
            await flush();

            expect(error).toHaveBeenCalledWith(expect.stringContaining('missing bones: spine01, root'));
            expect(onCharacterProblem).toHaveBeenLastCalledWith(expect.stringContaining('Character robot'));

            // The page restored the default in the control; that is a normal choice and loads it again.
            onCharacterProblem.mockClear();
            choose(DEFAULT_CHARACTER_ID);
            expect(loadDancingCharacterAssets).toHaveBeenCalledTimes(3);
            expect(loadDancingCharacterAssets).toHaveBeenLastCalledWith(expect.any(AbortSignal), FAKE_REGISTRY[0].urls);
            // That restoring load must not clear the message.
            expect(onCharacterProblem).not.toHaveBeenCalledWith(null);
            error.mockRestore();
        });

        it('does not reload the default after a failed switch from the default itself', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { choose } = await mountLoaded();

            choose('robot');
            loads[1].reject(new Error('404'));
            await flush();
            choose(DEFAULT_CHARACTER_ID);

            expect(loadDancingCharacterAssets).toHaveBeenCalledTimes(2);
            error.mockRestore();
        });

        it('clears the message when another character is chosen afterwards', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { choose, onCharacterProblem } = await mountLoaded();

            choose('robot');
            loads[1].reject(new Error('404'));
            await flush();
            choose(DEFAULT_CHARACTER_ID);
            onCharacterProblem.mockClear();
            choose('fox');

            expect(onCharacterProblem).toHaveBeenCalledWith(null);
            error.mockRestore();
        });

        it('treats a character that is not in the registry as a failure', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { choose, onCharacterProblem } = await mountLoaded();

            choose('ghost');

            expect(onCharacterProblem).toHaveBeenLastCalledWith(expect.stringContaining('ghost'));
            expect(loadDancingCharacterAssets).toHaveBeenCalledTimes(1);
            error.mockRestore();
        });

        it('reports modelFailed when the default fails and nothing is on screen, without asking for a restore', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { statuses, onCharacterProblem } = mountScene({ registry: FAKE_REGISTRY });

            loads[0].reject(new Error('404'));
            await flush();

            expect(statuses).toEqual(['loading', 'modelFailed']);
            expect(onCharacterProblem).not.toHaveBeenCalledWith(expect.any(String));
            error.mockRestore();
        });

        it('stays quiet when the default fails while another character is on screen', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { choose, statuses, onCharacterProblem } = await mountLoaded();
            choose('robot');
            loads[1].resolve(makeAssets());
            await flush();

            choose(DEFAULT_CHARACTER_ID);
            loads[2].reject(new Error('404'));
            await flush();

            expect(statuses).not.toContain('modelFailed');
            expect(onCharacterProblem).not.toHaveBeenCalledWith(expect.any(String));
            expect(error).toHaveBeenCalled();
            error.mockRestore();
        });

        it('logs, but keeps the default, when it loads with no dances', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { onCharacterProblem, statuses } = mountScene({ registry: FAKE_REGISTRY });
            character().setCharacter.mockReturnValueOnce({ danced: false, missing: [] });

            loads[0].resolve(makeAssets());
            await flush();

            expect(error).toHaveBeenCalled();
            expect(onCharacterProblem).not.toHaveBeenCalledWith(expect.any(String));
            expect(statuses).toEqual(['loading', 'ready']);
            error.mockRestore();
        });

        it('aborts the load in flight on unmount', async () => {
            const { choose, unmount } = await mountLoaded();
            choose('robot');

            unmount();

            expect(loads[1].signal.aborted).toBe(true);
        });

        it('uses the real registry by default', () => {
            mountScene();

            expect(loadDancingCharacterAssets).toHaveBeenCalledWith(
                expect.any(AbortSignal),
                CHARACTER_REGISTRY[0].urls,
            );
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

        it('passes the Dance selection to the frames and follows a change on the next frame', () => {
            const { renderer, valuesRef } = mountScene();

            renderer.renderFrame(0);
            valuesRef.current = { ...valuesRef.current, dance: 'salsa' };
            renderer.renderFrame(16);

            expect(character().frames.map((frame) => frame.danceSelection)).toEqual(['auto', 'salsa']);
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

        it('restarts the dance for each new source, but not when the source goes away', () => {
            const first = createAnalyser();
            const { renderer, rerender } = mountScene({ analyser: first });
            renderer.renderFrame(0);
            renderer.renderFrame(16);
            const scene = scenes[scenes.length - 1] as unknown as { restartDance: ReturnType<typeof vi.fn> };
            expect(scene.restartDance).toHaveBeenCalledTimes(1);

            rerender({ analyser: createAnalyser(), cameraLocked: true });
            renderer.renderFrame(32);
            expect(scene.restartDance).toHaveBeenCalledTimes(2);

            rerender({ analyser: undefined, cameraLocked: true });
            renderer.renderFrame(48);
            expect(scene.restartDance).toHaveBeenCalledTimes(2);
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

    describe('telemetry probe', () => {
        beforeEach(() => {
            telemetry.register.mockClear();
            telemetry.unregister.mockClear();
            telemetry.tick.mockClear();
        });

        it('registers the bass gate columns', () => {
            mountScene();

            expect(telemetry.register).toHaveBeenCalledWith(
                'dancing-character',
                expect.arrayContaining(['in', 'out', 'gateOpen', 'gateScore', 'gateWeight', 'tempoLocked']),
                expect.any(Function),
            );
        });

        it('registers the tempo columns after the gate columns, in the contract order', () => {
            mountScene();

            expect(telemetry.register.mock.calls.at(-1)![1]).toEqual([
                'in',
                'out',
                'gateOpen',
                'gateScore',
                'gateWeight',
                'tempoLocked',
                'bpm',
                'rawBeatBpm',
                'rawTempoBpm',
                'heldTempoBpm',
                'tempoConfidence',
                'meterConfidence',
                'beatsPerBar',
                'beatPhase',
                'barPhase',
                'beatCount',
                'songChanges',
                'gridEpoch',
                'timeScale',
                'phaseNudge',
                'meterLocked',
                'clipPhase',
                'bumpCount',
                'kickPhaseOffset',
                'rivalBpm',
            ]);
        });

        it('reads the tempo columns, with zeros for the analyzer values when there is no analyzer', () => {
            const { renderer, tracker } = mountScene();
            renderer.renderFrame(0);
            const scene = scenes[scenes.length - 1] as unknown as Record<string, unknown>;
            scene.timing = { timeScale: 1.25, phaseNudge: -0.01 };
            scene.timingState = { meterLocked: true };
            scene.clipPhase = 0.75;
            scene.bassGate = { open: false, score: 0, weight: 0, bumpCount: 7, kickOffset: -0.25 };
            Object.assign(tracker.state, {
                bpm: 120,
                tempoConfidence: 0.5,
                meterConfidence: 0.25,
                beatsPerBar: 4,
                beatPhase: 0.5,
                barPhase: 0.125,
                beatCount: 9,
                songChangeCount: 2,
            });

            const out = Array.from(readProbe(25));

            expect(out.slice(6)).toEqual(
                [120, 0, 0, 0, 0.5, 0.25, 4, 0.5, 0.125, 9, 2, 0, 1.25, -0.01, 1, 0.75, 7, -0.25, 0].map(Math.fround),
            );
        });

        it('reads the analyzer values and writes NaN for undefined phases and an unmeasured kick', () => {
            const { renderer, tracker } = mountScene();
            renderer.renderFrame(0);
            Object.assign(tracker, {
                analysis: { rawBeatBpm: 121, rawTempoBpm: 60.5, heldTempoBpm: 120, gridEpoch: 3, rivalBpm: 93.5 },
            });
            const scene = scenes[scenes.length - 1] as unknown as Record<string, unknown>;
            scene.bassGate = { open: false, score: 0, weight: 0, bumpCount: 0, kickOffset: NaN };

            const out = readProbe(25);

            expect([out[7], out[8], out[9], out[17], out[24]]).toEqual([121, 60.5, 120, 3, 93.5]);
            // beatsPerBar, beatPhase and barPhase are undefined in a fresh state.
            expect([out[12], out[13], out[14], out[23]].every(Number.isNaN)).toBe(true);
        });

        it('reads the gate input from the frame and the rest from the character, and ticks in seconds', () => {
            const analyser = asWebAudio<AnalyserNode>(new FakeAnalyserNode(new FakeAudioContext()));
            const { renderer } = mountScene({ analyser });
            renderer.renderFrame(0);
            const scene = scenes[scenes.length - 1] as unknown as Record<string, unknown>;
            scene.gateOutput = 0.4;
            scene.gateTempoLocked = true;
            scene.bassGate = { open: true, score: 3, weight: 0.5 };
            pulses[0].update.mockReturnValue(0.75);

            renderer.renderFrame(16);
            renderer.renderFrame(32);

            expect(Array.from(readProbe(6))).toEqual([0.75, 0.4, 1, 3, 0.5, 1].map(Math.fround));
            expect(telemetry.tick).toHaveBeenLastCalledWith(0.016);
        });

        it('reads closed and unlocked as zeros', () => {
            const { renderer } = mountScene();
            const scene = scenes[scenes.length - 1] as unknown as Record<string, unknown>;
            scene.gateOutput = 0;
            scene.gateTempoLocked = false;
            scene.bassGate = { open: false, score: 0, weight: 0 };

            renderer.renderFrame(16);

            expect(Array.from(readProbe(6))).toEqual([0, 0, 0, 0, 0, 0]);
        });

        it('unregisters when the scene is torn down', () => {
            const { unmount } = mountScene();

            unmount();

            expect(telemetry.unregister).toHaveBeenCalledTimes(1);
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
                        onCharacterProblem: vi.fn(),
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
