import { describe, expect, it } from 'vitest';
import { MIN_GAIN } from '../../../app/features/audio/agc';
import { DEFAULT_NORMALIZE_SETTINGS } from '../../../app/features/audio/types';
import { applyAgc, bytePeak } from './agc';

const SAMPLE_RATE = 48000;
const settings = DEFAULT_NORMALIZE_SETTINGS;

const tone = (seconds: number, amplitude: number, hz = 220): Float32Array => {
    const pcm = new Float32Array(Math.round(seconds * SAMPLE_RATE));
    for (let i = 0; i < pcm.length; i++) pcm[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
    return pcm;
};

const peakOfTail = (pcm: Float32Array, seconds: number): number => {
    let peak = 0;
    for (let i = pcm.length - Math.round(seconds * SAMPLE_RATE); i < pcm.length; i++) {
        peak = Math.max(peak, Math.abs(pcm[i]));
    }
    return peak;
};

describe('bytePeak', () => {
    it('quantizes like getByteTimeDomainData and looks at the last samples only', () => {
        // 128 * (1 + 0.5) = 192, so 64 / 128.
        expect(bytePeak(new Float32Array([0.5]), 1)).toBe(0.5);
        // Full scale clamps at 255: 127 / 128, and -1 maps to byte 0: 128 / 128.
        expect(bytePeak(new Float32Array([1]), 1)).toBe(127 / 128);
        expect(bytePeak(new Float32Array([-1]), 1)).toBe(1);
        // A byte truncates: 128 * (1 + 0.004) = 128.5 is byte 128, no level at all.
        expect(bytePeak(new Float32Array([0.004]), 1)).toBe(0);
        const samples = new Float32Array([0.9, 0, 0, 0]);
        expect(bytePeak(samples, 4, 3)).toBe(0);
        expect(bytePeak(samples, 4, 4)).toBeGreaterThan(0.8);
    });
});

describe('applyAgc', () => {
    it('converges a quiet steady tone to targetPeak / peak', () => {
        const out = applyAgc(tone(8, 0.1), SAMPLE_RATE, settings);
        expect(peakOfTail(out, 1)).toBeCloseTo(settings.targetPeak, 1);
    });

    it('converges a loud tone down to the target', () => {
        const out = applyAgc(tone(4, 0.95), SAMPLE_RATE, settings);
        expect(peakOfTail(out, 1)).toBeCloseTo(settings.targetPeak, 1);
    });

    it('stays within the gain limits', () => {
        // Very quiet but above the noise floor: the gain stops at maxGain.
        const quiet = tone(8, 0.02);
        const loud = applyAgc(quiet, SAMPLE_RATE, settings);
        expect(peakOfTail(loud, 1) / peakOfTail(quiet, 1)).toBeCloseTo(settings.maxGain, 0);
        // A tiny target would want less than MIN_GAIN: the gain stops there.
        const floor = applyAgc(tone(4, 0.9), SAMPLE_RATE, { ...settings, targetPeak: 0.01 });
        expect(peakOfTail(floor, 1) / 0.9).toBeCloseTo(MIN_GAIN, 1);
    });

    it('does nothing below the noise floor', () => {
        // A level the byte quantization reads as silence (128 * 1.003 truncates to the zero byte).
        const hiss = new Float32Array(SAMPLE_RATE * 2).fill(0.003);
        expect(applyAgc(hiss, SAMPLE_RATE, settings)).toEqual(hiss);
    });

    it('does not clip a sudden loud passage, and is deterministic', () => {
        const pcm = new Float32Array(SAMPLE_RATE * 2);
        pcm.set(tone(1, 0.05), 0);
        pcm.set(tone(1, 1), SAMPLE_RATE);
        const first = applyAgc(pcm, SAMPLE_RATE, settings);
        // The gain from the quiet part is still high when the loud part starts, so the output exceeds full scale.
        expect(peakOfTail(first.subarray(0, SAMPLE_RATE + 2000), 0.02)).toBeGreaterThan(1);
        expect(applyAgc(pcm.slice(), SAMPLE_RATE, settings)).toEqual(first);
    });
});
