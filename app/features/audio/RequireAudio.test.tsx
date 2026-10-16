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
            <RequireAudio><p>visualizer</p></RequireAudio>
            <CurrentPath />
        </>,
        { engine, route: '/cubes' },
    );
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
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

    it('sends the user to the landing page when nothing could be resumed', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockResolvedValue(false);
        renderGuarded(engine);

        await act(async () => { });
        expect(screen.getByLabelText('current path')).toHaveTextContent(/^\/$/);
        expect(screen.queryByText('visualizer')).not.toBeInTheDocument();
    });

    it('sends the user to the landing page when reopening the source fails', async () => {
        const engine = new FakeAudioEngine();
        engine.resumeSavedSource.mockRejectedValue(new Error('denied'));
        renderGuarded(engine);

        await act(async () => { });
        expect(screen.getByLabelText('current path')).toHaveTextContent(/^\/$/);
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
    });
});
