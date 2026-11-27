import { describe, expect, it } from 'vitest';
import { defaultValues, groupBySection } from '~/components/ControlPanel/controls';
import { cubesControls, cubesEnhancedControls } from './cubesControls';

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

describe('cubesEnhancedControls', () => {
    it('is today panel plus an Enhanced section of Glow, Particles and Camera motion', () => {
        expect(cubesEnhancedControls.slice(0, cubesControls.length)).toEqual(cubesControls);
        expect(groupBySection(cubesEnhancedControls).map((section) => section.name)).toEqual([
            'Response',
            'Look',
            'Enhanced',
        ]);
        const added = cubesEnhancedControls.slice(cubesControls.length);
        expect(added.map((control) => [control.key, control.label, control.default])).toEqual([
            ['glow', 'Glow', 0.6],
            ['particles', 'Particles', 0.6],
            ['cameraMotion', 'Camera motion', 0.5],
        ]);
    });

    it('has unique keys and defaults inside the 0..1 range for the added controls', () => {
        const keys = cubesEnhancedControls.map((control) => control.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const control of cubesEnhancedControls.slice(cubesControls.length)) {
            expect(control).toMatchObject({ type: 'range', min: 0, max: 1, step: 0.05 });
        }
    });
});
