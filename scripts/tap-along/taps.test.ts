import { describe, expect, it } from 'vitest';
import { applyOffset, cleanTaps } from './taps';

describe('cleanTaps', () => {
    it('sorts, drops invalid times and double hits', () => {
        expect(cleanTaps([2, 0.5, NaN, -1, 0.55, 1, 1.05, 1.2])).toEqual([0.5, 1, 1.2, 2]);
    });

    it('keeps the first of a run of close taps and honors the gap argument', () => {
        expect(cleanTaps([1, 1.1, 1.2], 0.15)).toEqual([1, 1.2]);
        expect(cleanTaps([])).toEqual([]);
    });
});

describe('applyOffset', () => {
    it('subtracts a lag and adds back a lead', () => {
        expect(applyOffset([1, 2], 50)).toEqual([0.95, 1.95]);
        expect(applyOffset([1], -100)[0]).toBeCloseTo(1.1);
    });

    it('drops times pushed before the start', () => {
        expect(applyOffset([0.01, 1], 50)).toEqual([0.95]);
    });
});
