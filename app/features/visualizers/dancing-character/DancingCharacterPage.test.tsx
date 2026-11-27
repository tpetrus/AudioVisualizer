// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dancingCharacterControls } from './dancingCharacterControls';
import { DancingCharacterPage } from './DancingCharacterPage';
import { useDancingCharacterScene } from './useDancingCharacterScene';
import { audioHub } from '~/features/audio/hub/audioHub';
import { installFakeFullscreen, type FakeFullscreen } from '~/test/fakeFullscreen';
import type { FullscreenSupport } from '~/features/fullscreen/types';
import { renderWithProviders } from '~/test/renderWithProviders';
import { isSlowNoticeDismissed, resetSlowNoticeDismissed } from '~/features/settings/frameRateMonitor';
import { getEnhancedGraphics, setEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';

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
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0 > .absolute.inset-0'));
        const defaults = Object.fromEntries(dancingCharacterControls.map((control) => [control.key, control.default]));
        expect(latestOptions().valuesRef.current).toEqual(defaults);
        expect(latestOptions().reducedMotion).toBe(false);
        expect(latestOptions().hub).toBe(audioHub);
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
        const note = "The dancer couldn't be loaded. Try reloading the page.";
        expect(screen.queryByText(note)).not.toBeInTheDocument();

        act(() => latestOptions().onStatus('ready'));
        expect(screen.queryByText(note)).not.toBeInTheDocument();

        act(() => latestOptions().onStatus('modelFailed'));
        expect(screen.getByText(note)).toBeInTheDocument();
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
        expect(screen.getByText(/Robot couldn't be loaded/)).toBeInTheDocument();

        act(() => latestOptions().onCharacterProblem(null));
        expect(screen.queryByText(/Robot couldn't be loaded/)).not.toBeInTheDocument();
        expect(screen.getByLabelText('Character')).toHaveValue('makehuman');
    });
});

describe('DancingCharacterPage fullscreen', () => {
    let fake: FakeFullscreen;

    afterEach(() => fake.restore());

    // The fullscreen target is the canvas host's parent, so the browser hides everything outside it.
    function renderPage(support: FullscreenSupport) {
        fake = installFakeFullscreen({ support });
        const rendered = renderWithProviders(<DancingCharacterPage />);
        const host = vi.mocked(useDancingCharacterScene).mock.calls[0][0].current as HTMLElement;
        return { ...rendered, wrapper: host.parentElement as HTMLElement };
    }

    it('adds the Fullscreen button after Settings', () => {
        renderPage('native');

        const labels = screen.getAllByRole('button').map((button) => button.textContent || button.ariaLabel);
        const settings = labels.indexOf('☰ Settings');
        expect(settings).toBeGreaterThan(-1);
        expect(screen.getByRole('button', { name: 'Fullscreen (F)' })).toBe(
            screen.getAllByRole('button')[settings + 1],
        );
    });

    it('makes the wrapper the fullscreen element, hides the bar and shows the hint', async () => {
        const { user, wrapper } = renderPage('native');

        await user.click(screen.getByRole('button', { name: 'Fullscreen (F)' }));
        await act(async () => {});

        expect(fake.element).toBe(wrapper);
        expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
        expect(screen.getByText('Press ESC to exit Fullscreen mode')).toBeInTheDocument();
    });

    it('restores the bar and focuses the button when the browser leaves fullscreen', async () => {
        const { user } = renderPage('native');
        await user.click(screen.getByRole('button', { name: 'Fullscreen (F)' }));
        await act(async () => {});

        act(() => fake.exitExternally());

        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Fullscreen (F)' })).toHaveFocus();
    });

    it('falls back to a pseudo mode without the API, and Escape leaves it', async () => {
        const { user } = renderPage('none');

        await user.click(screen.getByRole('button', { name: 'Fullscreen (F)' }));
        await act(async () => {});
        expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
        expect(screen.getByText('Press ESC to exit Fullscreen mode')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });

    it('hides the status messages while in fullscreen and restores them afterwards', async () => {
        const { user } = renderPage('none');
        act(() => latestOptions().onStatus('modelFailed'));
        act(() => latestOptions().onCharacterProblem('Robot could not be loaded.'));
        expect(screen.getByText(/The dancer couldn't be loaded/)).toBeInTheDocument();
        expect(screen.getByText('Robot could not be loaded.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Fullscreen (F)' }));
        await act(async () => {});
        expect(screen.queryByText(/The dancer couldn't be loaded/)).not.toBeInTheDocument();
        expect(screen.queryByText('Robot could not be loaded.')).not.toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText(/The dancer couldn't be loaded/)).toBeInTheDocument();
        expect(screen.getByText('Robot could not be loaded.')).toBeInTheDocument();
    });

    it('hides the attribution while in fullscreen and restores it afterwards', async () => {
        const { user } = renderPage('none');
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.selectOptions(screen.getByLabelText('Character'), 'robot');
        expect(screen.getByText(/Robot by Ada Maker/)).toBeInTheDocument();

        await act(async () => {
            fireEvent.keyDown(document, { key: 'f' });
        });
        expect(screen.queryByText(/Robot by Ada Maker/)).not.toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText(/Robot by Ada Maker/)).toBeInTheDocument();
    });
});

describe('DancingCharacterPage enhanced graphics', () => {
    beforeEach(() => {
        vi.mocked(useDancingCharacterScene).mockClear();
        resetSlowNoticeDismissed();
        localStorage.clear();
    });

    it('puts the graphics toggle in the settings panel and shows the scene status next to it', async () => {
        const { user } = renderWithProviders(<DancingCharacterPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        expect(screen.getByRole('switch', { name: /enhanced graphics/i })).toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus?.('loading'));
        expect(screen.getByText('Loading enhanced assets')).toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus?.('error'));
        expect(screen.getByText('Could not load enhanced assets, using standard')).toBeInTheDocument();
    });

    it('shows no slow-frame notice until the scene reports slow frames, inside the fullscreen wrapper', () => {
        const { container } = renderWithProviders(<DancingCharacterPage />);
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
        // The live region exists, empty, before the text appears, so screen readers announce the change.
        const region = container.querySelector('.fixed.inset-0 > [role="status"]') as HTMLElement;
        expect(region).toBeInTheDocument();
        expect(region).toBeEmptyDOMElement();

        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        const notice = screen.getByText('Enhanced graphics looks slow on this device.').closest('[role="status"]');
        expect(notice).toBe(region);
        expect(container.querySelector('.fixed.inset-0')).toContainElement(notice as HTMLElement);
    });

    it('takes no focus when the notice appears', () => {
        renderWithProviders(<DancingCharacterPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        expect(document.body).toHaveFocus();
    });

    it('switches to standard from the notice and hides it', async () => {
        setEnhancedGraphics(true);
        const { user } = renderWithProviders(<DancingCharacterPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        await user.click(screen.getByRole('button', { name: 'Switch to standard' }));

        expect(getEnhancedGraphics()).toBe(false);
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
    });

    it('keeps the preference on Dismiss and never shows the notice again this visit', async () => {
        setEnhancedGraphics(true);
        const { user } = renderWithProviders(<DancingCharacterPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        await user.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(getEnhancedGraphics()).toBe(true);
        expect(isSlowNoticeDismissed()).toBe(true);
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();

        // A rebuild reports its status again and the monitor may fire again: still hidden.
        act(() => latestOptions().onEnhancedStatus?.('loading'));
        act(() => latestOptions().onSlowFrames?.());
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
    });

    it('hides the notice when the scene goes back to the standard look', () => {
        renderWithProviders(<DancingCharacterPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());
        expect(screen.getByText(/looks slow/)).toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus?.(undefined));
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
    });

    it('does not show the notice again after standard and back until the monitor fires again', async () => {
        setEnhancedGraphics(true);
        const { user } = renderWithProviders(<DancingCharacterPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());
        expect(screen.getByText(/looks slow/)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.click(screen.getByRole('switch', { name: /enhanced graphics/i }));
        act(() => latestOptions().onEnhancedStatus?.(undefined));
        await user.click(screen.getByRole('switch', { name: /enhanced graphics/i }));
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();

        act(() => latestOptions().onSlowFrames?.());
        expect(screen.getByText(/looks slow/)).toBeInTheDocument();
    });
});
