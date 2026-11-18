import { describe, expect, it } from 'vitest';
import { filterLowpass, lowpassCoefficients, lowpassGain } from './biquad';

const SAMPLE_RATE = 48000;

describe('lowpass biquad', () => {
    it('has the spec gain at the cutoff and passes DC at 1', () => {
        const qDb = Math.SQRT1_2;
        const c = lowpassCoefficients(120, qDb, SAMPLE_RATE);
        // At w0 the spec's lowpass has magnitude 10^(Q/20): the resonance peak, here about 0.7 dB.
        expect(lowpassGain(c, 120, SAMPLE_RATE)).toBeCloseTo(Math.pow(10, qDb / 20), 6);
        expect(lowpassGain(c, 0, SAMPLE_RATE)).toBeCloseTo(1, 9);
        expect(lowpassGain(c, 6000, SAMPLE_RATE)).toBeLessThan(0.01);
    });

    it('settles a constant input to the same constant', () => {
        const c = lowpassCoefficients(120, Math.SQRT1_2, SAMPLE_RATE);
        const out = filterLowpass(new Float32Array(SAMPLE_RATE).fill(0.5), c);
        expect(out[out.length - 1]).toBeCloseTo(0.5, 5);
    });

    it('matches its own frequency response on a sine at the cutoff', () => {
        const c = lowpassCoefficients(120, Math.SQRT1_2, SAMPLE_RATE);
        const input = new Float32Array(SAMPLE_RATE);
        for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * 120 * i) / SAMPLE_RATE);
        const out = filterLowpass(input, c);
        let peak = 0;
        for (let i = SAMPLE_RATE / 2; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
        expect(peak).toBeCloseTo(lowpassGain(c, 120, SAMPLE_RATE), 2);
    });
});
