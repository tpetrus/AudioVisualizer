import type { TrioAccentInput, TrioAccentState } from './trioEnhancedTypes';
import {
    ACCENT_BASS_ONSET_THRESHOLD,
    ACCENT_DECAY_SECONDS,
    ACCENT_MIN_INTERVAL_SECONDS,
    ACCENT_PEAK_CAP,
    ACCENT_REDUCED_MOTION_FACTOR,
} from './trioEnhancedConfig';

export function createTrioAccent(): TrioAccentState {
    return { pulse: 0, triggered: false, sinceTrigger: Infinity, lastBeatCount: undefined, bassAbove: false };
}

// Advances the beat accent by one frame, in place. A trigger is a new beat or a rising edge of the kick onset; it is
// accepted at most three times a second, so a fast or noisy input cannot make the scene strobe.
export function stepTrioAccent(state: TrioAccentState, input: TrioAccentInput): void {
    // A bad frame time counts as no time passing, so it can neither grow the gate's clock nor blow up the decay.
    const dt = Number.isFinite(input.dtSeconds) && input.dtSeconds > 0 ? input.dtSeconds : 0;
    const intensity = Math.min(1, Math.max(0, Number.isFinite(input.intensity) ? input.intensity : 0));
    const peak = ACCENT_PEAK_CAP * intensity * (input.reducedMotion ? ACCENT_REDUCED_MOTION_FACTOR : 1);

    state.triggered = false;
    state.sinceTrigger += dt;
    state.pulse *= Math.exp(-dt / ACCENT_DECAY_SECONDS);

    const above = input.bassOnset > ACCENT_BASS_ONSET_THRESHOLD;
    const previousBeat = state.lastBeatCount;
    const wasAbove = state.bassAbove;
    state.lastBeatCount = input.beatCount;
    state.bassAbove = above;

    // The first step only records where the counters are: a track already playing is not a new beat.
    if (previousBeat !== undefined) {
        const trigger = input.beatCount > previousBeat || (above && !wasAbove);
        if (trigger && state.sinceTrigger >= ACCENT_MIN_INTERVAL_SECONDS) {
            state.triggered = true;
            state.sinceTrigger = 0;
            state.pulse = peak;
        }
    }

    // Lowering the slider (or turning on reduced motion) takes effect at once instead of after the decay.
    if (state.pulse > peak) state.pulse = peak;
}
