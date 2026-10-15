import { useId } from 'react';
import { useAudio } from '../audioEngineContext';
import type { NormalizeSettings as NormalizeOptions } from '../types';
import { useNormalizeOptions } from '../useAudioState';
import { smallOutlineButton } from './buttonStyles';

interface NormalizeSlider {
    key: keyof NormalizeOptions;
    label: string;
    help: string;
    min: number;
    max: number;
    step: number;
    unit: string;
}

const SLIDERS: readonly NormalizeSlider[] = [
    {
        key: 'targetPeak', label: 'Target level', min: 0.2, max: 1, step: 0.05, unit: '',
        help: 'How loud the audio is scaled to. Higher makes the visualization bigger overall.'
    },
    {
        key: 'maxGain', label: 'Maximum boost', min: 1, max: 32, step: 1, unit: 'x',
        help: 'Upper limit on amplification. Lower it if quiet sources get too noisy.'
    },
    {
        key: 'peakHold', label: 'Peak memory', min: 0.5, max: 10, step: 0.5, unit: ' s',
        help: 'How long a loud moment keeps the volume turned down. Longer is steadier; shorter reacts faster.'
    },
    {
        key: 'releaseTime', label: 'Recovery time', min: 0.05, max: 2, step: 0.05, unit: ' s',
        help: 'How quickly the volume comes back up after quiet passages. Shorter can sound pumpy.'
    },
    {
        key: 'noiseFloor', label: 'Noise floor', min: 0, max: 0.05, step: 0.001, unit: '',
        help: 'Input quieter than this counts as silence and is not boosted.'
    },
];

// Tuning for the automatic gain control, saved by the engine.
export function NormalizeSettings() {
    const engine = useAudio();
    const options = useNormalizeOptions();
    const idPrefix = useId();

    return (
        <details className="mb-3">
            <summary className="cursor-pointer text-sm">Normalization settings</summary>
            <div className="pt-2">
                {SLIDERS.map(slider => {
                    const id = `${idPrefix}-${slider.key}`;
                    return (
                        <div key={slider.key} className="mb-2">
                            <div className="flex justify-between text-sm">
                                <label htmlFor={id}>{slider.label}</label>
                                <span>{options[slider.key]}{slider.unit}</span>
                            </div>
                            <input
                                id={id}
                                type="range"
                                className="w-full accent-blue-500"
                                min={slider.min}
                                max={slider.max}
                                step={slider.step}
                                value={options[slider.key]}
                                onChange={event => engine.updateNormalizeOptions({ [slider.key]: Number(event.currentTarget.value) })}
                            />
                            <div className="text-sm text-gray-400">{slider.help}</div>
                        </div>
                    );
                })}
                <button type="button" className={smallOutlineButton} onClick={() => engine.resetNormalizeOptions()}>
                    Reset to defaults
                </button>
            </div>
        </details>
    );
}