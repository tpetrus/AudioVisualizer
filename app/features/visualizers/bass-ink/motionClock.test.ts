import { describe, expect, it } from 'vitest';
import { createRhythmState, type RhythmState } from '~/features/rhythm/types';
import { bassInkConfig } from './bassInkConfig';
import { advance, beatPunch, createMotionClock } from './motionClock';

const DT = 1 / 60;
const config = bassInkConfig.motion;
const FREE_RATE = 1 / config.freeBreathingSeconds;

function lockedState(barPhase: number, bpm = 120): RhythmState {
    const state = createRhythmState();
    state.bpm = bpm;
    state.barPhase = barPhase;
    state.beatPhase = (barPhase * 4) % 1;
    state.beatsPerBar = 4;
    state.tempoConfidence = 0.9;
    return state;
}

// Phase step that wraps correctly.
function stepOf(before: number, after: number): number {
    return after >= before ? after - before : after + 1 - before;
}

describe('motion clock', () => {
    it('breathes at the free rate with no tempo', () => {
        const clock = createMotionClock();
        const state = createRhythmState();
        let before = clock.phase;
        for (let i = 0; i < 120; i++) {
            const phase = advance(clock, state, DT);
            expect(stepOf(before, phase)).toBeCloseTo(FREE_RATE * DT, 9);
            before = phase;
        }
        expect(clock.locked).toBe(false);
        expect(clock.beatLockWeight).toBe(0);
    });

    it('wraps the phase into [0, 1)', () => {
        const clock = createMotionClock();
        const state = createRhythmState();
        for (let i = 0; i < 1000; i++) {
            const phase = advance(clock, state, DT);
            expect(phase).toBeGreaterThanOrEqual(0);
            expect(phase).toBeLessThan(1);
        }
    });

    it('locks at the enter confidence and releases only below the exit confidence', () => {
        const clock = createMotionClock();
        const state = lockedState(0);
        state.tempoConfidence = 0.5;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
        state.tempoConfidence = 0.6;
        advance(clock, state, DT);
        expect(clock.locked).toBe(true);
        // Inside the band it stays locked, and does not chatter.
        for (const confidence of [0.55, 0.45, 0.5, 0.41, 0.59]) {
            state.tempoConfidence = confidence;
            advance(clock, state, DT);
            expect(clock.locked).toBe(true);
        }
        state.tempoConfidence = 0.39;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
        // And back inside the band it stays unlocked.
        state.tempoConfidence = 0.55;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
    });

    it('does not lock without a beat position or a tempo, and unlocks when the beat position is lost', () => {
        const clock = createMotionClock();
        const state = lockedState(0);
        state.beatPhase = undefined;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
        state.beatPhase = 0.1;
        state.bpm = 0;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
        state.bpm = 120;
        advance(clock, state, DT);
        expect(clock.locked).toBe(true);
        state.beatPhase = undefined;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
    });

    it('locks on the beat alone while the meter is unsure', () => {
        const clock = createMotionClock();
        const state = lockedState(0);
        state.barPhase = undefined;
        state.beatsPerBar = undefined;
        advance(clock, state, DT);
        expect(clock.locked).toBe(true);
    });

    it('lines each beat up with a quarter of the breath when only the beat is known', () => {
        const clock = createMotionClock();
        const state = lockedState(0, 120);
        state.barPhase = undefined;
        clock.phase = 0.6;
        let beatClock = 0;
        const beatRate = 120 / 60;
        for (let i = 0; i < 60 * 30; i++) {
            beatClock = (beatClock + beatRate * DT) % 1;
            state.beatPhase = beatClock;
            advance(clock, state, DT);
        }
        // Which beat starts the breath is unknown, so any quarter is in line. Compared in breaths, like the bar.
        let error = beatClock - clock.phase * 4;
        error -= Math.round(error);
        expect(Math.abs(error / 4)).toBeLessThan(0.02);
    });

    it('eases the lock weight linearly over the ease time', () => {
        const clock = createMotionClock();
        const state = lockedState(0);
        advance(clock, state, config.weightEaseSeconds / 2);
        expect(clock.beatLockWeight).toBeCloseTo(0.5, 6);
        advance(clock, state, config.weightEaseSeconds);
        expect(clock.beatLockWeight).toBe(1);
        state.tempoConfidence = 0;
        advance(clock, state, config.weightEaseSeconds / 4);
        expect(clock.beatLockWeight).toBeCloseTo(0.75, 6);
    });

    it('never jumps or stalls while confidence crosses down and up (AC3)', () => {
        const clock = createMotionClock();
        const state = lockedState(0, 128);
        let before = clock.phase;
        let barClock = 0;
        const barRate = 128 / 60 / 4;
        const maxRate = Math.max(FREE_RATE, barRate);
        let minStep = Infinity;
        let maxStep = 0;
        for (let i = 0; i < 60 * 40; i++) {
            const seconds = i * DT;
            // Locked, then confidence collapses, then recovers; barPhase also vanishes for part of it.
            state.tempoConfidence = seconds < 10 ? 0.9 : seconds < 20 ? 0.1 : 0.9;
            barClock = (barClock + barRate * DT) % 1;
            state.barPhase = seconds >= 10 && seconds < 15 ? undefined : barClock;
            const phase = advance(clock, state, DT);
            const step = stepOf(before, phase);
            minStep = Math.min(minStep, step);
            maxStep = Math.max(maxStep, step);
            before = phase;
        }
        expect(minStep).toBeGreaterThan(0);
        // The correction adds at most the configured fraction on top of the larger base rate.
        expect(maxStep).toBeLessThanOrEqual(maxRate * DT * (1 + config.maxCorrectionFraction) + 1e-12);
    });

    it('converges on the bar phase when locked long enough', () => {
        const clock = createMotionClock();
        const state = lockedState(0, 120);
        clock.phase = 0.6;
        let barClock = 0;
        const barRate = 120 / 60 / 4;
        for (let i = 0; i < 60 * 30; i++) {
            barClock = (barClock + barRate * DT) % 1;
            state.barPhase = barClock;
            advance(clock, state, DT);
        }
        let error = state.barPhase! - clock.phase;
        error -= Math.round(error);
        expect(Math.abs(error)).toBeLessThan(0.02);
    });

    it('runs at the locked rate (one breath per bar) once locked and in phase', () => {
        const clock = createMotionClock();
        const state = lockedState(0, 120);
        advance(clock, state, 10);
        clock.phase = 0.3;
        state.barPhase = 0.3;
        const before = clock.phase;
        advance(clock, state, DT);
        state.barPhase = 0.3 + (120 / 60 / 4) * DT;
        expect(stepOf(before, clock.phase)).toBeCloseTo((120 / 60 / 4) * DT, 6);
    });

    it('uses 3 beats per bar for a waltz and 4 when the meter is unknown', () => {
        const waltz = createMotionClock();
        const state = lockedState(0, 90);
        state.beatsPerBar = 3;
        advance(waltz, state, 10);
        waltz.phase = 0.5;
        state.barPhase = 0.5;
        advance(waltz, state, DT);
        expect(stepOf(0.5, waltz.phase)).toBeCloseTo((90 / 60 / 3) * DT, 6);

        const unknown = createMotionClock();
        state.beatsPerBar = undefined;
        advance(unknown, state, 10);
        unknown.phase = 0.5;
        state.barPhase = 0.5;
        advance(unknown, state, DT);
        expect(stepOf(0.5, unknown.phase)).toBeCloseTo((90 / 60 / 4) * DT, 6);
    });

    it('falls back to the free rate while a fading lock has lost its tempo', () => {
        const clock = createMotionClock();
        const state = lockedState(0, 120);
        advance(clock, state, 10);
        state.bpm = 0;
        state.barPhase = undefined;
        state.tempoConfidence = 0;
        const before = clock.phase;
        advance(clock, state, DT);
        expect(stepOf(before, clock.phase)).toBeCloseTo(FREE_RATE * DT, 9);
    });

    it('treats a negative delta as no time', () => {
        const clock = createMotionClock();
        advance(clock, createRhythmState(), -1);
        expect(clock.phase).toBe(0);
    });

    describe('beatPunch', () => {
        function lockedClock(phase: number, beats = 4) {
            const clock = createMotionClock();
            clock.beatLockWeight = 1;
            clock.beatsPerBreath = beats;
            clock.phase = phase;
            return clock;
        }

        it('is 0 while the clock runs free', () => {
            const clock = createMotionClock();
            clock.phase = 0.01;
            expect(beatPunch(clock)).toBe(0);
        });

        it('peaks just after each beat and is 0 on the beat itself, so beats join without a step', () => {
            const attack = config.punchAttack;
            for (const beat of [0, 1, 2, 3]) {
                expect(beatPunch(lockedClock(beat / 4))).toBe(0);
                expect(beatPunch(lockedClock((beat + attack) / 4))).toBeGreaterThan(0.6);
                expect(beatPunch(lockedClock((beat + 0.5) / 4))).toBeLessThan(0.1);
            }
            expect(beatPunch(lockedClock(0.9999 / 4))).toBeLessThan(1e-3);
        });

        it('punches three times per breath in a bar of three', () => {
            expect(beatPunch(lockedClock((1 + config.punchAttack) / 3, 3))).toBeGreaterThan(0.6);
        });

        it('scales with the lock weight', () => {
            const clock = lockedClock(config.punchAttack / 4);
            const full = beatPunch(clock);
            clock.beatLockWeight = 0.5;
            expect(beatPunch(clock)).toBeCloseTo(full / 2, 9);
        });

        it('takes the beats per breath from the latest advance', () => {
            const clock = createMotionClock();
            const state = lockedState(0, 90);
            state.beatsPerBar = 3;
            advance(clock, state, DT);
            expect(clock.beatsPerBreath).toBe(3);
            state.beatsPerBar = undefined;
            advance(clock, state, DT);
            expect(clock.beatsPerBreath).toBe(4);
        });
    });
});
