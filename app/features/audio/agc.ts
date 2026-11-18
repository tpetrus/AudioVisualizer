import type { NormalizeSettings } from './types';

// How often the engine re-evaluates the gain, in milliseconds.
export const AGC_INTERVAL_MS = 30;
// Time constant, in seconds, of the gain's approach when the signal got too loud (fast, so peaks are caught).
export const ATTACK_TIME_CONSTANT = 0.02;
export const MIN_GAIN = 0.25;
// FFT size of the analyser that measures the raw input level; the peak is read over its last `fftSize` samples.
export const METER_FFT_SIZE = 1024;

// What one AGC tick decided. `envelope` is the new peak envelope. `wantedGain` and `timeConstant` are set when the gain
// should move toward a new target (the engine calls setTargetAtTime with them) and undefined below the noise floor.
export interface AgcDecision {
    envelope: number;
    wantedGain?: number;
    timeConstant?: number;
}

// The automatic gain control's decision for one tick, kept free of the Web Audio graph so the offline replay applies the
// very same rule. `envelope` is the slowly decaying peak envelope of the raw input from the previous tick, `level` the
// raw peak (0..1) measured now and `currentGain` the gain node's present value.
export function agcStep(
    envelope: number,
    level: number,
    currentGain: number,
    settings: NormalizeSettings,
): AgcDecision {
    const { targetPeak, maxGain, peakHold, releaseTime, noiseFloor } = settings;
    // Per-tick decay that halves the envelope every `peakHold` seconds.
    const decay = Math.pow(0.5, AGC_INTERVAL_MS / 1000 / peakHold);

    const next = Math.max(level, envelope * decay);
    if (next < noiseFloor) {
        return { envelope: next }; // don't amplify silence or noise
    }

    const wantedGain = Math.min(maxGain, Math.max(MIN_GAIN, targetPeak / next));
    // Fast attack when too loud, slower release when too quiet, to avoid pumping.
    return {
        envelope: next,
        wantedGain,
        timeConstant: wantedGain < currentGain ? ATTACK_TIME_CONSTANT : releaseTime,
    };
}
