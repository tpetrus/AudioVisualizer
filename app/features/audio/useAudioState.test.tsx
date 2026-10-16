// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { asWebAudio, FakeAnalyserNode } from '~/test/fakeWebAudio';
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
        const { result, engine } = renderHookWithProviders(() => ({ analyser: useAnalyser(), capturing: useCapturing() }));

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
