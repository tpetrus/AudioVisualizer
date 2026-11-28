// @vitest-environment jsdom
import { audioHub } from '~/features/audio/hub/audioHub';
import { BASS_INK_ANALYSER } from './bassInkAnalyser';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bassInkControls } from './bassInkControls';
import { BassInkPage } from './BassInkPage';
import { BASS_INK_ENHANCED_STRINGS } from './bassInkEnhancedStrings';
import { useBassInkScene } from './useBassInkScene';
import { asWebAudio } from '~/test/fakeWebAudio';
import { installFakeFullscreen, type FakeFullscreen } from '~/test/fakeFullscreen';
import type { FullscreenSupport } from '~/features/fullscreen/types';
import { renderWithProviders } from '~/test/renderWithProviders';
import { getEnhancedGraphics, setEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';

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
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0 > .absolute.inset-0'));
    });

    it('hands the scene its own analyser node (not the tap), the audio hub, the rhythm tracker and the default control values', () => {
        const { engine, tracker } = renderWithProviders(<BassInkPage />);
        expect(latestOptions().analyser).toBeUndefined();
        expect(latestOptions().hub).toBe(audioHub);
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

describe('BassInkPage fullscreen', () => {
    let fake: FakeFullscreen;

    afterEach(() => fake.restore());

    // The fullscreen target is the canvas host's parent, so the browser hides everything outside it.
    function renderPage(support: FullscreenSupport) {
        fake = installFakeFullscreen({ support });
        const rendered = renderWithProviders(<BassInkPage />);
        const host = vi.mocked(useBassInkScene).mock.calls[0][0].current as HTMLElement;
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

describe('BassInkPage enhanced graphics', () => {
    beforeEach(() => {
        vi.mocked(useBassInkScene).mockClear();
        localStorage.clear();
    });
    afterEach(() => localStorage.clear());

    it('passes the stored preference to the scene and follows the panel switch', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        expect(latestOptions().enhanced).toBe(false);

        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.click(screen.getByRole('switch', { name: /enhanced graphics/i }));

        expect(latestOptions().enhanced).toBe(true);
        expect(getEnhancedGraphics()).toBe(true);
    });

    it('describes what the switch does for bass ink', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        expect(screen.getByRole('switch', { name: /enhanced graphics/i })).toHaveAccessibleDescription(
            BASS_INK_ENHANCED_STRINGS.description,
        );
    });

    it('starts on when the preference is already on', () => {
        setEnhancedGraphics(true);
        renderWithProviders(<BassInkPage />);
        expect(latestOptions().enhanced).toBe(true);
    });

    it('shows the scene status on the panel switch', async () => {
        const { user } = renderWithProviders(<BassInkPage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        act(() => latestOptions().onEnhancedStatus?.('loading'));
        expect(screen.getByText('Loading enhanced assets')).toBeInTheDocument();
        act(() => latestOptions().onEnhancedStatus?.('ready'));
        expect(screen.getByText('Enhanced graphics on')).toBeInTheDocument();
        act(() => latestOptions().onEnhancedStatus?.(undefined));
        expect(screen.queryByText('Enhanced graphics on')).not.toBeInTheDocument();
    });
});
