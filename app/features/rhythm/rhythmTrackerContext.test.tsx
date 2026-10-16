// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { asTracker, FakeRhythmTracker } from '~/test/fakeEngines';
import { RhythmTrackerContext, useRhythm } from './rhythmTrackerContext';

describe('useRhythm', () => {
    it('throws a helpful error outside <RhythmProvider>', () => {
        // React logs the error thrown during render; it is the expected outcome here.
        vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => renderHook(() => useRhythm())).toThrow('useRhythm must be used inside <RhythmProvider>');
    });

    it('returns the tracker from the context', () => {
        const fake = new FakeRhythmTracker();

        const { result } = renderHook(() => useRhythm(), {
            wrapper: ({ children }) => <RhythmTrackerContext.Provider value={asTracker(fake)}>{children}</RhythmTrackerContext.Provider>,
        });

        expect(result.current).toBe(asTracker(fake));
    });
});
