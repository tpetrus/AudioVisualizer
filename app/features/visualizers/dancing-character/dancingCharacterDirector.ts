import { AUTO_DANCE, AUTO_ROTATE_BARS, FALLBACK_BEATS_PER_BAR } from './dancingCharacterConfig';

export interface DanceDirectorInput {
    /** AUTO_DANCE or a dance id. A string that is no known id at all (a stale value) counts as AUTO_DANCE. */
    selection: string;
    beatCount: number;
    downbeatCount: number;
    /** True when the rhythm tracker has a locked meter (`barPhase !== undefined`). */
    meterLocked: boolean;
    songChangeCount: number;
}

export interface DanceDirectorOutput<Id extends string> {
    /** The dance that should be at full weight once any fade finishes. */
    active: Id;
    /** A pending switch waiting for the next boundary. */
    next: Id | null;
    /** True on exactly the update where a switch starts. */
    switchNow: boolean;
}

export interface DanceDirector<Id extends string> {
    update(input: Readonly<DanceDirectorInput>, out: DanceDirectorOutput<Id>): void;
    reset(): void;
}

export function createDanceDirectorOutput<Id extends string>(initial: Id): DanceDirectorOutput<Id> {
    return { active: initial, next: null, switchNow: false };
}

/**
 * Decides which dance plays and when a switch starts. Switches only start on a bar boundary so the cross-fade lines up
 * with the music: a downbeat while the meter is locked, otherwise every FALLBACK_BEATS_PER_BAR-th beat. The beat tally
 * restarts whenever the meter lock changes, so a boundary is never counted by both schemes (doubled) and the partial
 * count of one scheme never leaks into the other (lost or early).
 *
 * `update` allocates nothing: all state lives in one object made at creation and the output is written in place.
 */
// `known` is every id the dance registry has, `available` the ones that actually loaded. A known id that did not load
// falls back to the first loaded dance, so the visitor still sees a dance; anything else is a stale value and means Auto.
export function createDanceDirector<Id extends string>(
    available: readonly Id[],
    known: readonly Id[] = available,
): DanceDirector<Id> {
    if (available.length === 0) {
        throw new Error('createDanceDirector needs at least one available dance.');
    }
    const first = available[0];
    const availableStrings: readonly string[] = available;
    const knownStrings: readonly string[] = known;

    const state = {
        started: false,
        lastBeat: 0,
        lastDownbeat: 0,
        lastSong: 0,
        lastLocked: false,
        // Beats seen since the director started or the meter lock last changed (unlocked scheme only).
        beatTally: 0,
        // Boundaries since the last switch (or since Auto was entered).
        boundaries: 0,
        songPending: false,
        wasAuto: false,
    };

    // Next dance after `current` in `available` order. Only called with two or more dances, so it never repeats.
    function cycleFrom(current: Id): Id {
        const i = available.indexOf(current);
        return available[(i + 1) % available.length];
    }

    function reset(): void {
        state.started = false;
    }

    function update(input: Readonly<DanceDirectorInput>, out: DanceDirectorOutput<Id>): void {
        out.switchNow = false;

        if (!state.started) {
            // The first update only records the counters; whatever they already hold is not a boundary.
            state.started = true;
            state.lastBeat = input.beatCount;
            state.lastDownbeat = input.downbeatCount;
            state.lastSong = input.songChangeCount;
            state.lastLocked = input.meterLocked;
            state.beatTally = 0;
            state.boundaries = 0;
            state.songPending = false;
            state.wasAuto = input.selection === AUTO_DANCE;
        }

        let boundary = false;
        if (input.meterLocked !== state.lastLocked) {
            state.lastLocked = input.meterLocked;
            state.beatTally = 0;
        }
        if (input.meterLocked) {
            // Several downbeats in one update still count as one boundary: the switch can only start once.
            boundary = input.downbeatCount > state.lastDownbeat;
        } else {
            const beats = input.beatCount - state.lastBeat;
            if (beats > 0) {
                state.beatTally += beats;
                if (state.beatTally >= FALLBACK_BEATS_PER_BAR) {
                    boundary = true;
                    state.beatTally %= FALLBACK_BEATS_PER_BAR;
                }
            }
        }
        state.lastBeat = input.beatCount;
        state.lastDownbeat = input.downbeatCount;
        if (input.songChangeCount > state.lastSong) state.songPending = true;
        state.lastSong = input.songChangeCount;

        // A selection that is neither a known nor a loaded id (for example a dance renamed since) is treated as Auto.
        const isAuto =
            input.selection === AUTO_DANCE ||
            (!knownStrings.includes(input.selection) && !availableStrings.includes(input.selection));
        if (isAuto && !state.wasAuto) {
            // Entering Auto never switches by itself; it starts counting bars from now.
            state.boundaries = 0;
        }
        state.wasAuto = isAuto;
        if (!isAuto) state.songPending = false;

        let target: Id | null = null;
        if (!isAuto) {
            const wanted = availableStrings.includes(input.selection) ? (input.selection as Id) : first;
            if (wanted !== out.active) target = wanted;
        } else if (available.length > 1 && state.songPending) {
            target = cycleFrom(out.active);
        }

        if (boundary) {
            state.boundaries += 1;
            if (isAuto && target === null && available.length > 1 && state.boundaries >= AUTO_ROTATE_BARS) {
                target = cycleFrom(out.active);
            }
            if (target !== null) {
                out.active = target;
                out.switchNow = true;
                state.boundaries = 0;
                state.songPending = false;
                target = null;
            }
        }
        out.next = target;
    }

    return { update, reset };
}
