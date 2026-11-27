import { describe, expect, it, vi } from 'vitest';
import {
    balanceGain,
    type BandEdges,
    type BandLevels,
    blur,
    createBandLevelState,
    createKernel,
    readBandLevels,
    sampleLogSpectrum,
    stepPeak,
} from './bandLevels';

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

describe('stepPeak', () => {
    it('jumps up to a louder frame at once', () => {
        expect(stepPeak(200, 100, 0.99)).toBe(200);
    });

    it('decays the previous peak when the frame is quieter', () => {
        expect(stepPeak(10, 100, 0.9)).toBe(90);
    });
});

describe('balanceGain', () => {
    it('maps the peak to the target', () => {
        expect(balanceGain(100, 200, 60)).toBe(2);
    });

    it('does not boost beyond the floor', () => {
        expect(balanceGain(6, 200, 60)).toBeCloseTo(200 / 60, 10);
    });
});

describe('readBandLevels', () => {
    const edges: BandEdges = { bassLow: 25, bassHigh: 140, midsHigh: 4000, highsHigh: 16000 };
    // 48 kHz with a 2048-point window: 1024 bins of 23.4375 Hz.
    const binHz = 48000 / 2048;
    const columns = 32;

    function read(spectrum: Uint8Array, bandEdges: BandEdges = edges, hz = binHz): BandLevels {
        const out: BandLevels = { bass: -1, mids: -1, highs: -1, combined: -1 };
        readBandLevels(spectrum, hz, bandEdges, createBandLevelState(columns), out);
        return out;
    }

    // A spectrum that is `level` between `fromHz` and `toHz` and silent elsewhere.
    function spectrumWith(level: number, fromHz: number, toHz: number): Uint8Array {
        const spectrum = new Uint8Array(1024);
        for (let bin = 0; bin < spectrum.length; bin++) {
            const hz = bin * binHz;
            if (hz >= fromHz && hz <= toHz) {
                spectrum[bin] = level;
            }
        }
        return spectrum;
    }

    it('reads silence as 0 in every band', () => {
        expect(read(new Uint8Array(1024))).toEqual({ bass: 0, mids: 0, highs: 0, combined: 0 });
    });

    it('reads a full-scale spectrum as about 1 in every band', () => {
        const levels = read(new Uint8Array(1024).fill(255));
        expect(levels.bass).toBeCloseTo(1, 4);
        expect(levels.mids).toBeCloseTo(1, 4);
        expect(levels.highs).toBeCloseTo(1, 4);
        expect(levels.combined).toBeCloseTo(1, 4);
    });

    it('raises the bass and not the highs for energy in the bass range only', () => {
        const levels = read(spectrumWith(255, 20, 200));
        expect(levels.bass).toBeGreaterThan(0.3);
        expect(levels.highs).toBe(0);
    });

    it('raises the highs and not the bass for energy in the highs range only', () => {
        const levels = read(spectrumWith(255, 5000, 15000));
        expect(levels.highs).toBeGreaterThan(0.3);
        expect(levels.bass).toBe(0);
    });

    it('makes combined the mean of the three bands', () => {
        const spectrum = new Uint8Array(1024);
        spectrum.forEach((_, bin) => (spectrum[bin] = (bin * 37) % 256));
        const levels = read(spectrum);
        expect(levels.combined).toBeCloseTo((levels.bass + levels.mids + levels.highs) / 3, 10);
        expect(levels.combined).toBeGreaterThan(0);
    });

    it('never decreases as a band gets louder', () => {
        let previous = -1;
        for (const level of [0, 30, 90, 160, 255]) {
            const { bass, combined } = read(spectrumWith(level, 20, 200));
            expect(bass).toBeGreaterThanOrEqual(previous);
            expect(combined).toBeGreaterThanOrEqual(0);
            previous = bass;
        }
        expect(previous).toBeGreaterThan(0);
    });

    it('overwrites every field of the output', () => {
        const levels = read(new Uint8Array(1024));
        expect(Object.values(levels).every((value) => value === 0)).toBe(true);
    });

    it('allocates no typed arrays while reading', () => {
        const state = createBandLevelState(columns);
        const out: BandLevels = { bass: 0, mids: 0, highs: 0, combined: 0 };
        const spectrum = new Uint8Array(1024).fill(100);
        const columnsBuffer = state.columns;
        const blurredBuffer = state.blurred;
        const created = vi.fn();
        const Original = Float32Array;
        vi.stubGlobal(
            'Float32Array',
            new Proxy(Original, {
                construct(target, args, newTarget) {
                    created();
                    return Reflect.construct(target, args, newTarget);
                },
            }),
        );
        try {
            readBandLevels(spectrum, binHz, edges, state, out);
            readBandLevels(spectrum, binHz, edges, state, out);
        } finally {
            vi.unstubAllGlobals();
        }
        expect(created).not.toHaveBeenCalled();
        expect(state.columns).toBe(columnsBuffer);
        expect(state.blurred).toBe(blurredBuffer);
        expect(out.bass).toBeGreaterThan(0);
    });

    it('writes zeros for an empty spectrum', () => {
        expect(read(new Uint8Array(0))).toEqual({ bass: 0, mids: 0, highs: 0, combined: 0 });
    });

    it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('writes zeros for binHz %s', (hz) => {
        expect(read(new Uint8Array(1024).fill(255), edges, hz)).toEqual({ bass: 0, mids: 0, highs: 0, combined: 0 });
    });

    it('writes zeros for a band whose edges are not finite or not increasing', () => {
        const loud = new Uint8Array(1024).fill(255);
        expect(read(loud, { ...edges, bassLow: Number.NaN }).bass).toBe(0);
        expect(read(loud, { ...edges, highsHigh: Number.POSITIVE_INFINITY }).highs).toBe(0);
        expect(read(loud, { ...edges, bassHigh: 20 }).bass).toBe(0);
        expect(read(loud, { ...edges, bassLow: 0 }).bass).toBe(0);
    });

    it('keeps a tiny column count usable', () => {
        const out: BandLevels = { bass: 0, mids: 0, highs: 0, combined: 0 };
        readBandLevels(new Uint8Array(1024).fill(255), binHz, edges, createBandLevelState(1), out);
        expect(out).toEqual({ bass: 0, mids: 0, highs: 0, combined: 0 });
    });
});
