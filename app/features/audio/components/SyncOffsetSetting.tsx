import { useId } from 'react';
import { useAudio } from '../audioEngineContext';
import { DEFAULT_SYNC_OFFSET_MS, SYNC_OFFSET_MAX_MS, SYNC_OFFSET_MIN_MS, SYNC_OFFSET_STEP_MS } from '../timingModel';
import { useSyncOffset } from '../useAudioState';
import { smallOutlineButton } from './buttonStyles';

// The words next to the slider spell the direction out, because a bare signed number does not say which way it moves.
function describeOffset(valueMs: number): string {
    if (valueMs > 0) {
        return `${valueMs} ms later`;
    }
    if (valueMs < 0) {
        return `${-valueMs} ms earlier`;
    }
    return '0 ms';
}

// Lets the user line beat-driven visuals up with what they hear, saved by the engine.
export function SyncOffsetSetting() {
    const engine = useAudio();
    const offsetMs = useSyncOffset();
    const id = useId();

    return (
        <details className="mb-3">
            <summary className="cursor-pointer text-sm">Sync</summary>
            <div className="pt-2">
                <div className="flex justify-between text-sm">
                    <label htmlFor={id}>Visual timing</label>
                    <span>{describeOffset(offsetMs)}</span>
                </div>
                <input
                    id={id}
                    type="range"
                    className="w-full accent-blue-500"
                    min={SYNC_OFFSET_MIN_MS}
                    max={SYNC_OFFSET_MAX_MS}
                    step={SYNC_OFFSET_STEP_MS}
                    value={offsetMs}
                    aria-valuetext={describeOffset(offsetMs)}
                    onChange={(event) => engine.setSyncOffsetMs(Number(event.currentTarget.value))}
                />
                <div className="mb-2 text-sm text-gray-400">
                    Moves beat-driven visuals earlier or later to match what you hear. Raise it if the visuals feel
                    ahead of the sound; lower it if they feel behind.
                </div>
                <button
                    type="button"
                    className={smallOutlineButton}
                    onClick={() => engine.setSyncOffsetMs(DEFAULT_SYNC_OFFSET_MS)}
                >
                    Reset
                </button>
            </div>
        </details>
    );
}
