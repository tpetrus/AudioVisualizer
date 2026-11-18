// One lowpass biquad stage as the W3C Web Audio spec defines BiquadFilterNode's lowpass. For this type Q is in dB, so
// alpha = sin(w0) / (2 * 10^(Q/20)).
export interface LowpassCoefficients {
    b0: number;
    b1: number;
    b2: number;
    a1: number;
    a2: number;
}

// Coefficients already divided by a0.
export function lowpassCoefficients(cutoffHz: number, qDb: number, sampleRate: number): LowpassCoefficients {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
    const alpha = Math.sin(w0) / (2 * Math.pow(10, qDb / 20));
    const cos = Math.cos(w0);
    const a0 = 1 + alpha;
    return {
        b0: (1 - cos) / 2 / a0,
        b1: (1 - cos) / a0,
        b2: (1 - cos) / 2 / a0,
        a1: (-2 * cos) / a0,
        a2: (1 - alpha) / a0,
    };
}

// Runs the stage over the samples (direct form I, zero initial state, float32 output like a Web Audio node).
export function filterLowpass(input: Float32Array, c: LowpassCoefficients): Float32Array {
    const out = new Float32Array(input.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < input.length; i++) {
        const x = input[i];
        const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        out[i] = y;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
    }
    return out;
}

// The magnitude of the stage's response at a frequency, from the transfer function H(z) on the unit circle.
export function lowpassGain(c: LowpassCoefficients, hz: number, sampleRate: number): number {
    const w = (2 * Math.PI * hz) / sampleRate;
    const re = (a: number, b: number, d: number): number => a + b * Math.cos(w) + d * Math.cos(2 * w);
    const im = (b: number, d: number): number => -b * Math.sin(w) - d * Math.sin(2 * w);
    const numRe = re(c.b0, c.b1, c.b2);
    const numIm = im(c.b1, c.b2);
    const denRe = re(1, c.a1, c.a2);
    const denIm = im(c.a1, c.a2);
    return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);
}
