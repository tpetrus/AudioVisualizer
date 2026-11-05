// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeDevice } from '~/test/fakeMedia';
import { renderWithProviders } from '~/test/renderWithProviders';
import { startFileSource } from '../devFileSource';
import { SourceChooser } from './SourceChooser';

vi.mock('../devFileSource', () => ({ startFileSource: vi.fn(async () => ({})) }));

const microphone = createFakeDevice({ deviceId: 'mic', label: 'Microphone' });
const stereoMix = createFakeDevice({ deviceId: 'mix', label: 'Stereo Mix' });

describe('SourceChooser', () => {
    it('offers both ways to capture and the setup guide', () => {
        renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);

        expect(screen.getByRole('heading', { name: 'Share screen or tab audio' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Use an audio input device' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Share audio' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Choose device' })).toBeEnabled();
        expect(screen.getByText('How do I set up Stereo Mix?')).toBeInTheDocument();
    });

    it('shows the introduction only on first use', () => {
        const first = renderWithProviders(<SourceChooser showIntro onStarted={vi.fn()} />);
        expect(screen.getByText(/Choose where the audio should come from/)).toBeInTheDocument();
        first.unmount();

        renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        expect(screen.queryByText(/Choose where the audio should come from/)).not.toBeInTheDocument();
    });

    it('only offers Back when there is a source to go back to', async () => {
        const onBack = vi.fn();
        const first = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
        first.unmount();

        const second = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} onBack={onBack} />);
        await second.user.click(screen.getByRole('button', { name: 'Back' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('starts screen capture and reports it started', async () => {
        const onStarted = vi.fn();
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);

        await user.click(screen.getByRole('button', { name: 'Share audio' }));

        expect(engine.startScreenCapture).toHaveBeenCalledTimes(1);
        expect(onStarted).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('disables the buttons while a capture is starting', async () => {
        let finish!: () => void;
        const onStarted = vi.fn();
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);
        engine.startScreenCapture.mockReturnValue(
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
        );

        await user.click(screen.getByRole('button', { name: 'Share audio' }));
        expect(screen.getByRole('button', { name: 'Share audio' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Choose device' })).toBeDisabled();

        await act(async () => finish());
        expect(screen.getByRole('button', { name: 'Share audio' })).toBeEnabled();
        expect(onStarted).toHaveBeenCalledTimes(1);
    });

    it('shows the engine error message when capture fails, and clears it on the next attempt', async () => {
        const onStarted = vi.fn();
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);
        engine.startScreenCapture.mockRejectedValueOnce(new Error('Permission denied by user'));

        await user.click(screen.getByRole('button', { name: 'Share audio' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Permission denied by user');
        expect(onStarted).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Share audio' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(onStarted).toHaveBeenCalledTimes(1);
    });

    it('shows a generic message when something other than an Error is thrown', async () => {
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        engine.startScreenCapture.mockRejectedValueOnce('nope');

        await user.click(screen.getByRole('button', { name: 'Share audio' }));

        expect(screen.getByRole('alert')).toHaveTextContent('Unable to capture audio.');
    });

    it('lists the input devices and selects the first one', async () => {
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        engine.getInputDevices.mockResolvedValue([microphone, stereoMix]);

        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        const select = screen.getByRole('combobox', { name: 'Audio input device' });
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Microphone', 'Stereo Mix']);
        expect(select).toHaveValue('mic');
        expect(screen.queryByRole('button', { name: 'Choose device' })).not.toBeInTheDocument();
    });

    it('preselects the remembered device when it is still present', async () => {
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        engine.saved = { mode: 'device', deviceId: 'mix' };
        engine.getInputDevices.mockResolvedValue([microphone, stereoMix]);

        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        expect(screen.getByRole('combobox', { name: 'Audio input device' })).toHaveValue('mix');
    });

    it('falls back to the first device when the remembered one is gone', async () => {
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        engine.saved = { mode: 'device', deviceId: 'unplugged' };
        engine.getInputDevices.mockResolvedValue([microphone, stereoMix]);

        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        expect(screen.getByRole('combobox', { name: 'Audio input device' })).toHaveValue('mic');
    });

    it('names devices that have no label', async () => {
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        engine.getInputDevices.mockResolvedValue([createFakeDevice({ deviceId: 'anon', label: '' })]);

        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        expect(screen.getByRole('option', { name: 'Unnamed device' })).toBeInTheDocument();
    });

    it('reports when there are no input devices', async () => {
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);
        engine.getInputDevices.mockResolvedValue([]);

        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        expect(screen.getByRole('alert')).toHaveTextContent('No audio input devices were found.');
        expect(screen.getByRole('button', { name: 'Choose device' })).toBeInTheDocument();
    });

    it('starts capturing from the device the user picked', async () => {
        const onStarted = vi.fn();
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);
        engine.getInputDevices.mockResolvedValue([microphone, stereoMix]);
        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        await user.selectOptions(screen.getByRole('combobox', { name: 'Audio input device' }), 'mix');
        await user.click(screen.getByRole('button', { name: 'Start' }));

        expect(engine.startDeviceCapture).toHaveBeenCalledWith('mix');
        expect(onStarted).toHaveBeenCalledTimes(1);
    });

    it('shows the error when opening the device fails', async () => {
        const onStarted = vi.fn();
        const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);
        engine.getInputDevices.mockResolvedValue([microphone]);
        engine.startDeviceCapture.mockRejectedValue(new Error('Device busy'));
        await user.click(screen.getByRole('button', { name: 'Choose device' }));

        await user.click(screen.getByRole('button', { name: 'Start' }));

        expect(screen.getByRole('alert')).toHaveTextContent('Device busy');
        expect(onStarted).not.toHaveBeenCalled();
    });

    describe('dev file source', () => {
        const track = () => new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });

        it('offers a third card with a file input in DEV', () => {
            renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);

            expect(screen.getByRole('heading', { name: 'Play a file (dev only)' })).toBeInTheDocument();
            expect(screen.getByLabelText('Audio file')).toHaveAttribute('accept', 'audio/*,.mp3,.wav,.flac');
        });

        it('leaves the card out of production', () => {
            vi.stubEnv('DEV', false);
            renderWithProviders(<SourceChooser showIntro={false} onStarted={vi.fn()} />);

            expect(screen.queryByLabelText('Audio file')).not.toBeInTheDocument();
            expect(screen.queryByText('Play a file (dev only)')).not.toBeInTheDocument();
        });

        it('plays the picked file and reports it started', async () => {
            const onStarted = vi.fn();
            const { user, engine } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);

            await user.upload(screen.getByLabelText('Audio file'), track());

            await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
            expect(startFileSource).toHaveBeenCalledWith(engine, expect.any(ArrayBuffer), { label: 'song.mp3' });
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('shows the decode error on one line and does not report a start', async () => {
            vi.mocked(startFileSource).mockRejectedValueOnce(
                new Error("Couldn't play song.mp3: unsupported or corrupt audio file."),
            );
            const onStarted = vi.fn();
            const { user } = renderWithProviders(<SourceChooser showIntro={false} onStarted={onStarted} />);

            await user.upload(screen.getByLabelText('Audio file'), track());

            expect(await screen.findByRole('alert')).toHaveTextContent(
                "Couldn't play song.mp3: unsupported or corrupt audio file.",
            );
            expect(onStarted).not.toHaveBeenCalled();
        });
    });
});
