import { OnsetExtractor, packFrame, type FrameSink } from './onsetExtractor';
import { BATCH_FRAMES, FFT_SIZE, FRAME_STRIDE, RHYTHM_PROCESSOR_NAME } from './rhythmConfig';
import type { FrameBatch } from './types';

// The AudioWorklet global scope has none of the DOM, and TypeScript's DOM lib does not describe it, so the few
// globals this file uses are declared here. `sampleRate` and `currentFrame` are provided by the worklet scope.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
    constructor();
    readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

// Web Audio renders in blocks of this many samples. Only used to size the mix-down scratch buffer; other block
// sizes are handled by growing it.
const RENDER_QUANTUM = 128;

// A thin shell around OnsetExtractor: it runs on the audio thread, turns the incoming audio into feature frames,
// and posts them to the main thread in batches. All analysis beyond that happens on the main thread, where it is
// cheap (a few hundred operations per frame) and easy to test.
class RhythmProcessor extends AudioWorkletProcessor {
    private readonly extractor = new OnsetExtractor(sampleRate);
    private mix = new Float32Array(RENDER_QUANTUM);
    // A batch is posted by transferring its buffer, so a fresh one is needed after each post (~12 per second).
    private batch = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
    private batchCount = 0;
    private batchTime0 = 0;
    // Context sample index of the first sample the extractor saw, and how many it has seen since.
    private startSample = 0;
    private consumed = 0;
    private started = false;

    private readonly onFrame: FrameSink = (frame) => {
        if (this.batchCount === 0) {
            // The window is centred half its length before its end.
            this.batchTime0 = (this.startSample + frame.endSample - FFT_SIZE / 2) / sampleRate;
        }
        packFrame(frame, this.batch, this.batchCount * FRAME_STRIDE);
        if (++this.batchCount === BATCH_FRAMES) {
            this.post();
        }
    };

    process(inputs: Float32Array[][]): boolean {
        const channels = inputs[0];
        if (!channels || channels.length === 0) {
            return true;
        }
        const length = channels[0].length;

        // If blocks were skipped, the time base of the running analysis is wrong, so start over from here.
        if (this.started && currentFrame !== this.startSample + this.consumed) {
            this.post();
            this.extractor.reset();
            this.started = false;
        }
        if (!this.started) {
            this.startSample = currentFrame;
            this.consumed = 0;
            this.started = true;
        }

        let block = channels[0];
        if (channels.length > 1) {
            // Rhythm does not depend on the stereo image, and one channel halves the work.
            if (this.mix.length < length) {
                this.mix = new Float32Array(length);
            }
            const mixed = this.mix.length === length ? this.mix : this.mix.subarray(0, length);
            for (let i = 0; i < length; i++) {
                let sum = 0;
                for (let c = 0; c < channels.length; c++) {
                    sum += channels[c][i];
                }
                mixed[i] = sum / channels.length;
            }
            block = mixed;
        }
        this.extractor.push(block, this.onFrame);
        this.consumed += length;
        return true;
    }

    // Sends the frames collected so far (if any) to the main thread.
    private post(): void {
        if (this.batchCount === 0) {
            return;
        }
        const message: FrameBatch = { time0: this.batchTime0, count: this.batchCount, frames: this.batch };
        this.port.postMessage(message, [this.batch.buffer]);
        this.batch = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
        this.batchCount = 0;
    }
}

registerProcessor(RHYTHM_PROCESSOR_NAME, RhythmProcessor);
