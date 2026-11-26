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
    { section: 'Look', key: 'trails', label: 'Trails', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    { section: 'Look', key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    // Three clearly different, vivid hues that read well blended additively on black: hot pink (the core at rest), amber
    // and sky blue (the edge at rest). A unit test checks that they stay far apart in hue. The brightness of a picked
    // color is the user's choice: the picker replaces the pitch-driven palette, so a very dark color makes a dark cloud.
    { section: 'Colors', key: 'colorA', label: 'Color A', type: 'color', default: '#ff4fa3' },
    { section: 'Colors', key: 'colorB', label: 'Color B', type: 'color', default: '#ffb21e' },
    { section: 'Colors', key: 'colorC', label: 'Color C', type: 'color', default: '#3fc8ff' },
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
