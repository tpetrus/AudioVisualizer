import { useEffect, useState } from 'react';
import { useAudio } from './audioEngineContext';

const METER_INTERVAL_MS = 100;
// How long the raw input must stay below SIGNAL_THRESHOLD before it counts as silent.
const SILENCE_TIMEOUT_MS = 4000;
const SIGNAL_THRESHOLD = 0.01;

interface LevelMeter {
    level: number;     // 0..1, after normalization: what the visualizations receive
    silent: boolean;   // the raw input has been quiet for SILENCE_TIMEOUT_MS
    trackInfo: string; // label and state of the captured track
}

const IDLE: LevelMeter = { level: 0, silent: false, trackInfo: '' };

// Polls the engine's meters while a source is capturing. Restarts whenever the source changes.
export function useLevelMeter(analyser: AnalyserNode | undefined): LevelMeter {
    const engine = useAudio();
    const [reading, setReading] = useState({ level: 0, silent: false });

    useEffect(() => {
        if (!analyser) {
            return;
        }
        let silentSince = Date.now();
        const timer = window.setInterval(() => {
            // Silence is judged on the raw input so amplified noise can't hide a dead source.
            if (engine.getLevel() > SIGNAL_THRESHOLD) {
                silentSince = Date.now();
            }
            setReading({
                level: engine.getOutputLevel(),
                silent: Date.now() - silentSince > SILENCE_TIMEOUT_MS,
            });
        }, METER_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [engine, analyser]);

    // trackInfo is read on each render; the meter re-renders 10 times a second, so it stays current.
    return analyser ? { ...reading, trackInfo: engine.trackInfo } : IDLE;
}