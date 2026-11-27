// @vitest-environment jsdom
import { audioHub } from '~/features/audio/hub/audioHub';
import { CUBES_ANALYSER } from './cubesAnalyser';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cubesControls, cubesEnhancedControls } from './cubesControls';
import { CUBES_ENHANCED_STRINGS } from './cubesEnhancedStrings';
import { getEnhancedGraphics, setEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';
import { isSlowNoticeDismissed, resetSlowNoticeDismissed } from '~/features/settings/frameRateMonitor';
import { CubesPage } from './CubesPage';
import { useCubesScene } from './useCubesScene';
import { asWebAudio } from '~/test/fakeWebAudio';
import { installFakeFullscreen, type FakeFullscreen } from '~/test/fakeFullscreen';
import type { FullscreenSupport } from '~/features/fullscreen/types';
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
        resetSlowNoticeDismissed();
        localStorage.clear();
    });

    it('gives the scene a full-window container', () => {
        const { container } = renderWithProviders(<CubesPage />);

        const [containerRef] = vi.mocked(useCubesScene).mock.calls[0];
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0 > .absolute.inset-0'));
    });

    it('hands the scene its own analyser node (not the tap), the audio hub and the default control values', () => {
        const { engine } = renderWithProviders(<CubesPage />);
        expect(latestOptions().analyser).toBeUndefined();
        expect(latestOptions().hub).toBe(audioHub);

        const analyser = asWebAudio<AnalyserNode>({});
        act(() => engine.setAnalyser(analyser));

        // The page's node is its own, carrying the declared settings; the engine's tap is not handed out.
        expect(latestOptions().analyser).toMatchObject(CUBES_ANALYSER);
        expect(latestOptions().analyser).not.toBe(analyser);
        const defaults = Object.fromEntries(cubesEnhancedControls.map((control) => [control.key, control.default]));
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

describe('CubesPage enhanced graphics', () => {
    beforeEach(() => {
        vi.mocked(useCubesScene).mockClear();
        resetSlowNoticeDismissed();
        localStorage.clear();
    });

    it('shows today panel and no Enhanced section while the flag is off', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(latestOptions().enhanced).toBe(false);
        expect(screen.getByLabelText('Sensitivity')).toBeInTheDocument();
        expect(screen.queryByText('Enhanced')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Glow')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Particles')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Camera motion')).not.toBeInTheDocument();
        expect(cubesControls.length).toBeLessThan(cubesEnhancedControls.length);
    });

    it('shows the Enhanced section while the flag is on, and the scene reads those values', async () => {
        setEnhancedGraphics(true);
        const { user } = renderWithProviders(<CubesPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(latestOptions().enhanced).toBe(true);
        expect(screen.getByText('Enhanced')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Glow'), { target: { value: '0.2' } });
        expect(latestOptions().valuesRef.current.glow).toBe(0.2);
        expect(screen.getByLabelText('Particles')).toBeInTheDocument();
        expect(screen.getByLabelText('Camera motion')).toBeInTheDocument();
    });

    it('follows the toggle in the panel header and keeps the Enhanced values across it', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        await user.click(screen.getByRole('switch', { name: /enhanced graphics/i }));
        expect(getEnhancedGraphics()).toBe(true);
        expect(latestOptions().enhanced).toBe(true);
        fireEvent.change(screen.getByLabelText('Glow'), { target: { value: '0.2' } });

        await user.click(screen.getByRole('switch', { name: /enhanced graphics/i }));
        expect(latestOptions().enhanced).toBe(false);
        expect(screen.queryByLabelText('Glow')).not.toBeInTheDocument();
        expect(latestOptions().valuesRef.current.glow).toBe(0.2);
    });

    it('describes the toggle with the cubes text and shows the scene status next to it', async () => {
        const { user } = renderWithProviders(<CubesPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(screen.getByRole('switch', { name: /enhanced graphics/i })).toHaveAccessibleDescription(
            CUBES_ENHANCED_STRINGS.description,
        );
        act(() => latestOptions().onEnhancedStatus?.('loading'));
        expect(screen.getByText('Loading enhanced assets')).toBeInTheDocument();
        act(() => latestOptions().onEnhancedStatus?.('error'));
        expect(screen.getByText('Could not load enhanced assets, using standard')).toBeInTheDocument();
    });

    it('shows no slow-frame notice until the scene reports slow frames, in an always-mounted status region', () => {
        const { container } = renderWithProviders(<CubesPage />);
        const region = container.querySelector('.fixed.inset-0 > [role="status"]') as HTMLElement;
        expect(region).toBeEmptyDOMElement();

        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        const notice = screen.getByText('Enhanced graphics looks slow on this device.').closest('[role="status"]');
        expect(notice).toBe(region);
    });

    it('switches to standard from the notice and hides it', async () => {
        setEnhancedGraphics(true);
        const { user } = renderWithProviders(<CubesPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        await user.click(screen.getByRole('button', { name: 'Switch to standard' }));

        expect(getEnhancedGraphics()).toBe(false);
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
    });

    it('keeps the preference on Dismiss and never shows the notice again this visit', async () => {
        setEnhancedGraphics(true);
        const { user } = renderWithProviders(<CubesPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());

        await user.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(getEnhancedGraphics()).toBe(true);
        expect(isSlowNoticeDismissed()).toBe(true);

        act(() => latestOptions().onSlowFrames?.());
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
    });

    it('hides the notice when the scene goes back to the standard look', () => {
        renderWithProviders(<CubesPage />);
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        act(() => latestOptions().onSlowFrames?.());
        expect(screen.getByText(/looks slow/)).toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus?.(undefined));
        expect(screen.queryByText(/looks slow/)).not.toBeInTheDocument();
    });
});

describe('CubesPage fullscreen', () => {
    let fake: FakeFullscreen;

    afterEach(() => fake.restore());

    // The fullscreen target is the canvas host's parent, so the browser hides everything outside it.
    function renderPage(support: FullscreenSupport) {
        fake = installFakeFullscreen({ support });
        const rendered = renderWithProviders(<CubesPage />);
        const host = vi.mocked(useCubesScene).mock.calls[0][0].current as HTMLElement;
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
});
