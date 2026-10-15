import type { ControlDefinition, ControlValues } from "~/components/ControlPanel/controls";

export const colorWaveControls = [
    // Heights
    { section: 'Heights', key: 'masterHeight', label: 'Overall height', type: 'range', min: 0.2, max: 4, step: 0.1, default: 1 },
    { section: 'Heights', key: 'heightGrowth', label: 'Growth per sheet', type: 'range', min: 1, max: 4, step: 0.1, default: 1.5 },
    { section: 'Heights', key: 'highsHeight', label: 'Highs height', type: 'range', min: 0, max: 12, step: 0.1, default: 1 },
    { section: 'Heights', key: 'midsHeight', label: 'Mids height', type: 'range', min: 0, max: 12, step: 0.1, default: 1.3 },
    { section: 'Heights', key: 'bassHeight', label: 'Bass height', type: 'range', min: 0, max: 12, step: 0.1, default: 1 },
    // Which frequencies each sheet shows
    { section: 'Frequency ranges', key: 'bassLow', label: 'Lowest note (Hz)', type: 'range', min: 20, max: 60, step: 5, default: 25 },
    { section: 'Frequency ranges', key: 'bassHigh', label: 'Bass / mids split (Hz)', type: 'range', min: 60, max: 500, step: 10, default: 140 },
    { section: 'Frequency ranges', key: 'midsHigh', label: 'Mids / highs split (Hz)', type: 'range', min: 1500, max: 8000, step: 100, default: 4000 },
    { section: 'Frequency ranges', key: 'highsHigh', label: 'Highest note (Hz)', type: 'range', min: 8000, max: 20000, step: 500, default: 16000 },
    // How the bars move
    { section: 'Motion', key: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.05, default: 0.5 },
    { section: 'Motion', key: 'fall', label: 'Fall speed', type: 'range', min: 1, max: 30, step: 1, default: 8 },
    // Where the sheets sit on screen
    { section: 'Position', key: 'moveX', label: 'Move left / right', type: 'range', min: -1500, max: 1500, step: 10, default: 0 },
    { section: 'Position', key: 'moveY', label: 'Move down / up', type: 'range', min: -300, max: 300, step: 5, default: 0 },
] as const satisfies readonly ControlDefinition[];

export type ColorWaveControlValues = ControlValues<typeof colorWaveControls>;