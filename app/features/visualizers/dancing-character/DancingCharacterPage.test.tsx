// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dancingCharacterControls } from './dancingCharacterControls';
import { DancingCharacterPage } from './DancingCharacterPage';
import { useDancingCharacterScene } from './useDancingCharacterScene';
import { renderWithProviders } from '~/test/renderWithProviders';

// The scene is covered by the hook's own spec; here the page's wiring is what matters.
const { resetView } = vi.hoisted(() => ({ resetView: vi.fn() }));
vi.mock('./useDancingCharacterScene', () => ({ useDancingCharacterScene: vi.fn(() => ({ resetView })) }));

type SceneOptions = Parameters<typeof useDancingCharacterScene>[1];

// The options the page passed to the scene hook on its latest render.
function latestOptions(): SceneOptions {
    const calls = vi.mocked(useDancingCharacterScene).mock.calls;
    return calls[calls.length - 1][1];
}

describe('DancingCharacterPage', () => {
    beforeEach(() => {
        vi.mocked(useDancingCharacterScene).mockClear();
        resetView.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('gives the scene a full-window container and the default control values', () => {
        const { container } = renderWithProviders(<DancingCharacterPage />);

        const [containerRef] = vi.mocked(useDancingCharacterScene).mock.calls[0];
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0'));
        const defaults = Object.fromEntries(dancingCharacterControls.map((control) => [control.key, control.default]));
        expect(latestOptions().valuesRef.current).toEqual(defaults);
    });

    it('lists the dance controls in the settings panel', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
        expect(screen.getByLabelText('Orbit around the dancer')).toBeInTheDocument();
        expect(screen.getByLabelText('Robot body')).toBeInTheDocument();
    });

    it('shows no status note until the model fails to load', () => {
        renderWithProviders(<DancingCharacterPage />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        act(() => latestOptions().onStatus('ready'));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        act(() => latestOptions().onStatus('skyboxFailed'));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        act(() => latestOptions().onStatus('modelFailed'));
        expect(screen.getByRole('status')).toHaveTextContent("The dancer couldn't be loaded. Try reloading the page.");
    });

    it('starts with the camera locked and passes lock changes to the scene', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        expect(latestOptions().cameraLocked).toBe(true);

        await user.click(screen.getByRole('button', { name: 'Camera locked. Click to unlock' }));

        expect(latestOptions().cameraLocked).toBe(false);
    });

    it('shows Reset view when the scene reports the view moved, and resets through the scene', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();

        act(() => latestOptions().onViewChanged(true));
        await user.click(screen.getByRole('button', { name: 'Reset view' }));

        expect(resetView).toHaveBeenCalledTimes(1);
    });

    it('uses calmer orbit and bass defaults when the visitor prefers reduced motion', () => {
        vi.stubGlobal(
            'matchMedia',
            vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })),
        );

        renderWithProviders(<DancingCharacterPage />);

        expect(latestOptions().valuesRef.current.orbitSpeed).toBe(0.5);
        expect(latestOptions().valuesRef.current.bassStrength).toBe(0.5);
    });
});
