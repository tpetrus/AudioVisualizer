import { useId } from 'react';
import { Button, Switch } from '~/components/ui';
import { useAudio } from '../audioEngineContext';
import { useAnalyser, useNormalize } from '../useAudioState';
import { METER_INTERVAL_MS, useLevelMeter } from '../useLevelMeter';
import { NormalizeSettings } from './NormalizeSettings';
import { SilenceWarning } from './SilenceWarning';
import { SyncOffsetSetting } from './SyncOffsetSetting';

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
    const normalizeDescriptionId = useId();
    const clampedLevel = Math.min(Math.max(level, 0), 1);

    return (
        <>
            <div className="mb-2 text-sm">
                <span className="text-text-muted">Using:</span> {trackInfo || 'active source'}
            </div>

            <div
                role="meter"
                aria-label="Output level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(clampedLevel * 100)}
                className="mb-2 h-2 overflow-hidden rounded-ui bg-surface-2"
            >
                {/* A linear transition as long as the poll interval turns the 10 Hz steps into continuous motion
                    without a render per frame. */}
                <div
                    className={`h-full w-full origin-left motion-reduce:transition-none ${
                        silent ? 'bg-warning' : 'bg-success'
                    }`}
                    style={{
                        transform: `scaleX(${clampedLevel})`,
                        transitionProperty: 'transform',
                        transitionTimingFunction: 'linear',
                        transitionDuration: `${METER_INTERVAL_MS}ms`,
                    }}
                />
            </div>

            <div className="mb-3">
                <Switch
                    checked={normalize}
                    onCheckedChange={(checked) => engine.setNormalize(checked)}
                    label="Normalize volume"
                    aria-describedby={normalizeDescriptionId}
                />
                <div id={normalizeDescriptionId} className="mt-1 text-sm text-text-muted">
                    Automatically adjusts the gain so the visualization looks the same whether the audio is quiet or
                    loud.
                </div>
            </div>

            <NormalizeSettings />
            <SyncOffsetSetting />

            {silent && <SilenceWarning />}

            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onChooseSource}>
                    Choose a different source
                </Button>
                <Button variant="primary" onClick={onDone}>
                    Done
                </Button>
            </div>
        </>
    );
}
