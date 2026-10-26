// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { FakeAudioEngine } from '~/test/fakeEngines';
import { asWebAudio } from '~/test/fakeWebAudio';
import { renderWithProviders } from '~/test/renderWithProviders';
import { RequireAudio } from './RequireAudio';

// Shows where the router currently points, so a redirect can be observed.
function CurrentPath() {
    return <output aria-label="current path">{useLocation().pathname}</output>;
}

function renderGuarded(engine: FakeAudioEngine) {
    return renderWithProviders(
        <>
            <RequireAudio>
                <p>visualizer</p>
            </RequireAudio>
            <CurrentPath />
        </>,
        { engine, route: '/cubes' },
    );
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('RequireAudio', () => {
    it('shows the page straight away when a source is already capturing', () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(asWebAudio<AnalyserNode>({}));
        renderGuarded(engine);

        expect(screen.getByText('visualizer')).toBeInTheDocument();
        expect(engine.resumeSavedSource).not.toHaveBeenCalled();
    });

    it('renders nothing, not even the dialog, while the saved source is being reopened', () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockReturnValue(deferred<boolean>().promise);
        const { container } = renderGuarded(engine);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(container.querySelector('p')).toBeNull();
    });

    it('renders nothing while the saved source is being reopened, then the page once it runs', async () => {
        const engine = new FakeAudioEngine();
        const pending = deferred<boolean>();
        engine.resumeSavedSource.mockReturnValue(pending.promise);
        renderGuarded(engine);
        expect(screen.queryByText('visualizer')).not.toBeInTheDocument();
        expect(screen.getByLabelText('current path')).toHaveTextContent('/cubes');

        await act(async () => pending.resolve(true));
        expect(screen.getByText('visualizer')).toBeInTheDocument();
        expect(screen.getByLabelText('current path')).toHaveTextContent('/cubes');
    });

    it('asks for a source in a required dialog when nothing could be resumed', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        renderGuarded(engine);

        await act(async () => {});
        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
        expect(screen.queryByText('visualizer')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('current path')).toHaveTextContent('/cubes');
    });

    it('asks for a source when reopening the source fails', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockRejectedValue(new Error('denied'));
        renderGuarded(engine);

        await act(async () => {});
        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
        expect(screen.queryByText('visualizer')).not.toBeInTheDocument();
    });

    it('cannot be dismissed until a source is capturing', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        const { user } = renderGuarded(engine);
        await act(async () => {});

        await user.keyboard('{Escape}');
        await user.click(screen.getByRole('dialog').parentElement as HTMLElement);

        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
    });

    it('goes back to the landing page from the dialog', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        const { user } = renderGuarded(engine);
        await act(async () => {});

        await user.click(screen.getByRole('button', { name: 'Back to home' }));

        expect(screen.getByLabelText('current path')).toHaveTextContent(/^\/$/);
    });

    it('shows the page under the dialog once a source starts, and keeps the dialog until it is closed', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        engine.startScreenCapture.mockImplementation(async () => {
            engine.setAnalyser(asWebAudio<AnalyserNode>({}));
        });
        const { user } = renderGuarded(engine);
        await act(async () => {});

        await user.click(screen.getByRole('button', { name: 'Share audio' }));

        expect(screen.getByText('visualizer')).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Done' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('visualizer')).toBeInTheDocument();
    });

    it('keeps the page and does not ask again when the source drops after it was shown', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        engine.startScreenCapture.mockImplementation(async () => {
            engine.setAnalyser(asWebAudio<AnalyserNode>({}));
        });
        const { user } = renderGuarded(engine);
        await act(async () => {});
        await user.click(screen.getByRole('button', { name: 'Share audio' }));
        await user.click(screen.getByRole('button', { name: 'Done' }));

        act(() => engine.stopCapture());

        expect(screen.getByText('visualizer')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not offer "Back to home" when the source drops while the prompt is still open over the page', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        engine.startScreenCapture.mockImplementation(async () => {
            engine.setAnalyser(asWebAudio<AnalyserNode>({}));
        });
        const { user } = renderGuarded(engine);
        await act(async () => {});
        await user.click(screen.getByRole('button', { name: 'Share audio' }));

        act(() => engine.stopCapture());

        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();
        expect(screen.getByText('visualizer')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();
    });

    it('keeps the page when a source that was resumed on mount drops', async () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(asWebAudio<AnalyserNode>({}));
        renderGuarded(engine);

        act(() => engine.stopCapture());

        expect(screen.getByText('visualizer')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ignores a result that arrives after it unmounted', async () => {
        const resolved = new FakeAudioEngine();
        const resolvedPending = deferred<boolean>();
        resolved.resumeSavedSource.mockReturnValue(resolvedPending.promise);
        const first = renderGuarded(resolved);
        first.unmount();
        await act(async () => resolvedPending.resolve(false));

        const rejected = new FakeAudioEngine();
        const rejectedPending = deferred<boolean>();
        rejected.resumeSavedSource.mockReturnValue(rejectedPending.promise);
        const second = renderGuarded(rejected);
        second.unmount();
        await act(async () => rejectedPending.reject(new Error('late')));

        expect(screen.queryByText('visualizer')).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
