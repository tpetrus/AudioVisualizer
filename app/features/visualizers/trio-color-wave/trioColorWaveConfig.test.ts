import { describe, expect, it } from 'vitest';
import { trioColorWaveControls } from './trioColorWaveControls';
import {
    BANDS,
    BACK_FALL_FACTOR,
    BACK_RISE_RATE,
    FLAG_DEPTH,
    FLAG_DISTANCE,
    PEAK_DECAY,
    PEAK_FLOOR,
    ROW_FALLOFF,
    SHEET_SPACING,
    TARGET_LEVEL,
} from './trioColorWaveConfig';

const controlKeys = new Set<string>(trioColorWaveControls.map((control) => control.key));

describe('BANDS', () => {
    it('lists the sheets front to back: highs, mids, bass', () => {
        expect(BANDS.map((band) => band.name)).toEqual(['Highs', 'Mids', 'Bass']);
    });

    it.each(BANDS.map((band) => [band.name, band] as const))('%s refers only to controls that exist', (_name, band) => {
        expect(controlKeys.has(band.lowKey)).toBe(true);
        expect(controlKeys.has(band.highKey)).toBe(true);
        expect(controlKeys.has(band.heightKey)).toBe(true);
    });

    it.each(BANDS.map((band) => [band.name, band] as const))(
        '%s uses a power-of-two window and valid ranges',
        (_name, band) => {
            expect(Math.log2(band.fftSize) % 1).toBe(0);
            expect(band.minSmoothing).toBeGreaterThanOrEqual(0);
            expect(band.minSmoothing).toBeLessThan(1);
            expect(band.blurColumns).toBeGreaterThan(0);
            expect(band.minDecibels).toBeLessThan(0);
            expect(band.startHue).toBeLessThanOrEqual(band.endHue);
        },
    );

    it('gives the bass the longest window and the most blur', () => {
        const [highs, mids, bass] = BANDS;
        expect(bass.fftSize).toBeGreaterThan(mids.fftSize);
        expect(mids.fftSize).toBeGreaterThan(highs.fftSize);
        expect(bass.blurColumns).toBeGreaterThan(mids.blurColumns);
    });

    it('chains each band to the next one up so the bands tile the spectrum', () => {
        const [highs, mids, bass] = BANDS;
        expect(bass.highKey).toBe(mids.lowKey);
        expect(mids.highKey).toBe(highs.lowKey);
    });
});

describe('layout and tuning constants', () => {
    it('spaces sheets far enough apart to hold all their rows', () => {
        expect(SHEET_SPACING).toBeGreaterThan(FLAG_DEPTH * FLAG_DISTANCE);
    });

    it('falls off from the farthest row (1) to the nearest (0.55)', () => {
        expect(ROW_FALLOFF).toHaveLength(FLAG_DEPTH);
        expect(ROW_FALLOFF[0]).toBe(1);
        expect(ROW_FALLOFF[FLAG_DEPTH - 1]).toBeCloseTo(0.55, 10);
        for (let row = 1; row < ROW_FALLOFF.length; row++) {
            expect(ROW_FALLOFF[row]).toBeLessThan(ROW_FALLOFF[row - 1]);
        }
    });

    it('keeps the rates and levels in their documented ranges', () => {
        expect(BACK_RISE_RATE).toBeGreaterThan(0);
        expect(BACK_RISE_RATE).toBeLessThan(1);
        expect(BACK_FALL_FACTOR).toBeGreaterThan(0);
        expect(BACK_FALL_FACTOR).toBeLessThan(1);
        expect(PEAK_DECAY).toBeLessThan(1);
        expect(PEAK_FLOOR).toBeLessThan(TARGET_LEVEL);
        expect(TARGET_LEVEL).toBeLessThanOrEqual(255);
    });
});
