import { describe, expect, it } from 'vitest';
import { scorecardBeatErrorMs, trackerOctave } from './beatError';
import { constantTruth } from './tempoTruth';

// Beats every `period` seconds from `start` up to `end`, each shifted by `offset`.
function grid(start: number, end: number, period: number, offset = 0): number[] {
    const beats: number[] = [];
    for (let time = start; time <= end + 1e-9; time += period) beats.push(time + offset);
    return beats;
}

describe('trackerOctave', () => {
    const truth = constantTruth(120);
    const series = (bpm: number) => grid(0, 10, 0.5).map((time) => ({ time, bpm }));

    it('finds half time, true time and double time', () => {
        expect(trackerOctave(series(60.4), truth, 0)).toBe(0.5);
        expect(trackerOctave(series(119), truth, 0)).toBe(1);
        expect(trackerOctave(series(241), truth, 0)).toBe(2);
    });

    it('ignores readings before the lock and readings with no tempo', () => {
        const readings = [
            { time: 0, bpm: 240 },
            { time: 1, bpm: 240 },
            { time: 2, bpm: 0 },
            { time: 3, bpm: 120 },
        ];
        expect(trackerOctave(readings, truth, 2)).toBe(1);
    });

    it('is undefined with no reading holding a tempo after the lock', () => {
        expect(trackerOctave([{ time: 5, bpm: 0 }], truth, 0)).toBeUndefined();
        expect(trackerOctave(series(120), truth, 11)).toBeUndefined();
    });
});

describe('scorecardBeatErrorMs', () => {
    const truth = grid(0, 20, 0.5);

    it('scores a tracker on the true tempo against every truth beat', () => {
        expect(scorecardBeatErrorMs(truth, grid(0, 20, 0.5, 0.01), 2, 1)).toBeCloseTo(10, 6);
    });

    it('does not charge a half-time tracker for the beats it rightly skips', () => {
        expect(scorecardBeatErrorMs(truth, grid(0, 20, 1, 0.01), 2, 0.5)).toBeCloseTo(10, 6);
    });

    it('scores a double-time tracker from the truth beats', () => {
        expect(scorecardBeatErrorMs(truth, grid(0, 20, 0.25, 0.01), 2, 2)).toBeCloseTo(10, 6);
    });

    it('only counts beats after the lock', () => {
        const late = [...grid(0, 4.75, 0.25, 0.1), ...grid(5, 20, 0.5)];
        expect(scorecardBeatErrorMs(truth, late, 5, 1)).toBe(0);
    });

    it('is null when no beat lies after the lock', () => {
        expect(scorecardBeatErrorMs(truth, [], 2, 1)).toBeNull();
        expect(scorecardBeatErrorMs(truth, grid(0, 20, 1), 30, 0.5)).toBeNull();
    });
});
