import type { ControlDefinition, ControlValues } from "~/components/ControlPanel/controls";

export const cubesControls = [
    { section: 'Response', key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.1, max: 2, step: 0.05, default: 0.6 },
    { section: 'Response', key: 'threshold', label: 'Noise gate', type: 'range', min: 0, max: 0.7, step: 0.01, default: 0.3 },
    { section: 'Response', key: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.05, default: 0.85 },
    { section: 'Look', key: 'depth', label: 'Depth', type: 'range', min: 1, max: 12, step: 0.5, default: 1 },
    { section: 'Look', key: 'spin', label: 'Spin speed', type: 'range', min: 0, max: 0.1, step: 0.005, default: 0.05 },
    { section: 'Look', key: 'color', label: 'Background cubes', type: 'color', default: '#cc0000' },
    { section: 'Look', key: 'raisedColor', label: 'Raised cubes', type: 'color', default: '#893001' },
    { section: 'Look', key: 'bassBump', label: 'Bass bump', type: 'checkbox', default: true },
    // TODO: Add support for conditional controls
    // { section: 'Look', key: 'bgPulse', label: 'Bump intensity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, shownWhen: 'bassBump' },
] as const satisfies readonly ControlDefinition[];

export type CubesControlValues = ControlValues<typeof cubesControls>;