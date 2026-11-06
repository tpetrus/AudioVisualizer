import {
    BASS_GATE_ATTACK_SECONDS,
    BASS_GATE_CLOSE_SCORE,
    BASS_GATE_EASE_SECONDS,
    BASS_GATE_FULL_RISE,
    BASS_GATE_GRACE_BEATS,
    BASS_GATE_LOCK_GRACE_SECONDS,
    BASS_GATE_MIN_INTERVAL,
    BASS_GATE_MIN_LEVEL,
    BASS_GATE_MIN_STRENGTH,
    BASS_GATE_ONSET_RISE,
    BASS_GATE_OPEN_SCORE,
    BASS_GATE_PHASE_ADAPT,
    BASS_GATE_PHASE_WINDOW,
    BASS_GATE_REARM_FALL,
    BASS_GATE_RELEASE_SECONDS,
    BASS_GATE_SCORE_DECAY,
    BASS_GATE_SCORE_MAX,
    BASS_GATE_STRENGTH_ADAPT,
    BASS_GATE_MAX_STEP_SECONDS,
} from './bassGateConfig';
import type { RhythmState } from './types';

// Plain numbers and booleans only, so it can be kept across frames without allocation.
export interface BassGateState {
    // Evidence that the kicks land at one place in the beat, 0..BASS_GATE_SCORE_MAX.
    score: number;
    open: boolean;
    // 0..1, eases toward 1 while open and toward 0 while closed.
    weight: number;
    // True once the raw bass has fallen from its last peak, so the next rise counts as a kick.
    armed: boolean;
    // Lowest raw bass since re-arming (a kick is a rise above it) and highest since the last kick (re-arming is a fall
    // below it).
    trough: number;
    peak: number;
    // True from an in-rhythm kick until re-arming, so its full rise is learned as the bump strength once it is known.
    measuring: boolean;
    // Where in the beat (0..1) the kicks land, learned from them; meaningless until phaseKnown.
    kickPhase: number;
    phaseKnown: boolean;
    // The bump to show on each beat, learned from the in-rhythm kicks' rises.
    kickStrength: number;
    // Beats since a kick last landed at the learned place; the score only decays after BASS_GATE_GRACE_BEATS of them.
    beatsSinceOnBeat: number;
    // Seconds the tempo has been unlocked; the gate forgets the beat only after BASS_GATE_LOCK_GRACE_SECONDS.
    unlockedSeconds: number;
    // The beat phase seen on the previous call, to notice the clock passing the learned kick place.
    lastPhase: number;
    // Seconds since the last bump started (capped, only compared against the minimum interval).
    sinceBump: number;
    // The bump envelope before the gate weight: it rises over attackLeft seconds toward bumpTarget, then fades.
    level: number;
    bumpTarget: number;
    attackLeft: number;
    beatCount: number;
    songChangeCount: number;
    initialized: boolean;
    // Written only for DEV telemetry, never read by the gate: bumps started so far (monotonic), and the latest measured
    // kick's signed distance from the learned place in beats (NaN until one was measured).
    bumpCount: number;
    kickOffset: number;
}

export function createBassGateState(): BassGateState {
    return {
        score: 0,
        open: false,
        weight: 0,
        armed: true,
        trough: 0,
        peak: 0,
        measuring: false,
        kickPhase: 0,
        phaseKnown: false,
        kickStrength: 1,
        beatsSinceOnBeat: 0,
        unlockedSeconds: 0,
        lastPhase: 0,
        sinceBump: BASS_GATE_MIN_INTERVAL,
        level: 0,
        bumpTarget: 0,
        attackLeft: 0,
        beatCount: 0,
        songChangeCount: 0,
        initialized: false,
        bumpCount: 0,
        kickOffset: NaN,
    };
}

// Forgets the learned bassline, as for a new song. The shown level and the gate weight are left to fade on their own.
export function forgetBassline(state: BassGateState): void {
    state.open = false;
    state.score = 0;
    state.phaseKnown = false;
    state.measuring = false;
    state.beatsSinceOnBeat = 0;
}

// Shows the bass as a steady pulse on the beat once its kicks have locked onto one place in the beat, and keeps that
// pulse going ("business as usual") through masked kicks, extra notes and brief tempo dropouts, since a song's
// bassline almost never changes quickly. Stray bass never shows. Returns the bass to show, 0..1. Allocates nothing.
export function stepBassGate(
    bass: number,
    rhythm: Readonly<RhythmState>,
    tempoLocked: boolean,
    state: BassGateState,
    dt: number,
): number {
    const step = Math.min(Math.max(dt, 0), BASS_GATE_MAX_STEP_SECONDS);
    const raw = Math.min(Math.max(bass, 0), 1);

    // A new song throws away the old bassline at once; a lost tempo lock only after a grace period, because the
    // tracker's confidence dips briefly in busy passages while the music carries on unchanged.
    const songChanged = state.initialized && rhythm.songChangeCount !== state.songChangeCount;
    state.unlockedSeconds = tempoLocked ? 0 : state.unlockedSeconds + step;
    if (songChanged || state.unlockedSeconds > BASS_GATE_LOCK_GRACE_SECONDS) forgetBassline(state);
    // The first call only records the counters, so a track already playing does not count as a new beat.
    const newBeat = state.initialized && rhythm.beatCount !== state.beatCount;
    state.songChangeCount = rhythm.songChangeCount;
    state.beatCount = rhythm.beatCount;
    state.initialized = true;
    state.sinceBump = Math.min(state.sinceBump + step, BASS_GATE_MIN_INTERVAL);

    // Only a long run of beats with no kick at the learned place wears the evidence down.
    if (newBeat) {
        state.beatsSinceOnBeat++;
        if (state.beatsSinceOnBeat > BASS_GATE_GRACE_BEATS) {
            state.score = Math.max(0, state.score - BASS_GATE_SCORE_DECAY);
        }
    }

    // A kick is a rise above the lowest point since re-arming; re-arming is a fall below the peak since the kick. A
    // finished in-rhythm kick teaches the bump strength, from its whole rise.
    let onset = false;
    if (state.armed) {
        state.trough = Math.min(state.trough, raw);
        if (raw - state.trough >= BASS_GATE_ONSET_RISE && raw >= BASS_GATE_MIN_LEVEL) {
            state.armed = false;
            state.peak = raw;
            onset = true;
        }
    } else {
        state.peak = Math.max(state.peak, raw);
        if (raw <= state.peak - BASS_GATE_REARM_FALL) {
            if (state.measuring) {
                const strength = Math.min(
                    1,
                    Math.max(BASS_GATE_MIN_STRENGTH, (state.peak - state.trough) / BASS_GATE_FULL_RISE),
                );
                state.kickStrength += (strength - state.kickStrength) * BASS_GATE_STRENGTH_ADAPT;
            }
            state.armed = true;
            state.measuring = false;
            state.trough = raw;
        }
    }

    // A kick is in rhythm when it lands where the previous kicks landed in the beat. The first kick, or one that comes
    // once the evidence has run out, only sets that place afresh and earns nothing. A kick elsewhere costs nothing, because
    // a syncopated bassline lands most of its notes away from that place: making them cost evidence kept the gate shut for
    // a whole track on real music (measured in docs/agents/rhythm-findings.md).
    const phase = rhythm.beatPhase;
    if (onset && tempoLocked && phase !== undefined) {
        const offset = state.phaseKnown ? wrapSigned(phase - state.kickPhase) : 0;
        if (state.phaseKnown) state.kickOffset = offset;
        if (state.phaseKnown && Math.abs(offset) <= BASS_GATE_PHASE_WINDOW) {
            state.kickPhase = wrapUnit(state.kickPhase + offset * BASS_GATE_PHASE_ADAPT);
            state.score = Math.min(BASS_GATE_SCORE_MAX, state.score + 1);
            state.beatsSinceOnBeat = 0;
            state.measuring = true;
        } else if (!state.phaseKnown || state.score <= 0) {
            state.kickPhase = phase;
            state.phaseKnown = true;
        }
    }
    // Two thresholds, so a score hovering near one value does not flicker the gate.
    if (state.open) {
        if (state.score <= BASS_GATE_CLOSE_SCORE) state.open = false;
    } else if (state.score >= BASS_GATE_OPEN_SCORE) {
        state.open = true;
    }

    // While open, the bump comes from the beat clock: every time it passes the learned kick place, whether or not
    // this particular kick was heard. A phase that only steps back a little (a tracker correction) is not a pass.
    if (phase !== undefined) {
        const before = wrapUnit(state.lastPhase - state.kickPhase);
        const now = wrapUnit(phase - state.kickPhase);
        const passed = now < before && before > 0.5;
        if (passed && state.open && state.sinceBump >= BASS_GATE_MIN_INTERVAL) {
            state.sinceBump = 0;
            state.bumpCount++;
            state.bumpTarget = state.kickStrength;
            state.attackLeft = BASS_GATE_ATTACK_SECONDS;
        }
        state.lastPhase = phase;
    }

    // The bump rises smoothly over the attack time, then fades, so it breathes rather than snaps.
    if (state.attackLeft > 0) {
        state.level += (state.bumpTarget - state.level) * Math.min(1, step / state.attackLeft);
        state.attackLeft -= step;
    } else {
        state.level *= Math.exp(-step / BASS_GATE_RELEASE_SECONDS);
    }

    const maxMove = step / BASS_GATE_EASE_SECONDS;
    const weightTarget = state.open ? 1 : 0;
    state.weight += Math.min(maxMove, Math.max(-maxMove, weightTarget - state.weight));

    // Tiny leftovers are snapped to 0 so a closed gate is exactly 0 and the lights and camera settle exactly.
    const shown = state.level * state.weight;
    return shown < 1e-3 ? 0 : Math.min(shown, 1);
}

// Difference of two phases as the shortest way around the beat, in (-0.5, 0.5].
function wrapSigned(delta: number): number {
    const wrapped = delta - Math.round(delta);
    return wrapped <= -0.5 ? wrapped + 1 : wrapped;
}

// A phase moved back into [0, 1).
function wrapUnit(phase: number): number {
    return phase - Math.floor(phase);
}
