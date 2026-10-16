import { describe, expect, it } from 'vitest';
import { defaultValues, groupBySection } from '~/components/ControlPanel/controls';
import { cubesControls } from './cubesControls';

describe('cubesControls', () => {
    it('has unique keys', () => {
        const keys = cubesControls.map((control) => control.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('keeps every range default inside its bounds, on a positive step', () => {
        for (const control of cubesControls) {
            if (control.type !== 'range') continue;
            expect(control.min).toBeLessThan(control.max);
            expect(control.step).toBeGreaterThan(0);
            expect(control.default).toBeGreaterThanOrEqual(control.min);
            expect(control.default).toBeLessThanOrEqual(control.max);
        }
    });

    it('uses #rrggbb defaults for colour controls', () => {
        const colors = cubesControls.filter((control) => control.type === 'color');
        expect(colors.length).toBeGreaterThan(0);
        for (const control of colors) {
            expect(control.default).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });

    it('only depends on a checkbox control that exists', () => {
        for (const control of cubesControls) {
            if (!('shownWhen' in control)) continue;
            const controller = cubesControls.find((other) => other.key === control.shownWhen);
            expect(controller?.type).toBe('checkbox');
        }
    });

    it('produces a default value for every control and groups them into sections', () => {
        expect(Object.keys(defaultValues(cubesControls))).toHaveLength(cubesControls.length);
        expect(groupBySection(cubesControls).map((section) => section.name)).toEqual(['Response', 'Look']);
    });
});
