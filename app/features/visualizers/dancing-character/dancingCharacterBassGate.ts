import type { RhythmState } from '~/features/rhythm/types';
import {
    BASS_GATE_CLOSE_SCORE,
    BASS_GATE_EASE_SECONDS,
    BASS_GATE_GRACE_BEATS,
    BASS_GATE_MIN_INTERVAL,
    BASS_GATE_FULL_RISE,
    BASS_GATE_MIN_LEVEL,
    BASS_GATE_MIN_STRENGTH,
    BASS_GATE_ONSET_RISE,
    BASS_GATE_PHASE_ADAPT,
    BASS_GATE_PHASE_WINDOW,
    BASS_GATE_OPEN_SCORE,
    BASS_GATE_REARM_FALL,
    BASS_GATE_RELEASE_SECONDS,
    BASS_GATE_SCORE_DECAY,
    BASS_GATE_SCORE_MAX,
    MAX_FRAME_DT,
} from './dancingCharacterConfig';

// Plain numbers and booleans only, so it can be kept across frames without allocation.
export interface BassGateState {
    // Evidence that the kicks follow the beat, 0..BASS_GATE_SCORE_MAX.
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
    // True from an accepted kick until re-arming: the shown level grows with the kick's rise while it lasts.
    following: boolean;
    // Where in the beat (0..1) the kicks land, learned from them; meaningless until phaseKnown.
    kickPhase: number;
    phaseKnown: boolean;
    // Beats since a kick last landed on the beat; the score only decays after BASS_GATE_GRACE_BEATS of them.
    beatsSinceOnBeat: number;
    // Seconds since the last accepted kick (capped, only compared against the minimum interval).
    sinceAccepted: number;
    // The bass before the gate weight is applied.
    level: number;
    beatCount: number;
    songChangeCount: number;
    initialized: boolean;
}

export function createBassGateState(): BassGateState {
    return {
        score: 0,
        open: false,
        weight: 0,
        armed: true,
        trough: 0,
        peak: 0,
        following: false,
        kickPhase: 0,
        phaseKnown: false,
        beatsSinceOnBeat: 0,
        sinceAccepted: BASS_GATE_MIN_INTERVAL,
        level: 0,
        beatCount: 0,
        songChangeCount: 0,
        initialized: false,
    };
}

// Lets the raw bass through only while its kicks keep landing on the locked beat, so stray bass (a clap, a vocal, a
// bump between beats) never moves the camera or the flashes. Returns the bass to show, 0..1. Allocates nothing.
export function stepBassGate(
    bass: number,
    rhythm: Readonly<RhythmState>,
    tempoLocked: boolean,
    state: BassGateState,
    dt: number,
): number {
    const step = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
    const raw = Math.min(Math.max(bass, 0), 1);

    // Losing the tempo or changing song throws away what was learned about the old beat.
    const songChanged = state.initialized && rhythm.songChangeCount !== state.songChangeCount;
    if (!tempoLocked || songChanged) {
        state.open = false;
        state.score = 0;
        state.beatsSinceOnBeat = 0;
        state.phaseKnown = false;
        state.following = false;
    }
    // The first call only records the counters, so a track already playing does not count as a new beat.
    const newBeat = state.initialized && rhythm.beatCount !== state.beatCount;
    state.songChangeCount = rhythm.songChangeCount;
    state.beatCount = rhythm.beatCount;
    state.initialized = true;
    state.sinceAccepted = Math.min(state.sinceAccepted + step, BASS_GATE_MIN_INTERVAL);

    if (newBeat) {
        state.beatsSinceOnBeat++;
        if (state.beatsSinceOnBeat > BASS_GATE_GRACE_BEATS)
            state.score = Math.max(0, state.score - BASS_GATE_SCORE_DECAY);
    }

    // A kick is a rise above the lowest point since re-arming; re-arming is a fall below the peak since the kick.
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
            state.armed = true;
            state.following = false;
            state.trough = raw;
        }
    }

    // A kick is in rhythm when it lands where the previous kicks landed in the beat. The first kick, or one that comes
    // once the evidence has run out, only sets that place afresh and earns nothing, so a stray first bump cannot lock
    // out the real bassline, and bumps at random places (about one in five lands in the window by chance) cannot string
    // together the run of in-rhythm kicks the gate needs to open.
    const phase = rhythm.beatPhase;
    let onBeat = false;
    if (onset && tempoLocked && phase !== undefined) {
        const offset = state.phaseKnown ? wrapSigned(phase - state.kickPhase) : 0;
        if (state.phaseKnown && Math.abs(offset) <= BASS_GATE_PHASE_WINDOW) {
            onBeat = true;
            state.kickPhase = wrapUnit(state.kickPhase + offset * BASS_GATE_PHASE_ADAPT);
            state.score = Math.min(BASS_GATE_SCORE_MAX, state.score + 1);
            state.beatsSinceOnBeat = 0;
        } else if (!state.phaseKnown || state.score <= 0) {
            state.kickPhase = phase;
            state.phaseKnown = true;
        } else {
            state.score = Math.max(0, state.score - 1);
        }
    }
    // Two thresholds, so a score hovering around one value does not flicker the gate.
    if (state.open) {
        if (state.score <= BASS_GATE_CLOSE_SCORE) state.open = false;
    } else if (state.score >= BASS_GATE_OPEN_SCORE) {
        state.open = true;
    }

    if (state.open && onset && onBeat && state.sinceAccepted >= BASS_GATE_MIN_INTERVAL) {
        state.following = true;
        state.sinceAccepted = 0;
    }

    // A followed kick shows its rise above the dip before it, scaled to full strength, so kicks read the same at the
    // start of a song and minutes into it. Otherwise the shown level only fades.
    if (state.following) {
        const strength = Math.min(
            1,
            Math.max(BASS_GATE_MIN_STRENGTH, (state.peak - state.trough) / BASS_GATE_FULL_RISE),
        );
        state.level = Math.max(state.level, strength);
    } else {
        state.level *= Math.exp(-step / BASS_GATE_RELEASE_SECONDS);
    }

    const maxMove = step / BASS_GATE_EASE_SECONDS;
    const weightTarget = state.open ? 1 : 0;
    state.weight += Math.min(maxMove, Math.max(-maxMove, weightTarget - state.weight));

    // Tiny leftovers are snapped to 0 so a closed gate is exactly 0 and the ring and lights can switch off.
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
