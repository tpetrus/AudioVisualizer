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
    // Beats in one breath (the bar length, 4 while the meter is unknown), as of the latest advance.
    beatsPerBreath: number;
    readonly config: MotionConfig;
}

export function createMotionClock(config: MotionConfig = bassInkConfig.motion): MotionClock {
    return { phase: 0, beatLockWeight: 0, locked: false, beatsPerBreath: 4, config };
}

// Advances the clock by one frame and returns the breathing phase (one breath per bar when locked).
export function advance(clock: MotionClock, state: RhythmState, dtSeconds: number): number {
    const config = clock.config;
    const dt = Math.max(0, dtSeconds);
    const barPhase = state.barPhase;

    const beatPhase = state.beatPhase;
    // Two thresholds: the clock locks at a high confidence and lets go at a lower one, so a confidence hovering near
    // one value does not toggle the lock every frame. The beat is enough to lock: the meter is often unsure for long
    // stretches of a mix, and a breath that ignores a tempo everyone can hear looks out of time.
    if (clock.locked) {
        if (state.tempoConfidence < config.exitConfidence || beatPhase === undefined) {
            clock.locked = false;
        }
    } else if (state.tempoConfidence >= config.enterConfidence && beatPhase !== undefined && state.bpm > 0) {
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

    clock.beatsPerBreath = state.beatsPerBar ?? 4;
    const freeRate = 1 / config.freeBreathingSeconds;
    // A lock that is fading out can outlive the tempo (bpm 0), so fall back to the free rate rather than stalling.
    const lockedRate = state.bpm > 0 ? state.bpm / 60 / (state.beatsPerBar ?? 4) : freeRate;
    const rate = freeRate + (lockedRate - freeRate) * weight;
    let step = rate * dt;

    let error: number | undefined;
    if (barPhase !== undefined) {
        // Shortest signed distance to the real bar position, in -0.5..0.5.
        error = barPhase - clock.phase;
        error -= Math.round(error);
    } else if (beatPhase !== undefined) {
        // Only the beat is known: line the breath up with whichever beat is nearest, so each beat still falls on a
        // quarter of the breath even though which one starts the bar is unknown.
        const beats = state.beatsPerBar ?? 4;
        let beatError = beatPhase - clock.phase * beats;
        beatError -= Math.round(beatError);
        error = beatError / beats;
    }
    if (weight > 0 && error !== undefined) {
        // Bounded to a fraction of the base step so the phase always keeps moving forward and never jumps.
        const limit = config.maxCorrectionFraction * step;
        step += Math.max(-limit, Math.min(limit, error * weight * config.correctionRate * dt));
    }

    const next = clock.phase + step;
    clock.phase = next - Math.floor(next);
    return clock.phase;
}

// 0..1 punch on every beat of a locked clock, 0 while it runs free. Read from the clock's own phase, which only ever
// moves forward and is pulled onto the beats, so the punch keeps the tempo even through masked kicks and can never
// jitter. It rises over the first `attack` of the beat and decays after, and is 0 at both ends of the beat, so the
// step from one beat to the next is continuous.
export function beatPunch(clock: MotionClock): number {
    const { punchAttack, punchDecay } = clock.config;
    const position = clock.phase * clock.beatsPerBreath;
    const x = position - Math.floor(position);
    const t = Math.min(1, x / punchAttack);
    const rise = t * t * (3 - 2 * t);
    return clock.beatLockWeight * rise * Math.exp(-punchDecay * x) * (1 - x);
}
