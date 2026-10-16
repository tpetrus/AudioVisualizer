// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRhythmTracker } from '~/test/fakeEngines';
import { renderWithProviders } from '~/test/renderWithProviders';
import { RhythmStats } from './RhythmStats';

function sample(times = 1) {
    act(() => {
        vi.advanceTimersByTime(100 * times);
    });
}

describe('RhythmStats', () => {
    let tracker: FakeRhythmTracker;

    beforeEach(() => {
        vi.useFakeTimers();
        tracker = new FakeRhythmTracker();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts idle: listening for tempo, unsure about the meter, no highlighted beat', () => {
        const { container } = renderWithProviders(<RhythmStats />, { tracker });

        expect(screen.getByText('tempo: listening · 0%')).toBeInTheDocument();
        expect(screen.getByText('meter: unsure · 0%')).toBeInTheDocument();
        // Four dial segments while the meter is unsure, none lit.
        expect(container.querySelectorAll('.h-3')).toHaveLength(4);
        expect(container.querySelectorAll('.h-3.bg-\\[\\#9f9\\], .h-3.bg-\\[\\#ff9\\]')).toHaveLength(0);
    });

    it('polls the tracker for the current phase on every sample', () => {
        renderWithProviders(<RhythmStats />, { tracker });
        expect(tracker.updatePhase).not.toHaveBeenCalled();

        sample(3);
        expect(tracker.updatePhase).toHaveBeenCalledTimes(3);
    });

    it('shows tempo, meter, confidences and band levels', () => {
        const { container } = renderWithProviders(<RhythmStats />, { tracker });
        tracker.state.bpm = 123.46;
        tracker.state.tempoConfidence = 0.8;
        tracker.state.meterConfidence = 0.55;
        tracker.state.bandOnsets.set([1, 0.5, 0.25]);
        tracker.state.beatPhase = 0.4;
        tracker.setBeatsPerBar(3);
        sample();

        expect(screen.getByText('123.5 BPM · 80%')).toBeInTheDocument();
        expect(screen.getByText('3 beats per bar · 55%')).toBeInTheDocument();
        expect(screen.getByText('kick')).toBeInTheDocument();
        const widths = Array.from(container.querySelectorAll<HTMLElement>('.h-full')).map((bar) => bar.style.width);
        // kick, mid, high, then the beat-phase bar.
        expect(widths).toEqual(['100%', '50%', '25%', '40%']);
        // Three segments for a 3/4 bar.
        expect(container.querySelectorAll('.h-3')).toHaveLength(3);
    });

    it('lights the bar segment for the current bar position, with the downbeat in a different colour', () => {
        const { container } = renderWithProviders(<RhythmStats />, { tracker });
        tracker.setBeatsPerBar(4);
        tracker.state.barPhase = 0.1;
        sample();
        const segments = () => Array.from(container.querySelectorAll('.h-3'));
        expect(segments()[0]).toHaveClass('bg-[#ff9]');

        tracker.state.barPhase = 0.6;
        sample();
        expect(segments()[2]).toHaveClass('bg-[#9f9]');
        expect(segments()[0]).toHaveClass('bg-white/15');

        // A phase of exactly 1 must not run past the last segment.
        tracker.state.barPhase = 1;
        sample();
        expect(segments()[3]).toHaveClass('bg-[#9f9]');
    });

    it('lights a plain segment when the bar position is known but the meter is not', () => {
        const { container } = renderWithProviders(<RhythmStats />, { tracker });
        tracker.state.barPhase = 0.1;
        sample();

        // The first of the four unsure segments is lit, but not with the downbeat colour.
        expect(container.querySelectorAll('.h-3')[0]).toHaveClass('bg-[#9f9]');
    });

    it('flashes "new song" after a song change and lets the flash fade', () => {
        renderWithProviders(<RhythmStats />, { tracker });
        const badge = screen.getByText('new song');
        expect(badge).toHaveClass('opacity-30');

        tracker.setSongChangeCount(1);
        sample();
        expect(badge).toHaveClass('bg-[#9f9]');

        // Lit for about a second (ten samples in total), then dim again.
        sample(9);
        expect(badge).toHaveClass('bg-[#9f9]');
        sample();
        expect(badge).toHaveClass('opacity-30');
    });

    it('does not flash for a song change that happened before it mounted', () => {
        tracker.setSongChangeCount(5);
        renderWithProviders(<RhythmStats />, { tracker });
        sample();

        expect(screen.getByText('new song')).toHaveClass('opacity-30');
    });

    it('stops polling when unmounted', () => {
        const { unmount } = renderWithProviders(<RhythmStats />, { tracker });
        unmount();
        sample(3);

        expect(tracker.updatePhase).not.toHaveBeenCalled();
    });
});
