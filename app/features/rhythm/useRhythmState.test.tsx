// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeRhythmTracker } from '~/test/fakeEngines';
import { renderHookWithProviders } from '~/test/renderWithProviders';
import { useBeatsPerBar, useSongChangeCount } from './useRhythmState';

describe('useBeatsPerBar', () => {
    it('is undefined until the tracker is sure of a meter', () => {
        const { result } = renderHookWithProviders(() => useBeatsPerBar());

        expect(result.current).toBeUndefined();
    });

    it('starts at the tracker value and re-renders when it changes', () => {
        const tracker = new FakeRhythmTracker();
        tracker.setBeatsPerBar(3);
        const { result } = renderHookWithProviders(() => useBeatsPerBar(), { tracker });
        expect(result.current).toBe(3);

        act(() => tracker.setBeatsPerBar(4));
        expect(result.current).toBe(4);

        act(() => tracker.setBeatsPerBar(undefined));
        expect(result.current).toBeUndefined();
    });

    it('stops listening after unmount', () => {
        const tracker = new FakeRhythmTracker();
        const { result, unmount } = renderHookWithProviders(() => useBeatsPerBar(), { tracker });

        unmount();

        // No subscriber is left, so changing the value must not touch the unmounted hook.
        expect(() => tracker.setBeatsPerBar(4)).not.toThrow();
        expect(result.current).toBeUndefined();
    });
});

describe('useSongChangeCount', () => {
    it('counts song changes as the tracker reports them', () => {
        const tracker = new FakeRhythmTracker();
        const { result } = renderHookWithProviders(() => useSongChangeCount(), { tracker });
        expect(result.current).toBe(0);

        act(() => tracker.setSongChangeCount(1));
        expect(result.current).toBe(1);

        act(() => tracker.setSongChangeCount(2));
        expect(result.current).toBe(2);
    });
});
