import { describe, expect, it } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { trioColorWaveControls } from './trioColorWaveControls';
import { trioAllControls, trioLookControls } from './trioLookControls';

describe('trioLookControls', () => {
    it('holds the four Look sliders with their ranges', () => {
        expect(trioLookControls.map(({ key, min, max }) => [key, min, max])).toEqual([
            ['glowStrength', 0, 3],
            ['accentIntensity', 0, 1],
            ['depth', 0, 1],
            ['dust', 0, 1],
        ]);
        expect(new Set(trioLookControls.map(({ section }) => section))).toEqual(new Set(['Look']));
        for (const control of trioLookControls) {
            expect(control.default).toBeGreaterThanOrEqual(control.min);
            expect(control.default).toBeLessThanOrEqual(control.max);
        }
    });

    it('shares no key with the standard controls, which come first and unchanged', () => {
        const standardKeys = new Set<string>(trioColorWaveControls.map(({ key }) => key));
        expect(trioLookControls.some(({ key }) => standardKeys.has(key))).toBe(false);
        expect(trioAllControls.slice(0, trioColorWaveControls.length)).toEqual([...trioColorWaveControls]);
        expect(defaultValues(trioAllControls)).toEqual({
            ...defaultValues(trioColorWaveControls),
            ...defaultValues(trioLookControls),
        });
    });
});
