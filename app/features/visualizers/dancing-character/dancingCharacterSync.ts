import {
    METER_ENTER_CONFIDENCE,
    METER_EXIT_CONFIDENCE,
    TEMPO_LOCK_CONFIDENCE,
    TEMPO_LOSE_CONFIDENCE,
} from '~/features/rhythm/rhythmConfig';
import type { RhythmState } from '~/features/rhythm/types';
import {
    CALM_DANCE_WEIGHT,
    CALM_TIME_SCALE,
    DANCE_WEIGHT_RATE,
    MAX_FRAME_DT,
    MAX_PHASE_NUDGE_PER_SECOND,
    MAX_TIME_SCALE_CHANGE_PER_SECOND,
    MIN_TIME_SCALE,
    NATIVE_BPM,
    NORMALIZED_BPM_MIN,
    PHASE_CORRECTION_GAIN,
    STEP_MULTIPLES,
    STEP_PHASE_OFFSET,
    TIME_SCALE_SLEW_RATE,
} from './dancingCharacterConfig';

export interface DanceTimingSettings {
    // settings.danceSpeed (0.5..2).
    danceSpeed: number;
}

export interface DanceTimingResult {
    // Multiplier for the time the clip advances by.
    timeScale: number;
    // Amount to add to the clip position this frame, in loop fractions (clipPhase units).
    phaseNudge: number;
    // CALM_DANCE_WEIGHT..1: eases to CALM_DANCE_WEIGHT while the tempo is unlocked and to 1 while it is locked.
    danceWeight: number;
    // The tempo the dance follows while locked, undefined otherwise (the orbit reads it).
    normalizedBpm: number | undefined;
    // True only while the tempo is locked, the meter is a confident 4 and a bar position is known.
    barLocked: boolean;
}

// Plain numbers and booleans only, so it can be kept across frames without allocation.
export interface DanceTimingState {
    // Tempo lock.
    locked: boolean;
    // Meter lock: the dance follows the bar, not only the beat.
    meterLocked: boolean;
    // 0 until a tempo has been normalized (also after a song change).
    lastNormalizedBpm: number;
    timeScale: number;
    danceWeight: number;
    songChangeCount: number;
    initialized: boolean;
}

export function createDanceTimingState(): DanceTimingState {
    return {
        locked: false,
        meterLocked: false,
        lastNormalizedBpm: 0,
        timeScale: CALM_TIME_SCALE,
        danceWeight: CALM_DANCE_WEIGHT,
        songChangeCount: 0,
        initialized: false,
    };
}

export function createDanceTimingResult(): DanceTimingResult {
    return {
        timeScale: CALM_TIME_SCALE,
        phaseNudge: 0,
        danceWeight: CALM_DANCE_WEIGHT,
        normalizedBpm: undefined,
        barLocked: false,
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

// Closes a phase error at the correction gain, never faster than the per-second cap, so catching up is a visible
// speed change rather than a teleport. `unitsPerLoop` is how many error units (beats or bars) one loop holds, which
// converts the error into loop fractions.
function correction(error: number, unitsPerLoop: number, dt: number): number {
    const limit = MAX_PHASE_NUDGE_PER_SECOND * dt;
    return Math.min(limit, Math.max(-limit, (error * PHASE_CORRECTION_GAIN * dt) / unitsPerLoop));
}

// Chooses how fast the clip runs, how much to nudge its position so it meets the music's bar (or beat), and how
// strongly the dance shows. Writes into and returns `out`, and allocates nothing.
export function computeDanceTiming(
    rhythm: Readonly<RhythmState>,
    clipBeats: number,
    clipPhase: number,
    settings: DanceTimingSettings,
    state: DanceTimingState,
    dt: number,
    out: DanceTimingResult,
): DanceTimingResult {
    const step = Math.min(Math.max(dt, 0), MAX_FRAME_DT);

    // A new song invalidates the old locks and octave choice; the speed itself carries on and slews from where it is.
    if (state.initialized && rhythm.songChangeCount !== state.songChangeCount) {
        state.locked = false;
        state.meterLocked = false;
        state.lastNormalizedBpm = 0;
    }
    state.songChangeCount = rhythm.songChangeCount;
    state.initialized = true;

    // Two thresholds, so a confidence hovering around one value does not flicker the dance between modes.
    const usable = rhythm.bpm > 0 && rhythm.beatPhase !== undefined;
    if (state.locked) {
        if (!usable || rhythm.tempoConfidence < TEMPO_LOSE_CONFIDENCE) state.locked = false;
    } else if (usable && rhythm.tempoConfidence >= TEMPO_LOCK_CONFIDENCE) {
        state.locked = true;
    }

    // The meter lock has its own two thresholds and only exists on top of the tempo lock with a known bar of four.
    if (!state.locked || rhythm.beatsPerBar !== 4 || rhythm.barPhase === undefined) {
        state.meterLocked = false;
    } else if (state.meterLocked) {
        if (rhythm.meterConfidence < METER_EXIT_CONFIDENCE) state.meterLocked = false;
    } else if (rhythm.meterConfidence >= METER_ENTER_CONFIDENCE) {
        state.meterLocked = true;
    }

    let target: number;
    let nudge = 0;
    // (A locked state always has a beat phase; the check is ordered so the types narrow.)
    if (rhythm.beatPhase !== undefined && state.locked) {
        const normalized = normalizeOctave(rhythm.bpm, state.lastNormalizedBpm);
        state.lastNormalizedBpm = normalized;
        const multiple = snapStepMultiple(settings.danceSpeed);
        target = (normalized / NATIVE_BPM) * multiple;

        if (state.meterLocked && rhythm.barPhase !== undefined) {
            // Where the clip is within its bar against where the music is within its bar. The error is in bars, so
            // the correction divides by the bars in one loop to get loop fractions.
            const barsPerLoop = clipBeats / (4 * multiple);
            if (barsPerLoop >= 1) {
                const position = clipPhase * barsPerLoop;
                const error = wrapSigned(rhythm.barPhase - (position - Math.floor(position)));
                nudge = correction(error, barsPerLoop, step);
            } else {
                // A loop shorter than a bar (double time) covers only part of the bar, so the clip position cannot be
                // compared in bars; instead the loop is aligned to where it should be within the music's bar, and that
                // error is already in loop fractions.
                const loopsPerBar = 1 / barsPerLoop;
                const target = rhythm.barPhase * loopsPerBar;
                const error = wrapSigned(target - Math.floor(target) - clipPhase);
                nudge = correction(error, 1, step);
            }
        } else {
            // Only the beat slot is compared, not which beat of the loop it is: the tracker's beat count can jitter,
            // and targeting the count would make the dancer jump by half a loop.
            const beatsPerLoop = clipBeats / multiple;
            const slot = clipPhase * beatsPerLoop - STEP_PHASE_OFFSET;
            const error = wrapSigned(rhythm.beatPhase - (slot - Math.floor(slot)));
            nudge = correction(error, beatsPerLoop, step);
        }
        out.normalizedBpm = normalized;
    } else {
        target = CALM_TIME_SCALE * settings.danceSpeed;
        out.normalizedBpm = undefined;
    }

    state.timeScale = Math.max(MIN_TIME_SCALE, slew(state.timeScale, Math.max(MIN_TIME_SCALE, target), step));

    // An exponential approach, so the weight never jumps and never leaves [CALM_DANCE_WEIGHT, 1].
    const weightTarget = state.locked ? 1 : CALM_DANCE_WEIGHT;
    state.danceWeight += (weightTarget - state.danceWeight) * (1 - Math.exp(-DANCE_WEIGHT_RATE * step));

    out.timeScale = state.timeScale;
    out.phaseNudge = nudge;
    out.danceWeight = state.danceWeight;
    out.barLocked = state.meterLocked;
    return out;
}
