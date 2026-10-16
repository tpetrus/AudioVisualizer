// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { asEngine, FakeAudioEngine } from '~/test/fakeEngines';
import { AudioProvider } from './AudioProvider';
import { audioEngine } from './audioEngine';
import { useAudio } from './audioEngineContext';

describe('useAudio', () => {
    it('throws a helpful error outside <AudioProvider>', () => {
        // React logs the error thrown during render; it is the expected outcome here.
        vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => renderHook(() => useAudio())).toThrow('useAudio must be used inside <AudioProvider>');
    });

    it('returns the injected engine', () => {
        const fake = new FakeAudioEngine();

        const { result } = renderHook(() => useAudio(), {
            wrapper: ({ children }) => <AudioProvider engine={asEngine(fake)}>{children}</AudioProvider>,
        });

        expect(result.current).toBe(asEngine(fake));
    });
});

describe('AudioProvider', () => {
    it('provides the app-wide audioEngine singleton by default', () => {
        const { result } = renderHook(() => useAudio(), {
            wrapper: ({ children }) => <AudioProvider>{children}</AudioProvider>,
        });

        expect(result.current).toBe(audioEngine);
    });
});
