import { describe, expect, it } from 'vitest';
import { blur, createKernel, sampleLogSpectrum } from './spectrum';

describe('createKernel', () => {
    it('is symmetric, peaks in the middle and sums to 1', () => {
        const kernel = createKernel(2);
        const middle = (kernel.length - 1) / 2;
        expect(kernel.length % 2).toBe(1);
        expect(kernel[middle]).toBe(Math.max(...kernel));
        for (let i = 0; i < middle; i++) {
            expect(kernel[i]).toBeCloseTo(kernel[kernel.length - 1 - i], 6);
        }
        expect(kernel.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5);
    });

    it('reaches three standard deviations on each side', () => {
        expect(createKernel(2).length).toBe(13);
    });

    it('never has a radius below 1, even for a tiny sigma', () => {
        expect(createKernel(0.1).length).toBe(3);
    });
});

describe('blur', () => {
    it('leaves a constant signal unchanged, including at the edges (edge values repeat)', () => {
        const values = new Float32Array(8).fill(5);
        const out = new Float32Array(8);
        blur(values, createKernel(1.5), out);
        out.forEach((value) => expect(value).toBeCloseTo(5, 4));
    });

    it('spreads a spike over its neighbours while keeping the total', () => {
        const values = new Float32Array(21);
        values[10] = 1;
        const out = new Float32Array(21);
        blur(values, createKernel(1.5), out);
        expect(out[10]).toBeLessThan(1);
        expect(out[9]).toBeGreaterThan(0);
        expect(out[9]).toBeCloseTo(out[11], 6);
        expect(out.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 4);
    });

    it('clamps to the edge values instead of reading outside the array', () => {
        const values = Float32Array.from([10, 0, 0, 0]);
        const out = new Float32Array(4);
        blur(values, Float32Array.from([1 / 3, 1 / 3, 1 / 3]), out);
        // Column 0 sees [edge 10, 10, 0].
        expect(out[0]).toBeCloseTo(20 / 3, 5);
        // The last column sees [0, 0, edge 0].
        expect(out[3]).toBe(0);
    });
});

describe('sampleLogSpectrum', () => {
    it('samples the endpoints at lowHz and highHz', () => {
        const spectrum = new Uint8Array(100);
        for (let i = 0; i < spectrum.length; i++) spectrum[i] = i;
        const out = new Float32Array(3);
        sampleLogSpectrum(spectrum, 10, 20, 640, out);
        // 20 Hz is bin 2; 640 Hz is bin 64; the middle is the geometric mean, 113.1 Hz -> bin 11.31.
        expect(out[0]).toBeCloseTo(2, 4);
        expect(out[1]).toBeCloseTo(11.3137, 3);
        expect(out[2]).toBeCloseTo(64, 4);
    });

    it('interpolates between neighbouring bins', () => {
        const spectrum = Uint8Array.from([0, 100, 200]);
        const out = new Float32Array(2);
        // Bin positions 0.5 and 1.5.
        sampleLogSpectrum(spectrum, 10, 5, 15, out);
        expect(out[0]).toBeCloseTo(50, 3);
        expect(out[1]).toBeCloseTo(150, 3);
    });

    it('clamps to the last bin when the requested frequency is beyond the spectrum', () => {
        const spectrum = Uint8Array.from([10, 20, 30]);
        const out = new Float32Array(2);
        sampleLogSpectrum(spectrum, 1, 1, 1000, out);
        expect(out[1]).toBe(30);
    });
});
