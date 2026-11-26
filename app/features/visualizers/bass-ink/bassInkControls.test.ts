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
            if (control.type !== 'range') continue;
            expect(control.min).toBeLessThan(control.max);
            expect(control.step).toBeGreaterThan(0);
            expect(control.default).toBeGreaterThanOrEqual(control.min);
            expect(control.default).toBeLessThanOrEqual(control.max);
        }
    });

    it('lets Flash intensity reach 0, which turns every global flash off', () => {
        const intensity = bassInkControls.find((control) => control.key === 'intensity');
        expect(intensity).toMatchObject({ min: 0 });
    });

    it('produces a default value for every control and groups them into sections', () => {
        expect(Object.keys(defaultValues(bassInkControls))).toHaveLength(bassInkControls.length);
        expect(groupBySection(bassInkControls).map((section) => section.name)).toEqual(['Response', 'Look', 'Colors']);
    });

    it('keeps the four existing controls unchanged, ahead of the Colors section', () => {
        expect(bassInkControls.slice(0, 4).map((control) => [control.key, control.default])).toEqual([
            ['intensity', 0.7],
            ['turbulence', 1],
            ['density', 0.8],
            ['cameraDrift', 0.3],
        ]);
    });

    it('appends Trails and Glow at the end of the Look section, 0 to 1 and on by default', () => {
        const look = groupBySection(bassInkControls).find((section) => section.name === 'Look')!;
        expect(look.controls.slice(-2).map((control) => control.key)).toEqual(['trails', 'glow']);
        expect(look.controls.slice(-2)).toEqual([
            {
                section: 'Look',
                key: 'trails',
                label: 'Trails',
                type: 'range',
                min: 0,
                max: 1,
                step: 0.05,
                default: 0.4,
            },
            { section: 'Look', key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
        ]);
    });

    it('adds three color pickers and a bounded color speed with a small nonzero default', () => {
        const byKey = (key: string) => bassInkControls.find((control) => control.key === key);
        for (const key of ['colorA', 'colorB', 'colorC']) {
            const control = byKey(key);
            expect(control?.type).toBe('color');
            expect(control?.section).toBe('Colors');
            expect(control?.default).toMatch(/^#[0-9a-f]{6}$/);
        }
        const speed = byKey('colorSpeed');
        expect(speed).toMatchObject({ type: 'range', section: 'Colors', min: 0, max: 1, step: 0.05 });
        expect(Number(speed?.default)).toBeGreaterThan(0);
        expect(Number(speed?.default)).toBeLessThanOrEqual(0.5);
    });

    it('defaults the three colors to clearly different hues', () => {
        const defaults = defaultValues(bassInkControls);
        const hue = (hex: string) => {
            // Hue of the sRGB value itself, in degrees.
            const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
            const max = Math.max(r, g, b);
            const delta = max - Math.min(r, g, b);
            const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
            return (sector * 60 + 360) % 360;
        };
        const apart = (a: number, b: number) => {
            const gap = Math.abs(a - b) % 360;
            return Math.min(gap, 360 - gap);
        };
        const hues = [defaults.colorA, defaults.colorB, defaults.colorC].map((value) => hue(String(value)));
        expect(apart(hues[0], hues[1])).toBeGreaterThanOrEqual(60);
        expect(apart(hues[1], hues[2])).toBeGreaterThanOrEqual(60);
        expect(apart(hues[0], hues[2])).toBeGreaterThanOrEqual(60);
    });
});
