// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    asWebAudio,
    FakeAnalyserNode,
    FakeGainNode,
    installFakeWebAudio,
    type FakeAudioContext,
} from '~/test/fakeWebAudio';
import { AudioEngine } from './audioEngine';
import { AudioProvider } from './AudioProvider';
import { FakeAudioEngine } from '~/test/fakeEngines';
import { renderHookWithProviders } from '~/test/renderWithProviders';
import { DEFAULT_NORMALIZE_SETTINGS } from './types';
import { useAnalyser, useCapturing, useNormalize, useNormalizeOptions } from './useAudioState';

function fakeAnalyser(): AnalyserNode {
    return asWebAudio<AnalyserNode>(new FakeAnalyserNode());
}

describe('useAnalyser and useCapturing', () => {
    it('report no analyser and not capturing before a source starts', () => {
        const analyser = renderHookWithProviders(() => useAnalyser());
        const capturing = renderHookWithProviders(() => useCapturing());

        expect(analyser.result.current).toBeUndefined();
        expect(capturing.result.current).toBe(false);
    });

    it('follow the engine as a source starts and stops', () => {
        const first = fakeAnalyser();
        const second = fakeAnalyser();
        const { result, engine } = renderHookWithProviders(() => ({
            analyser: useAnalyser(),
            capturing: useCapturing(),
        }));

        act(() => engine.setAnalyser(first));
        expect(result.current).toEqual({ analyser: first, capturing: true });

        act(() => engine.setAnalyser(second));
        expect(result.current.analyser).toBe(second);

        act(() => engine.setAnalyser(undefined));
        expect(result.current).toEqual({ analyser: undefined, capturing: false });
    });
});

describe('useNormalize', () => {
    it('reads and follows the normalize switch', () => {
        const { result, engine } = renderHookWithProviders(() => useNormalize());
        expect(result.current).toBe(true);

        act(() => engine.setNormalize(false));

        expect(result.current).toBe(false);
    });
});

describe('useNormalizeOptions', () => {
    it('reads the defaults, follows updates and returns to the defaults on reset', () => {
        const { result, engine } = renderHookWithProviders(() => useNormalizeOptions());
        expect(result.current).toEqual(DEFAULT_NORMALIZE_SETTINGS);

        act(() => engine.updateNormalizeOptions({ targetPeak: 0.9 }));
        expect(result.current).toEqual({ ...DEFAULT_NORMALIZE_SETTINGS, targetPeak: 0.9 });

        act(() => engine.resetNormalizeOptions());
        expect(result.current).toEqual(DEFAULT_NORMALIZE_SETTINGS);
    });
});

const A = { fftSize: 2048, smoothingTimeConstant: 0.5, minDecibels: -100, maxDecibels: -30 };

describe('useAnalyser(options)', () => {
    const B = { fftSize: 4096, smoothingTimeConstant: 0.9, minDecibels: -90, maxDecibels: -20 };

    it('returns a node of its own carrying the declared settings, not the tap', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(fakeAnalyser());
        const one = renderHookWithProviders(() => useAnalyser(A), { engine });
        const two = renderHookWithProviders(() => useAnalyser(B), { engine });

        expect(one.result.current).not.toBe(engine.getAnalyser());
        expect(one.result.current).not.toBe(two.result.current);
        expect(one.result.current).toMatchObject(A);
        expect(two.result.current).toMatchObject(B);
    });

    it('follows the engine to a new source and keeps one live node under StrictMode', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(fakeAnalyser());
        const { result } = renderHookWithProviders(() => useAnalyser(A), { engine, reactStrictMode: true });

        expect(engine.ownedEntries.size).toBe(1);
        const first = result.current;
        expect(first).toMatchObject(A);

        act(() => engine.setAnalyser(fakeAnalyser()));
        expect(result.current).not.toBe(first);
        expect(result.current).toMatchObject(A);
        expect(engine.ownedEntries.size).toBe(1);
    });

    it('does not recreate the node for equal values in a new object, and assigns changed values to it', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(fakeAnalyser());
        const { result, rerender } = renderHookWithProviders((options) => useAnalyser(options), {
            engine,
            initialProps: A,
        });
        const node = result.current;

        rerender({ ...A });
        expect(result.current).toBe(node);
        expect(engine.acquireAnalyser).toHaveBeenCalledTimes(1);

        rerender(B);
        expect(result.current).toBe(node);
        expect(result.current).toMatchObject(B);
        expect(engine.acquireAnalyser).toHaveBeenCalledTimes(1);
    });

    it('releases the node on unmount', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(fakeAnalyser());
        const { unmount } = renderHookWithProviders(() => useAnalyser(A), { engine });
        expect(engine.ownedEntries.size).toBe(1);

        unmount();

        expect(engine.ownedEntries.size).toBe(0);
    });

    it('owner assignments survive a source change while the options stay the same', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(fakeAnalyser());
        const { result } = renderHookWithProviders(() => useAnalyser(A), { engine });
        act(() => {
            result.current!.smoothingTimeConstant = 0.1;
        });

        act(() => engine.setAnalyser(fakeAnalyser()));
        expect(result.current!.smoothingTimeConstant).toBe(0.1);
    });

    it('still assigns changed option values after an owner assignment', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(fakeAnalyser());
        const { result, rerender } = renderHookWithProviders((options) => useAnalyser(options), {
            engine,
            initialProps: A,
        });
        result.current!.smoothingTimeConstant = 0.1;

        rerender({ ...A, smoothingTimeConstant: 0.7 });
        expect(result.current!.smoothingTimeConstant).toBe(0.7);
    });
});

describe('useAnalyser(options) against the real engine', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('leaves exactly one owned node connected under StrictMode, and none after unmount', async () => {
        const web = installFakeWebAudio();
        const engine = new AudioEngine();
        await engine.startSource((context) => ({
            node: asWebAudio<AudioNode>(new FakeGainNode(asWebAudio<FakeAudioContext>(context))),
            stop: vi.fn(),
        }));
        const gain = web.contexts[0].createdGains[0];
        // The tap and the two meters are the first three analysers; owned nodes come after them.
        const ownedConnected = () => {
            const owned = new Set(web.contexts[0].createdAnalysers.slice(3));
            const connects = gain.connect.mock.calls.filter(([node]) => owned.has(node as FakeAnalyserNode)).length;
            const disconnects = gain.disconnect.mock.calls.filter(([node]) =>
                owned.has(node as FakeAnalyserNode),
            ).length;
            return connects - disconnects;
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <StrictMode>
                <AudioProvider engine={engine}>{children}</AudioProvider>
            </StrictMode>
        );

        const { unmount } = renderHook(() => useAnalyser(A), { wrapper });
        expect(ownedConnected()).toBe(1);

        unmount();
        expect(ownedConnected()).toBe(0);
    });
});
