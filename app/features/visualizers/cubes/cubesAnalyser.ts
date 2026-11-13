import type { AnalyserSettings } from '~/features/audio/types';

// The settings this visualizer reads its spectrum with. The page asks the engine for a node carrying them, so what
// the cubes see never depends on which visualizer was opened before.
export const CUBES_ANALYSER: AnalyserSettings = {
    fftSize: 2048,
    smoothingTimeConstant: 0.5,
    minDecibels: -100,
    maxDecibels: -30,
};
