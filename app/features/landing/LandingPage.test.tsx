// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { version } from '../../../package.json';
import { FakeAudioEngine } from '~/test/fakeEngines';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';
import { LandingPage } from './LandingPage';

function capturingEngine() {
    const engine = new FakeAudioEngine();
    engine.setAnalyser(asWebAudio<AnalyserNode>({}));
    return engine;
}

describe('LandingPage', () => {
    it('shows the version, the title banner, the visualizations and the coming-soon card', () => {
        renderWithProviders(<LandingPage />, { engine: capturingEngine() });

        expect(screen.getByText(`v${version}`)).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'AudioVisualizer' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Cubes' })).toHaveAttribute('href', '/cubes');
        expect(screen.getByRole('link', { name: 'Trio color wave' })).toHaveAttribute('href', '/trio-color-wave');
        expect(screen.getByText('More coming soon')).toBeInTheDocument();
    });

    it('prioritises only the title image, which is the largest contentful paint', () => {
        const { container } = renderWithProviders(<LandingPage />, { engine: capturingEngine() });

        expect(container.querySelector('header img')).toHaveAttribute('fetchpriority', 'high');
        expect(screen.getByRole('img', { name: 'Cubes' })).not.toHaveAttribute('fetchpriority');
        expect(screen.getByRole('img', { name: 'Trio color wave' })).not.toHaveAttribute('fetchpriority');
    });

    describe('when a saved source reopens', () => {
        it('goes straight to the visualizations without the audio dialog', async () => {
            const engine = capturingEngine();
            engine.resumeSavedSource.mockResolvedValue(true);
            renderWithProviders(<LandingPage />, { engine });
            await act(async () => {});

            expect(engine.resumeSavedSource).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByText(/Audio source active/)).toBeInTheDocument();
        });
    });

    describe('when no source could be resumed', () => {
        it('does not open the audio dialog, keeps the cards as links and offers to connect audio', async () => {
            const engine = new FakeAudioEngine();
            renderWithProviders(<LandingPage />, { engine });
            await act(async () => {});

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Cubes' })).toHaveAttribute('href', '/cubes');
            expect(screen.getByRole('link', { name: 'Trio color wave' })).toHaveAttribute('href', '/trio-color-wave');
            expect(screen.getByRole('button', { name: 'Connect audio' })).toBeInTheDocument();
            expect(screen.queryByText(/Audio source active/)).not.toBeInTheDocument();
        });

        it('stays quiet when resuming fails', async () => {
            const engine = new FakeAudioEngine();
            engine.resumeSavedSource.mockRejectedValue(new Error('denied'));
            renderWithProviders(<LandingPage />, { engine });
            await act(async () => {});

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Connect audio' })).toBeInTheDocument();
        });

        it('opens a dialog that can be dismissed without choosing a source', async () => {
            const engine = new FakeAudioEngine();
            const { user } = renderWithProviders(<LandingPage />, { engine });
            await act(async () => {});

            await user.click(screen.getByRole('button', { name: 'Connect audio' }));
            expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Close' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(engine.startScreenCapture).not.toHaveBeenCalled();

            await user.click(screen.getByRole('button', { name: 'Connect audio' }));
            await user.keyboard('{Escape}');
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('shows the active source once the user starts one in the dialog', async () => {
            const engine = new FakeAudioEngine();
            engine.startScreenCapture.mockImplementation(async () => {
                engine.setAnalyser(asWebAudio<AnalyserNode>({}));
            });
            const { user } = renderWithProviders(<LandingPage />, { engine });
            await act(async () => {});

            await user.click(screen.getByRole('button', { name: 'Connect audio' }));
            await user.click(screen.getByRole('button', { name: 'Share audio' }));
            await user.click(screen.getByRole('button', { name: 'Done' }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByText(/Audio source active/)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Connect audio' })).not.toBeInTheDocument();
        });
    });

    it('lets a capturing user reopen the audio dialog and close it again', async () => {
        const engine = capturingEngine();
        engine.resumeSavedSource.mockResolvedValue(true);
        const { user } = renderWithProviders(<LandingPage />, { engine });
        await act(async () => {});

        await user.click(screen.getByRole('button', { name: 'Audio settings' }));
        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
