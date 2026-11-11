import { describe, expect, it } from 'vitest';
import { AUTO_DANCE, AUTO_ROTATE_BARS } from './dancingCharacterConfig';
import { createDanceDirector, createDanceDirectorOutput, type DanceDirectorInput } from './dancingCharacterDirector';

type Id = 'a' | 'b' | 'c';
const ALL: readonly Id[] = ['a', 'b', 'c'];

function setup(available: readonly Id[] = ALL, selection: string = AUTO_DANCE, locked = true) {
    const director = createDanceDirector<Id>(available);
    const out = createDanceDirectorOutput<Id>(available[0]);
    const input: DanceDirectorInput = {
        selection,
        beatCount: 0,
        downbeatCount: 0,
        meterLocked: locked,
        songChangeCount: 0,
    };
    director.update(input, out);
    return {
        director,
        out,
        input,
        tick: () => director.update(input, out),
        bar() {
            input.beatCount += 4;
            input.downbeatCount += 1;
            director.update(input, out);
        },
        beat() {
            input.beatCount += 1;
            director.update(input, out);
        },
    };
}

describe('createDanceDirector', () => {
    it('throws without available dances', () => {
        expect(() => createDanceDirector<Id>([])).toThrow(/at least one/);
    });

    it('creates an idle output', () => {
        expect(createDanceDirectorOutput<Id>('b')).toEqual({ active: 'b', next: null, switchNow: false });
    });

    it('treats the first update as a recording only', () => {
        const director = createDanceDirector<Id>(ALL);
        const out = createDanceDirectorOutput<Id>('a');
        director.update(
            { selection: 'b', beatCount: 40, downbeatCount: 10, meterLocked: true, songChangeCount: 3 },
            out,
        );
        expect(out).toEqual({ active: 'a', next: 'b', switchNow: false });
    });

    it('switches a manual selection on the next locked downbeat only', () => {
        const s = setup(ALL, 'b');
        expect(s.out.next).toBe('b');
        s.beat();
        s.beat();
        expect(s.out.switchNow).toBe(false);
        s.bar();
        expect(s.out).toEqual({ active: 'b', next: null, switchNow: true });
        s.bar();
        expect(s.out).toEqual({ active: 'b', next: null, switchNow: false });
    });

    it('counts several downbeats in one update as one boundary', () => {
        const s = setup(ALL, 'b');
        s.input.downbeatCount += 3;
        s.tick();
        expect(s.out.switchNow).toBe(true);
    });

    it('uses every 4th beat while unlocked and ignores downbeats', () => {
        const s = setup(ALL, 'b', false);
        s.input.downbeatCount += 1;
        s.tick();
        s.beat();
        s.beat();
        s.beat();
        expect(s.out.switchNow).toBe(false);
        s.beat();
        expect(s.out).toEqual({ active: 'b', next: null, switchNow: true });
    });

    it('handles a multi-beat jump and keeps the remainder', () => {
        const s = setup(ALL, 'b', false);
        s.input.beatCount += 5;
        s.tick();
        expect(s.out.switchNow).toBe(true);
        s.input.selection = 'c';
        s.beat();
        s.beat();
        expect(s.out.switchNow).toBe(false);
        s.beat();
        expect(s.out.switchNow).toBe(true);
    });

    it('does not lose or double a boundary when the meter lock changes', () => {
        const s = setup(ALL, 'b', false);
        s.beat();
        s.beat();
        s.beat();
        // Lock: the partial beat tally is dropped and only downbeats count now.
        s.input.meterLocked = true;
        s.beat();
        expect(s.out.switchNow).toBe(false);
        s.input.selection = 'c';
        s.bar();
        expect(s.out).toEqual({ active: 'c', next: null, switchNow: true });
        // Unlock: a fresh 4-beat tally, and a downbeat arriving with beats is not a second boundary.
        s.input.meterLocked = false;
        s.input.selection = 'a';
        s.beat();
        s.beat();
        s.input.downbeatCount += 1;
        s.beat();
        expect(s.out.switchNow).toBe(false);
        s.beat();
        expect(s.out).toEqual({ active: 'a', next: null, switchNow: true });
    });

    it('cancels a pending switch when the selection returns before the boundary', () => {
        const s = setup(ALL, 'b');
        s.tick();
        expect(s.out.next).toBe('b');
        s.input.selection = 'a';
        s.tick();
        expect(s.out.next).toBeNull();
        s.bar();
        expect(s.out).toEqual({ active: 'a', next: null, switchNow: false });
    });

    it('maps unavailable and unknown selections to the first available dance', () => {
        const s = setup(['b', 'c'], 'c');
        s.out.active = 'c';
        s.input.selection = 'a';
        s.tick();
        expect(s.out.next).toBe('b');
        s.bar();
        expect(s.out.active).toBe('b');
        s.input.selection = 'not-a-dance';
        s.out.active = 'c';
        s.tick();
        expect(s.out.next).toBe('b');
        s.out.active = 'b';
        s.tick();
        expect(s.out.next).toBeNull();
    });

    it('rotates in Auto every 8 bars while locked and never repeats', () => {
        const s = setup();
        const seen: Id[] = [];
        for (let i = 0; i < AUTO_ROTATE_BARS * 3; i++) {
            s.bar();
            if (s.out.switchNow) seen.push(s.out.active);
            else expect(s.out.next).toBeNull();
        }
        expect(seen).toEqual(['b', 'c', 'a']);
    });

    it('rotates in Auto every 32 beats while unlocked', () => {
        const s = setup(ALL, AUTO_DANCE, false);
        for (let i = 0; i < AUTO_ROTATE_BARS * 4 - 1; i++) {
            s.beat();
            expect(s.out.switchNow).toBe(false);
        }
        s.beat();
        expect(s.out).toEqual({ active: 'b', next: null, switchNow: true });
    });

    it('switches in Auto on a song change, but only at the next boundary', () => {
        const s = setup();
        s.input.songChangeCount += 1;
        s.tick();
        expect(s.out).toEqual({ active: 'a', next: 'b', switchNow: false });
        s.bar();
        expect(s.out).toEqual({ active: 'b', next: null, switchNow: true });
        // The bar count restarted with the switch: 7 more bars do nothing.
        for (let i = 0; i < AUTO_ROTATE_BARS - 1; i++) {
            s.bar();
            expect(s.out.switchNow).toBe(false);
        }
        s.bar();
        expect(s.out.active).toBe('c');
    });

    it('ignores song changes outside Auto and does not carry them into Auto', () => {
        const s = setup(ALL, 'a');
        s.input.songChangeCount += 1;
        s.tick();
        expect(s.out.next).toBeNull();
        s.input.selection = AUTO_DANCE;
        s.bar();
        expect(s.out.switchNow).toBe(false);
    });

    it('does not switch when entering Auto and restarts its bar count', () => {
        const s = setup(ALL, 'a');
        for (let i = 0; i < 5; i++) s.bar();
        s.input.selection = AUTO_DANCE;
        s.tick();
        expect(s.out.switchNow).toBe(false);
        for (let i = 0; i < AUTO_ROTATE_BARS - 1; i++) {
            s.bar();
            expect(s.out.switchNow).toBe(false);
        }
        s.bar();
        expect(s.out.switchNow).toBe(true);
    });

    it('never switches in Auto with a single dance', () => {
        const s = setup(['a']);
        s.input.songChangeCount += 1;
        for (let i = 0; i < AUTO_ROTATE_BARS * 2; i++) {
            s.bar();
            expect(s.out).toEqual({ active: 'a', next: null, switchNow: false });
        }
    });

    it('forgets counters and pending switches on reset', () => {
        const s = setup(ALL, AUTO_DANCE);
        s.input.songChangeCount += 1;
        s.tick();
        expect(s.out.next).toBe('b');
        s.director.reset();
        s.input.beatCount += 100;
        s.input.downbeatCount += 100;
        s.tick();
        // Counters were re-recorded, so the jump is no boundary and the pending song change is gone.
        expect(s.out).toEqual({ active: 'a', next: null, switchNow: false });
    });

    it('reuses the output object and allocates nothing per update', () => {
        const s = setup();
        const out = s.out;
        const keys = Object.keys(out);
        for (let i = 0; i < 1000; i++) s.bar();
        expect(s.out).toBe(out);
        expect(Object.keys(out)).toEqual(keys);
    });
});
