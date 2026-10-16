// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cubesControls } from './cubesControls';
import { CubesPage } from './CubesPage';
import { useCubesScene } from './useCubesScene';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';

// The scene is covered by the hook's own spec; here the page's wiring is what matters.
const { resetView } = vi.hoisted(() => ({ resetView: vi.fn() }));
vi.mock('./useCubesScene', () => ({ useCubesScene: vi.fn(() => ({ resetView })) }));

type SceneOptions = Parameters<typeof useCubesScene>[1];

// The options the page passed to the scene hook on its latest render.
function latestOptions(): SceneOptions {
    const calls = vi.mocked(useCubesScene).mock.calls;
    return calls[calls.length - 1][1];
}

describe('CubesPage', () => {
    beforeEach(() => {
        vi.mocked(useCubesScene).mockClear();
        resetView.mockClear();
    });

    it('gives the scene a full-window container', () => {
        const { container } = renderWithProviders(<CubesPage />);

        const [containerRef] = vi.mocked(useCubesScene).mock.calls[0];
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0'));
    });

    it('hands the scene the capturing analyser, the rhythm tracker and the default control values', () => {
        const { engine, tracker } = renderWithProviders(<CubesPage />);
        expect(latestOptions().analyser).toBeUndefined();
        expect(latestOptions().rhythm).toBe(tracker);

        const analyser = asWebAudio<AnalyserNode>({});
        act(() => engine.setAnalyser(analyser));

        expect(latestOptions().analyser).toBe(analyser);
        const defaults = Object.fromEntries(cubesControls.map((control) => [control.key, control.default]));
        expect(latestOptions().valuesRef.current).toEqual(defaults);
    });

    it('starts with the camera locked and passes lock changes to the scene', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        expect(latestOptions().cameraLocked).toBe(true);

        await user.click(screen.getByRole('button', { name: 'Camera locked. Click to unlock' }));

        expect(latestOptions().cameraLocked).toBe(false);
        expect(screen.getByRole('button', { name: 'Camera unlocked. Click to lock' })).toBeInTheDocument();
    });

    it('shows Reset view when the scene reports the view moved, and resets through the scene', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();

        act(() => latestOptions().onViewChanged(true));
        await user.click(screen.getByRole('button', { name: 'Reset view' }));

        expect(resetView).toHaveBeenCalledTimes(1);
        act(() => latestOptions().onViewChanged(false));
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();
    });

    it('feeds panel changes into the values the scene reads, and Reset all restores them', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        fireEvent.change(screen.getByLabelText('Sensitivity'), { target: { value: '1.2' } });
        expect(latestOptions().valuesRef.current.sensitivity).toBe(1.2);

        await user.click(screen.getByRole('button', { name: 'Reset all' }));
        expect(latestOptions().valuesRef.current.sensitivity).toBe(0.6);
    });

    it('lists every cubes control in the settings panel', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(screen.getByText('Response')).toBeInTheDocument();
        expect(screen.getByText('Look')).toBeInTheDocument();
        expect(screen.getByLabelText('Noise gate')).toBeInTheDocument();
        expect(screen.getByLabelText('Smoothing')).toBeInTheDocument();
    });
});
