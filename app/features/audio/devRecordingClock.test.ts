import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActivePlayback, type FilePlayback } from './devFileSource';
import { onRecordingClock } from './devRecordingClock';

vi.mock('./devFileSource', () => ({ getActivePlayback: vi.fn() }));

describe('onRecordingClock', () => {
    beforeEach(() => {
        vi.spyOn(performance, 'now').mockReturnValue(100_000);
    });

    afterEach(() => {
        vi.mocked(getActivePlayback).mockReset();
        vi.restoreAllMocks();
    });

    it('puts a mark on the file playback position, minus the mark age', () => {
        vi.mocked(getActivePlayback).mockReturnValue({ position: () => 12 } as unknown as FilePlayback);

        // Marked 2.5 s ago: it happened 9.5 s into the track. The audio context's time is not used while a file plays.
        expect(onRecordingClock(97_500, 999)).toBeCloseTo(9.5, 6);
    });

    it('gives a negative time for a mark made before the track started', () => {
        vi.mocked(getActivePlayback).mockReturnValue({ position: () => 1 } as unknown as FilePlayback);

        expect(onRecordingClock(97_000, undefined)).toBeCloseTo(-2, 6);
    });

    it('falls back to the audio context time when no file is playing', () => {
        vi.mocked(getActivePlayback).mockReturnValue(undefined);

        expect(onRecordingClock(99_000, 30)).toBeCloseTo(29, 6);
    });

    it('is NaN with no clock at all, and for a mark that was never set', () => {
        vi.mocked(getActivePlayback).mockReturnValue(undefined);
        expect(onRecordingClock(99_000, undefined)).toBeNaN();

        vi.mocked(getActivePlayback).mockReturnValue({ position: () => 5 } as unknown as FilePlayback);
        expect(onRecordingClock(NaN, 30)).toBeNaN();
    });
});
