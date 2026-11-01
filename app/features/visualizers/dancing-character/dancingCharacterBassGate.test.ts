import { describe, expect, it } from 'vitest';
import { createRhythmState } from '~/features/rhythm/types';
import { createBassGateState, stepBassGate } from './dancingCharacterBassGate';
import { BASS_GATE_GRACE_BEATS, BASS_GATE_MIN_INTERVAL } from './dancingCharacterConfig';

const DT = 1 / 60;
// 120 BPM: a beat every 30 frames.
const FRAMES_PER_BEAT = 30;

// Steps the gate with a 120 BPM clock. `bassAt(frame, phase)` gives the raw bass for each frame.
function drive(
    frames: number,
    bassAt: (frame: number, phase: number) => number,
    options: { locked?: boolean; start?: number; state?: ReturnType<typeof createBassGateState> } = {},
) {
    const state = options.state ?? createBassGateState();
    const rhythm = createRhythmState();
    const outputs: number[] = [];
    const start = options.start ?? 0;
    for (let i = start; i < start + frames; i++) {
        const beat = i / FRAMES_PER_BEAT;
        rhythm.beatPhase = beat % 1;
        rhythm.beatCount = Math.floor(beat);
        outputs.push(stepBassGate(bassAt(i, rhythm.beatPhase), rhythm, options.locked ?? true, state, DT));
    }
    return { state, rhythm, outputs };
}

// A kick on every beat: 4 frames of 0.8 right after the beat, silence between.
const onBeatKick = (frame: number) => (frame % FRAMES_PER_BEAT < 4 ? 0.8 : 0);

describe('stepBassGate', () => {
    it('opens after a few on-beat kicks and then passes the pulse', () => {
        const { state, outputs } = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        expect(state.open).toBe(true);
        // The early beats show nothing; later kicks come through at full strength once the gate has eased in.
        expect(outputs.slice(0, FRAMES_PER_BEAT * 2).every((value) => value === 0)).toBe(true);
        expect(Math.max(...outputs.slice(-FRAMES_PER_BEAT * 2))).toBeCloseTo(1);
    });

    // Measured with the e2e beat fixture: the bass pulse often stands out only once a bar, because a steady kick on
    // every beat flattens its fast-versus-slow comparison. A kick on every downbeat is still a consistent beat.
    it('opens on one kick per bar and stays open while the kicks keep coming', () => {
        const kickPerBar = (frame: number) => (frame % (FRAMES_PER_BEAT * 4) < 4 ? 0.8 : 0);
        const { state, outputs } = drive(FRAMES_PER_BEAT * 4 * 4, kickPerBar);
        expect(state.open).toBe(true);
        const more = drive(FRAMES_PER_BEAT * 4 * 8, kickPerBar, { state, start: FRAMES_PER_BEAT * 4 * 4 });
        expect(more.state.open).toBe(true);
        expect(Math.max(...outputs, ...more.outputs)).toBeCloseTo(1);
    });

    // The user's report: bumps showed at a song's start and stopped 10 to 15 s in. The bass pulse compares the bass
    // with its last ~1.5 s, so mid-song a kick is only a small rise on a raised floor: here it swings between 0.2 and
    // 0.32 every beat, never below the old fixed re-arm level (0.15) nor above the old onset level (0.35).
    it('keeps showing full bumps mid-song, when each kick is only a small rise on a raised floor', () => {
        const midSong = (frame: number) => (frame % FRAMES_PER_BEAT < 6 ? 0.32 : 0.2);
        const beats = 60;
        const { state, outputs } = drive(FRAMES_PER_BEAT * beats, midSong);
        expect(state.open).toBe(true);
        // Every beat in the last 40 (20 s at 120 BPM) shows a clear bump.
        for (let beat = beats - 40; beat < beats; beat++) {
            const slice = outputs.slice(beat * FRAMES_PER_BEAT, (beat + 1) * FRAMES_PER_BEAT);
            expect(Math.max(...slice)).toBeGreaterThanOrEqual(0.5);
        }
    });

    it('keeps the gate open through the grace period of silence, then closes it', () => {
        const { state } = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        const silent = () => 0;
        const start = FRAMES_PER_BEAT * 8;
        drive(FRAMES_PER_BEAT * BASS_GATE_GRACE_BEATS, silent, { state, start });
        expect(state.open).toBe(true);
        drive(FRAMES_PER_BEAT * 8, silent, { state, start: start + FRAMES_PER_BEAT * BASS_GATE_GRACE_BEATS });
        expect(state.open).toBe(false);
    });

    it('never shows random bumps that fall between the beats', () => {
        const { outputs, state } = drive(FRAMES_PER_BEAT * 20, (frame, phase) =>
            phase > 0.4 && phase < 0.6 && frame % 3 === 0 ? 0.9 : 0,
        );
        expect(Math.max(...outputs)).toBe(0);
        expect(state.open).toBe(false);
    });

    it('does not show one stray off-beat bump while open', () => {
        const base = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        const start = FRAMES_PER_BEAT * 8;
        // Silent until half way through the beat, then a bump, then silence again.
        const { outputs } = drive(FRAMES_PER_BEAT, (frame) => (frame - start >= 14 && frame - start < 18 ? 0.9 : 0), {
            state: base.state,
            start,
        });
        // Only the previous kick's decay may remain, so nothing after the bump starts is above where it began.
        expect(Math.max(...outputs.slice(14))).toBeLessThanOrEqual(outputs[13]);
    });

    it('shows nothing while the tempo is not locked, whatever the bass', () => {
        const { outputs, state } = drive(FRAMES_PER_BEAT * 8, onBeatKick, { locked: false });
        expect(Math.max(...outputs)).toBe(0);
        expect(state.open).toBe(false);
    });

    it('closes and forgets the score when the tempo lock is lost', () => {
        const { state } = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        expect(state.open).toBe(true);
        drive(2, onBeatKick, { state, locked: false, start: FRAMES_PER_BEAT * 8 });
        expect(state.open).toBe(false);
        expect(state.score).toBe(0);
    });

    it('closes when the song changes', () => {
        const { state, rhythm } = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        rhythm.songChangeCount++;
        stepBassGate(0, rhythm, true, state, DT);
        expect(state.open).toBe(false);
        expect(state.score).toBe(0);
    });

    it('closes after the kicks stop landing on the beat', () => {
        const { state } = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        drive(FRAMES_PER_BEAT * 12, (frame, phase) => (phase > 0.45 && phase < 0.55 && frame % 2 === 0 ? 0.9 : 0), {
            state,
            start: FRAMES_PER_BEAT * 8,
        });
        expect(state.open).toBe(false);
    });

    it('starts at most three reactions in any closed second even for 6 Hz kicks', () => {
        const { state } = drive(FRAMES_PER_BEAT * 8, onBeatKick);
        // Kicks every 10 frames (6 Hz). Whenever one starts following, the level jumps to the raw bass.
        const start = FRAMES_PER_BEAT * 8;
        const starts: number[] = [];
        let wasFollowing = false;
        for (let i = start; i < start + 120; i++) {
            const rhythm = createRhythmState();
            const beat = i / FRAMES_PER_BEAT;
            // Every kick is inside the beat window of a beat that is 10 frames apart (a fast double-time clock).
            rhythm.beatPhase = ((i % 10) / 10) * 0.1;
            rhythm.beatCount = Math.floor(beat);
            stepBassGate(i % 10 < 3 ? 0.9 : 0, rhythm, true, state, DT);
            if (state.following && !wasFollowing) starts.push(i);
            wasFollowing = state.following;
        }
        expect(starts.length).toBeGreaterThan(0);
        for (const first of starts) {
            const inWindow = starts.filter((frame) => frame >= first && frame <= first + 60).length;
            expect(inWindow).toBeLessThanOrEqual(3);
        }
        for (let i = 1; i < starts.length; i++) {
            expect((starts[i] - starts[i - 1]) * DT).toBeGreaterThanOrEqual(BASS_GATE_MIN_INTERVAL - 1e-9);
        }
    });

    it('eases in and out within [0, 1] without jumps', () => {
        const opening = drive(FRAMES_PER_BEAT * 10, onBeatKick);
        const closing = drive(FRAMES_PER_BEAT * 6, () => 0, {
            state: opening.state,
            locked: false,
            start: FRAMES_PER_BEAT * 10,
        });
        for (const value of [...opening.outputs, ...closing.outputs]) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
        expect(closing.outputs.at(-1)).toBe(0);
        // The weight moves at most dt / ease per frame, so the output never jumps by more than the kick height.
        expect(opening.state.weight).toBe(0);
    });

    it('clamps a huge or negative dt and ignores out of range bass', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        rhythm.beatPhase = 0;
        expect(stepBassGate(5, rhythm, true, state, 100)).toBe(0);
        expect(stepBassGate(-3, rhythm, true, state, -1)).toBe(0);
        expect(state.weight).toBe(0);
    });
});
