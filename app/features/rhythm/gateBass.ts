import { GATE_BASS_CUTOFF_HZ, GATE_BASS_WINDOW } from './rhythmConfig';

// Samples of filtered audio kept for the window reads, a power of two so the ring index is a mask. A full window can end
// anywhere in the newest RING - GATE_BASS_WINDOW samples, which covers the audio block the extractor is cutting frames
// from (128 samples in a worklet; blocks up to 6144 samples still read whole windows).
const RING = 8192;
const RING_MASK = RING - 1;

// BassPulse sets each stage's Q to 1/sqrt 2. A BiquadFilterNode reads a lowpass Q in dB, so this is the Q those nodes
// actually ran with, which the gate was tuned on.
const STAGE_Q_DB = Math.SQRT1_2;

// The gate-input bass of contract C1: BassPulse's feature, computed on the audio thread so it travels with the frames
// it belongs to. Two cascaded lowpass biquads as the Web Audio spec defines them (each stage's output rounded to float32,
// as a node's is), then the root mean square of the newest GATE_BASS_WINDOW filtered samples, which is what BassPulse
// computed from its analyser. Allocates only in the constructor.
export class GateBassFeature {
    private readonly b0: number;
    private readonly b1: number;
    private readonly b2: number;
    private readonly a1: number;
    private readonly a2: number;
    // Each stage's last two inputs and outputs: x1, x2, y1, y2 of the first stage, then of the second.
    private readonly history = new Float64Array(8);
    // Squares of the filtered samples, by sample index modulo RING.
    private readonly squares = new Float64Array(RING);
    // Samples pushed since the last reset.
    private written = 0;

    constructor(sampleRate: number) {
        const w0 = (2 * Math.PI * GATE_BASS_CUTOFF_HZ) / sampleRate;
        const alpha = Math.sin(w0) / (2 * Math.pow(10, STAGE_Q_DB / 20));
        const cos = Math.cos(w0);
        const a0 = 1 + alpha;
        this.b0 = (1 - cos) / 2 / a0;
        this.b1 = (1 - cos) / a0;
        this.b2 = this.b0;
        this.a1 = (-2 * cos) / a0;
        this.a2 = (1 - alpha) / a0;
    }

    // Filters the next samples of the signal.
    public push(samples: Float32Array): void {
        const h = this.history;
        const { b0, b1, b2, a1, a2 } = this;
        for (let i = 0; i < samples.length; i++) {
            const x = samples[i];
            const first = Math.fround(b0 * x + b1 * h[0] + b2 * h[1] - a1 * h[2] - a2 * h[3]);
            h[1] = h[0];
            h[0] = x;
            h[3] = h[2];
            h[2] = first;
            const second = Math.fround(b0 * first + b1 * h[4] + b2 * h[5] - a1 * h[6] - a2 * h[7]);
            h[5] = h[4];
            h[4] = first;
            h[7] = h[6];
            h[6] = second;
            // The mask keeps the low bits exactly at any count below 2^53, so a very long session does not break it.
            this.squares[this.written & RING_MASK] = second * second;
            this.written++;
        }
    }

    // The RMS of the GATE_BASS_WINDOW filtered samples before sample `end` (samples since the last reset; before the
    // first one they count as silence). The extractor's frames always end inside what was pushed; a read outside it is
    // clamped to the held samples rather than thrown, because an exception on the audio thread would stop the worklet
    // for good.
    public levelAt(end: number): number {
        const stop = Math.min(end, this.written);
        const start = Math.max(0, stop - GATE_BASS_WINDOW, this.written - RING);
        let sum = 0;
        for (let i = start; i < stop; i++) {
            sum += this.squares[i & RING_MASK];
        }
        return Math.sqrt(sum / GATE_BASS_WINDOW);
    }

    // Starts over, as for a new signal: the filters forget their state and earlier samples read as silence.
    public reset(): void {
        this.history.fill(0);
        this.written = 0;
    }
}
