// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trioColorWaveControls } from './trioColorWaveControls';
import { TrioColorWavePage } from './TrioColorWavePage';
import { useTrioColorWaveScene } from './useTrioColorWaveScene';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';

// The scene is covered by the hook's own spec; here the page's wiring is what matters.
const { resetView } = vi.hoisted(() => ({ resetView: vi.fn() }));
vi.mock('./useTrioColorWaveScene', () => ({ useTrioColorWaveScene: vi.fn(() => ({ resetView })) }));

type SceneOptions = Parameters<typeof useTrioColorWaveScene>[1];

// The options the page passed to the scene hook on its latest render.
function latestOptions(): SceneOptions {
    const calls = vi.mocked(useTrioColorWaveScene).mock.calls;
    return calls[calls.length - 1][1];
}

describe('TrioColorWavePage', () => {
    beforeEach(() => {
        vi.mocked(useTrioColorWaveScene).mockClear();
        resetView.mockClear();
    });

    it('gives the scene a full-window container', () => {
        const { container } = renderWithProviders(<TrioColorWavePage />);

        const [containerRef] = vi.mocked(useTrioColorWaveScene).mock.calls[0];
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0'));
    });

    it('hands the scene the capturing analyser and the default control values', () => {
        const { engine } = renderWithProviders(<TrioColorWavePage />);
        expect(latestOptions().analyser).toBeUndefined();

        const analyser = asWebAudio<AnalyserNode>({});
        act(() => engine.setAnalyser(analyser));

        expect(latestOptions().analyser).toBe(analyser);
        const defaults = Object.fromEntries(trioColorWaveControls.map((control) => [control.key, control.default]));
        expect(latestOptions().valuesRef.current).toEqual(defaults);
    });

    it('starts with the camera locked and passes lock changes to the scene', async () => {
        const { user } = renderWithProviders(<TrioColorWavePage />);
        expect(latestOptions().cameraLocked).toBe(true);

        await user.click(screen.getByRole('button', { name: 'Camera locked. Click to unlock' }));

        expect(latestOptions().cameraLocked).toBe(false);
    });

    it('shows Reset view when the scene reports the view moved, and resets through the scene', async () => {
        const { user } = renderWithProviders(<TrioColorWavePage />);
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();

        act(() => latestOptions().onViewChanged(true));
        await user.click(screen.getByRole('button', { name: 'Reset view' }));

        expect(resetView).toHaveBeenCalledTimes(1);
    });

    it('feeds panel changes into the values the scene reads, and Reset all restores them', async () => {
        const { user } = renderWithProviders(<TrioColorWavePage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        // The first section (Heights) is open.
        fireEvent.change(screen.getByLabelText('Overall height'), { target: { value: '2.5' } });
        expect(latestOptions().valuesRef.current.masterHeight).toBe(2.5);

        await user.click(screen.getByRole('button', { name: 'Reset all' }));
        expect(latestOptions().valuesRef.current.masterHeight).toBe(1);
    });
});
