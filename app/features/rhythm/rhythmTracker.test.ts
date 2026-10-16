import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asEngine, FakeAudioEngine } from '~/test/fakeEngines';
import {
    asWebAudio,
    FakeAnalyserNode,
    FakeAudioContext,
    installFakeWebAudio,
    type FakeAudioWorkletNode,
    type FakeWebAudio,
} from '~/test/fakeWebAudio';
import { OnsetExtractor, packFrame } from './onsetExtractor';
import { BATCH_FRAMES, FFT_SIZE, FRAME_STRIDE, RHYTHM_PROCESSOR_NAME } from './rhythmConfig';
import { RhythmTracker } from './rhythmTracker';
import { renderTrack, TEST_SAMPLE_RATE } from './testSignals';
import type { FrameBatch } from './types';

// The real import is a Vite worker-URL query that only exists in the bundler.
vi.mock('./rhythmProcessor.worklet?worker&url', () => ({ default: '/assets/rhythm-worklet.js' }));

interface Harness {
    web: FakeWebAudio;
    engine: FakeAudioEngine;
    tracker: RhythmTracker;
}

function createHarness(): Harness {
    const web = installFakeWebAudio();
    const engine = new FakeAudioEngine();
    return { web, engine, tracker: new RhythmTracker() };
}

function createAnalyser(context = new FakeAudioContext({ sampleRate: TEST_SAMPLE_RATE })): FakeAnalyserNode {
    return new FakeAnalyserNode(context);
}

function asAnalyser(fake: FakeAnalyserNode): AnalyserNode {
    return asWebAudio<AnalyserNode>(fake);
}

// What the worklet would post for `frameCount` frames of noise-free flux in the kick band: enough for the analyzer to
// count a frame as heard and to light up the kick onset display.
function flatBatch(time0 = 0, count = BATCH_FRAMES): FrameBatch {
    const frames = new Float32Array(count * FRAME_STRIDE);
    for (let i = 0; i < count; i++) {
        frames[i * FRAME_STRIDE] = 1;
    }
    return { time0, count, frames };
}

// Cuts a real drum-machine track into the batches the worklet would post, so the tracker sees a plausible song.
function trackBatches(seconds: number, bpm: number): FrameBatch[] {
    const { pcm } = renderTrack({ seconds, bpm, beatsPerBar: 4, sampleRate: TEST_SAMPLE_RATE });
    const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
    const batches: FrameBatch[] = [];
    let current: FrameBatch | undefined;
    for (let offset = 0; offset < pcm.length; offset += 128) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + 128)), (frame) => {
            if (!current) {
                current = {
                    time0: (frame.endSample - FFT_SIZE / 2) / TEST_SAMPLE_RATE,
                    count: 0,
                    frames: new Float32Array(BATCH_FRAMES * FRAME_STRIDE),
                };
            }
            packFrame(frame, current.frames, current.count * FRAME_STRIDE);
            if (++current.count === BATCH_FRAMES) {
                batches.push(current);
                current = undefined;
            }
        });
    }
    return batches;
}

// The node RhythmTracker attached, once the worklet module has "loaded".
async function attachedNode(web: FakeWebAudio, count = 1): Promise<FakeAudioWorkletNode> {
    await vi.waitFor(() => expect(web.workletNodes).toHaveLength(count));
    return web.workletNodes[count - 1];
}

// A message from the processor, delivered the way a browser does (asynchronously). Resolves once it was handled.
async function deliver(node: FakeAudioWorkletNode, batch: FrameBatch, handled: () => unknown): Promise<void> {
    const before = handled();
    node.processorPort.postMessage(batch);
    await vi.waitFor(() => expect(handled()).not.toEqual(before));
}

describe('RhythmTracker', () => {
    let harness: Harness;

    beforeEach(() => {
        harness = createHarness();
    });

    afterEach(() => {
        harness.tracker.dispose();
        vi.restoreAllMocks();
    });

    describe('starting and stopping', () => {
        it('stays idle while the engine has no analyser', () => {
            harness.tracker.start(asEngine(harness.engine));
            expect(harness.web.contexts).toHaveLength(0);
            expect(harness.web.workletNodes).toHaveLength(0);
        });

        it('loads the worklet module once and attaches a node to the analyser', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));

            const node = await attachedNode(harness.web);

            expect(analyser.context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
            expect(analyser.context.audioWorklet.addModule).toHaveBeenCalledWith('/assets/rhythm-worklet.js');
            expect(node.name).toBe(RHYTHM_PROCESSOR_NAME);
            expect(node.options).toEqual({
                numberOfInputs: 1,
                numberOfOutputs: 0,
                channelCount: 2,
                channelCountMode: 'explicit',
            });
            expect(analyser.connect).toHaveBeenCalledWith(node);
        });

        it('attaches when the analyser appears after start()', async () => {
            harness.tracker.start(asEngine(harness.engine));
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            await attachedNode(harness.web);
            expect(analyser.connect).toHaveBeenCalled();
        });

        it('ignores engine updates that keep the same analyser', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            await attachedNode(harness.web);

            harness.engine.notify();
            harness.engine.notify();

            expect(harness.web.workletNodes).toHaveLength(1);
            expect(analyser.context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        });

        it('start() again restarts instead of subscribing twice', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            harness.tracker.start(asEngine(harness.engine));
            await attachedNode(harness.web);

            // The restart rebinds the analyser once (the first bind was superseded), so there is exactly one node.
            const next = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(next));
            await attachedNode(harness.web, 2);
            expect(harness.web.workletNodes[1].context).toBe(next.context);

            // A duplicate subscription would have bound the new analyser twice.
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(harness.web.workletNodes).toHaveLength(2);
        });

        it('dispose() detaches the node, closes the port and stops following the engine', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            const close = vi.spyOn(node.port, 'close');

            harness.tracker.dispose();

            expect(analyser.disconnect).toHaveBeenCalledWith(node);
            expect(node.disconnect).toHaveBeenCalled();
            expect(close).toHaveBeenCalled();
            expect(node.onprocessorerror).toBeNull();

            harness.engine.setAnalyser(asAnalyser(createAnalyser()));
            expect(harness.web.workletNodes).toHaveLength(1);
        });

        it('dispose() is safe before start and twice in a row', () => {
            expect(() => harness.tracker.dispose()).not.toThrow();
            harness.tracker.start(asEngine(harness.engine));
            harness.tracker.dispose();
            expect(() => harness.tracker.dispose()).not.toThrow();
        });

        it('keeps the last state readable after the capture stops', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            await deliver(node, flatBatch(), () => harness.tracker.state.bandOnsets[0]);

            harness.engine.setAnalyser(undefined);

            expect(node.disconnect).toHaveBeenCalled();
            expect(harness.tracker.state.bandOnsets[0]).toBeGreaterThan(0);
        });

        it('survives disconnect() throwing because the old audio context is already closed', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            analyser.disconnect.mockImplementation(() => {
                throw new Error('context closed');
            });
            node.disconnect.mockImplementation(() => {
                throw new Error('context closed');
            });

            expect(() => harness.engine.setAnalyser(undefined)).not.toThrow();
            expect(analyser.disconnect).toHaveBeenCalled();
            expect(node.disconnect).toHaveBeenCalled();
        });
    });

    describe('loading the worklet module', () => {
        it('does not attach a node for a source that was replaced while the module loaded', async () => {
            const first = createAnalyser();
            const second = createAnalyser();
            first.context.audioWorklet.manual = true;
            second.context.audioWorklet.manual = true;
            harness.tracker.start(asEngine(harness.engine));

            harness.engine.setAnalyser(asAnalyser(first));
            harness.engine.setAnalyser(asAnalyser(second));
            first.context.audioWorklet.resolveAll();
            second.context.audioWorklet.resolveAll();

            const node = await attachedNode(harness.web);
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(harness.web.workletNodes).toHaveLength(1);
            expect(node.context).toBe(second.context);
            expect(first.connect).not.toHaveBeenCalled();
        });

        it('does not attach anything after the capture stopped mid-load', async () => {
            const analyser = createAnalyser();
            analyser.context.audioWorklet.manual = true;
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));

            harness.engine.setAnalyser(undefined);
            analyser.context.audioWorklet.resolveAll();
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(harness.web.workletNodes).toHaveLength(0);
        });

        it('reuses the loaded module when the same context binds again', async () => {
            const context = new FakeAudioContext({ sampleRate: TEST_SAMPLE_RATE });
            const first = createAnalyser(context);
            const second = createAnalyser(context);
            harness.engine.setAnalyser(asAnalyser(first));
            harness.tracker.start(asEngine(harness.engine));
            await attachedNode(harness.web);

            harness.engine.setAnalyser(asAnalyser(second));
            await attachedNode(harness.web, 2);

            expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        });

        it('logs a failed load and retries it on the next bind', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const analyser = createAnalyser();
            const failure = new Error('network down');
            analyser.context.audioWorklet.failWith = failure;
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));

            await vi.waitFor(() =>
                expect(error).toHaveBeenCalledWith('RhythmTracker could not start the audio worklet', failure),
            );
            expect(harness.web.workletNodes).toHaveLength(0);

            analyser.context.audioWorklet.failWith = undefined;
            harness.engine.setAnalyser(undefined);
            harness.engine.setAnalyser(asAnalyser(analyser));
            await attachedNode(harness.web);
            expect(analyser.context.audioWorklet.addModule).toHaveBeenCalledTimes(2);
        });

        it('stays quiet about a failed load that no longer matters', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const analyser = createAnalyser();
            analyser.context.audioWorklet.manual = true;
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));

            harness.engine.setAnalyser(undefined);
            analyser.context.audioWorklet.rejectAll();
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(error).not.toHaveBeenCalled();
        });

        it('reports a processor error from the current node only', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            const handler = node.onprocessorerror;

            handler?.(new Event('processorerror'));
            expect(error).toHaveBeenCalledWith('The rhythm audio worklet failed');

            // After a switch the old node's handler is stale and must not complain.
            error.mockClear();
            harness.engine.setAnalyser(undefined);
            handler?.(new Event('processorerror'));
            expect(error).not.toHaveBeenCalled();
        });
    });

    describe('analysis', () => {
        it('feeds the frames the worklet posts into the state', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            expect(harness.tracker.state.bandOnsets[0]).toBe(0);

            await deliver(node, flatBatch(), () => harness.tracker.state.bandOnsets[0]);

            expect(harness.tracker.state.bandOnsets[0]).toBeGreaterThan(0);
        });

        it('ignores a late message once it has been disposed', async () => {
            const handlers: Array<(event: unknown) => void> = [];
            const original = EventTarget.prototype.addEventListener;
            vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (
                this: EventTarget,
                type: string,
                listener: EventListenerOrEventListenerObject | null,
                options?: boolean | AddEventListenerOptions,
            ) {
                if (type === 'message' && typeof listener === 'function') {
                    handlers.push(listener as (event: unknown) => void);
                }
                return original.call(this, type, listener, options);
            });
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            await attachedNode(harness.web);
            harness.tracker.dispose();

            expect(handlers.length).toBeGreaterThan(0);
            expect(() => handlers[handlers.length - 1]({ data: flatBatch() })).not.toThrow();
            expect(harness.tracker.state.bandOnsets[0]).toBe(0);
        });

        it('does not call a new source a song change when nothing was heard from the old one', async () => {
            const listener = vi.fn();
            harness.tracker.subscribe(listener);
            harness.engine.setAnalyser(asAnalyser(createAnalyser()));
            harness.tracker.start(asEngine(harness.engine));
            await attachedNode(harness.web);

            // StrictMode's second mount, and a second analyser, with no audio heard in between.
            harness.tracker.start(asEngine(harness.engine));
            harness.engine.setAnalyser(asAnalyser(createAnalyser()));

            expect(harness.tracker.getSongChangeCount()).toBe(0);
            expect(listener).not.toHaveBeenCalled();
        });

        it('counts a new source as a song change once the old one was analysed, and tells subscribers', async () => {
            const listener = vi.fn();
            harness.tracker.subscribe(listener);
            harness.engine.setAnalyser(asAnalyser(createAnalyser()));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            await deliver(node, flatBatch(), () => harness.tracker.state.bandOnsets[0]);
            expect(listener).not.toHaveBeenCalled();

            harness.engine.setAnalyser(asAnalyser(createAnalyser()));

            expect(harness.tracker.getSongChangeCount()).toBe(1);
            expect(harness.tracker.state.songChangeCount).toBe(1);
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('notifies only when the meter or the song counter changes, not for every batch', async () => {
            const listener = vi.fn();
            harness.tracker.subscribe(listener);
            harness.engine.setAnalyser(asAnalyser(createAnalyser()));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);

            await deliver(node, flatBatch(0), () => harness.tracker.state.bandOnsets[0]);
            node.processorPort.postMessage(flatBatch(0.1));
            node.processorPort.postMessage(flatBatch(0.2));
            // Nothing observable marks the end of the last message, so give the port time to deliver them.
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(harness.tracker.state.bandOnsets[0]).toBeGreaterThan(0);
            expect(listener).not.toHaveBeenCalled();
        });

        it('stops notifying an unsubscribed listener, and a throwing listener does not block the others', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const removed = vi.fn();
            const healthy = vi.fn();
            const failure = new Error('boom');
            harness.tracker.subscribe(removed)();
            harness.tracker.subscribe(() => {
                throw failure;
            });
            harness.tracker.subscribe(healthy);
            harness.engine.setAnalyser(asAnalyser(createAnalyser()));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            await deliver(node, flatBatch(), () => harness.tracker.state.bandOnsets[0]);

            harness.engine.setAnalyser(asAnalyser(createAnalyser()));

            expect(removed).not.toHaveBeenCalled();
            expect(healthy).toHaveBeenCalledTimes(1);
            expect(error).toHaveBeenCalledWith('RhythmTracker listener failed', failure);
        });
    });

    describe('with a real song', () => {
        it('finds the tempo and tracks the beat phase, reading the clock of the bound context', async () => {
            const analyser = createAnalyser();
            harness.engine.setAnalyser(asAnalyser(analyser));
            harness.tracker.start(asEngine(harness.engine));
            const node = await attachedNode(harness.web);
            const { state } = harness.tracker;

            const batches = trackBatches(20, 120);
            let latest = 0;
            for (const batch of batches) {
                latest = batch.time0 + (batch.count - 1) / 100;
                analyser.context.currentTime = latest;
                node.processorPort.postMessage(batch);
            }
            await vi.waitFor(() => expect(state.bpm).toBeGreaterThan(0));
            // Let every queued batch arrive before reading the final state.
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(state.bpm).toBeGreaterThan(115);
            expect(state.bpm).toBeLessThan(125);
            expect(state.beatCount).toBeGreaterThan(10);
            // The store getter reports the meter once it settled, and subscribers were told when it flipped.
            expect(harness.tracker.getBeatsPerBar()).toBe(state.beatsPerBar);

            // With no argument the phase follows the context clock.
            analyser.context.currentTime = latest + 0.1;
            harness.tracker.updatePhase();
            const phase = state.beatPhase;
            expect(phase).toBeDefined();
            expect(phase).toBeGreaterThanOrEqual(0);
            expect(phase).toBeLessThan(1);
            expect(state.nextBeatTime).toBeGreaterThan(latest + 0.1 - 1e-9);

            // An explicit time wins over the context clock.
            harness.tracker.updatePhase(0);
            expect(state.beatPhase).toBe(0);
        });
    });

    describe('updatePhase', () => {
        it('does nothing without a bound analyser and without an explicit time', () => {
            expect(() => harness.tracker.updatePhase()).not.toThrow();
            expect(harness.tracker.state.beatPhase).toBeUndefined();
        });

        it('leaves the phase unknown before any beat was found, with or without a time', async () => {
            harness.engine.setAnalyser(asAnalyser(createAnalyser()));
            harness.tracker.start(asEngine(harness.engine));
            await attachedNode(harness.web);

            harness.tracker.updatePhase();
            harness.tracker.updatePhase(5);

            expect(harness.tracker.state.beatPhase).toBeUndefined();
            expect(harness.tracker.state.barPhase).toBeUndefined();
        });

        it('accepts an explicit time before start() as a harmless no-op', () => {
            expect(() => harness.tracker.updatePhase(1)).not.toThrow();
        });
    });
});
