import { describe, expect, it } from 'vitest';
import { formatOnsetRates, onsetRates } from './onsetRates';

const onsets = {
    kick: [0, 1, 2, 3],
    bass: [0.02, 1.5],
    snare: [],
    highs: [0.5, 0.52, 3.9],
};

describe('onsetRates', () => {
    it('counts events per beat between the first and last beat and the beats with an onset nearby', () => {
        const rates = onsetRates([0, 1, 2, 3], onsets);
        expect(rates.perBeat).toEqual({ kick: 4 / 3, bass: 2 / 3, snare: 0, highs: 2 / 3 });
        expect(rates.coverage).toBe(1);
        expect(rates.beatCount).toBe(4);
    });

    it('does not count an onset outside the tolerance', () => {
        expect(onsetRates([0.2, 1.2], onsets).coverage).toBe(0);
    });

    it('drops the beats after the cap', () => {
        const rates = onsetRates([0, 1, 2, 3], onsets, 2);
        expect(rates.beatCount).toBe(3);
        expect(rates.perBeat.kick).toBe(3 / 2);
    });

    it('is NaN without beats', () => {
        expect(onsetRates([], onsets).coverage).toBeNaN();
    });

    it('formats two lines', () => {
        expect(formatOnsetRates(onsetRates([], onsets))).toEqual([
            '  onset events per beat kick 1.00, bass 0.00, snare 0.00, highs 0.00',
            '  beats with an onset within 50 ms n/a (0 beats)',
        ]);
    });
});
