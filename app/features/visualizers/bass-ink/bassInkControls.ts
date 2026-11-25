import type { ControlDefinition, ControlValues } from '~/components/ControlPanel/controls';

export const bassInkControls = [
    {
        section: 'Response',
        key: 'intensity',
        label: 'Flash intensity',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.7,
    },
    {
        section: 'Response',
        key: 'turbulence',
        label: 'Turbulence',
        type: 'range',
        min: 0,
        max: 2,
        step: 0.05,
        default: 1,
    },
    { section: 'Look', key: 'density', label: 'Density', type: 'range', min: 0.25, max: 1.5, step: 0.05, default: 0.8 },
    {
        section: 'Look',
        key: 'cameraDrift',
        label: 'Camera drift',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.3,
    },
    // Palette 0's core, the midpoint of its core and edge (in linear light) and its edge, as sRGB hex. A unit test checks
    // them against writePalette(0). The brightness of a picked color is the user's choice: the picker replaces the
    // pitch-driven palette, so a very dark color makes a dark cloud.
    { section: 'Colors', key: 'colorA', label: 'Color A', type: 'color', default: '#f79696' },
    { section: 'Colors', key: 'colorB', label: 'Color B', type: 'color', default: '#c47b6e' },
    { section: 'Colors', key: 'colorC', label: 'Color C', type: 'color', default: '#765615' },
    {
        section: 'Colors',
        key: 'colorSpeed',
        label: 'Color speed (0 = static)',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.2,
    },
] as const satisfies readonly ControlDefinition[];

export type BassInkControlValues = ControlValues<typeof bassInkControls>;
