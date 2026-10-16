import { describe, expect, it } from 'vitest';
import { Fft, createHannWindow } from './fft';
import { createRandom } from './testSignals';

// Reference O(n^2) discrete Fourier transform in double precision.
function naiveDft(re: Float64Array, im: Float64Array): { re: Float64Array; im: Float64Array } {
    const n = re.length;
    const outRe = new Float64Array(n);
    const outIm = new Float64Array(n);
    for (let k = 0; k < n; k++) {
        for (let t = 0; t < n; t++) {
            const angle = (-2 * Math.PI * k * t) / n;
            outRe[k] += re[t] * Math.cos(angle) - im[t] * Math.sin(angle);
            outIm[k] += re[t] * Math.sin(angle) + im[t] * Math.cos(angle);
        }
    }
    return { re: outRe, im: outIm };
}

describe('Fft', () => {
    it.each([2, 8, 64, 256, 1024])('matches a naive DFT on random complex input (size %i)', size => {
        const random = createRandom(size);
        const re = new Float32Array(size);
        const im = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            re[i] = random() * 2 - 1;
            im[i] = random() * 2 - 1;
        }
        const expected = naiveDft(Float64Array.from(re), Float64Array.from(im));
        new Fft(size).forward(re, im);
        // Float32 storage limits the accuracy, so the tolerance scales with the transform size.
        const tolerance = 1e-4 * Math.sqrt(size);
        for (let k = 0; k < size; k++) {
            expect(Math.abs(re[k] - expected.re[k])).toBeLessThan(tolerance);
            expect(Math.abs(im[k] - expected.im[k])).toBeLessThan(tolerance);
        }
    });

    it('puts a pure cosine into exactly its bin', () => {
        const size = 256;
        const bin = 17;
        const re = new Float32Array(size);
        const im = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            re[i] = Math.cos((2 * Math.PI * bin * i) / size);
        }
        new Fft(size).forward(re, im);
        expect(Math.hypot(re[bin], im[bin])).toBeCloseTo(size / 2, 2);
        expect(Math.hypot(re[bin + 3], im[bin + 3])).toBeLessThan(1e-2);
    });

    it('can be reused for several transforms', () => {
        const fft = new Fft(16);
        const first = new Float32Array(16).fill(1);
        fft.forward(first, new Float32Array(16));
        const second = new Float32Array(16).fill(1);
        fft.forward(second, new Float32Array(16));
        expect(Array.from(second)).toEqual(Array.from(first));
    });

    it.each([0, 1, 3, 100, 1000, 1023])('throws for the unsupported size %i', size => {
        expect(() => new Fft(size)).toThrow(/power of two/);
    });
});

describe('createHannWindow', () => {
    const size = 1024;
    const window = createHannWindow(size);

    it('starts at zero and peaks at one in the middle', () => {
        expect(window[0]).toBeCloseTo(0, 6);
        expect(window[size / 2]).toBeCloseTo(1, 6);
    });

    it('is symmetric about the middle (periodic form: w[i] equals w[size - i])', () => {
        for (let i = 1; i < size / 2; i++) {
            expect(window[i]).toBeCloseTo(window[size - i], 5);
        }
    });

    it('rises monotonically to the peak', () => {
        for (let i = 1; i <= size / 2; i++) {
            expect(window[i]).toBeGreaterThanOrEqual(window[i - 1]);
        }
    });

    it('sums to size / 2, which the onset extractor relies on for its magnitude scale', () => {
        let sum = 0;
        for (const value of window) {
            sum += value;
        }
        expect(sum).toBeCloseTo(size / 2, 3);
    });
});
