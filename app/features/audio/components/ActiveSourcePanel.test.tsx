// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioEngine } from '~/test/fakeEngines';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';
import { ActiveSourcePanel } from './ActiveSourcePanel';

function capturingEngine() {
    const engine = new FakeAudioEngine();
    engine.setAnalyser(asWebAudio<AnalyserNode>({}));
    return engine;
}

describe('ActiveSourcePanel', () => {
    beforeEach(() => {
        // Only the meter's interval and the clock are faked. Testing Library waits on a real setTimeout after each
        // user-event action, which would hang forever under fully faked timers.
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function renderPanel(engine = capturingEngine(), handlers = { onChooseSource: vi.fn(), onDone: vi.fn() }) {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const rendered = renderWithProviders(<ActiveSourcePanel {...handlers} />, { engine });
        return { ...rendered, user, ...handlers };
    }

    it('says which source is in use, falling back to a generic name', () => {
        const engine = capturingEngine();
        engine.trackInfo = 'Stereo Mix (running)';
        const first = renderPanel(engine);
        expect(screen.getByText(/Stereo Mix \(running\)/)).toBeInTheDocument();
        first.unmount();

        engine.trackInfo = '';
        renderPanel(engine);
        expect(screen.getByText(/active source/)).toBeInTheDocument();
    });

    it('shows the normalized level as a bar that follows the meter', () => {
        const engine = capturingEngine();
        const { container } = renderPanel(engine);
        const bar = () => container.querySelector<HTMLElement>('.rounded.bg-white\\/20 > div');
        expect(bar()).toHaveStyle({ width: '0%' });

        engine.level = 0.5;
        engine.outputLevel = 0.5;
        act(() => { vi.advanceTimersByTime(100); });
        expect(bar()).toHaveStyle({ width: '50%' });
        expect(bar()).toHaveClass('bg-green-500');

        // Normalized output can overshoot full scale; the bar stops at the end.
        engine.outputLevel = 1.7;
        act(() => { vi.advanceTimersByTime(100); });
        expect(bar()).toHaveStyle({ width: '100%' });
    });

    it('warns when the input stays silent and takes the warning away when sound returns', () => {
        const engine = capturingEngine();
        const { container } = renderPanel(engine);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        act(() => { vi.advanceTimersByTime(4200); });
        expect(screen.getByRole('status')).toHaveTextContent('No audio signal detected');
        expect(container.querySelector('.bg-yellow-500')).toBeInTheDocument();

        engine.level = 0.3;
        act(() => { vi.advanceTimersByTime(100); });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('toggles volume normalization through the engine', async () => {
        const { user, engine } = renderPanel();
        const toggle = screen.getByRole('switch', { name: 'Normalize volume' });
        expect(toggle).toBeChecked();

        await user.click(toggle);

        expect(engine.setNormalize).toHaveBeenCalledWith(false);
        expect(toggle).not.toBeChecked();
    });

    it('includes the normalization settings', () => {
        renderPanel();

        expect(screen.getByText('Normalization settings')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Target level'), { target: { value: '0.9' } });
        expect(screen.getByLabelText('Target level')).toHaveValue('0.9');
    });

    it('lets the user pick another source or finish', async () => {
        const { user, onChooseSource, onDone } = renderPanel();

        await user.click(screen.getByRole('button', { name: 'Choose a different source' }));
        expect(onChooseSource).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Done' }));
        expect(onDone).toHaveBeenCalledTimes(1);
    });
});
