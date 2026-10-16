// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { version } from '../../../package.json';
import { FakeAudioEngine } from '~/test/fakeEngines';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';
import { LandingPage } from './LandingPage';

// The 3D title needs WebGL; TitleBanner has its own spec.
vi.mock('./TitleBanner', () => ({ TitleBanner: () => <div data-testid="title-banner" /> }));

function capturingEngine() {
    const engine = new FakeAudioEngine();
    engine.setAnalyser(asWebAudio<AnalyserNode>({}));
    return engine;
}

describe('LandingPage', () => {
    it('shows the version, the title banner, the visualizations and the coming-soon card', () => {
        renderWithProviders(<LandingPage />, { engine: capturingEngine() });

        expect(screen.getByText(`v${version}`)).toBeInTheDocument();
        expect(screen.getByTestId('title-banner')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Cubes' })).toHaveAttribute('href', '/cubes');
        expect(screen.getByRole('link', { name: 'Trio color wave' })).toHaveAttribute('href', '/trio-color-wave');
        expect(screen.getByText('More coming soon')).toBeInTheDocument();
    });

    describe('when a saved source reopens', () => {
        it('goes straight to the visualizations without the audio dialog', async () => {
            const engine = capturingEngine();
            engine.resumeSavedSource.mockResolvedValue(true);
            renderWithProviders(<LandingPage />, { engine });
            await act(async () => { });

            expect(engine.resumeSavedSource).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByText(/Audio source active/)).toBeInTheDocument();
        });
    });

    describe('when no source could be resumed', () => {
        it('opens the audio dialog and locks the visualizations', async () => {
            const engine = new FakeAudioEngine();
            renderWithProviders(<LandingPage />, { engine });
            await act(async () => { });

            expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(screen.getAllByTitle('Choose an audio source first')).toHaveLength(2);
            expect(screen.queryByText(/Audio source active/)).not.toBeInTheDocument();
        });

        it('opens the audio dialog when resuming fails', async () => {
            const engine = new FakeAudioEngine();
            engine.resumeSavedSource.mockRejectedValue(new Error('denied'));
            renderWithProviders(<LandingPage />, { engine });
            await act(async () => { });

            expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
        });

        it('unlocks the visualizations once the user starts a source in the dialog', async () => {
            const engine = new FakeAudioEngine();
            engine.startScreenCapture.mockImplementation(async () => {
                engine.setAnalyser(asWebAudio<AnalyserNode>({}));
            });
            const { user } = renderWithProviders(<LandingPage />, { engine });
            await act(async () => { });

            await user.click(screen.getByRole('button', { name: 'Share audio' }));
            await user.click(screen.getByRole('button', { name: 'Done' }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Cubes' })).toBeInTheDocument();
        });
    });

    it('lets a capturing user reopen the audio dialog and close it again', async () => {
        const engine = capturingEngine();
        engine.resumeSavedSource.mockResolvedValue(true);
        const { user } = renderWithProviders(<LandingPage />, { engine });
        await act(async () => { });

        await user.click(screen.getByRole('button', { name: 'Audio settings' }));
        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open the dialog for a result that arrives after it unmounted', async () => {
        const resolved = new FakeAudioEngine();
        let resolveResume!: (value: boolean) => void;
        resolved.resumeSavedSource.mockReturnValue(new Promise<boolean>(resolve => { resolveResume = resolve; }));
        const first = renderWithProviders(<LandingPage />, { engine: resolved });
        first.unmount();
        await act(async () => resolveResume(false));

        const rejected = new FakeAudioEngine();
        let rejectResume!: (error: unknown) => void;
        rejected.resumeSavedSource.mockReturnValue(new Promise<boolean>((_, reject) => { rejectResume = reject; }));
        const second = renderWithProviders(<LandingPage />, { engine: rejected });
        second.unmount();
        await act(async () => rejectResume(new Error('late')));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
