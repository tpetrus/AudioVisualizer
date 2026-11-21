import {
    BASS_GATE_ATTACK_SECONDS,
    BASS_GATE_BAR_BEATS,
    BASS_GATE_BAR_WINDOW,
    BASS_GATE_CHANCE_MARGIN,
    BASS_GATE_CHANCE_MIN,
    BASS_GATE_DENSITY_BEATS,
    BASS_GATE_EMPTY_RADIUS,
    BASS_GATE_KICK_HISTORY,
    BASS_GATE_CLOSE_SCORE,
    BASS_GATE_EASE_SECONDS,
    BASS_GATE_FULL_RISE,
    BASS_GATE_GRACE_BEATS,
    BASS_GATE_LOCK_GRACE_SECONDS,
    BASS_GATE_MIN_INTERVAL,
    BASS_GATE_MIN_LEVEL,
    BASS_GATE_MIN_STRENGTH,
    BASS_GATE_ON_BEAT_CENTER,
    BASS_GATE_ON_BEAT_RADIUS,
    BASS_GATE_ONSET_RISE,
    BASS_GATE_OPEN_SCORE,
    BASS_GATE_PHASE_ADAPT,
    BASS_GATE_PHASE_WINDOW,
    BASS_GATE_PRELOCK_SECONDS,
    BASS_GATE_REARM_FALL,
    BASS_GATE_REPEAT_RATE,
    BASS_GATE_RELEASE_SECONDS,
    BASS_GATE_SCORE_DECAY,
    BASS_GATE_SCORE_MAX,
    BASS_GATE_STRENGTH_ADAPT,
    BASS_GATE_MAX_STEP_SECONDS,
} from './bassGateConfig';
import type { RhythmState } from './types';

// Numbers, booleans and two fixed-size arrays made once, so it can be kept across frames without allocation.
export interface BassGateState {
    // Evidence that the bassline repeats, 0..BASS_GATE_SCORE_MAX: while closed, each kick that repeats an earlier bar
    // adds to it and each one that does not takes from it, weighed against how often a repeat would happen by chance;
    // while open, matches add to it and long runs without one wear it down.
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
    // Seconds the gate has run (its own clock, from dt), and the clock times of kicks heard with no beat to place them on
    // (a ring of BASS_GATE_KICK_HISTORY, NaN when unused), placed on the beat once there is one.
    clock: number;
    unplacedTimes: Float64Array;
    unplacedHead: number;
    // Whether the previous call had a locked beat, to notice the one that brings it.
    onGrid: boolean;
    // Beat positions of the latest kicks (a ring of BASS_GATE_KICK_HISTORY).
    kickTimes: Float64Array;
    kickHead: number;
    // Where in the beat (0..1) the kicks land, learned from them; meaningless until phaseKnown.
    kickPhase: number;
    phaseKnown: boolean;
    // The bump to show on each beat, learned from the in-rhythm kicks' rises.
    kickStrength: number;
    // Beats since a kick last landed at the learned place; the score only decays after BASS_GATE_GRACE_BEATS of them.
    beatsSinceOnBeat: number;
    // Seconds the tempo has been unlocked; the gate forgets the beat only after BASS_GATE_LOCK_GRACE_SECONDS.
    unlockedSeconds: number;
    // The beat phase seen on the previous call, to notice the clock passing the learned kick place; NaN when that call had
    // no beat phase (and at the start), so a phase that appears after a gap is never read as a pass from a stale one.
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
        clock: 0,
        unplacedTimes: new Float64Array(BASS_GATE_KICK_HISTORY).fill(NaN),
        unplacedHead: 0,
        onGrid: false,
        kickTimes: new Float64Array(BASS_GATE_KICK_HISTORY).fill(NaN),
        kickHead: 0,
        kickPhase: 0,
        phaseKnown: false,
        kickStrength: 1,
        beatsSinceOnBeat: 0,
        unlockedSeconds: 0,
        lastPhase: NaN,
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
    state.kickTimes.fill(NaN);
}

// The three outcomes of comparing a kick with the bar before: it repeated it, it did not, or there was nothing there
// to compare with.
const REPEATED = 1;
const NOT_REPEATED = 0;
const NO_EARLIER_BAR = -1;

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
    // Kicks heard before a new song are not its bassline.
    if (songChanged) state.unplacedTimes.fill(NaN);
    state.clock += step;
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

    // A bassline repeats every bar and scattered bass does not, so a kick is in rhythm when a kick landed at the same
    // beat position one bar (four beats) earlier. A random kick does that by chance too, and the busier the bass the
    // more often, so each kick is weighed against that chance rather than counted.
    const phase = rhythm.beatPhase;
    const onGrid = tempoLocked && phase !== undefined;
    if (BASS_GATE_PRELOCK_SECONDS > 0) {
        if (onset && !onGrid) {
            state.unplacedTimes[state.unplacedHead] = state.clock;
            state.unplacedHead = (state.unplacedHead + 1) % BASS_GATE_KICK_HISTORY;
        } else if (onGrid && !state.onGrid) {
            placeUnplacedKicks(state, rhythm.beatCount + phase, rhythm.bpm);
        }
    }
    state.onGrid = onGrid;
    if (onset && onGrid) {
        const offset = state.phaseKnown ? wrapSigned(phase - state.kickPhase) : 0;
        if (state.phaseKnown) state.kickOffset = offset;
        const atPlace = state.phaseKnown && Math.abs(offset) <= BASS_GATE_PHASE_WINDOW;
        const position = rhythm.beatCount + phase;
        // Once open, only kicks at the learned place keep the evidence, so a bassline that has moved to another place wears
        // it down and is learned afresh, as before; the bar repeat is what finds a bassline in the first place.
        const repeat = state.open ? NO_EARLIER_BAR : repeatsEarlierBar(state, position);
        const matched = state.open ? atPlace : repeat === REPEATED;
        const chance = state.open ? 0 : chanceOfRepeat(state, position);
        rememberKick(state, position);
        if (atPlace) {
            state.kickPhase = wrapUnit(state.kickPhase + offset * BASS_GATE_PHASE_ADAPT);
        } else if (!state.open) {
            // Until it opens, the place follows the latest kick, so it is a real kick's place once the bassline is found.
            state.kickPhase = phase;
            state.phaseKnown = true;
        }
        if (matched) {
            state.beatsSinceOnBeat = 0;
            state.measuring = true;
        }
        if (state.open) {
            if (matched) state.score = Math.min(BASS_GATE_SCORE_MAX, state.score + 1);
        } else if (repeat !== NO_EARLIER_BAR) {
            // The evidence moves by the log of how much likelier this outcome is for a real bassline than for chance,
            // and never falls below 0, so a long stretch of scattered bass does not have to be paid back later. A kick
            // with no earlier bar to compare with says nothing either way. No upper limit is needed here: a sum that
            // reaches the open score opens the gate below, which sets it to the maximum.
            weighRepeat(state, matched, chance);
        }
    }
    // Two thresholds, so a score hovering near one value does not flicker the gate.
    if (state.open) {
        if (state.score <= BASS_GATE_CLOSE_SCORE) state.open = false;
    } else if (state.score >= BASS_GATE_OPEN_SCORE) {
        state.open = true;
        // Opened evidence starts at the top, so a bassline that has just been found is held through its first breaks.
        state.score = BASS_GATE_SCORE_MAX;
        state.kickPhase = bestSupportedPlace(state);
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
    } else {
        state.lastPhase = NaN;
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

// The place in the beat where most of the remembered kicks land, within BASS_GATE_PHASE_WINDOW, centered on them; the
// latest kick's place breaks a tie. Until the gate opens the place follows the latest kick, and once open it only moves
// toward kicks near it, so the place it opens with is the one it keeps. A bassline with kicks at two places in the beat
// (on the beat and an off-beat accent) used to open on whichever came last; opening a few bars sooner (kicks placed from
// before the lock, S5) made that the off-beat one on four tracks, and every bump then landed 90 to 300 ms off the beat.
// Only the kicks of the last two bars count, the span the repeats that opened the gate look back over, so a bassline
// that moved is not pulled back to its old place by kicks still in the history. Allocates nothing.
function bestSupportedPlace(state: BassGateState): number {
    const times = state.kickTimes;
    const since =
        times[(state.kickHead + BASS_GATE_KICK_HISTORY - 1) % BASS_GATE_KICK_HISTORY] - 2 * BASS_GATE_BAR_BEATS;
    let bestRank = 0;
    let bestPlace = state.kickPhase;
    for (const candidate of times) {
        if (!(candidate >= since)) continue;
        let count = 0;
        let offsets = 0;
        for (const other of times) {
            const offset = wrapSigned(other - candidate);
            if (other >= since && Math.abs(offset) <= BASS_GATE_PHASE_WINDOW) {
                count++;
                offsets += offset;
            }
        }
        const place = wrapUnit(candidate + offsets / count);
        // A repeated place on the beat (allowing the bass pulse's lag) beats any place off it, and on a tie the latest
        // kick's place wins (the position term is far below 1).
        const onBeat = count > 1 && Math.abs(wrapSigned(place - BASS_GATE_ON_BEAT_CENTER)) <= BASS_GATE_ON_BEAT_RADIUS;
        const rank = count + (onBeat ? BASS_GATE_KICK_HISTORY : 0) + candidate * 1e-9;
        if (rank > bestRank) {
            bestRank = rank;
            bestPlace = place;
        }
    }
    return bestPlace;
}

// Moves the closed gate's evidence by the log of how much likelier this outcome is for a real bassline than for chance.
// Bass so busy that chance alone repeats at least as often as a real bassline would tells nothing: the log would turn
// negative for a repeat and positive for a miss, so the kick is neutral there instead. With the current constants the
// chance tops out near 0.72 (the whole kick history in the last 8 beats), below the repeat rate, so this only guards
// against retuning.
function weighRepeat(state: BassGateState, matched: boolean, chance: number): void {
    if (chance >= BASS_GATE_REPEAT_RATE) return;
    const likelihood = matched ? BASS_GATE_REPEAT_RATE / chance : (1 - BASS_GATE_REPEAT_RATE) / (1 - chance);
    state.score = Math.max(0, state.score + Math.log(likelihood));
}

// Places the kicks heard without a beat, within BASS_GATE_PRELOCK_SECONDS, at the beat positions the tracker's tempo puts
// them at, counting back from the position now, and weighs them as evidence as if they had been heard on the beat, so
// the first kicks on the beat have earlier bars to repeat. A gate that is still open (a short dropout) keeps its
// bassline and does not need them.
function placeUnplacedKicks(state: BassGateState, now: number, bpm: number): void {
    const times = state.unplacedTimes;
    if (!state.open && bpm > 0) {
        // Oldest first, as they were heard: the ring from its head.
        for (let i = 0; i < BASS_GATE_KICK_HISTORY; i++) {
            const time = times[(state.unplacedHead + i) % BASS_GATE_KICK_HISTORY];
            const ago = state.clock - time;
            if (!(ago <= BASS_GATE_PRELOCK_SECONDS)) continue;
            const position = now - (ago * bpm) / 60;
            const repeat = repeatsEarlierBar(state, position);
            if (repeat !== NO_EARLIER_BAR) weighRepeat(state, repeat === REPEATED, chanceOfRepeat(state, position));
            rememberKick(state, position);
            state.kickPhase = wrapUnit(position);
            state.phaseKnown = true;
        }
    }
    times.fill(NaN);
}

function rememberKick(state: BassGateState, position: number): void {
    state.kickTimes[state.kickHead] = position;
    state.kickHead = (state.kickHead + 1) % BASS_GATE_KICK_HISTORY;
}

// Whether a remembered kick landed one bar before this beat position, within the bar window. When nothing at all
// landed near that place (the kick there was masked or missed, or the bassline rested), the bar before that one is
// asked instead, so one missed kick does not also fail the kick that repeats it a bar later. When that place is empty
// too there is nothing to compare with. The unused slots hold NaN, which is never near.
function repeatsEarlierBar(state: BassGateState, position: number): number {
    for (let bars = 1; bars <= 2; bars++) {
        let near = false;
        let repeated = false;
        for (const before of state.kickTimes) {
            const distance = Math.abs(position - before - bars * BASS_GATE_BAR_BEATS);
            if (distance <= BASS_GATE_BAR_WINDOW) repeated = true;
            if (distance <= BASS_GATE_EMPTY_RADIUS) near = true;
        }
        if (repeated) return REPEATED;
        if (near) return NOT_REPEATED;
    }
    return NO_EARLIER_BAR;
}

// How likely a kick here is to repeat an earlier bar by chance alone: the share of a beat that the bar windows of the
// recent kicks cover, from how many kicks landed in the last BASS_GATE_DENSITY_BEATS beats.
function chanceOfRepeat(state: BassGateState, position: number): number {
    let recent = 0;
    for (const before of state.kickTimes) {
        if (before < position && before >= position - BASS_GATE_DENSITY_BEATS) recent++;
    }
    const covered = (recent / BASS_GATE_DENSITY_BEATS) * 2 * BASS_GATE_BAR_WINDOW * BASS_GATE_CHANCE_MARGIN;
    return Math.max(BASS_GATE_CHANCE_MIN, 1 - Math.exp(-covered));
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
