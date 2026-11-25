import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultValues, groupBySection } from '~/components/ControlPanel/controls';
import { bassInkControls } from './bassInkControls';
import type { PalettePair } from './bassInkTypes';
import { writePalette } from './chromaPalette';

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

    it('defaults the colors to palette 0 core, the midpoint and the edge', () => {
        const palette: PalettePair = { core: new Float32Array(3), edge: new Float32Array(3) };
        writePalette(0, palette);
        const hex = (r: number, g: number, b: number) =>
            '#' + new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace).getHexString();
        const defaults = defaultValues(bassInkControls);
        expect(defaults.colorA).toBe(hex(palette.core[0], palette.core[1], palette.core[2]));
        expect(defaults.colorC).toBe(hex(palette.edge[0], palette.edge[1], palette.edge[2]));
        expect(defaults.colorB).toBe(
            hex(
                (palette.core[0] + palette.edge[0]) / 2,
                (palette.core[1] + palette.edge[1]) / 2,
                (palette.core[2] + palette.edge[2]) / 2,
            ),
        );
    });
});
