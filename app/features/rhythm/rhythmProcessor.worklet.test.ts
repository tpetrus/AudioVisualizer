import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FFT_SIZE, FRAME_RMS_OFFSET, FRAME_STRIDE, BATCH_FRAMES, RHYTHM_PROCESSOR_NAME } from './rhythmConfig';
import { sine } from './testSignals';
import type { FrameBatch } from './types';

const SAMPLE_RATE = 48000;
// OnsetExtractor emits a frame every 480 samples at 48 kHz, and the first one only once a full window plus a previous
// window to compare with have been heard: the hop that completes the second window ends at sample 1920.
const FIRST_FRAME_END = 1920;
const HOP = 480;

interface PostedMessage {
    message: FrameBatch;
    transfer: Transferable[];
}

interface ProcessorLike {
    port: { postMessage: ReturnType<typeof vi.fn> };
    process(inputs: Float32Array[][]): boolean;
}

// Plays the audio worklet scope: the globals the file declares, then imports it so it registers its processor.
async function loadProcessor(startFrame = 0) {
    vi.resetModules();
    const state = { currentFrame: startFrame };
    class FakeAudioWorkletProcessor {
        readonly port = { postMessage: vi.fn() };
    }
    const registerProcessor = vi.fn();
    vi.stubGlobal('sampleRate', SAMPLE_RATE);
    vi.stubGlobal('AudioWorkletProcessor', FakeAudioWorkletProcessor);
    vi.stubGlobal('registerProcessor', registerProcessor);
    // The processor reads the clock at every block, so expose it as a getter the spec can move.
    Object.defineProperty(globalThis, 'currentFrame', { get: () => state.currentFrame, configurable: true });

    await import('./rhythmProcessor.worklet');

    const [name, Processor] = registerProcessor.mock.calls[0] as [string, new () => ProcessorLike];
    const processor = new Processor();
    const posted = (): PostedMessage[] =>
        processor.port.postMessage.mock.calls.map(([message, transfer]) => ({ message, transfer }) as PostedMessage);
    return { name, processor, state, registerProcessor, posted };
}

// Feeds `samples` (one array per channel) in blocks, advancing the context clock the way the browser does.
function play(
    harness: Awaited<ReturnType<typeof loadProcessor>>,
    channels: Float32Array[],
    blockSizes: number[] | number = 128,
): void {
    const total = channels[0].length;
    let offset = 0;
    let index = 0;
    while (offset < total) {
        const size = Array.isArray(blockSizes) ? blockSizes[index++ % blockSizes.length] : blockSizes;
        const end = Math.min(total, offset + size);
        harness.processor.process([channels.map((channel) => channel.subarray(offset, end))]);
        harness.state.currentFrame += end - offset;
        offset = end;
    }
}

describe('rhythm processor worklet', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        // `currentFrame` is defined as a getter rather than stubbed, so vi.unstubAllGlobals() would not remove it.
        Reflect.deleteProperty(globalThis, 'currentFrame');
    });

    it('registers one processor under the shared name', async () => {
        const { name, registerProcessor } = await loadProcessor();
        expect(name).toBe(RHYTHM_PROCESSOR_NAME);
        expect(registerProcessor).toHaveBeenCalledTimes(1);
    });

    it('keeps the node alive and posts nothing for missing or empty input', async () => {
        const harness = await loadProcessor();
        expect(harness.processor.process([])).toBe(true);
        expect(harness.processor.process([[]])).toBe(true);
        expect(harness.posted()).toHaveLength(0);
    });

    it('posts batches of frames with the time of the first frame centre', async () => {
        const startFrame = 1000;
        const harness = await loadProcessor(startFrame);

        play(harness, [sine(440, 0.3, 0.5, SAMPLE_RATE)]);

        const batches = harness.posted();
        expect(batches.length).toBeGreaterThanOrEqual(2);
        const { message } = batches[0];
        expect(message.count).toBe(BATCH_FRAMES);
        expect(message.frames).toHaveLength(BATCH_FRAMES * FRAME_STRIDE);
        // Window centre = context start + frame end - half a window.
        expect(message.time0).toBeCloseTo((startFrame + FIRST_FRAME_END - FFT_SIZE / 2) / SAMPLE_RATE, 10);
        // The second batch starts exactly one batch of hops later.
        expect(batches[1].message.time0 - message.time0).toBeCloseTo((BATCH_FRAMES * HOP) / SAMPLE_RATE, 10);
        // A 0.5 amplitude sine has an RMS of 0.5 / sqrt(2).
        expect(message.frames[FRAME_RMS_OFFSET]).toBeCloseTo(0.5 / Math.SQRT2, 2);
    });

    it('transfers each batch buffer and starts the next batch in a fresh one', async () => {
        const harness = await loadProcessor();

        play(harness, [sine(440, 0.3, 0.5, SAMPLE_RATE)]);

        const [first, second] = harness.posted();
        expect(first.transfer).toEqual([first.message.frames.buffer]);
        expect(second.message.frames.buffer).not.toBe(first.message.frames.buffer);
        // Posting transfers the buffer, which is why the first batch's bytes are no longer usable by the processor.
        expect(second.message.count).toBe(BATCH_FRAMES);
    });

    it('does not post a partial batch on its own', async () => {
        const harness = await loadProcessor();
        // Three frames' worth of audio: not enough to fill a batch.
        play(harness, [sine(440, (FIRST_FRAME_END + 2 * HOP) / SAMPLE_RATE, 0.5, SAMPLE_RATE)]);
        expect(harness.posted()).toHaveLength(0);
    });

    it('mixes stereo down to the average of the channels', async () => {
        const left = sine(440, 0.3, 0.5, SAMPLE_RATE);
        const right = sine(660, 0.3, 0.25, SAMPLE_RATE);
        const average = left.map((value, i) => (value + right[i]) / 2);

        const stereo = await loadProcessor();
        play(stereo, [left, right]);
        const mono = await loadProcessor();
        play(mono, [average]);

        const stereoBatches = stereo.posted().map(({ message }) => message);
        const monoBatches = mono.posted().map(({ message }) => message);
        expect(stereoBatches.length).toBeGreaterThan(0);
        expect(stereoBatches).toHaveLength(monoBatches.length);
        stereoBatches.forEach((batch, i) => {
            expect(batch.time0).toBe(monoBatches[i].time0);
            batch.frames.forEach((value, j) => expect(value).toBeCloseTo(monoBatches[i].frames[j], 4));
        });
    });

    it('copes with block sizes that grow and shrink', async () => {
        const left = sine(440, 0.4, 0.5, SAMPLE_RATE);
        const right = sine(880, 0.4, 0.5, SAMPLE_RATE);

        const steady = await loadProcessor();
        play(steady, [left, right], 128);
        const varying = await loadProcessor();
        // 128 is the render quantum the scratch buffer starts at; 512 grows it, and 64 uses a part of it.
        play(varying, [left, right], [128, 512, 64, 256]);

        const expected = steady.posted().map(({ message }) => message);
        const actual = varying.posted().map(({ message }) => message);
        expect(actual.length).toBeGreaterThan(0);
        actual.forEach((batch, i) => {
            expect(batch.time0).toBe(expected[i].time0);
            batch.frames.forEach((value, j) => expect(value).toBeCloseTo(expected[i].frames[j], 4));
        });
    });

    it('flushes the frames it has and starts over when blocks were skipped', async () => {
        const harness = await loadProcessor();
        // Three frames, so a partial batch is waiting when the gap comes.
        play(harness, [sine(440, (FIRST_FRAME_END + 2 * HOP) / SAMPLE_RATE, 0.5, SAMPLE_RATE)], 120);
        expect(harness.posted()).toHaveLength(0);

        // The context clock jumps ahead: the audio thread dropped some blocks.
        const resumeAt = harness.state.currentFrame + 50_000;
        harness.state.currentFrame = resumeAt;
        play(harness, [sine(440, 0.3, 0.5, SAMPLE_RATE)]);

        const batches = harness.posted();
        // The first message is the flushed partial batch from before the gap.
        expect(batches[0].message.count).toBe(3);
        // After the gap, timing starts again from the new clock, with a fresh window.
        expect(batches[1].message.time0).toBeCloseTo((resumeAt + FIRST_FRAME_END - FFT_SIZE / 2) / SAMPLE_RATE, 10);
    });

    it('has nothing to flush when blocks are skipped before any frame was produced', async () => {
        const harness = await loadProcessor();
        harness.processor.process([[new Float32Array(128)]]);
        harness.state.currentFrame = 99_999;
        expect(harness.processor.process([[new Float32Array(128)]])).toBe(true);
        expect(harness.posted()).toHaveLength(0);
    });
});
