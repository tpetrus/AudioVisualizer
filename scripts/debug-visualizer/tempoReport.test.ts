import { describe, expect, it } from 'vitest';
import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import {
    computeTempoMetrics,
    findTempoColumns,
    normalizeOctave,
    parseBpmSidecar,
    summarizeTempo,
    type TempoSummaryOptions,
} from './tempoReport';

const COLUMNS = [
    't',
    'dt',
    'fps',
    'dancing-character.in',
    'dancing-character.out',
    'dancing-character.bpm',
    'dancing-character.rawTempoBpm',
    'dancing-character.tempoConfidence',
    'dancing-character.beatPhase',
    'dancing-character.songChanges',
    'dancing-character.gridEpoch',
    'dancing-character.tempoLocked',
    'dancing-character.gateOpen',
    'dancing-character.bumpCount',
    'dancing-character.clipPhase',
];

interface RowValues {
    fps: number;
    bpm: number;
    raw: number;
    confidence: number;
    beatPhase: number;
    songChanges: number;
    gridEpoch: number;
    locked: number;
    gateOpen: number;
    bumpCount: number;
    clipPhase: number;
}

// A table of `seconds` of rows at 60 Hz where `make` overrides the steady defaults for each row.
function makeTable(seconds: number, make: (t: number, i: number) => Partial<RowValues> = () => ({})): TelemetryTable {
    const rows: number[][] = [];
    const count = Math.round(seconds * 60);
    for (let i = 0; i < count; i++) {
        const t = i / 60;
        const v: RowValues = {
            fps: 60,
            bpm: 120,
            raw: 120,
            confidence: 0.9,
            beatPhase: (t * 2) % 1,
            songChanges: 0,
            gridEpoch: 0,
            locked: 1,
            gateOpen: 1,
            // A bump on every beat (every 0.5 s at 120 bpm).
            bumpCount: Math.floor(t * 2),
            clipPhase: (t / 4) % 1,
            ...make(t, i),
        };
        rows.push([
            t,
            1 / 60,
            v.fps,
            0.5,
            0.5,
            v.bpm,
            v.raw,
            v.confidence,
            v.beatPhase,
            v.songChanges,
            v.gridEpoch,
            v.locked,
            v.gateOpen,
            v.bumpCount,
            v.clipPhase,
        ]);
    }
    return { columns: [...COLUMNS], rows };
}

describe('parseBpmSidecar', () => {
    it('reads the first whitespace token', () => {
        expect(parseBpmSidecar('128\n')).toBe(128);
        expect(parseBpmSidecar('  97.5 bpm extra')).toBe(97.5);
    });

    it.each(['', '   ', 'abc', '0', '-90', 'Infinity', 'NaN'])('rejects %j', (text) => {
        expect(parseBpmSidecar(text)).toBeUndefined();
    });
});

describe('normalizeOctave', () => {
    it('leaves a matching tempo alone', () => {
        expect(normalizeOctave(120, 120)).toBeCloseTo(120);
    });

    it('doubles half time and halves double time', () => {
        expect(normalizeOctave(60, 120)).toBeCloseTo(120);
        expect(normalizeOctave(240, 120)).toBeCloseTo(120);
        expect(normalizeOctave(30, 120)).toBeCloseTo(120);
    });

    it('keeps a tempo that is not an octave away at its own ratio', () => {
        expect(normalizeOctave(100, 120)).toBeCloseTo(100);
        expect(normalizeOctave(180, 120)).toBeCloseTo(90);
    });

    it('keeps 0 at 0', () => {
        expect(normalizeOctave(0, 120)).toBe(0);
    });
});

describe('findTempoColumns', () => {
    it('uses the first column ending in .bpm and its prefix', () => {
        const found = findTempoColumns(COLUMNS);
        expect(found?.prefix).toBe('dancing-character.');
        expect(found?.bpm).toBe(COLUMNS.indexOf('dancing-character.bpm'));
        expect(found?.gridEpoch).toBe(COLUMNS.indexOf('dancing-character.gridEpoch'));
    });

    it('returns undefined without one', () => {
        expect(findTempoColumns(['t', 'cubes.in'])).toBeUndefined();
    });
});

describe('computeTempoMetrics', () => {
    it('returns undefined for a table with no .bpm column', () => {
        expect(computeTempoMetrics({ columns: ['t', 'fps'], rows: [[0, 60]] })).toBeUndefined();
    });

    it('measures a steady recording against the reference', () => {
        const metrics = computeTempoMetrics(makeTable(20), { referenceBpm: 120 })!;
        expect(metrics.lockTime).toBeCloseTo(2, 1);
        expect(metrics.medianBpm).toBe(120);
        expect(metrics.withinTolerance).toBe(1);
        expect(metrics.songChanges).toBe(0);
        expect(metrics.gridRebuilds).toBe(0);
        expect(metrics.lockedShare).toBe(1);
        expect(metrics.gateShare).toBe(1);
        expect(metrics.gateOpenTime).toBeCloseTo(2, 1);
        expect(metrics.bumpIntervalShare).toBe(1);
        expect(metrics.meanFps).toBe(60);
    });

    it('leaves withinTolerance undefined without a reference', () => {
        expect(computeTempoMetrics(makeTable(10))!.withinTolerance).toBeUndefined();
    });

    it('treats half and double time as in tolerance', () => {
        const half = computeTempoMetrics(
            makeTable(10, () => ({ bpm: 60 })),
            { referenceBpm: 120 },
        )!;
        const double = computeTempoMetrics(
            makeTable(10, () => ({ bpm: 240 })),
            { referenceBpm: 120 },
        )!;
        expect(half.withinTolerance).toBe(1);
        expect(double.withinTolerance).toBe(1);
    });

    it('counts rows outside the tolerance, including bpm 0', () => {
        // After lock at 2 s, rows between 6 s and 8 s read 125 bpm (4.2% off) and 8 s to 10 s read 0.
        const metrics = computeTempoMetrics(
            makeTable(10, (t) => (t >= 8 ? { bpm: 0 } : t >= 6 ? { bpm: 125 } : {})),
            { referenceBpm: 120 },
        )!;
        // Post-lock spans 2 s to 10 s: 4 s of the 8 s are in tolerance.
        expect(metrics.withinTolerance).toBeCloseTo(0.5, 1);
    });

    it('honors a custom tolerance', () => {
        const table = makeTable(10, () => ({ bpm: 122 }));
        expect(computeTempoMetrics(table, { referenceBpm: 120 })!.withinTolerance).toBe(0);
        expect(computeTempoMetrics(table, { referenceBpm: 120, tolerance: 0.02 })!.withinTolerance).toBe(1);
    });

    it('reports never locked as no lock time and NaN median', () => {
        const metrics = computeTempoMetrics(
            makeTable(10, () => ({ locked: 0 })),
            { referenceBpm: 120 },
        )!;
        expect(metrics.lockTime).toBeUndefined();
        expect(metrics.medianBpm).toBeNaN();
        expect(metrics.lockedShare).toBe(0);
        expect(metrics.gateOpenTime).toBeUndefined();
        expect(metrics.bumpIntervalShare).toBeUndefined();
    });

    it('requires the lock to hold for the hold time, and a dip restarts it', () => {
        // Locked 1 s to 2.5 s (1.5 s, too short), dip, locked again from 3 s on.
        const table = makeTable(10, (t) => ({ locked: (t >= 1 && t < 2.5) || t >= 3 ? 1 : 0 }));
        expect(computeTempoMetrics(table)!.lockTime).toBeCloseTo(5, 1);
        expect(computeTempoMetrics(table, { lockHoldSeconds: 1 })!.lockTime).toBeCloseTo(2, 1);
    });

    it('counts rises of songChanges within the recording only', () => {
        const alreadyFive = computeTempoMetrics(makeTable(5, () => ({ songChanges: 5 })))!;
        expect(alreadyFive.songChanges).toBe(0);
        const rising = computeTempoMetrics(makeTable(10, (t) => ({ songChanges: t >= 4 ? 6 : 5 })))!;
        expect(rising.songChanges).toBe(1);
    });

    it('counts gridEpoch rises, including after a fall to 0', () => {
        const table = makeTable(12, (t) => ({ gridEpoch: t < 3 ? 2 : t < 6 ? 0 : t < 9 ? 1 : 2 }));
        // 2 -> 0 is a fall, then 0 -> 1 and 1 -> 2 are rises.
        expect(computeTempoMetrics(table)!.gridRebuilds).toBe(2);
    });

    it('measures the bump interval share, accepting whole multiples and rejecting off-grid bumps', () => {
        // Bumps every 0.5 s (1 beat), every 1.0 s (2 beats): on the grid. Then a 0.75 s gap (1.5 beats): off.
        const times = [3, 3.5, 4.5, 5.25, 6, 6.5];
        const table = makeTable(8, (t) => ({ bumpCount: times.filter((b) => b <= t).length }));
        // Intervals 0.5, 1.0, 0.75, 0.75, 0.5 -> beats 1, 2, 1.5, 1.5, 1.
        expect(computeTempoMetrics(table)!.bumpIntervalShare).toBeCloseTo(3 / 5, 5);
    });

    it('ignores bumps before the lock', () => {
        // Bumps at 0.1 s and 0.2 s (off grid) happen before the lock at 2 s.
        const table = makeTable(8, (t) => ({ bumpCount: (t >= 0.1 ? 1 : 0) + (t >= 0.2 ? 1 : 0) + Math.floor(t) }));
        expect(computeTempoMetrics(table)!.bumpIntervalShare).toBe(1);
    });

    it('computes gateShare from the first opening, and how long after the lock that was', () => {
        // Opens at 4 s, two seconds after the lock at 2 s, and closes for good at 7 s, three seconds into seven.
        const metrics = computeTempoMetrics(makeTable(11, (t) => ({ gateOpen: t >= 4 && t < 7 ? 1 : 0 })))!;
        expect(metrics.gateOpenTime).toBeCloseTo(4, 1);
        expect(metrics.gateOpenDelay).toBeCloseTo(2, 1);
        expect(metrics.gateShare).toBeCloseTo(3 / 7, 1);
    });

    it('reports a gate that never opens', () => {
        const table = makeTable(10, () => ({ gateOpen: 0 }));
        const metrics = computeTempoMetrics(table)!;
        expect(metrics.gateOpenDelay).toBeUndefined();
        expect(metrics.gateShare).toBe(0);
        expect(summarizeTempo(table, { referenceBpm: 120 }).at(-1)).toContain('gate never opened');
    });

    it('fails a gate that opens too long after the lock, however well it then holds', () => {
        const table = makeTable(20, (t) => ({ gateOpen: t >= 8 ? 1 : 0 }));
        expect(summarizeTempo(table, { referenceBpm: 120 }).at(-1)).toContain('after lock > 4 s');
    });

    it('reads fps from t when the table has no fps column', () => {
        const table = makeTable(5);
        const dropFps = (row: number[]) => row.filter((_, c) => c !== 2);
        const reduced = { columns: COLUMNS.filter((name) => name !== 'fps'), rows: table.rows.map(dropFps) };
        expect(computeTempoMetrics(reduced)!.meanFps).toBeCloseTo(60, 0);
    });

    it('handles an empty table', () => {
        const metrics = computeTempoMetrics({ columns: COLUMNS, rows: [] })!;
        expect(metrics.lockTime).toBeUndefined();
        expect(metrics.meanFps).toBe(0);
    });
});

describe('summarizeTempo', () => {
    const verdictOf = (lines: string[]) => lines[lines.length - 1];

    it('says so with one line when there is no .bpm column', () => {
        const lines = summarizeTempo({ columns: ['t', 'fps'], rows: [[0, 60]] });
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('no "<probe>.bpm" column');
    });

    it('passes a steady recording that matches the reference', () => {
        const lines = summarizeTempo(makeTable(20), { referenceBpm: 120 });
        expect(verdictOf(lines)).toBe('TEMPO VERDICT: PASS');
        expect(lines[0]).toContain('reference 120 bpm');
    });

    it('is a report with no PASS or FAIL when there is no reference', () => {
        const lines = summarizeTempo(makeTable(20));
        expect(verdictOf(lines)).toBe('TEMPO VERDICT: report only (no sidecar)');
        expect(lines.join('\n')).not.toMatch(/PASS|FAIL/);
    });

    it('fails a recording that never locks', () => {
        const lines = summarizeTempo(
            makeTable(10, () => ({ locked: 0 })),
            { referenceBpm: 120 },
        );
        expect(verdictOf(lines)).toBe('TEMPO VERDICT: FAIL (never locked)');
    });

    it('fails and names the target for a deviation, a song change and a grid rebuild', () => {
        const table = makeTable(20, (t) => ({
            bpm: t >= 10 ? 130 : 120,
            songChanges: t >= 8 ? 1 : 0,
            gridEpoch: t >= 12 ? 1 : 0,
        }));
        const lines = summarizeTempo(table, { referenceBpm: 120 });
        const verdict = verdictOf(lines);
        expect(verdict).toMatch(/^TEMPO VERDICT: FAIL \(/);
        expect(verdict).toContain('within tolerance');
        expect(verdict).toContain('1 song changes');
        expect(verdict).toContain('1 grid rebuilds');
        expect(lines.some((line) => line.startsWith('song change at t=8'))).toBe(true);
        expect(lines.some((line) => line.startsWith('grid rebuild at t=12'))).toBe(true);
    });

    it('fails when the gate stays shut or the bumps are off the grid', () => {
        const gate = summarizeTempo(
            makeTable(20, () => ({ gateOpen: 0 })),
            { referenceBpm: 120 },
        );
        expect(verdictOf(gate)).toContain('gate never opened');
        const off = summarizeTempo(
            makeTable(20, (t) => ({ bumpCount: Math.floor(t * 1.5) })),
            { referenceBpm: 120 },
        );
        expect(verdictOf(off)).toContain('bump interval share');
    });

    it('never prints a miss that reads as its own threshold (0.99 < 0.99)', () => {
        // 29 of 3000 rows unlocked at the end: a locked share of about 0.9899, which rounds to 0.99 at three digits.
        const table = makeTable(50, (t) => ({ locked: t >= 50 - 29 / 60 ? 0 : 1 }));
        const verdict = verdictOf(summarizeTempo(table, { referenceBpm: 120 }));
        expect(verdict).toContain('locked share 0.9899 < 0.99');
        expect(verdict).not.toContain('0.99 < 0.99');
    });

    it('fails when there are no bump intervals to judge', () => {
        const lines = summarizeTempo(
            makeTable(10, () => ({ bumpCount: 0 })),
            { referenceBpm: 120 },
        );
        expect(verdictOf(lines)).toContain('no bump intervals measured');
    });

    it('shows deviation columns only with a reference', () => {
        const withRef = summarizeTempo(makeTable(10), { referenceBpm: 120 });
        const without = summarizeTempo(makeTable(10));
        expect(withRef[1]).toContain('dev ');
        expect(withRef[1]).toContain('in-tol');
        expect(without[1]).not.toContain('dev ');
    });

    it('reports the largest octave-normalized deviation in a window', () => {
        const table = makeTable(10, (t) => ({ bpm: t >= 3 && t < 3.5 ? 126 : 60 }));
        const lines = summarizeTempo(table, { referenceBpm: 120, windowSeconds: 5 });
        // 60 normalizes to 120 (0% off); 126 is 5% off.
        expect(lines[1]).toContain('dev 5%');
    });

    it('marks windows under the minimum fps unreliable', () => {
        const lines = summarizeTempo(makeTable(10, () => ({ fps: 20 })));
        expect(lines[1]).toContain('unreliable');
        expect(summarizeTempo(makeTable(10))[1]).not.toContain('unreliable');
    });

    it('prints NaN beat phases without breaking', () => {
        const lines = summarizeTempo(makeTable(10, () => ({ beatPhase: NaN })));
        expect(verdictOf(lines)).toBe('TEMPO VERDICT: report only (no sidecar)');
        expect(lines.join('\n')).not.toContain('undefined');
    });

    it('prints NaN statistics for a window with no finite bpm', () => {
        const lines = summarizeTempo(makeTable(5, () => ({ bpm: NaN, confidence: NaN })));
        expect(lines[1]).toContain('bpm NaN (NaN..NaN)');
        expect(lines[1]).toContain('minConf NaN');
    });

    it('never exceeds maxLines, widening windows and capping events', () => {
        const table = makeTable(300, (t) => ({ songChanges: Math.floor(t / 10), gridEpoch: Math.floor(t / 7) }));
        for (const maxLines of [40, 20, 12, 6, 3, 1]) {
            const lines = summarizeTempo(table, { referenceBpm: 120, maxLines });
            expect(lines.length).toBeLessThanOrEqual(maxLines);
            expect(verdictOf(lines)).toMatch(/^TEMPO VERDICT/);
        }
        expect(summarizeTempo(table, { maxLines: 0 })).toEqual([]);
        const capped = summarizeTempo(table, { referenceBpm: 120 });
        expect(capped.some((line) => /\.\.\. and \d+ more events/.test(line))).toBe(true);
    });

    it('widens the window instead of dropping the end of the recording', () => {
        const options: TempoSummaryOptions = { maxLines: 12, windowSeconds: 1 };
        const lines = summarizeTempo(makeTable(100), options);
        const windows = lines.filter((line) => / s {2}bpm /.test(line));
        expect(windows.length).toBeLessThanOrEqual(7);
        expect(windows[windows.length - 1]).toMatch(/-99.98 s /);
    });

    it('handles an empty table', () => {
        const lines = summarizeTempo({ columns: COLUMNS, rows: [] });
        expect(verdictOf(lines)).toBe('TEMPO VERDICT: FAIL (never locked)');
    });
});
