import type { AnalyserSettings } from '~/features/audio/types';

// The settings this visualizer reads its spectrum with: the Web Audio defaults it was tuned on, declared explicitly.
// The page asks the engine for a node carrying them.
export const BASS_INK_ANALYSER: AnalyserSettings = {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: -30,
};
