import { describe, expect, it } from 'vitest';
import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import {
    distance,
    hubRows,
    orderRows,
    reactionRows,
    resample,
    type LiveCellLookup,
    type LoadedSession,
    type OrderRun,
} from './compare';

const BEATS = Array.from({ length: 16 }, (_, i) => 1 + i * 0.5);

// A table sampled every 5 ms whose `cubes.out` jumps to 1 for 100 ms at each beat (`delay` seconds late) and whose hub
// columns are a constant `level` plus a ramp `slope * t`.
function makeRun(
    options: { level?: number; slope?: number; delay?: number; start?: number; end?: number; beats?: boolean } = {},
): OrderRun {
    const { level = 1, slope = 0, delay = 0, start = 0, end = 10, beats = true } = options;
    const columns = ['t', 'gain', 'bassRaw', 'onsetKick', 'onsetMid', 'onsetHigh', 'cubes.in', 'cubes.out'];
    const rows: number[][] = [];
    for (let t = start; t <= end + 1e-9; t += 0.005) {
        const pulse = BEATS.some((beat) => t >= beat + delay && t < beat + delay + 0.1) ? 1 : 0;
        const value = level + slope * t;
        rows.push([t, value, value, value, value, value, value, pulse]);
    }
    const table: TelemetryTable = { columns, rows };
    return { table, beats: beats ? BEATS : undefined };
}

const cellOf =
    (value: number | null, spread: number, status = 'pass', applicable = true): LiveCellLookup =>
    () => ({ value, spread, status, applicable });

describe('resample and distance', () => {
    it('interpolates linearly on the grid', () => {
        const table: TelemetryTable = {
            columns: ['t', 'x'],
            rows: [
                [0, 0],
                [1, 10],
            ],
        };
        const grid = resample(table, 'x', 0, 1)!;
        expect([grid[0], grid[1], grid[2]]).toEqual([0, expect.closeTo(0.1, 6), expect.closeTo(0.2, 6)]);
        expect(resample(table, 'x', 0, 1)).toHaveLength(101);
        expect(resample(table, 'nope', 0, 1)).toBeNull();
        expect(resample({ columns: ['t', 'x'], rows: [] }, 'x', 0, 1)).toBeNull();
    });

    it('is the RMS difference over the common time', () => {
        const a = makeRun({ level: 1 }).table;
        const b = makeRun({ level: 3, start: 2, end: 20 }).table;
        expect(distance(a, b, 'gain')).toBeCloseTo(2, 6);
        expect(distance(a, a, 'gain')).toBe(0);
    });

    it('is null without overlap or the column', () => {
        const a = makeRun({ end: 2 }).table;
        const b = makeRun({ start: 5, end: 8 }).table;
        expect(distance(a, b, 'gain')).toBeNull();
        expect(distance(a, a, 'missing')).toBeNull();
        expect(distance({ columns: ['x'], rows: [[1]] }, a, 'x')).toBeNull();
        expect(distance({ columns: ['t', 'x'], rows: [] }, a, 'x')).toBeNull();
    });
});

describe('hubRows', () => {
    const lead = [makeRun({ level: 1 }), makeRun({ level: 1.2 })];

    it('passes when after the other is no further from the lead runs than the controls explain', () => {
        const self = [makeRun({ level: 1.1 }), makeRun({ level: 1.15 })];
        const other = [makeRun({ level: 1.1 }), makeRun({ level: 1.3 })];
        const rows = hubRows('cubes,bass-ink', 'a.wav', 'cubes', lead, self, other);
        expect(rows.map((row) => row.signal)).toEqual([
            'gain',
            'bassRaw',
            'onsetKick',
            'onsetMid',
            'onsetHigh',
            'cubes.in',
        ]);
        const gain = rows[0];
        expect(gain).toMatchObject({
            kind: 'hub',
            pair: 'cubes,bass-ink',
            track: 'a.wav',
            visualizer: 'cubes',
            pass: true,
        });
        // First: median of 0.1, 0.15, 0.05, 0.1 = 0.1; second: median of 0.1, 0.3, 0.1, 0.1 = 0.1.
        expect(gain.first).toBeCloseTo(0.1, 6);
        expect(gain.second).toBeCloseTo(0.1, 6);
        // Allowed: max(within lead 0.2, first 0.1).
        expect(gain.allowed).toBeCloseTo(0.2, 6);
    });

    it('fails when after the other is further than the lead spread and the control', () => {
        const tight = [makeRun({ level: 1 }), makeRun({ level: 1.01 })];
        const self = [makeRun({ level: 1.02 })];
        const other = [makeRun({ level: 2 })];
        expect(hubRows('p', 't', 'cubes', tight, self, other).every((row) => row.pass === false)).toBe(true);
    });

    it('lets a large control distance widen the allowance', () => {
        const tight = [makeRun({ level: 1 }), makeRun({ level: 1.01 })];
        const rows = hubRows('p', 't', 'cubes', tight, [makeRun({ level: 2 })], [makeRun({ level: 2 })]);
        expect(rows[0].allowed).toBeCloseTo(rows[0].first!, 6);
        expect(rows[0].pass).toBe(true);
    });

    it('is not judged with too few runs', () => {
        for (const [l, s, o] of [
            [[makeRun()], [makeRun()], [makeRun()]],
            [lead, [], [makeRun()]],
            [lead, [makeRun()], []],
        ]) {
            const rows = hubRows('p', 't', 'cubes', l, s, o);
            expect(rows.every((row) => row.pass === null && row.note?.includes('at least 2'))).toBe(true);
        }
    });

    it('is not judged when a column is missing or the runs do not overlap', () => {
        const rows = hubRows('p', 't', 'bass-ink', lead, [makeRun()], [makeRun()]);
        const own = rows.find((row) => row.signal === 'bass-ink.in');
        expect(own).toMatchObject({ pass: null, first: null, second: null });
        expect(own?.note).toContain('missing');
        expect(rows.find((row) => row.signal === 'gain')?.pass).toBe(true);
    });
});

describe('reactionRows', () => {
    const runs = [makeRun(), makeRun()];
    const late = [makeRun({ delay: 0.3 })];

    it('judges the other median against the self median within the allowance', () => {
        const rows = reactionRows('p', 't', 'cubes', runs, runs, runs, cellOf(0.9, 0.1));
        expect(rows.map((row) => row.signal)).toEqual([
            'live.hit.share50ms',
            'live.reaction.latencyMs',
            'live.falseFire.share',
        ]);
        const hit = rows[0];
        expect(hit.kind).toBe('reaction');
        expect(hit.first).toBeCloseTo(1, 6);
        expect(hit.second).toBe(hit.first);
        expect(hit.allowed).toBe(0.1);
        expect(hit.pass).toBe(true);
    });

    it('fails when the other runs differ by more than the allowance', () => {
        const hit = reactionRows('p', 't', 'cubes', runs, runs, late, cellOf(0, 0.1))[0];
        expect(hit.second).toBeCloseTo(0, 6);
        expect(hit.pass).toBe(false);
    });

    it('takes the lead and self spread as the allowance without a live cell', () => {
        const noCell: LiveCellLookup = () => undefined;
        const spread = reactionRows('p', 't', 'cubes', [...runs, ...late], runs, late, noCell)[0];
        expect(spread.allowed).toBeCloseTo(1, 6);
        expect(spread.pass).toBe(true);
        const flat = reactionRows('p', 't', 'cubes', runs, runs, late, noCell)[0];
        expect(flat.allowed).toBe(0);
        expect(flat.pass).toBe(false);
    });

    it('is not judged for a track with no beats', () => {
        const bare = [makeRun({ beats: false })];
        const row = reactionRows('p', 't', 'cubes', bare, bare, bare, cellOf(0.9, 0.1))[0];
        expect(row).toMatchObject({ first: null, second: null, pass: null, note: 'the track has no beats' });
    });

    it('is not judged when self or other has no measured value', () => {
        expect(reactionRows('p', 't', 'cubes', runs, [], runs, cellOf(0.9, 0.1))[0]).toMatchObject({
            pass: null,
            note: 'no self run measured',
        });
        expect(reactionRows('p', 't', 'cubes', runs, runs, [], cellOf(0.9, 0.1))[0]).toMatchObject({
            pass: null,
            note: 'no run after the other visualizer measured',
        });
    });
});

describe('orderRows', () => {
    it('splits each visualizer into lead, self and other runs, per track', () => {
        const session = (leadViz: string, followViz: string, level: number): LoadedSession => ({
            leadViz,
            followViz,
            lead: makeRun({ level }),
            follow: makeRun({ level }),
        });
        const sessions = new Map([
            [
                'a.wav',
                [
                    session('cubes', 'bass-ink', 1),
                    session('bass-ink', 'cubes', 1),
                    session('cubes', 'cubes', 1),
                    session('bass-ink', 'bass-ink', 1),
                    session('cubes', 'bass-ink', 1),
                ],
            ],
        ]);
        const rows = orderRows(['cubes', 'bass-ink'], sessions, cellOf(1, 0));
        // cubes: 3 lead runs, 1 self, 1 other; bass-ink: 2 lead runs, 1 self, 2 other. All identical, so every cubes row passes (the fake tables have no bass-ink columns).
        expect(rows).toHaveLength(2 * (6 + 3));
        expect(rows.filter((row) => row.visualizer === 'cubes').every((row) => row.pass === true)).toBe(true);
        expect(new Set(rows.map((row) => row.visualizer))).toEqual(new Set(['cubes', 'bass-ink']));
        expect(rows.every((row) => row.pair === 'cubes,bass-ink' && row.track === 'a.wav')).toBe(true);
    });
});
