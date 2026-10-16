import { describe, expect, it } from 'vitest';
import { BeatTracker } from './beatTracker';
import { createRandom } from './testSignals';

const FRAME_RATE = 100;

interface Run {
    beatTimes: number[];
    beatCounts: number[];
    lockedAt: number | undefined;
}

// Drives the tracker with a pulse train at `bpm` for `seconds`, telling it the tempo (as the analyzer would).
function drive(tracker: BeatTracker, bpm: number, seconds: number, tempoBpm = bpm, startTime = 0, jitter = 0): Run {
    const random = createRandom(11);
    const run: Run = { beatTimes: [], beatCounts: [], lockedAt: undefined };
    const period = 60 / bpm;
    tracker.setTempo(tempoBpm);
    let nextPulse = period;
    for (let i = 0; i < seconds * FRAME_RATE; i++) {
        const time = startTime + i / FRAME_RATE;
        let onset = 0.05;
        if (time - startTime >= nextPulse - 0.5 / FRAME_RATE) {
            onset = 1;
            nextPulse += period;
            if (jitter > 0) {
                nextPulse += (random() * 2 - 1) * jitter;
            }
        }
        const beat = tracker.push(time, onset);
        if (tracker.locked && run.lockedAt === undefined) {
            run.lockedAt = time - startTime;
        }
        if (beat) {
            run.beatTimes.push(tracker.lastBeatTime);
            run.beatCounts.push(tracker.beatCount);
        }
    }
    return run;
}

describe('BeatTracker', () => {
    it('stays unlocked without a tempo', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        tracker.setTempo(0);
        for (let i = 0; i < 1000; i++) {
            expect(tracker.push(i / FRAME_RATE, i % 50 === 0 ? 1 : 0)).toBe(false);
        }
        expect(tracker.locked).toBe(false);
        expect(tracker.periodSeconds).toBe(0);
        expect(tracker.beatCount).toBe(0);
    });

    it('locks within a few seconds once it knows the tempo', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = drive(tracker, 120, 10);
        expect(tracker.locked).toBe(true);
        expect(run.lockedAt).toBeDefined();
        expect(run.lockedAt ?? Infinity).toBeLessThan(5);
    });

    it.each([70, 100, 120, 160, 180])('declares beats one period apart at %i BPM', bpm => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = drive(tracker, bpm, 30);
        const period = 60 / bpm;
        expect(run.beatTimes.length).toBeGreaterThan((20 / period) * 0.9);
        const settled = run.beatTimes.slice(Math.ceil(8 / period));
        for (let i = 1; i < settled.length; i++) {
            expect(Math.abs(settled[i] - settled[i - 1] - period)).toBeLessThan(0.04 * period + 0.01);
        }
        expect(Math.abs(tracker.periodSeconds - period)).toBeLessThan(0.03 * period);
    });

    it('puts the declared beats on the pulses', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const bpm = 120;
        const run = drive(tracker, bpm, 30);
        const period = 60 / bpm;
        // The pulses fall at multiples of the period.
        const settled = run.beatTimes.slice(Math.ceil(10 / period));
        for (const time of settled) {
            const phase = time / period;
            const error = Math.abs(phase - Math.round(phase)) * period;
            expect(error).toBeLessThan(0.04);
        }
    });

    it('increases beatCount by exactly one per declared beat, starting at 1', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = drive(tracker, 110, 20);
        expect(run.beatCounts[0]).toBe(1);
        for (let i = 1; i < run.beatCounts.length; i++) {
            expect(run.beatCounts[i]).toBe(run.beatCounts[i - 1] + 1);
        }
        expect(tracker.beatCount).toBe(run.beatCounts[run.beatCounts.length - 1]);
    });

    it('tolerates a little timing jitter without losing the tempo', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 120, 30, 120, 0, 0.02);
        expect(tracker.locked).toBe(true);
        expect(Math.abs(tracker.periodSeconds - 0.5)).toBeLessThan(0.03);
    });

    it('rebuilds the grid when the tempo estimate moves a long way', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 100, 15);
        expect(tracker.locked).toBe(true);
        const epoch = tracker.gridEpoch;
        tracker.setTempo(160);
        expect(tracker.locked).toBe(false);
        expect(tracker.gridEpoch).toBe(epoch + 1);
    });

    it('keeps the grid for a small tempo change', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 100, 15);
        const epoch = tracker.gridEpoch;
        tracker.setTempo(104);
        expect(tracker.locked).toBe(true);
        expect(tracker.gridEpoch).toBe(epoch);
    });

    it('follows a new tempo after the grid is rebuilt', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 100, 15);
        const run = drive(tracker, 150, 20, 150, 15);
        expect(tracker.locked).toBe(true);
        expect(Math.abs(tracker.periodSeconds - 0.4)).toBeLessThan(0.02);
        const last = run.beatTimes.slice(-6);
        for (let i = 1; i < last.length; i++) {
            expect(Math.abs(last[i] - last[i - 1] - 0.4)).toBeLessThan(0.03);
        }
    });

    it('forgets everything on reset()', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 120, 15);
        tracker.reset();
        expect(tracker.locked).toBe(false);
        expect(tracker.beatCount).toBe(0);
        expect(tracker.periodSeconds).toBe(0);
        expect(tracker.gridEpoch).toBe(0);
    });
});
