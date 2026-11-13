// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { asWebAudio, FakeAnalyserNode } from '~/test/fakeWebAudio';
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

describe('useAnalyser(options)', () => {
    const A = { fftSize: 2048, smoothingTimeConstant: 0.5, minDecibels: -100, maxDecibels: -30 };
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
});
