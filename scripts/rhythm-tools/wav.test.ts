import { describe, expect, it } from 'vitest';
import { readWav, writeWav } from './wav';

describe('writeWav', () => {
    it('writes a mono 16-bit file that readWav reads back', () => {
        const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 0.25]);
        const buffer = writeWav(samples, 22050);
        expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
        expect(buffer.length).toBe(44 + samples.length * 2);
        const read = readWav(buffer);
        expect(read.sampleRate).toBe(22050);
        expect(read.samples.length).toBe(samples.length);
        samples.forEach((value, i) => expect(read.samples[i]).toBeCloseTo(value, 3));
    });

    it('clips samples beyond full scale', () => {
        const read = readWav(writeWav(Float32Array.from([2, -2]), 8000));
        expect(read.samples[0]).toBeCloseTo(1, 3);
        expect(read.samples[1]).toBeCloseTo(-1, 3);
    });
});
