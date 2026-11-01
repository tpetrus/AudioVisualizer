import type { RhythmState } from '~/features/rhythm/types';
import {
    BASS_GATE_BEAT_WINDOW,
    BASS_GATE_CLOSE_SCORE,
    BASS_GATE_EASE_SECONDS,
    BASS_GATE_GRACE_BEATS,
    BASS_GATE_MIN_INTERVAL,
    BASS_GATE_ONSET_LEVEL,
    BASS_GATE_OPEN_SCORE,
    BASS_GATE_REARM_LEVEL,
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
    // True once the raw bass has fallen below the re-arm level, so the next rise counts as a kick.
    armed: boolean;
    // True from an accepted kick until the raw bass falls below the re-arm level.
    following: boolean;
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
        following: false,
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

    // A kick is the raw bass rising through the onset level while armed.
    let onset = false;
    if (raw < BASS_GATE_REARM_LEVEL) {
        state.armed = true;
        state.following = false;
    } else if (state.armed && raw >= BASS_GATE_ONSET_LEVEL) {
        state.armed = false;
        onset = true;
    }

    const phase = rhythm.beatPhase;
    const onBeat =
        tempoLocked && phase !== undefined && (phase <= BASS_GATE_BEAT_WINDOW || phase >= 1 - BASS_GATE_BEAT_WINDOW);

    if (onset && tempoLocked) {
        state.score = onBeat ? Math.min(BASS_GATE_SCORE_MAX, state.score + 1) : Math.max(0, state.score - 1);
        if (onBeat) state.beatsSinceOnBeat = 0;
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

    if (state.following) state.level = raw;
    else state.level *= Math.exp(-step / BASS_GATE_RELEASE_SECONDS);

    const maxMove = step / BASS_GATE_EASE_SECONDS;
    const weightTarget = state.open ? 1 : 0;
    state.weight += Math.min(maxMove, Math.max(-maxMove, weightTarget - state.weight));

    // Tiny leftovers are snapped to 0 so a closed gate is exactly 0 and the ring and lights can switch off.
    const shown = state.level * state.weight;
    return shown < 1e-3 ? 0 : Math.min(shown, 1);
}
