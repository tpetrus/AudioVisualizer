import { describe, expect, it } from 'vitest';
import { createRhythmState, type RhythmState } from '~/features/rhythm/types';
import { bassInkConfig } from './bassInkConfig';
import { advance, createMotionClock } from './motionClock';

const DT = 1 / 60;
const config = bassInkConfig.motion;
const FREE_RATE = 1 / config.freeBreathingSeconds;

function lockedState(barPhase: number, bpm = 120): RhythmState {
    const state = createRhythmState();
    state.bpm = bpm;
    state.barPhase = barPhase;
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

    it('does not lock without a bar position or a tempo, and unlocks when the bar position is lost', () => {
        const clock = createMotionClock();
        const state = lockedState(0);
        state.barPhase = undefined;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
        state.barPhase = 0.1;
        state.bpm = 0;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
        state.bpm = 120;
        advance(clock, state, DT);
        expect(clock.locked).toBe(true);
        state.barPhase = undefined;
        advance(clock, state, DT);
        expect(clock.locked).toBe(false);
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
});
