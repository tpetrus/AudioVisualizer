import { Fft, createHannWindow } from './fft';
import {
    BAND_COUNT,
    CHROMA_BINS,
    CHROMA_MAX_HZ,
    CHROMA_MIN_HZ,
    FFT_SIZE,
    FRAME_CHROMA_OFFSET,
    FRAME_ENERGY_OFFSET,
    FRAME_FLUX_OFFSET,
    FRAME_RMS_OFFSET,
    HOP_SECONDS,
    KICK_MAX_HZ,
    MAGNITUDE_LOG_GAIN,
    MID_MAX_HZ,
} from './rhythmConfig';

// One analysis frame. The arrays are owned by the extractor and overwritten for the next frame, so a sink must copy
// (see `packFrame`) whatever it wants to keep.
export interface OnsetFrame {
    // Log-compressed spectral flux per band (kick, mid, high): mean positive change of log magnitude per bin.
    flux: Float32Array;
    // Mean compressed magnitude, log(1 + gain * magnitude), per band. A uniform level change shifts all bands by
    // roughly the same amount, so comparing bands with each other measures the spectral balance.
    energy: Float32Array;
    // Root-mean-square of the raw samples in the window, 0..1.
    rms: number;
    // Strength of each pitch class, C first.
    chroma: Float32Array;
    // Total samples consumed when the frame's window ended. The window is centred FFT_SIZE / 2 samples earlier.
    endSample: number;
}

export type FrameSink = (frame: OnsetFrame) => void;

// Samples between frames for a given sample rate.
export function hopSizeFor(sampleRate: number): number {
    return Math.max(1, Math.round(sampleRate * HOP_SECONDS));
}

// Writes the frame into `out` at `offset` using the layout in rhythmConfig.ts.
export function packFrame(frame: OnsetFrame, out: Float32Array, offset: number): void {
    for (let b = 0; b < BAND_COUNT; b++) {
        out[offset + FRAME_FLUX_OFFSET + b] = frame.flux[b];
        out[offset + FRAME_ENERGY_OFFSET + b] = frame.energy[b];
    }
    out[offset + FRAME_RMS_OFFSET] = frame.rms;
    for (let i = 0; i < CHROMA_BINS; i++) {
        out[offset + FRAME_CHROMA_OFFSET + i] = frame.chroma[i];
    }
}

// Turns a stream of audio samples into onset features: a Hann-windowed FFT every hop, reduced to three bands of
// log spectral flux, a chroma vector and an RMS level. Pure (no Web Audio): the worklet feeds it live audio and
// tests feed it synthetic signals. It allocates only in the constructor.
export class OnsetExtractor {
    readonly sampleRate: number;
    // Samples between frames, and the resulting frames per second.
    readonly hopSize: number;
    readonly frameRate: number;

    private readonly fft = new Fft(FFT_SIZE);
    private readonly window = createHannWindow(FFT_SIZE);
    private readonly ring = new Float32Array(FFT_SIZE);
    private readonly re = new Float32Array(FFT_SIZE);
    private readonly im = new Float32Array(FFT_SIZE);
    private readonly logMagnitude = new Float32Array(FFT_SIZE / 2);
    private readonly previousLog = new Float32Array(FFT_SIZE / 2);
    // Scales an FFT magnitude so that a full-scale sine measures 1.0 (a Hann window sums to FFT_SIZE / 2).
    private readonly magnitudeScale = 4 / FFT_SIZE;
    // Band b covers FFT bins [bandStart[b], bandStart[b + 1]).
    private readonly bandStart = new Int32Array(BAND_COUNT + 1);
    // Pitch class of each FFT bin, or -1 when the bin is outside the chroma range.
    private readonly pitchClass = new Int8Array(FFT_SIZE / 2);
    private readonly frame: OnsetFrame = {
        flux: new Float32Array(BAND_COUNT),
        energy: new Float32Array(BAND_COUNT),
        rms: 0,
        chroma: new Float32Array(CHROMA_BINS),
        endSample: 0,
    };

    private writeIndex = 0;
    private sinceHop = 0;
    private samplesConsumed = 0;
    // The first full window has nothing to compare with, so it produces no frame.
    private hasPrevious = false;

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.hopSize = hopSizeFor(sampleRate);
        this.frameRate = sampleRate / this.hopSize;

        const binHz = sampleRate / FFT_SIZE;
        const lastBin = FFT_SIZE / 2;
        // Bin 0 is DC and carries no rhythm. Each band gets at least one bin even at low sample rates.
        const kickEnd = Math.min(lastBin - 2, Math.max(2, Math.floor(KICK_MAX_HZ / binHz) + 1));
        const midEnd = Math.min(lastBin - 1, Math.max(kickEnd + 1, Math.floor(MID_MAX_HZ / binHz) + 1));
        this.bandStart[0] = 1;
        this.bandStart[1] = kickEnd;
        this.bandStart[2] = midEnd;
        this.bandStart[3] = lastBin;

        for (let k = 0; k < lastBin; k++) {
            const hz = k * binHz;
            if (hz < CHROMA_MIN_HZ || hz > CHROMA_MAX_HZ) {
                this.pitchClass[k] = -1;
                continue;
            }
            const midiNote = Math.round(69 + 12 * Math.log2(hz / 440));
            this.pitchClass[k] = ((midiNote % CHROMA_BINS) + CHROMA_BINS) % CHROMA_BINS;
        }
    }

    // Consumes samples and calls `onFrame` once per completed hop. Block sizes are arbitrary.
    push(samples: Float32Array, onFrame: FrameSink): void {
        const mask = FFT_SIZE - 1;
        for (let i = 0; i < samples.length; i++) {
            this.ring[this.writeIndex] = samples[i];
            this.writeIndex = (this.writeIndex + 1) & mask;
            this.samplesConsumed++;
            if (++this.sinceHop === this.hopSize) {
                this.sinceHop = 0;
                if (this.samplesConsumed >= FFT_SIZE && this.analyse()) {
                    onFrame(this.frame);
                }
            }
        }
    }

    // Forgets all audio so far, e.g. when the source changed.
    reset(): void {
        this.ring.fill(0);
        this.previousLog.fill(0);
        this.writeIndex = 0;
        this.sinceHop = 0;
        this.samplesConsumed = 0;
        this.hasPrevious = false;
    }

    // Analyses the newest FFT_SIZE samples into `this.frame`. Returns false for the very first window.
    private analyse(): boolean {
        const mask = FFT_SIZE - 1;
        let sumSquares = 0;
        // writeIndex points at the oldest sample, so reading from it yields the window in time order.
        for (let i = 0; i < FFT_SIZE; i++) {
            const sample = this.ring[(this.writeIndex + i) & mask];
            sumSquares += sample * sample;
            this.re[i] = sample * this.window[i];
            this.im[i] = 0;
        }
        this.fft.forward(this.re, this.im);

        const chroma = this.frame.chroma;
        chroma.fill(0);
        for (let k = 1; k < FFT_SIZE / 2; k++) {
            const magnitude = Math.sqrt(this.re[k] * this.re[k] + this.im[k] * this.im[k]) * this.magnitudeScale;
            this.logMagnitude[k] = Math.log(1 + MAGNITUDE_LOG_GAIN * magnitude);
            const pitch = this.pitchClass[k];
            if (pitch >= 0) {
                // Square root keeps one loud partial from hiding the rest of the chord.
                chroma[pitch] += Math.sqrt(magnitude);
            }
        }

        for (let b = 0; b < BAND_COUNT; b++) {
            const start = this.bandStart[b];
            const end = this.bandStart[b + 1];
            let flux = 0;
            let energy = 0;
            for (let k = start; k < end; k++) {
                const level = this.logMagnitude[k];
                energy += level;
                // Only increases count: a decaying note is not an onset.
                const rise = level - this.previousLog[k];
                if (rise > 0) {
                    flux += rise;
                }
            }
            this.frame.flux[b] = flux / (end - start);
            this.frame.energy[b] = energy / (end - start);
        }
        this.frame.rms = Math.sqrt(sumSquares / FFT_SIZE);
        this.frame.endSample = this.samplesConsumed;

        const hadPrevious = this.hasPrevious;
        this.previousLog.set(this.logMagnitude);
        this.hasPrevious = true;
        return hadPrevious;
    }
}
