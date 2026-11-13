import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BandOnsets } from './bandOnsets';
import { OnsetExtractor, packFrame } from './onsetExtractor';
import {
    BATCH_FRAMES,
    FEATURE_ONSET_BAND_COUNT,
    FFT_SIZE,
    FRAME_RMS_OFFSET,
    FRAME_STRIDE,
    HUB_BAND_COUNT,
    RHYTHM_PROCESSOR_NAME,
} from './rhythmConfig';
import { silence, sine } from './testSignals';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch } from './types';

const SAMPLE_RATE = 48000;
// OnsetExtractor emits a frame every 480 samples at 48 kHz, and the first one only once a full window plus a previous
// window to compare with have been heard: the hop that completes the second window ends at sample 1920.
const FIRST_FRAME_END = 1920;
const HOP = 480;

interface PostedMessage {
    message: FeatureBatch;
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
        expect(first.transfer).toContain(first.message.frames.buffer);
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

    // Silence, then kicks, then silence: a few onset events for the detector to find.
    function kickTrain(): Float32Array {
        const pcm = silence(2.5, SAMPLE_RATE);
        for (const start of [0.5, 1.2, 1.9]) {
            let phase = 0;
            for (let i = 0; i < 0.3 * SAMPLE_RATE; i++) {
                const t = i / SAMPLE_RATE;
                phase += (2 * Math.PI * (45 + 55 * Math.exp(-t / 0.03))) / SAMPLE_RATE;
                pcm[Math.round(start * SAMPLE_RATE) + i] += 0.8 * Math.exp(-t / 0.07) * Math.sin(phase);
            }
        }
        return pcm;
    }

    // Everything the worklet should say, worked out directly with the same extractor and detector.
    function expected(pcm: Float32Array) {
        const extractor = new OnsetExtractor(SAMPLE_RATE);
        const bandOnsets = new BandOnsets(SAMPLE_RATE, extractor.frameRate);
        const packed: number[][] = [];
        const times: number[] = [];
        const energy: number[][] = [];
        const events: { band: number; time: number }[] = [];
        for (let offset = 0; offset < pcm.length; offset += 128) {
            extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + 128)), (frame) => {
                const row = new Float32Array(FRAME_STRIDE);
                packFrame(frame, row, 0);
                packed.push(Array.from(row));
                const time = (frame.endSample - FFT_SIZE / 2) / SAMPLE_RATE;
                times.push(time);
                bandOnsets.push(frame.logMagnitude, time, (band, eventTime) => events.push({ band, time: eventTime }));
                energy.push(Array.from(bandOnsets.energy));
            });
        }
        return { packed, times, energy, events };
    }

    it('posts version 2 messages whose packed frames, time0 and count are the old FrameBatch', async () => {
        const harness = await loadProcessor();
        const pcm = kickTrain();
        play(harness, [pcm]);

        const want = expected(pcm);
        const batches = harness.posted().map(({ message }) => message);
        expect(batches.length).toBeGreaterThan(5);
        batches.forEach((message, b) => {
            expect(message.version).toBe(FEATURE_MESSAGE_VERSION);
            expect(message.count).toBe(BATCH_FRAMES);
            expect(message.time0).toBeCloseTo(want.times[b * BATCH_FRAMES], 12);
            expect(message.frames).toHaveLength(BATCH_FRAMES * FRAME_STRIDE);
            for (let f = 0; f < BATCH_FRAMES; f++) {
                const frame = Array.from(message.frames.subarray(f * FRAME_STRIDE, (f + 1) * FRAME_STRIDE));
                expect(frame).toEqual(want.packed[b * BATCH_FRAMES + f]);
            }
        });
    });

    it('stamps every frame with its window centre and posts its band energies', async () => {
        const harness = await loadProcessor(1000);
        const pcm = kickTrain();
        play(harness, [pcm]);

        const want = expected(pcm);
        const batches = harness.posted().map(({ message }) => message);
        batches.forEach((message, b) => {
            expect(message.frameTimes).toHaveLength(BATCH_FRAMES);
            expect(message.frameTimes[0]).toBe(message.time0);
            expect(message.bandEnergy).toHaveLength(BATCH_FRAMES * HUB_BAND_COUNT);
            for (let f = 0; f < BATCH_FRAMES; f++) {
                if (f > 0) {
                    expect(message.frameTimes[f] - message.frameTimes[f - 1]).toBeCloseTo(HOP / SAMPLE_RATE, 12);
                }
                const index = b * BATCH_FRAMES + f;
                // The clock started at 1000, which the expectation run did not know about.
                expect(message.frameTimes[f]).toBeCloseTo(want.times[index] + 1000 / SAMPLE_RATE, 9);
                for (let band = 0; band < HUB_BAND_COUNT; band++) {
                    expect(message.bandEnergy[f * HUB_BAND_COUNT + band]).toBeCloseTo(want.energy[index][band], 5);
                }
            }
        });
    });

    it('sends each onset event once, including those decided in a later batch than their frame', async () => {
        const harness = await loadProcessor();
        const pcm = kickTrain();
        play(harness, [pcm]);

        const want = expected(pcm);
        expect(want.events.length).toBe(3);
        const sent: { band: number; time: number }[] = [];
        for (const { message } of harness.posted()) {
            expect(message.onsetBand).toHaveLength(BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT);
            expect(message.onsetTime).toHaveLength(BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT);
            expect(message.onsetStrength).toHaveLength(BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT);
            for (let i = 0; i < message.onsetCount; i++) {
                sent.push({ band: message.onsetBand[i], time: message.onsetTime[i] });
                expect(message.onsetStrength[i]).toBeGreaterThan(0);
                expect(message.onsetStrength[i]).toBeLessThanOrEqual(1);
            }
        }
        // Every event was decided long before the audio ended, so all of them are in the posted batches, once each.
        expect(sent.map((event) => event.band)).toEqual(want.events.map((event) => event.band));
        sent.forEach((event, i) => expect(event.time).toBeCloseTo(want.events[i].time, 9));
    });

    it('sends events that cross a batch boundary once, whatever the alignment of the audio to the batches', async () => {
        let crossings = 0;
        for (let shift = 0; shift < BATCH_FRAMES; shift++) {
            const harness = await loadProcessor();
            const pcm = kickTrain();
            // Starting the audio a few hops later moves every event across the batch grid.
            const shifted = new Float32Array(pcm.length + shift * HOP);
            shifted.set(pcm, shift * HOP);
            play(harness, [shifted]);

            const want = expected(shifted);
            const sent: number[] = [];
            for (const { message } of harness.posted()) {
                for (let i = 0; i < message.onsetCount; i++) {
                    sent.push(message.onsetTime[i]);
                    // An event older than its batch's first frame was decided only after the batch began.
                    if (message.onsetTime[i] < message.time0) crossings++;
                }
            }
            expect(sent).toHaveLength(want.events.length);
            sent.forEach((time, i) => expect(time).toBeCloseTo(want.events[i].time, 9));
        }
        expect(crossings).toBeGreaterThan(0);
    });

    it('starts the detector over when blocks were skipped', async () => {
        const harness = await loadProcessor();
        const pcm = kickTrain();
        // A loud kick, a gap in the clock, then a much quieter kick: after the reset the quiet one is the loudest the
        // detector has heard, so its strength is exactly 1. A retained band peak would make it less than 1.
        const gap = 100_000;
        const loud = pcm.slice(0, Math.round(1.0 * SAMPLE_RATE));
        const quiet = loud.map((value) => value * 0.3);
        play(harness, [loud]);
        harness.state.currentFrame += gap;
        play(harness, [quiet]);

        const times: number[] = [];
        const strengths: number[] = [];
        for (const { message } of harness.posted()) {
            for (let i = 0; i < message.onsetCount; i++) {
                times.push(message.onsetTime[i]);
                strengths.push(message.onsetStrength[i]);
            }
        }
        expect(times).toHaveLength(2);
        expect(times[1] - times[0]).toBeCloseTo(1.0 + gap / SAMPLE_RATE, 6);
        expect(strengths[1]).toBe(1);
    });

    it('never counts more onset events than its arrays hold', async () => {
        const harness = await loadProcessor();
        const capacity = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;
        const sink = (
            harness.processor as unknown as { onOnset: (band: number, time: number, strength: number) => void }
        ).onOnset;
        for (let i = 0; i < capacity + 5; i++) sink(0, i, 1);
        play(harness, [silence(0.3, SAMPLE_RATE)]);
        expect(harness.posted()[0].message.onsetCount).toBe(capacity);
    });

    it('transfers every buffer of the message and makes fresh ones after each post', async () => {
        const harness = await loadProcessor();
        play(harness, [kickTrain()]);

        const [first, second] = harness.posted();
        const buffersOf = (message: FeatureBatch): ArrayBufferLike[] => [
            message.frames.buffer,
            message.frameTimes.buffer,
            message.bandEnergy.buffer,
            message.onsetBand.buffer,
            message.onsetTime.buffer,
            message.onsetStrength.buffer,
        ];
        expect(first.transfer).toEqual(buffersOf(first.message));
        expect(new Set(first.transfer).size).toBe(6);
        buffersOf(second.message).forEach((buffer, i) => expect(buffer).not.toBe(buffersOf(first.message)[i]));
    });
});
