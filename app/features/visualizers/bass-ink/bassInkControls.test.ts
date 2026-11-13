import { describe, expect, it } from 'vitest';
import { defaultValues, groupBySection } from '~/components/ControlPanel/controls';
import { bassInkControls } from './bassInkControls';

describe('bassInkControls', () => {
    it('has unique keys', () => {
        const keys = bassInkControls.map((control) => control.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('keeps every range default inside its bounds, on a positive step', () => {
        for (const control of bassInkControls) {
            expect(control.min).toBeLessThan(control.max);
            expect(control.step).toBeGreaterThan(0);
            expect(control.default).toBeGreaterThanOrEqual(control.min);
            expect(control.default).toBeLessThanOrEqual(control.max);
        }
    });

    it('lets Flash intensity reach 0, which turns every global flash off', () => {
        const intensity = bassInkControls.find((control) => control.key === 'intensity');
        expect(intensity?.min).toBe(0);
    });

    it('produces a default value for every control and groups them into sections', () => {
        expect(Object.keys(defaultValues(bassInkControls))).toHaveLength(bassInkControls.length);
        expect(groupBySection(bassInkControls).map((section) => section.name)).toEqual(['Response', 'Look']);
    });
});
