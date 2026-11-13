import { describe, expect, it } from 'vitest';
import { calibrate, medianIntervalBpm, parseCalibration } from './calibration';

const beats = Array.from({ length: 10 }, (_, i) => 1 + i * 0.5);

describe('calibrate', () => {
    it('measures a constant lag with zero spread', () => {
        const result = calibrate(
            beats.map((beat) => beat + 0.05),
            beats,
            'click.wav',
        );
        expect(result.offsetMs).toBeCloseTo(50);
        expect(result.noiseFloorMs).toBeCloseTo(0);
        expect(result).toMatchObject({ taps: 10, track: 'click.wav' });
    });

    it('reports a negative offset for early taps and a spread for scatter', () => {
        const taps = beats.map((beat, i) => beat - 0.03 + (i % 2 ? 0.01 : -0.01));
        const result = calibrate(taps, beats, 'c.wav');
        expect(result.offsetMs).toBeLessThan(-25);
        expect(result.noiseFloorMs).toBeGreaterThan(5);
    });

    it('needs enough taps and some beats', () => {
        expect(() => calibrate([1, 2], beats, 'c')).toThrow(/at least/);
        expect(() => calibrate(beats, [], 'c')).toThrow(/no beats/);
    });
});

describe('parseCalibration', () => {
    it('round-trips and fills optional fields', () => {
        expect(parseCalibration('{"offsetMs":12,"noiseFloorMs":9,"taps":4,"track":"a"}')).toEqual({
            offsetMs: 12,
            noiseFloorMs: 9,
            taps: 4,
            track: 'a',
        });
        expect(parseCalibration('{"offsetMs":1,"noiseFloorMs":2}')).toMatchObject({ taps: 0, track: '' });
    });

    it('rejects bad input', () => {
        expect(() => parseCalibration('nope')).toThrow(/not valid JSON/);
        expect(() => parseCalibration('null')).toThrow(/lacks/);
        expect(() => parseCalibration('{"offsetMs":"x"}')).toThrow(/lacks/);
    });
});

describe('medianIntervalBpm', () => {
    it('converts the median gap', () => {
        expect(medianIntervalBpm([0, 0.5, 1, 1.5, 3])).toBeCloseTo(120);
    });

    it('is undefined without a usable gap', () => {
        expect(medianIntervalBpm([1])).toBeUndefined();
        expect(medianIntervalBpm([1, 1])).toBeUndefined();
    });
});
