// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudioProvider } from '~/features/audio/AudioProvider';
import { asEngine, asTracker, FakeAudioEngine, FakeRhythmTracker } from '~/test/fakeEngines';
import { asWebAudio, FakeAnalyserNode } from '~/test/fakeWebAudio';
import { RhythmProvider, type HubLoader } from './RhythmProvider';

// A hub that counts what it was asked, standing in for the module the dynamic import would load.
function createHub() {
    const hub = { start: vi.fn((_tracker: unknown) => {}), dispose: vi.fn(() => {}) };
    const loadHub = vi.fn<HubLoader>(async () => ({ audioHub: hub }));
    return { hub, loadHub };
}

function mount(engine: FakeAudioEngine, tracker: FakeRhythmTracker, loadHub: HubLoader, strict = false) {
    const tree = (
        <AudioProvider engine={asEngine(engine)}>
            <RhythmProvider tracker={asTracker(tracker)} loadHub={loadHub}>
                <p>child</p>
            </RhythmProvider>
        </AudioProvider>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function source(): AnalyserNode {
    return asWebAudio<AnalyserNode>(new FakeAnalyserNode());
}

describe('RhythmProvider audio hub', () => {
    it('does not load the hub while the engine has no source', () => {
        const { loadHub } = createHub();
        mount(new FakeAudioEngine(), new FakeRhythmTracker(), loadHub);
        expect(loadHub).not.toHaveBeenCalled();
    });

    it('loads and starts it on the tracker the first time there is a source, once', async () => {
        const engine = new FakeAudioEngine();
        const tracker = new FakeRhythmTracker();
        const { hub, loadHub } = createHub();
        mount(engine, tracker, loadHub);

        engine.setAnalyser(source());
        await waitFor(() => expect(hub.start).toHaveBeenCalledWith(asTracker(tracker)));

        // Source changes keep the hub attached and load nothing more.
        engine.setAnalyser(undefined);
        engine.setAnalyser(source());
        engine.notify();
        expect(loadHub).toHaveBeenCalledTimes(1);
        expect(hub.start).toHaveBeenCalledTimes(1);
        expect(hub.dispose).not.toHaveBeenCalled();
    });

    it('starts at mount when the engine already has a source, and disposes on unmount', async () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(source());
        const { hub, loadHub } = createHub();
        const view = mount(engine, new FakeRhythmTracker(), loadHub);
        await waitFor(() => expect(hub.start).toHaveBeenCalledTimes(1));

        view.unmount();
        expect(hub.dispose).toHaveBeenCalledTimes(1);
    });

    it('ignores a load that resolves after the provider unmounted', async () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(source());
        const { hub } = createHub();
        let finish: () => void = () => {};
        const loadHub = vi.fn<HubLoader>(
            () =>
                new Promise((resolve) => {
                    finish = () => resolve({ audioHub: hub });
                }),
        );
        const view = mount(engine, new FakeRhythmTracker(), loadHub);
        view.unmount();
        finish();
        await Promise.resolve();
        await Promise.resolve();

        expect(hub.start).not.toHaveBeenCalled();
    });

    it('leaves exactly one started hub after StrictMode mounts twice', async () => {
        const engine = new FakeAudioEngine();
        engine.setAnalyser(source());
        const { hub, loadHub } = createHub();
        mount(engine, new FakeRhythmTracker(), loadHub, true);

        await waitFor(() => expect(hub.start).toHaveBeenCalled());
        await Promise.resolve();
        // Each start is balanced by a dispose except the live one.
        expect(hub.start.mock.calls.length - hub.dispose.mock.calls.length).toBe(1);
    });

    it('logs a failed load and tries again at the next source change', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const engine = new FakeAudioEngine();
        engine.setAnalyser(source());
        const { hub } = createHub();
        const loadHub = vi
            .fn<HubLoader>()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue({ audioHub: hub });
        mount(engine, new FakeRhythmTracker(), loadHub);
        await waitFor(() => expect(error).toHaveBeenCalledWith('The audio hub could not start', expect.any(Error)));

        engine.setAnalyser(source());
        await waitFor(() => expect(hub.start).toHaveBeenCalledTimes(1));
    });

    it('retries after start throws, and disposes the started hub exactly once', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const engine = new FakeAudioEngine();
        engine.setAnalyser(source());
        const { hub, loadHub } = createHub();
        hub.start.mockImplementationOnce(() => {
            throw new Error('start failed');
        });
        const view = mount(engine, new FakeRhythmTracker(), loadHub);
        await waitFor(() => expect(error).toHaveBeenCalledWith('The audio hub could not start', expect.any(Error)));

        engine.notify();
        await waitFor(() => expect(hub.start).toHaveBeenCalledTimes(2));
        await Promise.resolve();
        view.unmount();
        expect(hub.dispose).toHaveBeenCalledTimes(1);
    });

    it('still renders its children and starts the tracker', () => {
        const engine = new FakeAudioEngine();
        const tracker = new FakeRhythmTracker();
        const view = mount(engine, tracker, createHub().loadHub);
        expect(view.getByText('child')).toBeInTheDocument();
        expect(tracker.start).toHaveBeenCalledWith(engine);
    });
});
