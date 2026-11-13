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
] as const satisfies readonly ControlDefinition[];

export type BassInkControlValues = ControlValues<typeof bassInkControls>;
