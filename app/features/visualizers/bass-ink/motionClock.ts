import type { RhythmState } from '~/features/rhythm/types';
import { bassInkConfig, type MotionConfig } from './bassInkConfig';

// The breathing clock of the cloud (plan C3). `phase` is what drives motion; it is only ever advanced, never assigned,
// so a tempo lock appearing or disappearing changes the speed but cannot make the cloud jump.
export interface MotionClock {
    // 0..1 breathing phase.
    phase: number;
    // 0..1 how much the clock follows the music; eases between 0 (free) and 1 (locked).
    beatLockWeight: number;
    // Hysteresis state: true while the tempo is trusted.
    locked: boolean;
    readonly config: MotionConfig;
}

export function createMotionClock(config: MotionConfig = bassInkConfig.motion): MotionClock {
    return { phase: 0, beatLockWeight: 0, locked: false, config };
}

// Advances the clock by one frame and returns the breathing phase (one breath per bar when locked).
export function advance(clock: MotionClock, state: RhythmState, dtSeconds: number): number {
    const config = clock.config;
    const dt = Math.max(0, dtSeconds);
    const barPhase = state.barPhase;

    // Two thresholds: the clock locks at a high confidence and lets go at a lower one, so a confidence hovering near
    // one value does not toggle the lock every frame.
    if (clock.locked) {
        if (state.tempoConfidence < config.exitConfidence || barPhase === undefined) {
            clock.locked = false;
        }
    } else if (state.tempoConfidence >= config.enterConfidence && barPhase !== undefined && state.bpm > 0) {
        clock.locked = true;
    }

    const target = clock.locked ? 1 : 0;
    const easeStep = dt / config.weightEaseSeconds;
    if (clock.beatLockWeight < target) {
        clock.beatLockWeight = Math.min(target, clock.beatLockWeight + easeStep);
    } else {
        clock.beatLockWeight = Math.max(target, clock.beatLockWeight - easeStep);
    }
    const weight = clock.beatLockWeight;

    const freeRate = 1 / config.freeBreathingSeconds;
    // A lock that is fading out can outlive the tempo (bpm 0), so fall back to the free rate rather than stalling.
    const lockedRate = state.bpm > 0 ? state.bpm / 60 / (state.beatsPerBar ?? 4) : freeRate;
    const rate = freeRate + (lockedRate - freeRate) * weight;
    let step = rate * dt;

    if (weight > 0 && barPhase !== undefined) {
        // Shortest signed distance to the real bar position, in -0.5..0.5.
        let error = barPhase - clock.phase;
        error -= Math.round(error);
        // Bounded to a fraction of the base step so the phase always keeps moving forward and never jumps.
        const limit = config.maxCorrectionFraction * step;
        step += Math.max(-limit, Math.min(limit, error * weight * config.correctionRate * dt));
    }

    const next = clock.phase + step;
    clock.phase = next - Math.floor(next);
    return clock.phase;
}
