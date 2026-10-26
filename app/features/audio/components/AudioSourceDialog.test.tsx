// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeAudioEngine } from '~/test/fakeEngines';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';
import { AudioSourceDialog } from './AudioSourceDialog';

function capturingEngine() {
    const engine = new FakeAudioEngine();
    engine.setAnalyser(asWebAudio<AnalyserNode>({}));
    return engine;
}

describe('AudioSourceDialog', () => {
    describe('with no source capturing', () => {
        it('is a modal dialog that starts on the source chooser with the introduction', () => {
            renderWithProviders(<AudioSourceDialog onClose={vi.fn()} />);

            const dialog = screen.getByRole('dialog', { name: 'Audio source' });
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(screen.getByText(/Choose where the audio should come from/)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Share audio' })).toBeInTheDocument();
        });

        it('moves keyboard focus into the dialog', () => {
            renderWithProviders(<AudioSourceDialog onClose={vi.fn()} />);

            expect(screen.getByRole('dialog')).toHaveFocus();
        });

        it('cannot be dismissed: no close button, Escape or backdrop click', async () => {
            const onClose = vi.fn();
            const { user } = renderWithProviders(<AudioSourceDialog onClose={onClose} />);
            expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

            await user.keyboard('{Escape}');
            await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

            expect(onClose).not.toHaveBeenCalled();
        });

        it('shows the active source panel once a source starts capturing', async () => {
            const { user, engine } = renderWithProviders(<AudioSourceDialog onClose={vi.fn()} />);
            engine.startScreenCapture.mockImplementation(async () => {
                engine.setAnalyser(asWebAudio<AnalyserNode>({}));
            });

            await user.click(screen.getByRole('button', { name: 'Share audio' }));

            expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Share audio' })).not.toBeInTheDocument();
        });
    });

    describe('with no source capturing and dismissible', () => {
        it('still starts on the source chooser, but can be closed', async () => {
            const onClose = vi.fn();
            const { user } = renderWithProviders(<AudioSourceDialog dismissible onClose={onClose} />);
            expect(screen.getByRole('button', { name: 'Share audio' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Close' }));
            await user.keyboard('{Escape}');
            await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

            expect(onClose).toHaveBeenCalledTimes(3);
        });

        it('never offers to go back home, even when asked to', () => {
            renderWithProviders(<AudioSourceDialog dismissible onClose={vi.fn()} onBackHome={vi.fn()} />);

            expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();
        });
    });

    describe('back to home', () => {
        it('is offered by a required dialog with no source, and calls back', async () => {
            const onBackHome = vi.fn();
            const { user } = renderWithProviders(<AudioSourceDialog onClose={vi.fn()} onBackHome={onBackHome} />);

            await user.click(screen.getByRole('button', { name: 'Back to home' }));

            expect(onBackHome).toHaveBeenCalledTimes(1);
        });

        it('is not rendered without a handler', () => {
            renderWithProviders(<AudioSourceDialog onClose={vi.fn()} />);

            expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();
        });

        it('is hidden while a source is capturing', () => {
            renderWithProviders(<AudioSourceDialog onClose={vi.fn()} onBackHome={vi.fn()} />, {
                engine: capturingEngine(),
            });

            expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();
        });

        it('disappears once a source starts capturing', async () => {
            const { user, engine } = renderWithProviders(<AudioSourceDialog onClose={vi.fn()} onBackHome={vi.fn()} />);
            engine.startScreenCapture.mockImplementation(async () => {
                engine.setAnalyser(asWebAudio<AnalyserNode>({}));
            });

            await user.click(screen.getByRole('button', { name: 'Share audio' }));

            expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();
        });
    });

    describe('while a source is capturing', () => {
        it('shows the active source panel and a close button', () => {
            renderWithProviders(<AudioSourceDialog onClose={vi.fn()} />, { engine: capturingEngine() });

            expect(screen.getByRole('switch', { name: 'Normalize volume' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
            expect(screen.queryByText(/Choose where the audio should come from/)).not.toBeInTheDocument();
        });

        it('closes from the close button, Done, Escape and a click on the backdrop', async () => {
            const onClose = vi.fn();
            const { user } = renderWithProviders(<AudioSourceDialog onClose={onClose} />, {
                engine: capturingEngine(),
            });

            await user.click(screen.getByRole('button', { name: 'Close' }));
            await user.click(screen.getByRole('button', { name: 'Done' }));
            await user.keyboard('{Escape}');
            await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

            expect(onClose).toHaveBeenCalledTimes(4);
        });

        it('ignores other keys and clicks inside the dialog', async () => {
            const onClose = vi.fn();
            const { user } = renderWithProviders(<AudioSourceDialog onClose={onClose} />, {
                engine: capturingEngine(),
            });

            await user.keyboard('a{Enter}');
            await user.click(screen.getByRole('dialog'));

            expect(onClose).not.toHaveBeenCalled();
        });

        it('switches to the chooser and back without closing', async () => {
            const onClose = vi.fn();
            const { user } = renderWithProviders(<AudioSourceDialog onClose={onClose} />, {
                engine: capturingEngine(),
            });

            await user.click(screen.getByRole('button', { name: 'Choose a different source' }));
            expect(screen.getByRole('button', { name: 'Share audio' })).toBeInTheDocument();
            // The introduction is only for first use.
            expect(screen.queryByText(/Choose where the audio should come from/)).not.toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Back' }));
            expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
            expect(onClose).not.toHaveBeenCalled();
        });

        it('returns to the active source panel after starting a new source', async () => {
            const { user, engine } = renderWithProviders(<AudioSourceDialog onClose={vi.fn()} />, {
                engine: capturingEngine(),
            });
            await user.click(screen.getByRole('button', { name: 'Choose a different source' }));

            await user.click(screen.getByRole('button', { name: 'Share audio' }));

            expect(engine.startScreenCapture).toHaveBeenCalledTimes(1);
            expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
        });
    });

    it('stops listening for Escape once it is closed', async () => {
        const onClose = vi.fn();
        const { user, unmount } = renderWithProviders(<AudioSourceDialog onClose={onClose} />, {
            engine: capturingEngine(),
        });
        unmount();

        await user.keyboard('{Escape}');

        expect(onClose).not.toHaveBeenCalled();
    });
});
