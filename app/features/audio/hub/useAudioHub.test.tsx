// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeAudioHub } from '~/test/fakeAudioHub';
import { audioHub } from './audioHub';
import { AudioHubContext, useAudioHub } from './useAudioHub';

describe('useAudioHub', () => {
    it('returns the app singleton by default', () => {
        const { result } = renderHook(() => useAudioHub());
        expect(result.current).toBe(audioHub);
    });

    it('returns a hub provided through the context, which a spec can drive by hand', () => {
        const fake = new FakeAudioHub();
        const { result } = renderHook(() => useAudioHub(), {
            wrapper: ({ children }) => <AudioHubContext.Provider value={fake}>{children}</AudioHubContext.Provider>,
        });
        expect(result.current).toBe(fake);

        fake.setBands([1, 0.5]);
        fake.snapshot.time = 3;
        fake.fireOnset('snare', { strength: 0.4 });
        result.current.update(4);

        expect(Array.from(result.current.snapshot.bands)).toEqual([1, 0.5, 0, 0, 0, 0]);
        expect(fake.update).toHaveBeenCalledWith(4);
        expect(fake.snapshot.onsets.snare).toEqual({ lastTime: 3, strength: 0.4, sinceSeconds: 0, count: 1 });
        result.current.update();
        expect(fake.snapshot.time).toBe(4);
    });
});
