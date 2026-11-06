// Pure tempo checks over a telemetry recording (contract C5): did the tracker lock quickly, hold the song's tempo, and
// keep the beat grid and the bass gate steady. No DOM and no node APIs, so the CLIs and the specs share it. Not part of
// the app bundle.

import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';

export interface TempoSummaryOptions {
    referenceBpm?: number;
    windowSeconds?: number; // default 5
    tolerance?: number; // default 0.01
    lockHoldSeconds?: number; // default 2
    minFps?: number; // default 50
    maxLines?: number; // default 40
}

export interface TempoMetrics {
    lockTime: number | undefined; // first t at which tempoLocked has held 1 for lockHoldSeconds; post-lock starts here
    medianBpm: number; // post-lock, of the bpm column; NaN when never locked
    withinTolerance: number | undefined; // post-lock share of rows, octave-normalized; undefined without a reference
    songChanges: number; // rises of songChanges within the recording, so a re-select before the first row never counts
    gridRebuilds: number; // rises of gridEpoch within the recording
    lockedShare: number; // post-lock share of rows with tempoLocked = 1
    gateShare: number; // post-lock share of rows with gateOpen = 1
    gateOpenTime: number | undefined; // first post-lock t with gateOpen = 1
    bumpIntervalShare: number | undefined; // post-lock intervals within 0.1 beat of a whole number of beats (at least 1)
    meanFps: number;
}

const DEFAULTS = { windowSeconds: 5, tolerance: 0.01, lockHoldSeconds: 2, minFps: 50, maxLines: 40 };
// A bump interval counts as on the grid when it is this close (in beats) to a whole number of beats.
const BUMP_GRID_BEATS = 0.1;
const PASS_WITHIN_TOLERANCE = 0.98;
const PASS_LOCKED_SHARE = 0.99;
const PASS_GATE_SHARE = 0.99;
const PASS_BUMP_SHARE = 0.95;
// Header, the three metric lines and the verdict. Windows and event lines share what is left.
const FIXED_LINES = 5;
// At most this many song-change and grid-rebuild lines, the last one being a "+N more" note when there are more.
const MAX_EVENT_LINES = 6;

/** Column indexes of one probe's tempo columns; -1 where a column is missing. */
export interface TempoColumns {
    prefix: string;
    t: number;
    fps: number;
    bpm: number;
    rawTempoBpm: number;
    tempoConfidence: number;
    beatPhase: number;
    clipPhase: number;
    songChanges: number;
    gridEpoch: number;
    tempoLocked: number;
    gateOpen: number;
    bumpCount: number;
}

// Finds the tempo columns from the first column named "<probe>.bpm"; the probe name locates the others.
export function findTempoColumns(columns: readonly string[]): TempoColumns | undefined {
    const bpm = columns.findIndex((name) => name.endsWith('.bpm'));
    if (bpm < 0) return undefined;
    const prefix = columns[bpm].slice(0, -'bpm'.length);
    const at = (name: string) => columns.indexOf(name);
    return {
        prefix,
        t: at('t'),
        fps: at('fps'),
        bpm,
        rawTempoBpm: at(`${prefix}rawTempoBpm`),
        tempoConfidence: at(`${prefix}tempoConfidence`),
        beatPhase: at(`${prefix}beatPhase`),
        clipPhase: at(`${prefix}clipPhase`),
        songChanges: at(`${prefix}songChanges`),
        gridEpoch: at(`${prefix}gridEpoch`),
        tempoLocked: at(`${prefix}tempoLocked`),
        gateOpen: at(`${prefix}gateOpen`),
        bumpCount: at(`${prefix}bumpCount`),
    };
}

export function parseBpmSidecar(text: string): number | undefined {
    const token = text.trim().split(/\s+/)[0];
    if (token === undefined || token === '') return undefined;
    const value = Number(token);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function normalizeOctave(bpm: number, reference: number): number {
    // A tempo of 0 has no octave, and a non-positive reference has no meaningful ratio.
    if (!(bpm > 0) || !(reference > 0)) return bpm;
    return bpm * 2 ** Math.round(Math.log2(reference / bpm));
}

function significant(value: number, digits = 4): string {
    if (!Number.isFinite(value)) return 'NaN';
    return String(Number(value.toPrecision(digits)));
}

function percent(share: number): string {
    return `${significant(share * 100, 3)}%`;
}

function cell(row: readonly number[], index: number): number {
    return index < 0 ? NaN : row[index];
}

function median(values: readonly number[]): number {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function meanOf(values: readonly number[]): number {
    const finite = values.filter(Number.isFinite);
    return finite.length === 0 ? NaN : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

// The mean fps column, or the row rate from t when the table has no fps column.
function meanFpsOf(rows: readonly (readonly number[])[], columns: TempoColumns): number {
    if (rows.length === 0) return 0;
    if (columns.fps >= 0) {
        const mean = meanOf(rows.map((row) => row[columns.fps]));
        return Number.isFinite(mean) ? mean : 0;
    }
    const span = cell(rows[rows.length - 1], columns.t) - cell(rows[0], columns.t);
    return span > 0 ? (rows.length - 1) / span : 0;
}

// Rows where the column rose compared with the row before it. The first row has no row before, so a counter that
// already stood at 5 when recording began contributes nothing.
function risesOf(rows: readonly (readonly number[])[], index: number): number[] {
    const at: number[] = [];
    if (index < 0) return at;
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][index] > rows[i - 1][index]) at.push(i);
    }
    return at;
}

interface Analysis {
    columns: TempoColumns;
    metrics: TempoMetrics;
    lockIndex: number; // first post-lock row, rows.length when never locked
    songChangeRows: number[];
    gridRebuildRows: number[];
}

function lockIndexOf(rows: readonly (readonly number[])[], columns: TempoColumns, hold: number): number {
    let runStart = NaN;
    for (let i = 0; i < rows.length; i++) {
        if (cell(rows[i], columns.tempoLocked) === 1) {
            const t = rows[i][columns.t];
            if (Number.isNaN(runStart)) runStart = t;
            if (t - runStart >= hold) return i;
        } else {
            // A dip restarts the hold.
            runStart = NaN;
        }
    }
    return rows.length;
}

function analyze(table: TelemetryTable, options: TempoSummaryOptions): Analysis | undefined {
    const columns = findTempoColumns(table.columns);
    if (!columns) return undefined;
    const hold = options.lockHoldSeconds ?? DEFAULTS.lockHoldSeconds;
    const tolerance = options.tolerance ?? DEFAULTS.tolerance;
    const { rows } = table;
    const lockIndex = lockIndexOf(rows, columns, hold);
    const post = rows.slice(lockIndex);
    const lockTime = lockIndex < rows.length ? rows[lockIndex][columns.t] : undefined;

    const medianBpm = median(post.map((row) => row[columns.bpm]).filter(Number.isFinite));
    const reference = options.referenceBpm;
    let withinTolerance: number | undefined;
    if (reference !== undefined) {
        const inside = post.filter(
            (row) => Math.abs(normalizeOctave(row[columns.bpm], reference) - reference) / reference <= tolerance,
        ).length;
        withinTolerance = post.length === 0 ? 0 : inside / post.length;
    }

    const share = (index: number) =>
        post.length === 0 ? 0 : post.filter((row) => cell(row, index) === 1).length / post.length;
    const gateRow = post.find((row) => cell(row, columns.gateOpen) === 1);

    // Bump times are the post-lock rows where the counter rose; intervals are measured in beats of the median tempo.
    const bumpTimes: number[] = [];
    for (const i of risesOf(rows, columns.bumpCount)) {
        if (i >= lockIndex) bumpTimes.push(rows[i][columns.t]);
    }
    let bumpIntervalShare: number | undefined;
    if (bumpTimes.length >= 2 && medianBpm > 0) {
        let onGrid = 0;
        for (let i = 1; i < bumpTimes.length; i++) {
            const beats = ((bumpTimes[i] - bumpTimes[i - 1]) * medianBpm) / 60;
            const whole = Math.max(1, Math.round(beats));
            if (Math.abs(beats - whole) <= BUMP_GRID_BEATS) onGrid++;
        }
        bumpIntervalShare = onGrid / (bumpTimes.length - 1);
    }

    const songChangeRows = risesOf(rows, columns.songChanges);
    const gridRebuildRows = risesOf(rows, columns.gridEpoch);
    return {
        columns,
        lockIndex,
        songChangeRows,
        gridRebuildRows,
        metrics: {
            lockTime,
            medianBpm,
            withinTolerance,
            songChanges: songChangeRows.length,
            gridRebuilds: gridRebuildRows.length,
            lockedShare: share(columns.tempoLocked),
            gateShare: share(columns.gateOpen),
            gateOpenTime: gateRow ? gateRow[columns.t] : undefined,
            bumpIntervalShare,
            meanFps: meanFpsOf(rows, columns),
        },
    };
}

export function computeTempoMetrics(
    table: TelemetryTable,
    options: TempoSummaryOptions = {},
): TempoMetrics | undefined {
    return analyze(table, options)?.metrics;
}

// The targets that were missed, empty when the recording passes. Only meaningful with a reference tempo.
function missedTargets(metrics: TempoMetrics): string[] {
    const missed: string[] = [];
    if (metrics.lockTime === undefined) return ['never locked'];
    const { withinTolerance, bumpIntervalShare } = metrics;
    if (withinTolerance === undefined || !(withinTolerance >= PASS_WITHIN_TOLERANCE)) {
        missed.push(`within tolerance ${significant(withinTolerance ?? NaN, 3)} < ${PASS_WITHIN_TOLERANCE}`);
    }
    if (metrics.songChanges > 0) missed.push(`${metrics.songChanges} song changes`);
    if (metrics.gridRebuilds > 0) missed.push(`${metrics.gridRebuilds} grid rebuilds`);
    if (!(metrics.lockedShare >= PASS_LOCKED_SHARE)) {
        missed.push(`locked share ${significant(metrics.lockedShare, 3)} < ${PASS_LOCKED_SHARE}`);
    }
    if (!(metrics.gateShare >= PASS_GATE_SHARE)) {
        missed.push(`gate share ${significant(metrics.gateShare, 3)} < ${PASS_GATE_SHARE}`);
    }
    if (bumpIntervalShare === undefined || !(bumpIntervalShare >= PASS_BUMP_SHARE)) {
        missed.push(
            bumpIntervalShare === undefined
                ? 'no bump intervals measured'
                : `bump interval share ${significant(bumpIntervalShare, 3)} < ${PASS_BUMP_SHARE}`,
        );
    }
    return missed;
}

function windowLine(
    rows: readonly (readonly number[])[],
    first: number,
    last: number,
    columns: TempoColumns,
    options: TempoSummaryOptions,
    start: number,
    end: number,
): string {
    const slice = rows.slice(first, last);
    const column = (index: number) => slice.map((row) => cell(row, index));
    const bpms = column(columns.bpm).filter(Number.isFinite);
    const reference = options.referenceBpm;
    const tolerance = options.tolerance ?? DEFAULTS.tolerance;
    const minFps = options.minFps ?? DEFAULTS.minFps;
    const rises = (index: number) => {
        let count = 0;
        // Compare the first row with the row before the window so a rise on a window boundary is counted once.
        for (let i = first; i < last; i++) {
            if (i > 0 && cell(rows[i], index) > cell(rows[i - 1], index)) count++;
        }
        return count;
    };
    const flagShare = (index: number) =>
        slice.filter((row) => cell(row, index) === 1).length / Math.max(1, slice.length);
    const parts = [
        `${significant(start, 4)}-${significant(end, 4)} s`,
        `bpm ${significant(meanOf(bpms))} (${significant(bpms.length ? Math.min(...bpms) : NaN)}..${significant(bpms.length ? Math.max(...bpms) : NaN)})`,
    ];
    if (reference !== undefined) {
        const deviations = bpms.map((bpm) => Math.abs(normalizeOctave(bpm, reference) - reference) / reference);
        const worst = deviations.length ? Math.max(...deviations) : NaN;
        const inside = deviations.filter((deviation) => deviation <= tolerance).length;
        parts.push(`dev ${significant(worst * 100, 3)}%`, `in-tol ${percent(inside / Math.max(1, slice.length))}`);
    }
    const confidence = column(columns.tempoConfidence).filter(Number.isFinite);
    parts.push(
        `raw ${significant(meanOf(column(columns.rawTempoBpm)))}`,
        `minConf ${significant(confidence.length ? Math.min(...confidence) : NaN, 3)}`,
        `song+${rises(columns.songChanges)}`,
        `grid+${rises(columns.gridEpoch)}`,
        `locked ${percent(flagShare(columns.tempoLocked))}`,
        `gate ${percent(flagShare(columns.gateOpen))}`,
        `bumps ${rises(columns.bumpCount)}`,
    );
    if (meanFpsOf(slice, columns) < minFps) parts.push('unreliable');
    return parts.join('  ');
}

function metricLines(metrics: TempoMetrics): string[] {
    const optional = (value: number | undefined, format: (v: number) => string) =>
        value === undefined ? 'n/a' : format(value);
    return [
        `lock at ${optional(metrics.lockTime, (v) => `${significant(v)} s`)}, median bpm ${significant(metrics.medianBpm)}, ` +
            `within tolerance ${optional(metrics.withinTolerance, percent)}, mean fps ${significant(metrics.meanFps, 3)}`,
        `song changes ${metrics.songChanges}, grid rebuilds ${metrics.gridRebuilds}, ` +
            `locked ${percent(metrics.lockedShare)}, gate ${percent(metrics.gateShare)}`,
        `gate first open at ${optional(metrics.gateOpenTime, (v) => `${significant(v)} s`)}, ` +
            `bump intervals on the grid ${optional(metrics.bumpIntervalShare, percent)}`,
    ];
}

export function summarizeTempo(table: TelemetryTable, options: TempoSummaryOptions = {}): string[] {
    const analysis = analyze(table, options);
    if (!analysis) return ['Tempo: no "<probe>.bpm" column in this recording, so there is no tempo report.'];
    const { columns, metrics } = analysis;
    const { rows } = table;
    const maxLines = options.maxLines ?? DEFAULTS.maxLines;
    const reference = options.referenceBpm;

    const header =
        `Tempo (${columns.prefix.replace(/\.$/, '')}): ` +
        (reference === undefined
            ? 'no reference tempo'
            : `reference ${significant(reference)} bpm, tolerance ${percent(options.tolerance ?? DEFAULTS.tolerance)}`);

    const events: string[] = [];
    for (const i of analysis.songChangeRows) events.push(`song change at t=${significant(rows[i][columns.t])} s`);
    for (const i of analysis.gridRebuildRows) events.push(`grid rebuild at t=${significant(rows[i][columns.t])} s`);
    const eventLines =
        events.length > MAX_EVENT_LINES
            ? [...events.slice(0, MAX_EVENT_LINES - 1), `... and ${events.length - (MAX_EVENT_LINES - 1)} more events`]
            : events;

    let verdict: string;
    if (metrics.lockTime === undefined) verdict = 'TEMPO VERDICT: FAIL (never locked)';
    else if (reference === undefined) verdict = 'TEMPO VERDICT: report only (no sidecar)';
    else {
        const missed = missedTargets(metrics);
        verdict = missed.length === 0 ? 'TEMPO VERDICT: PASS' : `TEMPO VERDICT: FAIL (${missed.join(', ')})`;
    }

    // Windows take whatever the fixed lines and the events leave, widening the window to fit.
    const available = Math.max(0, maxLines - FIXED_LINES - eventLines.length);
    const lines: string[] = [header];
    if (rows.length > 0 && available > 0) {
        const start = cell(rows[0], columns.t);
        const span = cell(rows[rows.length - 1], columns.t) - start;
        const preferred = options.windowSeconds ?? DEFAULTS.windowSeconds;
        // floor(span / w) + 1 windows fit when w > span / available.
        const width = Math.max(preferred, (span / available) * 1.0001);
        let first = 0;
        while (first < rows.length) {
            const index = Math.floor((rows[first][columns.t] - start) / width);
            let last = first + 1;
            while (last < rows.length && Math.floor((rows[last][columns.t] - start) / width) === index) last++;
            lines.push(
                windowLine(
                    rows,
                    first,
                    last,
                    columns,
                    options,
                    start + index * width,
                    Math.min(start + (index + 1) * width, start + span),
                ),
            );
            first = last;
        }
    }
    lines.push(...eventLines, ...metricLines(metrics), verdict);

    // A tiny maxLines or a table with a broken t column must still not overflow; the verdict always survives.
    if (lines.length > maxLines) return maxLines < 1 ? [] : [...lines.slice(0, maxLines - 1), verdict];
    return lines;
}
