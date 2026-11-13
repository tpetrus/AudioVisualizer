import { BandOnsets, type OnsetSink } from './bandOnsets';
import { OnsetExtractor, packFrame, type FrameSink } from './onsetExtractor';
import {
    BATCH_FRAMES,
    FEATURE_ONSET_BAND_COUNT,
    FFT_SIZE,
    FRAME_STRIDE,
    HUB_BAND_COUNT,
    RHYTHM_PROCESSOR_NAME,
} from './rhythmConfig';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch } from './types';

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

// Each frame decides at most one event per onset band, so a batch holds at most this many events.
const ONSET_CAPACITY = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;

// A thin shell around OnsetExtractor and BandOnsets: it runs on the audio thread, turns the incoming audio into
// feature frames, band energies and onset events, and posts them to the main thread in batches. The tempo and beat
// analysis happens on the main thread, where it is cheap (a few hundred operations per frame) and easy to test.
class RhythmProcessor extends AudioWorkletProcessor {
    private readonly extractor = new OnsetExtractor(sampleRate);
    private readonly bandOnsets = new BandOnsets(sampleRate, this.extractor.frameRate);
    private mix = new Float32Array(RENDER_QUANTUM);
    // A batch is posted by transferring its buffers, so fresh ones are needed after each post (~12 per second).
    private batch = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
    private frameTimes = new Float64Array(BATCH_FRAMES);
    private bandEnergy = new Float32Array(BATCH_FRAMES * HUB_BAND_COUNT);
    private onsetBand = new Uint8Array(ONSET_CAPACITY);
    private onsetTime = new Float64Array(ONSET_CAPACITY);
    private onsetStrength = new Float32Array(ONSET_CAPACITY);
    private onsetCount = 0;
    private batchCount = 0;
    private batchTime0 = 0;
    // Context sample index of the first sample the extractor saw, and how many it has seen since.
    private startSample = 0;
    private consumed = 0;
    private started = false;

    // Fields rather than methods or per-frame closures, so the audio thread allocates nothing per frame.
    private readonly onOnset: OnsetSink = (band, time, strength) => {
        this.onsetBand[this.onsetCount] = band;
        this.onsetTime[this.onsetCount] = time;
        this.onsetStrength[this.onsetCount] = strength;
        this.onsetCount++;
    };

    private readonly onFrame: FrameSink = (frame) => {
        // The window is centred half its length before its end.
        const time = (this.startSample + frame.endSample - FFT_SIZE / 2) / sampleRate;
        if (this.batchCount === 0) {
            this.batchTime0 = time;
        }
        packFrame(frame, this.batch, this.batchCount * FRAME_STRIDE);
        this.frameTimes[this.batchCount] = time;
        this.bandOnsets.push(frame.logMagnitude, time, this.onOnset);
        this.bandEnergy.set(this.bandOnsets.energy, this.batchCount * HUB_BAND_COUNT);
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
            this.bandOnsets.reset();
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
        const message: FeatureBatch = {
            version: FEATURE_MESSAGE_VERSION,
            time0: this.batchTime0,
            count: this.batchCount,
            frames: this.batch,
            frameTimes: this.frameTimes,
            bandEnergy: this.bandEnergy,
            onsetCount: this.onsetCount,
            onsetBand: this.onsetBand,
            onsetTime: this.onsetTime,
            onsetStrength: this.onsetStrength,
        };
        this.port.postMessage(message, [
            this.batch.buffer,
            this.frameTimes.buffer,
            this.bandEnergy.buffer,
            this.onsetBand.buffer,
            this.onsetTime.buffer,
            this.onsetStrength.buffer,
        ]);
        this.batch = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
        this.frameTimes = new Float64Array(BATCH_FRAMES);
        this.bandEnergy = new Float32Array(BATCH_FRAMES * HUB_BAND_COUNT);
        this.onsetBand = new Uint8Array(ONSET_CAPACITY);
        this.onsetTime = new Float64Array(ONSET_CAPACITY);
        this.onsetStrength = new Float32Array(ONSET_CAPACITY);
        this.onsetCount = 0;
        this.batchCount = 0;
    }
}

registerProcessor(RHYTHM_PROCESSOR_NAME, RhythmProcessor);
