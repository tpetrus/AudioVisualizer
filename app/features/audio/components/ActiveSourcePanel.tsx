import { useId } from 'react';
import { useAudio } from '../audioEngineContext';
import { useAnalyser, useNormalize } from '../useAudioState';
import { useLevelMeter } from '../useLevelMeter';
import { outlineButton, primaryButton } from './buttonStyles';
import { NormalizeSettings } from './NormalizeSettings';
import { SilenceWarning } from './SilenceWarning';

interface ActiveSourcePanelProps {
    onChooseSource: () => void;
    onDone: () => void;
}

// What's shown while a source is capturing: the live level, volume normalization and its settings.
export function ActiveSourcePanel({ onChooseSource, onDone }: ActiveSourcePanelProps) {
    const engine = useAudio();
    const analyser = useAnalyser();
    const normalize = useNormalize();
    const { level, silent, trackInfo } = useLevelMeter(analyser);
    const normalizeId = useId();

    return (
        <>
            <div className="mb-2 text-sm">
                <span className="text-gray-400">Using:</span> {trackInfo || 'active source'}
            </div>

            <div className="mb-2 h-2 overflow-hidden rounded bg-white/20">
                <div
                    className={`h-full ${silent ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(level, 1) * 100}%` }}
                />
            </div>

            <div className="mb-3">
                <input
                    id={normalizeId}
                    type="checkbox"
                    role="switch"
                    className="mr-2 h-4 w-4 align-middle accent-blue-500"
                    checked={normalize}
                    onChange={(event) => engine.setNormalize(event.currentTarget.checked)}
                />
                <label className="cursor-pointer" htmlFor={normalizeId}>
                    Normalize volume
                </label>
                <div className="text-sm text-gray-400">
                    Automatically adjusts the gain so the visualization looks the same whether the audio is quiet or
                    loud.
                </div>
            </div>

            <NormalizeSettings />

            {silent && <SilenceWarning />}

            <div className="flex justify-end gap-2">
                <button type="button" className={outlineButton} onClick={onChooseSource}>
                    Choose a different source
                </button>
                <button type="button" className={primaryButton} onClick={onDone}>
                    Done
                </button>
            </div>
        </>
    );
}
