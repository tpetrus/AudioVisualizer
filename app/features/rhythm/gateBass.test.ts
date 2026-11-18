import { describe, expect, it } from 'vitest';
import { GateBassFeature } from './gateBass';
import { GATE_BASS_WINDOW } from './rhythmConfig';

const SAMPLE_RATE = 48000;

function sine(hz: number, seconds: number, amplitude = 1): Float32Array {
    return Float32Array.from({ length: Math.round(seconds * SAMPLE_RATE) }, (_, i) =>
        Math.fround(amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE)),
    );
}

function levelAfter(signal: Float32Array): number {
    const feature = new GateBassFeature(SAMPLE_RATE);
    feature.push(signal);
    return feature.levelAt(signal.length);
}

describe('GateBassFeature', () => {
    it('passes bass at its RMS times the stages gain and stops what lies above the cutoff', () => {
        // A sine's RMS is its amplitude over sqrt 2. A BiquadFilterNode reads Q in dB, so BassPulse's Q of 0.707 is a
        // linear Q of 10^(0.707 / 20), a little resonant: at half the cutoff each stage gains
        // 1 / sqrt((1 - r^2)^2 + (r / Q)^2) with r = 0.5, about 1.14, so the bass reads that much louder, as it did.
        const q = Math.pow(10, Math.SQRT1_2 / 20);
        const stage = 1 / Math.sqrt((1 - 0.25) ** 2 + (0.5 / q) ** 2);
        expect(levelAfter(sine(60, 1, 0.5))).toBeCloseTo(0.5 * Math.SQRT1_2 * stage * stage, 2);
        // Five octaves above the cutoff, 24 dB per octave leaves almost nothing.
        expect(levelAfter(sine(4000, 1, 0.5))).toBeLessThan(1e-4);
    });

    it('reads 0 for silence and counts samples before the start as silence', () => {
        const feature = new GateBassFeature(SAMPLE_RATE);
        feature.push(new Float32Array(4096));
        expect(feature.levelAt(4096)).toBe(0);
        const short = new GateBassFeature(SAMPLE_RATE);
        short.push(sine(60, GATE_BASS_WINDOW / SAMPLE_RATE, 0.5));
        // A window that only half lies after the start is the half's energy over the whole window.
        const half = short.levelAt(GATE_BASS_WINDOW / 2);
        const full = short.levelAt(GATE_BASS_WINDOW);
        expect(half).toBeLessThan(full);
        expect(short.levelAt(0)).toBe(0);
    });

    it('reads a window that ends inside the pushed samples, not only at the newest one', () => {
        const feature = new GateBassFeature(SAMPLE_RATE);
        const tone = sine(60, 0.5, 0.5);
        const signal = new Float32Array(tone.length + 4800);
        signal.set(tone);
        feature.push(signal);
        // The window that ends with the tone hears it; the one that ends after 100 ms of silence does not.
        expect(feature.levelAt(tone.length)).toBeGreaterThan(0.3);
        expect(feature.levelAt(signal.length)).toBeLessThan(0.01);
    });

    it('clamps a read beyond what it holds instead of throwing on the audio thread', () => {
        const feature = new GateBassFeature(SAMPLE_RATE);
        feature.push(sine(60, 1, 0.5));
        const newest = feature.levelAt(SAMPLE_RATE);
        expect(feature.levelAt(SAMPLE_RATE + 500)).toBe(newest);
        // Older than the ring keeps: only the held part of the window counts, so it reads less than a full window.
        expect(feature.levelAt(SAMPLE_RATE - 8000)).toBeLessThan(newest);
        expect(feature.levelAt(-10)).toBe(0);
    });

    it('starts over on reset, forgetting the filter state and the old window', () => {
        const feature = new GateBassFeature(SAMPLE_RATE);
        feature.push(sine(60, 1, 0.5));
        feature.reset();
        feature.push(new Float32Array(GATE_BASS_WINDOW));
        expect(feature.levelAt(GATE_BASS_WINDOW)).toBe(0);
        const fresh = new GateBassFeature(SAMPLE_RATE);
        const tone = sine(80, 0.2, 0.4);
        fresh.push(tone);
        feature.reset();
        feature.push(tone);
        expect(feature.levelAt(tone.length)).toBe(fresh.levelAt(tone.length));
    });

    it('treats any block size the same', () => {
        const tone = sine(70, 0.5, 0.4);
        const whole = new GateBassFeature(SAMPLE_RATE);
        whole.push(tone);
        const blocks = new GateBassFeature(SAMPLE_RATE);
        for (let offset = 0; offset < tone.length; offset += 128) blocks.push(tone.subarray(offset, offset + 128));
        expect(blocks.levelAt(tone.length)).toBe(whole.levelAt(tone.length));
    });
});
