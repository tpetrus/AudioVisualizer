import type { ControlDefinition, ControlValues } from '~/components/ControlPanel/controls';
import { trioColorWaveControls } from './trioColorWaveControls';

// The enhanced look's own controls. They are a separate table so the standard panel, its keys and its defaults stay
// exactly as they were: the page only shows this section while the enhanced look is running.
export const trioLookControls = [
    {
        section: 'Look',
        key: 'glowStrength',
        label: 'Glow',
        type: 'range',
        min: 0,
        max: 3,
        step: 0.05,
        default: 1,
    },
    {
        section: 'Look',
        key: 'accentIntensity',
        label: 'Beat accent',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.6,
    },
    {
        section: 'Look',
        key: 'depth',
        label: 'Depth haze',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.6,
    },
    {
        section: 'Look',
        key: 'dust',
        label: 'Dust',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5,
    },
] as const satisfies readonly ControlDefinition[];

export type TrioLookControlValues = ControlValues<typeof trioLookControls>;

// Every trio control, standard first. The page holds the values of this whole table, so Look values survive the look
// being switched off and on again; the panel is given only the standard table while the enhanced look is not running.
export const trioAllControls = [...trioColorWaveControls, ...trioLookControls] as const;

export type TrioAllControlValues = ControlValues<typeof trioAllControls>;
