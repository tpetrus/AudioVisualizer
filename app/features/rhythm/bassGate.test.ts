import { describe, expect, it } from 'vitest';
import { createBassGateState, forgetBassline, stepBassGate } from './bassGate';
import {
    BASS_GATE_ATTACK_SECONDS,
    BASS_GATE_EASE_SECONDS,
    BASS_GATE_GRACE_BEATS,
    BASS_GATE_LOCK_GRACE_SECONDS,
    BASS_GATE_MIN_INTERVAL,
} from './bassGateConfig';
import { createRhythmState } from './types';

const DT = 1 / 60;
// 120 BPM: a beat every 30 frames.
const FRAMES_PER_BEAT = 30;

type State = ReturnType<typeof createBassGateState>;

// Steps the gate with a 120 BPM clock. `bassAt(frame, phase)` gives the raw bass for each frame.
function drive(
    frames: number,
    bassAt: (frame: number, phase: number) => number,
    options: { locked?: boolean; start?: number; state?: State } = {},
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

// The largest output in each beat of `outputs` (which started at a beat).
function peaksPerBeat(outputs: readonly number[]): number[] {
    const peaks: number[] = [];
    for (let i = 0; i < outputs.length; i += FRAMES_PER_BEAT) {
        peaks.push(Math.max(...outputs.slice(i, i + FRAMES_PER_BEAT)));
    }
    return peaks;
}

// A kick on every beat: 4 frames of 0.8 right after the beat, silence between.
const onBeatKick = (frame: number) => (frame % FRAMES_PER_BEAT < 4 ? 0.8 : 0);
const silent = () => 0;

// A gate locked onto on-beat kicks for 12 beats, with its fade-in finished.
function locked(): State {
    const { state } = drive(FRAMES_PER_BEAT * 12, onBeatKick);
    expect(state.open).toBe(true);
    expect(state.weight).toBe(1);
    return state;
}

describe('stepBassGate', () => {
    it('opens after a short run of kicks at one place, then pulses on every beat', () => {
        const { state, outputs } = drive(FRAMES_PER_BEAT * 12, onBeatKick);
        expect(state.open).toBe(true);
        // The first kick only sets the place and the next four open the gate, so the first beats show nothing.
        expect(outputs.slice(0, FRAMES_PER_BEAT * 4).every((value) => value === 0)).toBe(true);
        for (const peak of peaksPerBeat(outputs).slice(-4)) expect(peak).toBeGreaterThan(0.9);
    });

    // The user's report: bumps showed at a song's start and stopped 10 to 15 s in. The bass pulse compares the bass
    // with its last ~1.5 s, so mid-song a kick is only a small rise on a raised floor: here it swings between 0.2 and
    // 0.32 every beat.
    it('locks onto kicks that are only a small rise on a raised floor', () => {
        const midSong = (frame: number) => (frame % FRAMES_PER_BEAT < 6 ? 0.32 : 0.2);
        const { state, outputs } = drive(FRAMES_PER_BEAT * 60, midSong);
        expect(state.open).toBe(true);
        for (const peak of peaksPerBeat(outputs).slice(-40)) expect(peak).toBeGreaterThanOrEqual(0.5);
    });

    // Measured with the e2e beat fixture: the bass pulse often stands out only once a bar.
    it('opens on one kick per bar and then pulses on every beat', () => {
        const kickPerBar = (frame: number) => (frame % (FRAMES_PER_BEAT * 4) < 4 ? 0.8 : 0);
        const { state, outputs } = drive(FRAMES_PER_BEAT * 4 * 10, kickPerBar);
        expect(state.open).toBe(true);
        for (const peak of peaksPerBeat(outputs).slice(-8)) expect(peak).toBeGreaterThan(0.5);
    });

    // Business as usual: a locked bassline keeps pulsing through masked kicks and extra notes.
    it('keeps pulsing on every beat through eight beats in which no kick is heard', () => {
        const state = locked();
        const { outputs } = drive(FRAMES_PER_BEAT * 8, silent, { state, start: FRAMES_PER_BEAT * 12 });
        expect(state.open).toBe(true);
        for (const peak of peaksPerBeat(outputs)) expect(peak).toBeGreaterThan(0.9);
    });

    it('is not shaken by extra notes between the beats once locked', () => {
        const state = locked();
        const score = state.score;
        // The kick plus a second note half way through every beat.
        const busy = (frame: number) => (frame % FRAMES_PER_BEAT < 4 || frame % FRAMES_PER_BEAT >= 15 ? 0.8 : 0);
        drive(FRAMES_PER_BEAT * 16, busy, { state, start: FRAMES_PER_BEAT * 12 });
        expect(state.open).toBe(true);
        expect(state.score).toBeGreaterThanOrEqual(score);
        expect(state.kickPhase).toBeLessThan(0.1);
    });

    it('does not show a stray bump between the beats', () => {
        const start = FRAMES_PER_BEAT * 12;
        const plain = drive(FRAMES_PER_BEAT, silent, { state: locked(), start });
        const stray = drive(FRAMES_PER_BEAT, (frame) => (frame - start >= 14 && frame - start < 18 ? 0.9 : 0), {
            state: locked(),
            start,
        });
        expect(stray.outputs).toEqual(plain.outputs);
    });

    it('keeps the pulse for the grace period after the kicks stop, then fades it out', () => {
        const state = locked();
        const start = FRAMES_PER_BEAT * 12;
        drive(FRAMES_PER_BEAT * BASS_GATE_GRACE_BEATS, silent, { state, start });
        expect(state.open).toBe(true);
        const after = drive(FRAMES_PER_BEAT * 16, silent, {
            state,
            start: start + FRAMES_PER_BEAT * BASS_GATE_GRACE_BEATS,
        });
        expect(state.open).toBe(false);
        expect(after.outputs.at(-1)).toBe(0);
    });

    // Bass bumps at a different place in every beat have no rhythm, so they never open the gate. (A bassline that lands
    // at the same off-beat place every beat does keep the tempo, and is shown.)
    // Fitted to a real syncopated bassline (docs/agents/rhythm-findings.md): the kicks repeat every bar, but only about a
    // third land at one place in the beat, so the misses keep spending the evidence the hits earn.
    it.fails('opens within 8 beats on a syncopated bassline', () => {
        const pattern = [0, 0.75, 2, 2.3, 3.55];
        const bass = (frame: number) => {
            const position = (frame / FRAMES_PER_BEAT) % 4;
            return pattern.some((place) => position >= place && position < place + 4 / FRAMES_PER_BEAT) ? 0.8 : 0;
        };
        expect(drive(FRAMES_PER_BEAT * 8, bass).state.open).toBe(true);
    });

    it.each([1, 7, 42, 99, 2024])('never shows bumps that land at random places in the beat (seed %i)', (start) => {
        let seed = start;
        const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        const bumpFrame = Array.from({ length: 40 }, () => Math.floor(random() * FRAMES_PER_BEAT));
        const { outputs, state } = drive(FRAMES_PER_BEAT * 40, (frame) => {
            const beat = Math.floor(frame / FRAMES_PER_BEAT);
            const at = frame % FRAMES_PER_BEAT;
            return at >= bumpFrame[beat] && at < bumpFrame[beat] + 4 ? 0.9 : 0;
        });
        expect(Math.max(...outputs)).toBe(0);
        expect(state.open).toBe(false);
    });

    it('shows nothing while the tempo has never locked, whatever the bass', () => {
        const { outputs, state } = drive(FRAMES_PER_BEAT * 12, onBeatKick, { locked: false });
        expect(Math.max(...outputs)).toBe(0);
        expect(state.open).toBe(false);
    });

    it('holds the bassline through a short tempo dropout and forgets it after a long one', () => {
        const state = locked();
        let at = FRAMES_PER_BEAT * 12;
        const short = Math.floor(BASS_GATE_LOCK_GRACE_SECONDS / 2 / DT);
        drive(short, onBeatKick, { state, locked: false, start: at });
        at += short;
        expect(state.open).toBe(true);
        drive(FRAMES_PER_BEAT * 2, onBeatKick, { state, start: at });
        at += FRAMES_PER_BEAT * 2;
        drive(Math.ceil((BASS_GATE_LOCK_GRACE_SECONDS + 0.5) / DT), onBeatKick, { state, locked: false, start: at });
        expect(state.open).toBe(false);
        expect(state.phaseKnown).toBe(false);
    });

    it('forgets the bassline when the song changes, and fades out rather than snapping', () => {
        const { state, rhythm } = drive(FRAMES_PER_BEAT * 12, onBeatKick);
        rhythm.songChangeCount++;
        rhythm.beatPhase = 0.5;
        stepBassGate(0, rhythm, true, state, DT);
        expect(state.open).toBe(false);
        expect(state.score).toBe(0);
        expect(state.weight).toBeGreaterThan(0.9);
    });

    it('learns a new place only after the bassline has moved for a long time', () => {
        const state = locked();
        // The same kick, now half a beat later.
        const offBeat = (frame: number) => ((frame + FRAMES_PER_BEAT / 2) % FRAMES_PER_BEAT < 4 ? 0.8 : 0);
        const start = FRAMES_PER_BEAT * 12;
        drive(FRAMES_PER_BEAT * 8, offBeat, { state, start });
        // Two bars of a moved bassline are not enough to give up on the old one.
        expect(state.open).toBe(true);
        expect(state.kickPhase).toBeLessThan(0.1);
        drive(FRAMES_PER_BEAT * 40, offBeat, { state, start: start + FRAMES_PER_BEAT * 8 });
        expect(state.open).toBe(true);
        expect(state.kickPhase).toBeCloseTo(0.5, 1);
    });

    it('starts at most three bumps in any closed second, however fast the beat', () => {
        const state = locked();
        // A 360 BPM clock (a beat every 10 frames) with a kick on each beat.
        const starts: number[] = [];
        const rhythm = createRhythmState();
        for (let i = 0; i < 180; i++) {
            rhythm.beatPhase = (i % 10) / 10;
            rhythm.beatCount = 1000 + Math.floor(i / 10);
            stepBassGate(i % 10 < 3 ? 0.9 : 0, rhythm, true, state, DT);
            if (Math.abs(state.attackLeft - (BASS_GATE_ATTACK_SECONDS - DT)) < 1e-9) starts.push(i);
        }
        expect(starts.length).toBeGreaterThan(3);
        for (const first of starts) {
            expect(starts.filter((frame) => frame >= first && frame <= first + 60).length).toBeLessThanOrEqual(3);
        }
        for (let i = 1; i < starts.length; i++) {
            expect((starts[i] - starts[i - 1]) * DT).toBeGreaterThanOrEqual(BASS_GATE_MIN_INTERVAL - 1e-9);
        }
    });

    it('fades out over the whole ease time and stays within [0, 1]', () => {
        const opening = drive(FRAMES_PER_BEAT * 12, onBeatKick);
        for (const value of opening.outputs) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
        const fading = opening.state;
        forgetBassline(fading);
        drive(Math.round(BASS_GATE_EASE_SECONDS / 2 / DT), silent, { state: fading, start: FRAMES_PER_BEAT * 12 });
        expect(fading.weight).toBeCloseTo(0.5, 1);
        drive(Math.round(BASS_GATE_EASE_SECONDS / DT), silent, { state: fading, start: FRAMES_PER_BEAT * 20 });
        expect(fading.weight).toBe(0);
    });

    it('counts each bump start exactly once and never counts down', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        const starts: number[] = [];
        let previous = 0;
        for (let i = 0; i < FRAMES_PER_BEAT * 24; i++) {
            const beat = i / FRAMES_PER_BEAT;
            rhythm.beatPhase = beat % 1;
            rhythm.beatCount = Math.floor(beat);
            const wasSinceBump = state.sinceBump;
            stepBassGate(onBeatKick(i), rhythm, true, state, DT);
            expect(state.bumpCount).toBeGreaterThanOrEqual(previous);
            expect(state.bumpCount - previous).toBeLessThanOrEqual(1);
            // A bump starts exactly when the timer is zeroed.
            const started = state.sinceBump === 0 && wasSinceBump > 0;
            expect(state.bumpCount - previous).toBe(started ? 1 : 0);
            if (started) starts.push(i);
            previous = state.bumpCount;
        }
        expect(state.bumpCount).toBe(starts.length);
        expect(state.bumpCount).toBeGreaterThan(10);
    });

    it('leaves bumpCount and kickOffset alone when the bassline is forgotten', () => {
        const state = locked();
        const { bumpCount, kickOffset } = state;
        expect(bumpCount).toBeGreaterThan(0);
        forgetBassline(state);
        expect(state.bumpCount).toBe(bumpCount);
        expect(state.kickOffset).toBe(kickOffset);
    });

    it('starts kickOffset at NaN, keeps it NaN until a place is known, then records the wrapped offset', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        expect(state.bumpCount).toBe(0);
        expect(state.kickOffset).toBeNaN();

        // The first kick sets the place: no offset is measured against a place that was not known.
        rhythm.beatPhase = 0.1;
        stepBassGate(0.8, rhythm, true, state, DT);
        expect(state.phaseKnown).toBe(true);
        expect(state.kickPhase).toBeCloseTo(0.1, 12);
        expect(state.kickOffset).toBeNaN();

        // Re-arm, then a kick 0.05 beats late is measured before the place adapts.
        stepBassGate(0, rhythm, true, state, DT);
        rhythm.beatPhase = 0.15;
        stepBassGate(0.8, rhythm, true, state, DT);
        expect(state.kickOffset).toBeCloseTo(0.05, 12);

        // A kick just before the place across the wrap is a small negative offset, not nearly a whole beat.
        stepBassGate(0, rhythm, true, state, DT);
        rhythm.beatPhase = (state.kickPhase - 0.2 + 1) % 1;
        stepBassGate(0.8, rhythm, true, state, DT);
        expect(state.kickOffset).toBeCloseTo(-0.2, 12);
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
