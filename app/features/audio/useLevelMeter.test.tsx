// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asWebAudio, FakeAnalyserNode } from '~/test/fakeWebAudio';
import { renderHookWithProviders } from '~/test/renderWithProviders';
import { useLevelMeter } from './useLevelMeter';

function fakeAnalyser(): AnalyserNode {
    return asWebAudio<AnalyserNode>(new FakeAnalyserNode());
}

describe('useLevelMeter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('is idle and starts no timer without an analyser', () => {
        const { result, engine } = renderHookWithProviders(() => useLevelMeter(undefined));

        act(() => vi.advanceTimersByTime(1000));

        expect(result.current).toEqual({ level: 0, silent: false, trackInfo: '' });
        expect(vi.getTimerCount()).toBe(0);
        expect(engine.getOutputLevel).not.toHaveBeenCalled();
    });

    it('polls the output level every 100 ms and reports the track info', () => {
        const analyser = fakeAnalyser();
        const { result, engine } = renderHookWithProviders(() => useLevelMeter(analyser));
        engine.trackInfo = 'Stereo Mix (live)';
        engine.level = 0.5;
        engine.outputLevel = 0.8;

        // Nothing has been read yet: the first reading arrives with the first tick.
        expect(result.current.level).toBe(0);
        act(() => vi.advanceTimersByTime(99));
        expect(result.current.level).toBe(0);
        act(() => vi.advanceTimersByTime(1));

        expect(result.current).toEqual({ level: 0.8, silent: false, trackInfo: 'Stereo Mix (live)' });

        engine.outputLevel = 0.2;
        act(() => vi.advanceTimersByTime(100));
        expect(result.current.level).toBe(0.2);
    });

    it('flags silence only once the raw input has stayed quiet for more than 4 seconds', () => {
        const analyser = fakeAnalyser();
        const { result, engine } = renderHookWithProviders(() => useLevelMeter(analyser));
        // Only the raw level counts: a loud output level (amplified noise) must not hide a dead source.
        engine.level = 0.005;
        engine.outputLevel = 0.9;

        act(() => vi.advanceTimersByTime(4000));
        expect(result.current.silent).toBe(false);

        act(() => vi.advanceTimersByTime(100));
        expect(result.current.silent).toBe(true);
    });

    it('clears the silent flag when a signal returns', () => {
        const analyser = fakeAnalyser();
        const { result, engine } = renderHookWithProviders(() => useLevelMeter(analyser));
        act(() => vi.advanceTimersByTime(5000));
        expect(result.current.silent).toBe(true);

        engine.level = 0.5;
        act(() => vi.advanceTimersByTime(100));

        expect(result.current.silent).toBe(false);
    });

    it('restarts the silence clock when the analyser changes', () => {
        const first = fakeAnalyser();
        const { result, rerender } = renderHookWithProviders(({ analyser }) => useLevelMeter(analyser), {
            initialProps: { analyser: first },
        });
        act(() => vi.advanceTimersByTime(5000));
        expect(result.current.silent).toBe(true);

        rerender({ analyser: fakeAnalyser() });
        act(() => vi.advanceTimersByTime(1000));

        expect(result.current.silent).toBe(false);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('returns to idle and stops polling when the source goes away', () => {
        const { result, rerender, engine } = renderHookWithProviders(({ analyser }) => useLevelMeter(analyser), {
            initialProps: { analyser: fakeAnalyser() as AnalyserNode | undefined },
        });
        engine.outputLevel = 0.7;
        engine.trackInfo = 'track';
        act(() => vi.advanceTimersByTime(100));
        expect(result.current.level).toBe(0.7);

        rerender({ analyser: undefined });

        expect(result.current).toEqual({ level: 0, silent: false, trackInfo: '' });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears its timer on unmount', () => {
        const { unmount } = renderHookWithProviders(() => useLevelMeter(fakeAnalyser()));
        expect(vi.getTimerCount()).toBe(1);

        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
