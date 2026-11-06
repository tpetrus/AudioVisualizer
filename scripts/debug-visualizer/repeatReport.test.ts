import { describe, expect, it } from 'vitest';
import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import { compareRuns, describeRunDeviations, formatRepeatReport } from './repeatReport';

const COLUMNS = [
    't',
    'fps',
    'dancing-character.bpm',
    'dancing-character.beatPhase',
    'dancing-character.tempoLocked',
    'dancing-character.clipPhase',
];

interface RunShape {
    seconds?: number;
    fps?: number;
    bpm?: number;
    beatOffset?: number; // seconds the beat grid is shifted by
    clipOffset?: number; // loops the dance position is shifted by
    lockAt?: number; // seconds; Infinity never locks
    loopSeconds?: number;
    start?: number; // track time of the first row
}

// One run of a steady tempo, sampled at `fps`. The beat grid and clip position are functions of track time.
function makeRun(shape: RunShape = {}): TelemetryTable {
    const { seconds = 20, fps = 60, bpm = 120, beatOffset = 0, clipOffset = 0, lockAt = 1, loopSeconds = 4 } = shape;
    const { start = 0 } = shape;
    const period = 60 / bpm;
    const rows: number[][] = [];
    const count = Math.round(seconds * fps);
    for (let i = 0; i < count; i++) {
        const t = start + i / fps;
        const phase = ((((t - beatOffset) / period) % 1) + 1) % 1;
        const clip = (((t / loopSeconds + clipOffset) % 1) + 1) % 1;
        rows.push([t, fps, bpm, phase, t >= lockAt + start ? 1 : 0, clip]);
    }
    return { columns: [...COLUMNS], rows };
}

describe('compareRuns', () => {
    it('throws a one-line error for fewer than two tables', () => {
        expect(() => compareRuns([])).toThrow('Need at least two recordings to compare.');
        expect(() => compareRuns([makeRun()])).toThrow('Need at least two recordings to compare.');
    });

    it('finds identical runs identical', () => {
        const comparison = compareRuns([makeRun(), makeRun(), makeRun()]);
        expect(comparison.runs).toBe(3);
        expect(comparison.sameOctave).toBe(true);
        expect(comparison.medianBpms).toEqual([120, 120, 120]);
        expect(comparison.samples).toBeGreaterThan(40);
        expect(comparison.bpmPercent.max).toBe(0);
        expect(comparison.beatMs.max).toBeCloseTo(0, 3);
        expect(comparison.clipLoops.max).toBeCloseTo(0, 6);
        expect(comparison.lockSeconds).toBeCloseTo(0, 1);
    });

    it('measures a beat grid offset in milliseconds', () => {
        const comparison = compareRuns([makeRun(), makeRun({ beatOffset: 0.03 })]);
        expect(comparison.beatMs.median).toBeCloseTo(30, 0);
        expect(comparison.beatMs.max).toBeCloseTo(30, 0);
    });

    it('measures a bpm difference as a percent of the mean', () => {
        const comparison = compareRuns([makeRun(), makeRun({ bpm: 121 })]);
        // (121 - 120) / 120.5
        expect(comparison.bpmPercent.median).toBeCloseTo(0.83, 1);
    });

    it('wraps beat times around the beat, not across it', () => {
        // 0.495 s and 0.005 s into a 0.5 s beat are 10 ms apart around the circle, not 490 ms.
        const comparison = compareRuns([makeRun({ beatOffset: -0.005 }), makeRun({ beatOffset: 0.005 })]);
        expect(comparison.beatMs.max).toBeCloseTo(10, 0);
    });

    it('wraps clipPhase around the loop', () => {
        // Phases 0.99 and 0.01 at t = 0 for 4 s loops; shifting by +-0.01 loops keeps them 0.02 apart.
        const comparison = compareRuns([makeRun({ clipOffset: -0.01 }), makeRun({ clipOffset: 0.01 })]);
        expect(comparison.clipLoops.max).toBeCloseTo(0.02, 3);
        expect(comparison.clipLoops.max).toBeLessThan(0.05);
    });

    it('sees different octaves as a different grid, with NaN beat spread', () => {
        const comparison = compareRuns([makeRun({ bpm: 120 }), makeRun({ bpm: 60 })]);
        expect(comparison.sameOctave).toBe(false);
        expect(comparison.beatMs.median).toBeNaN();
        expect(comparison.beatMs.p95).toBeNaN();
        expect(comparison.beatMs.max).toBeNaN();
        const lines = formatRepeatReport(comparison);
        expect(lines.join('\n')).toContain('not in the same octave');
        expect(lines[lines.length - 1]).toContain('FAIL');
        expect(lines[lines.length - 1]).toContain('same octave');
    });

    it('gives Infinity lock seconds and a FAIL when a run never locks', () => {
        const comparison = compareRuns([makeRun(), makeRun({ lockAt: Infinity })]);
        expect(comparison.lockSeconds).toBe(Infinity);
        expect(comparison.lockTimes[1]).toBeUndefined();
        expect(comparison.samples).toBe(0);
        expect(comparison.bpmPercent.p95).toBeNaN();
        const lines = formatRepeatReport(comparison);
        expect(lines[lines.length - 1]).toMatch(/^REPEAT VERDICT: FAIL/);
        expect(lines.join('\n')).toContain('never');
        expect(lines.join('\n')).toContain('Infinity');
    });

    it('does not create beat spread from a frame-rate difference', () => {
        const comparison = compareRuns([makeRun({ fps: 120 }), makeRun({ fps: 24 }), makeRun({ fps: 60 })]);
        expect(comparison.beatMs.max).toBeLessThan(1);
        expect(comparison.bpmPercent.max).toBe(0);
        // The clip position is read from the latest row, at most one 24 Hz frame (1/24 s of a 4 s loop) old.
        expect(comparison.clipLoops.max).toBeLessThan(0.05);
        expect(formatRepeatReport(comparison).at(-1)).toBe('REPEAT VERDICT: PASS');
    });

    it('starts sampling at the latest lock and ends at the shortest run', () => {
        const comparison = compareRuns([makeRun({ lockAt: 1, seconds: 20 }), makeRun({ lockAt: 3, seconds: 10 })]);
        // Locks (after the 2 s hold) at 3 and 5, the second being the later one; the second run's last row is 9.98 s.
        expect(comparison.lockSeconds).toBeCloseTo(2, 1);
        const expected = Math.floor((9.98 - 5) / 0.25 + 1e-6) + 1;
        expect(comparison.samples).toBeGreaterThanOrEqual(expected - 1);
        expect(comparison.samples).toBeLessThanOrEqual(expected + 1);
    });

    it('skips rows with an undefined beatPhase and bpm 0', () => {
        const noisy = makeRun();
        // Every other row reads NaN phase and bpm 0 from 5 s on; the last valid row stands in for the sample.
        noisy.rows.forEach((row, i) => {
            if (row[0] >= 5 && i % 2 === 0) {
                row[3] = NaN;
                row[2] = 0;
            }
        });
        const comparison = compareRuns([makeRun(), noisy]);
        expect(comparison.beatMs.max).toBeLessThan(1);
        expect(comparison.medianBpms[1]).toBeCloseTo(120);
    });

    it('has no spreads and fails when no sample time exists', () => {
        // Run B ends before run A locks.
        const comparison = compareRuns([makeRun({ lockAt: 8 }), makeRun({ seconds: 5 })]);
        expect(comparison.lockTimes[1]).toBeCloseTo(3, 1);
        expect(comparison.samples).toBe(0);
        expect(comparison.clipLoops.median).toBeNaN();
        expect(formatRepeatReport(comparison).at(-1)).toMatch(/^REPEAT VERDICT: FAIL/);
    });

    it('treats a table with no tempo columns as never locked', () => {
        const comparison = compareRuns([makeRun(), { columns: ['t', 'fps'], rows: [[0, 60]] }]);
        expect(comparison.lockTimes[1]).toBeUndefined();
        expect(comparison.medianBpms[1]).toBeNaN();
        expect(comparison.sameOctave).toBe(false);
        expect(comparison.lockSeconds).toBe(Infinity);
    });

    it('treats a run without beatPhase or clipPhase columns as having no usable rows', () => {
        const bare = makeRun();
        const trimmed = {
            columns: bare.columns.filter((name) => !/beatPhase|clipPhase/.test(name)),
            rows: bare.rows.map((row) => [row[0], row[1], row[2], row[4]]),
        };
        const comparison = compareRuns([makeRun(), trimmed]);
        expect(comparison.samples).toBe(0);
    });
});

describe('formatRepeatReport', () => {
    it('passes within the default targets', () => {
        const lines = formatRepeatReport(compareRuns([makeRun(), makeRun({ beatOffset: 0.01 })]));
        expect(lines.at(-1)).toBe('REPEAT VERDICT: PASS');
        expect(lines[0]).toContain('2 runs');
    });

    it('names the missed target and honors custom targets', () => {
        const comparison = compareRuns([makeRun(), makeRun({ beatOffset: 0.06 })]);
        expect(formatRepeatReport(comparison).at(-1)).toBe('REPEAT VERDICT: FAIL (beat spread)');
        expect(formatRepeatReport(comparison, { beatMs: 100 }).at(-1)).toBe('REPEAT VERDICT: PASS');
    });

    it('fails on a clip position difference, a bpm difference and a lock time difference', () => {
        expect(formatRepeatReport(compareRuns([makeRun(), makeRun({ clipOffset: 0.2 })])).at(-1)).toContain(
            'clip spread',
        );
        expect(formatRepeatReport(compareRuns([makeRun(), makeRun({ bpm: 123 })])).at(-1)).toContain('bpm spread');
        expect(formatRepeatReport(compareRuns([makeRun({ lockAt: 1 }), makeRun({ lockAt: 5 })])).at(-1)).toContain(
            'lock time spread',
        );
    });
});

describe('describeRunDeviations', () => {
    it('gives one line per run, octave-normalized', () => {
        const lines = describeRunDeviations([120, 61, 240], 120);
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain('0%');
        expect(lines[1]).toContain('1.67%');
        expect(lines[2]).toContain('0%');
    });
});

describe('compareRuns from the meter lock', () => {
    // A run whose dance position is shifted by `clipOffset` until its meter locks at `meterAt`.
    function withMeter(clipOffset: number, meterAt: number): TelemetryTable {
        const run = makeRun();
        const clip = run.columns.indexOf('dancing-character.clipPhase');
        return {
            columns: [...run.columns, 'dancing-character.meterLocked'],
            rows: run.rows.map((row) => {
                const out = [...row, row[0] >= meterAt ? 1 : 0];
                if (row[0] < meterAt) out[clip] = (row[clip] + clipOffset) % 1;
                return out;
            }),
        };
    }

    it('starts the spreads at the latest meter lock, not the tempo lock', () => {
        const comparison = compareRuns([withMeter(0, 8), withMeter(0.25, 10)]);
        expect(comparison.meterLockTimes[0]).toBeCloseTo(8, 1);
        expect(comparison.meterLockTimes[1]).toBeCloseTo(10, 1);
        expect(comparison.clipLoops.max).toBeLessThan(0.001);
    });

    it('falls back to the tempo lock for runs with no meter lock, and says so', () => {
        const comparison = compareRuns([makeRun(), makeRun()]);
        expect(comparison.meterLockTimes).toEqual([undefined, undefined]);
        expect(formatRepeatReport(comparison).join('\n')).toContain('meter lock times: never, never');
    });
});
