// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trioAllControls } from './trioLookControls';
import { TrioColorWavePage } from './TrioColorWavePage';
import { TRIO_ENHANCED_STRINGS } from './trioEnhancedStrings';
import { useTrioColorWaveScene } from './useTrioColorWaveScene';
import { asWebAudio } from '~/test/fakeWebAudio';
import { installFakeFullscreen, type FakeFullscreen } from '~/test/fakeFullscreen';
import type { FullscreenSupport } from '~/features/fullscreen/types';
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
        expect(containerRef.current).toBe(container.querySelector('.fixed.inset-0 > .absolute.inset-0'));
    });

    it('hands the scene the capturing analyser and the default control values', () => {
        const { engine } = renderWithProviders(<TrioColorWavePage />);
        expect(latestOptions().analyser).toBeUndefined();

        const analyser = asWebAudio<AnalyserNode>({});
        act(() => engine.setAnalyser(analyser));

        expect(latestOptions().analyser).toBe(analyser);
        const defaults = Object.fromEntries(trioAllControls.map((control) => [control.key, control.default]));
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

describe('TrioColorWavePage enhanced graphics', () => {
    beforeEach(() => vi.mocked(useTrioColorWaveScene).mockClear());

    it('hands the scene the tracker and a status callback, and shows the switch in the panel header', async () => {
        const { user, tracker } = renderWithProviders(<TrioColorWavePage />);

        expect(latestOptions().rhythm).toBe(tracker);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        expect(screen.getByRole('switch', { name: /Enhanced graphics/ })).toHaveAccessibleDescription(
            TRIO_ENHANCED_STRINGS.description,
        );
    });

    it('shows the Look section only while the enhanced look is ready', async () => {
        const { user } = renderWithProviders(<TrioColorWavePage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        expect(screen.queryByText('Look')).not.toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus!('loading'));
        expect(screen.getByText('Loading enhanced assets')).toBeInTheDocument();
        expect(screen.queryByText('Look')).not.toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus!('ready'));
        expect(screen.getByText('Enhanced graphics on')).toBeInTheDocument();
        expect(screen.getByText('Look')).toBeInTheDocument();

        act(() => latestOptions().onEnhancedStatus!(undefined));
        expect(screen.queryByText('Look')).not.toBeInTheDocument();
    });

    it('keeps a Look value across the section being hidden and shown again', async () => {
        const { user } = renderWithProviders(<TrioColorWavePage />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        act(() => latestOptions().onEnhancedStatus!('ready'));
        await user.click(screen.getByText('Look'));
        fireEvent.change(screen.getByLabelText('Glow'), { target: { value: '2' } });

        act(() => latestOptions().onEnhancedStatus!(undefined));

        expect(latestOptions().valuesRef.current.glowStrength).toBe(2);
    });
});

describe('TrioColorWavePage fullscreen', () => {
    let fake: FakeFullscreen;

    afterEach(() => fake.restore());

    // The fullscreen target is the canvas host's parent, so the browser hides everything outside it.
    function renderPage(support: FullscreenSupport) {
        fake = installFakeFullscreen({ support });
        const rendered = renderWithProviders(<TrioColorWavePage />);
        const host = vi.mocked(useTrioColorWaveScene).mock.calls[0][0].current as HTMLElement;
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
