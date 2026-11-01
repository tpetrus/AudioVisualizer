import { TEMPO_LOCK_CONFIDENCE, TEMPO_LOSE_CONFIDENCE } from '~/features/rhythm/rhythmConfig';
import {
    DEFAULT_CALM_RATE,
    MAX_FRAME_DT,
    MAX_PHASE_NUDGE_PER_SECOND,
    MAX_TIME_SCALE_CHANGE_PER_SECOND,
    MIN_TIME_SCALE,
    NATIVE_BEATS_PER_LOOP,
    NATIVE_BPM,
    NORMALIZED_BPM_MIN,
    PHASE_CORRECTION_GAIN,
    STEP_MULTIPLES,
    STEP_PHASE_OFFSET,
    TIME_SCALE_SLEW_RATE,
} from './dancingCharacterConfig';

export interface DanceTimingInput {
    // RhythmState.bpm: 0 means unknown (not undefined).
    bpm: number;
    // 0..1
    tempoConfidence: number;
    // 0..1 position in the current beat, undefined until a beat is found.
    beatPhase: number | undefined;
    // RhythmState.songChangeCount; a change releases the lock.
    songChangeCount: number;
    // 0..1 position in the Dance loop (action.time / duration).
    clipPhase: number;
    // settings.danceSpeed (0.5..2).
    danceSpeed: number;
    // Seconds since the last frame (>= 0; anything above MAX_FRAME_DT is treated as MAX_FRAME_DT).
    dt: number;
}

export interface DanceTimingOutput {
    // Multiplier for the time the clip advances by.
    timeScale: number;
    // Amount to add to the clip position, in loop fractions (clipPhase units).
    phaseNudge: number;
    // The tempo the dance follows while locked, undefined while the tempo is unknown.
    normalizedBpm: number | undefined;
}

// Plain numbers and booleans only, so it can be kept across frames without allocation.
export interface DanceTimingState {
    locked: boolean;
    // 0 until a tempo has been normalized (also after a song change).
    lastNormalizedBpm: number;
    timeScale: number;
    songChangeCount: number;
    initialized: boolean;
}

export function createDanceTimingState(): DanceTimingState {
    return {
        locked: false,
        lastNormalizedBpm: 0,
        timeScale: DEFAULT_CALM_RATE,
        songChangeCount: 0,
        initialized: false,
    };
}

// The step multiple closest to the setting, compared in ratio (log) terms because 0.5, 1 and 2 are octaves apart.
export function snapStepMultiple(danceSpeed: number): number {
    const speed = Math.max(danceSpeed, MIN_TIME_SCALE);
    let best: number = STEP_MULTIPLES[0];
    let bestDistance = Infinity;
    for (const multiple of STEP_MULTIPLES) {
        const distance = Math.abs(Math.log2(speed / multiple));
        if (distance < bestDistance) {
            best = multiple;
            bestDistance = distance;
        }
    }
    return best;
}

// Moves the raw tempo by factors of two to the octave nearest the previous value, so a half or double time estimate
// (which the tracker may flip between mid-song) gives the same dance. The first value is folded into
// [NORMALIZED_BPM_MIN, 2 * NORMALIZED_BPM_MIN).
function normalizeOctave(bpm: number, previous: number): number {
    const octaves =
        previous > 0 ? Math.round(Math.log2(previous / bpm)) : Math.ceil(Math.log2(NORMALIZED_BPM_MIN / bpm));
    return bpm * 2 ** octaves;
}

// Difference of two phases (0..1 positions) as the shortest way around the loop, in (-0.5, 0.5].
function wrapSigned(delta: number): number {
    const wrapped = delta - Math.round(delta);
    return wrapped <= -0.5 ? wrapped + 1 : wrapped;
}

function slew(current: number, target: number, dt: number): number {
    const step = (target - current) * (1 - Math.exp(-TIME_SCALE_SLEW_RATE * dt));
    const limit = MAX_TIME_SCALE_CHANGE_PER_SECOND * dt;
    return current + Math.min(limit, Math.max(-limit, step));
}

// Chooses how fast the clip runs and how much to nudge its position so its beat slot meets the music's beat. Writes
// into and returns `out`, and allocates nothing.
export function computeDanceTiming(
    input: DanceTimingInput,
    state: DanceTimingState,
    out: DanceTimingOutput,
): DanceTimingOutput {
    const dt = Math.min(Math.max(input.dt, 0), MAX_FRAME_DT);

    // A new song invalidates the old lock and octave choice; the speed itself carries on and slews from where it is.
    if (state.initialized && input.songChangeCount !== state.songChangeCount) {
        state.locked = false;
        state.lastNormalizedBpm = 0;
    }
    state.songChangeCount = input.songChangeCount;
    state.initialized = true;

    // Two thresholds, so a confidence hovering around one value does not flicker the dance between modes.
    const usable = input.bpm > 0 && input.beatPhase !== undefined;
    if (state.locked) {
        if (!usable || input.tempoConfidence < TEMPO_LOSE_CONFIDENCE) state.locked = false;
    } else if (usable && input.tempoConfidence >= TEMPO_LOCK_CONFIDENCE) {
        state.locked = true;
    }

    let target: number;
    let nudge = 0;
    // (A locked state always has a beat phase; the check is ordered so the types narrow.)
    if (input.beatPhase !== undefined && state.locked) {
        const normalized = normalizeOctave(input.bpm, state.lastNormalizedBpm);
        state.lastNormalizedBpm = normalized;
        const multiple = snapStepMultiple(input.danceSpeed);
        target = (normalized / NATIVE_BPM) * multiple;

        // Only the beat slot is compared, not which beat of the loop it is: the tracker's beat count can jitter, and
        // targeting the count would make the dancer jump by half a loop.
        const beatsPerLoop = NATIVE_BEATS_PER_LOOP / multiple;
        const slot = input.clipPhase * beatsPerLoop - STEP_PHASE_OFFSET;
        const error = wrapSigned(input.beatPhase - (slot - Math.floor(slot)));
        const limit = MAX_PHASE_NUDGE_PER_SECOND * dt;
        nudge = Math.min(limit, Math.max(-limit, (error * PHASE_CORRECTION_GAIN * dt) / beatsPerLoop));
        out.normalizedBpm = normalized;
    } else {
        target = DEFAULT_CALM_RATE * input.danceSpeed;
        out.normalizedBpm = undefined;
    }

    state.timeScale = Math.max(MIN_TIME_SCALE, slew(state.timeScale, Math.max(MIN_TIME_SCALE, target), dt));
    out.timeScale = state.timeScale;
    out.phaseNudge = nudge;
    return out;
}
