import { describe, expect, it } from 'vitest';
import { defaultValues, groupBySection } from '~/components/ControlPanel/controls';
import { trioColorWaveControls } from './trioColorWaveControls';

describe('trioColorWaveControls', () => {
    it('has unique keys', () => {
        const keys = trioColorWaveControls.map(control => control.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('keeps every default inside its bounds, on a positive step', () => {
        for (const control of trioColorWaveControls) {
            expect(control.min).toBeLessThan(control.max);
            expect(control.step).toBeGreaterThan(0);
            expect(control.default).toBeGreaterThanOrEqual(control.min);
            expect(control.default).toBeLessThanOrEqual(control.max);
        }
    });

    it('keeps the frequency splits in ascending order at their defaults', () => {
        const values = defaultValues(trioColorWaveControls);
        expect(values.bassLow).toBeLessThan(values.bassHigh);
        expect(values.bassHigh).toBeLessThan(values.midsHigh);
        expect(values.midsHigh).toBeLessThan(values.highsHigh);
    });

    it('keeps the frequency ranges from overlapping at any slider position', () => {
        const range = (key: string) => {
            const control = trioColorWaveControls.find(candidate => candidate.key === key);
            if (!control) throw new Error(`missing control ${key}`);
            return control;
        };
        expect(range('bassLow').max).toBeLessThan(range('bassHigh').min + 1);
        expect(range('bassHigh').max).toBeLessThan(range('midsHigh').min);
        expect(range('midsHigh').max).toBeLessThanOrEqual(range('highsHigh').min);
    });

    it('groups into the documented sections in order', () => {
        expect(groupBySection(trioColorWaveControls).map(section => section.name))
            .toEqual(['Heights', 'Frequency ranges', 'Motion', 'Position']);
    });
});
