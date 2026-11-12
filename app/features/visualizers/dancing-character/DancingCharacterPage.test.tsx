// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dancingCharacterControls } from './dancingCharacterControls';
import { DancingCharacterPage } from './DancingCharacterPage';
import { useDancingCharacterScene } from './useDancingCharacterScene';
import { renderWithProviders } from '~/test/renderWithProviders';

// The default plus a made-up second character, so the page spec does not depend on which real characters ship.
vi.mock('./characterRegistry', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./characterRegistry')>();
    const registry = [
        actual.CHARACTER_REGISTRY[0],
        {
            ...actual.CHARACTER_REGISTRY[0],
            id: 'robot',
            title: 'Robot',
            author: 'Ada Maker',
            license: 'CC-BY' as const,
        },
    ];
    return {
        ...actual,
        CHARACTER_REGISTRY: registry,
        findCharacter: (id: string) => registry.find((entry) => entry.id === id),
    };
});

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
        expect(latestOptions().reducedMotion).toBe(false);
    });

    it('lists the dance controls in the settings panel', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
        expect(screen.getByLabelText('Orbit around the dancer')).toBeInTheDocument();
        expect(screen.getByLabelText('Skin tint')).toBeInTheDocument();
    });

    it('shows no status note until the model fails to load', () => {
        renderWithProviders(<DancingCharacterPage />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        act(() => latestOptions().onStatus('ready'));
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
        expect(latestOptions().reducedMotion).toBe(true);
        expect(latestOptions().valuesRef.current.bassCameraStrength).toBe(0.2);
    });

    it('starts with the Character select first, on the default, and no attribution', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        const select = screen.getByLabelText('Character');
        expect(select).toHaveValue('makehuman');
        expect(within(select).getAllByRole('option')).toHaveLength(2);
        expect(screen.queryByText(/license/)).not.toBeInTheDocument();
        expect(latestOptions().valuesRef.current.character).toBe('makehuman');
    });

    it('shows the attribution of a chosen non-default character and hides it again for the default', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        await user.selectOptions(screen.getByLabelText('Character'), 'robot');
        expect(latestOptions().valuesRef.current.character).toBe('robot');
        expect(screen.getByText(/Robot by Ada Maker, license CC-BY 1\.0\./)).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText('Character'), 'makehuman');
        expect(screen.queryByText(/license/)).not.toBeInTheDocument();
    });

    it('puts the default back and shows the message when the scene reports a problem, and clears it later', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.selectOptions(screen.getByLabelText('Character'), 'robot');

        act(() => latestOptions().onCharacterProblem("Robot couldn't be loaded, so the default character is back."));

        expect(screen.getByLabelText('Character')).toHaveValue('makehuman');
        expect(screen.getByRole('status')).toHaveTextContent("Robot couldn't be loaded");

        act(() => latestOptions().onCharacterProblem(null));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Character')).toHaveValue('makehuman');
    });
});
