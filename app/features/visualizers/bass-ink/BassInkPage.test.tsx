// @vitest-environment jsdom
import { BASS_INK_ANALYSER } from './bassInkAnalyser';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bassInkControls } from './bassInkControls';
import { BassInkPage } from './BassInkPage';
import { useBassInkScene } from './useBassInkScene';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';

// The scene is covered by the hook's own spec; here the page's wiring is what matters.
const { resetView } = vi.hoisted(() => ({ resetView: vi.fn() }));
vi.mock('./useBassInkScene', () => ({ useBassInkScene: vi.fn(() => ({ resetView })) }));

type SceneOptions = Parameters<typeof useBassInkScene>[1];

// The options the page passed to the scene hook on its latest render.
function latestOptions(): SceneOptions {
    const calls = vi.mocked(useBassInkScene).mock.calls;
    return calls[calls.length - 1][1];
}

describe('BassInkPage', () => {
    beforeEach(() => {
        vi.mocked(useBassInkScene).mockClear();
        resetView.mockClear();
    });

    it('gives the scene a full-window container', () => {
        const { container } = renderWithProviders(<BassInkPage />);

        const [containerRef] = vi.mocked(useBassInkScene).mock.calls[0];
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0'));
    });

    it('hands the scene its own analyser node (not the tap), the rhythm tracker and the default control values', () => {
        const { engine, tracker } = renderWithProviders(<BassInkPage />);
        expect(latestOptions().analyser).toBeUndefined();
        expect(latestOptions().rhythm).toBe(tracker);

        const analyser = asWebAudio<AnalyserNode>({});
        act(() => engine.setAnalyser(analyser));

        // The page's node is its own, carrying the declared settings; the engine's tap is not handed out.
        expect(latestOptions().analyser).toMatchObject(BASS_INK_ANALYSER);
        expect(latestOptions().analyser).not.toBe(analyser);
        const defaults = Object.fromEntries(bassInkControls.map((control) => [control.key, control.default]));
        expect(latestOptions().valuesRef.current).toEqual(defaults);
    });

    it('starts with the camera locked and passes lock changes to the scene', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        expect(latestOptions().cameraLocked).toBe(true);

        await user.click(screen.getByRole('button', { name: 'Camera locked. Click to unlock' }));

        expect(latestOptions().cameraLocked).toBe(false);
        expect(screen.getByRole('button', { name: 'Camera unlocked. Click to lock' })).toBeInTheDocument();
    });

    it('shows Reset view when the scene reports the view moved, and resets through the scene', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();

        act(() => latestOptions().onViewChanged(true));
        await user.click(screen.getByRole('button', { name: 'Reset view' }));

        expect(resetView).toHaveBeenCalledTimes(1);
        act(() => latestOptions().onViewChanged(false));
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();
    });

    it('feeds panel changes into the values the scene reads, and Reset all restores them', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        fireEvent.change(screen.getByLabelText('Turbulence'), { target: { value: '1.5' } });
        expect(latestOptions().valuesRef.current.turbulence).toBe(1.5);

        await user.click(screen.getByRole('button', { name: 'Reset all' }));
        expect(latestOptions().valuesRef.current.turbulence).toBe(1);
    });

    it('lists every bass ink control in the settings panel', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(screen.getByText('Response')).toBeInTheDocument();
        expect(screen.getByText('Look')).toBeInTheDocument();
        expect(screen.getByLabelText('Flash intensity')).toBeInTheDocument();
        expect(screen.getByLabelText('Camera drift')).toBeInTheDocument();
    });
});
