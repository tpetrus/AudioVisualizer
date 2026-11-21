// The AC11 comparison: a visualizer's hub signals and reaction metrics when it led a page session against when it
// followed another visualizer in the same page. Pure: the runs come in already loaded, so no files are read here.

import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import { median } from '../live/liveCells';
import { falseFireShare, hitShare, reactionLatencyMs } from '../live/measures';
import type { LiveVisualizer } from '../targets';

export interface OrderRun {
    table: TelemetryTable;
    // The track's labeled beats, when it has a sidecar.
    beats: readonly number[] | undefined;
}

export interface OrderRow {
    pair: string;
    track: string;
    visualizer: string;
    signal: string;
    kind: 'hub' | 'reaction';
    first: number | null;
    second: number | null;
    allowed: number | null;
    pass: boolean | null;
    note?: string;
}

// The part of a committed live cell the reaction rows need.
export interface LiveCellRef {
    value: number | null;
    spread: number;
    status: string;
    applicable: boolean;
}

export type LiveCellLookup = (metric: string, track: string, visualizer: string) => LiveCellRef | undefined;

// Pass tolerance for floating point noise only.
const EPSILON = 1e-6;
export const GRID_SECONDS = 0.01;

export const HUB_COLUMNS = ['gain', 'bassRaw', 'onsetKick', 'onsetMid', 'onsetHigh'];

const REACTION_SIGNALS: readonly {
    id: string;
    measure: (table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]) => number | null;
}[] = [
    { id: 'live.hit.share50ms', measure: hitShare },
    { id: 'live.reaction.latencyMs', measure: reactionLatencyMs },
    { id: 'live.falseFire.share', measure: falseFireShare },
];

const numbers = (values: readonly (number | null)[]): number[] =>
    values.filter((value): value is number => value !== null && Number.isFinite(value));

// Reaction rows: the median of each side's per-run values, judged against the committed live cell's value and spread.
export function reactionRows(
    pair: string,
    track: string,
    viz: LiveVisualizer,
    first: readonly OrderRun[],
    second: readonly OrderRun[],
    cellOf: LiveCellLookup,
): OrderRow[] {
    return REACTION_SIGNALS.map(({ id, measure }) => {
        const row: OrderRow = {
            pair,
            track,
            visualizer: viz,
            signal: id,
            kind: 'reaction',
            first: null,
            second: null,
            allowed: null,
            pass: null,
        };
        const withBeats = (runs: readonly OrderRun[]): number[] =>
            numbers(runs.map((run) => (run.beats === undefined ? null : measure(run.table, viz, run.beats))));
        row.first = median(withBeats(first));
        row.second = median(withBeats(second));
        const cell = cellOf(id, track, viz);
        if ([...first, ...second].every((run) => run.beats === undefined) && first.length + second.length > 0) {
            row.note = 'the track has no beats';
        } else if (cell === undefined || !cell.applicable || cell.status === 'unavailable' || cell.value === null) {
            row.note = 'no live cell to compare with';
        } else if (row.second === null) {
            row.note = 'no second run measured';
        } else {
            row.allowed = cell.spread;
            row.pass = Math.abs(row.second - cell.value) <= cell.spread + EPSILON;
        }
        return row;
    });
}

// A column of a table resampled on a common grid of the `t` column, by linear interpolation.
export function resample(table: TelemetryTable, column: string, start: number, end: number): number[] | null {
    const timeIndex = table.columns.indexOf('t');
    const valueIndex = table.columns.indexOf(column);
    if (timeIndex < 0 || valueIndex < 0 || table.rows.length === 0) return null;
    const out: number[] = [];
    let at = 0;
    for (let t = start; t <= end + 1e-9; t += GRID_SECONDS) {
        while (at + 1 < table.rows.length && table.rows[at + 1][timeIndex] <= t) at++;
        const a = table.rows[at];
        const b = table.rows[Math.min(at + 1, table.rows.length - 1)];
        const span = b[timeIndex] - a[timeIndex];
        const weight = span > 0 ? Math.min(1, Math.max(0, (t - a[timeIndex]) / span)) : 0;
        out.push(a[valueIndex] + (b[valueIndex] - a[valueIndex]) * weight);
    }
    return out;
}

const timeSpan = (table: TelemetryTable): [number, number] | null => {
    const index = table.columns.indexOf('t');
    if (index < 0 || table.rows.length === 0) return null;
    return [table.rows[0][index], table.rows[table.rows.length - 1][index]];
};

// The RMS difference of one column of two runs over the time both cover; null when they do not overlap or lack the column.
export function distance(a: TelemetryTable, b: TelemetryTable, column: string): number | null {
    const spanA = timeSpan(a);
    const spanB = timeSpan(b);
    if (spanA === null || spanB === null) return null;
    const start = Math.max(spanA[0], spanB[0]);
    const end = Math.min(spanA[1], spanB[1]);
    if (end <= start) return null;
    const x = resample(a, column, start, end);
    const y = resample(b, column, start, end);
    if (x === null || y === null) return null;
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += (x[i] - y[i]) ** 2;
    return Math.sqrt(sum / x.length);
}

export interface LoadedSession {
    leadViz: string;
    followViz: string;
    lead: OrderRun;
    follow: OrderRun;
}

// All rows of one pair: for each track and each visualizer, its led runs against its followed runs.
export function orderRows(
    pair: readonly [string, string],
    sessionsByTrack: ReadonlyMap<string, readonly LoadedSession[]>,
    cellOf: LiveCellLookup,
): OrderRow[] {
    const rows: OrderRow[] = [];
    for (const [track, sessions] of sessionsByTrack) {
        for (const viz of pair) {
            const first = sessions.filter((session) => session.leadViz === viz).map((session) => session.lead);
            const second = sessions.filter((session) => session.followViz === viz).map((session) => session.follow);
            rows.push(
                ...hubRows(pair.join(','), track, viz as LiveVisualizer, first, second),
                ...reactionRows(pair.join(','), track, viz as LiveVisualizer, first, second, cellOf),
            );
        }
    }
    return rows;
}

// Every distance between two different runs of one condition.
function withinDistances(runs: readonly OrderRun[], column: string): (number | null)[] {
    const out: (number | null)[] = [];
    for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) out.push(distance(runs[i].table, runs[j].table, column));
    }
    return out;
}

// Hub rows: how far apart the signal is between the two conditions (second column), against how far apart runs of one
// condition already are (first column and the allowance). The hub signals are the shared inputs the visualizers read, so
// a visualizer that leads and one that follows should see the same signal within a recording's own run-to-run spread.
export function hubRows(
    pair: string,
    track: string,
    viz: LiveVisualizer,
    first: readonly OrderRun[],
    second: readonly OrderRun[],
): OrderRow[] {
    return [...HUB_COLUMNS, `${viz}.in`].map((column) => {
        const row: OrderRow = {
            pair,
            track,
            visualizer: viz,
            signal: column,
            kind: 'hub',
            first: null,
            second: null,
            allowed: null,
            pass: null,
        };
        if (first.length < 2 || second.length < 2) {
            row.note = 'needs at least 2 runs in each condition';
            return row;
        }
        const within = numbers([...withinDistances(first, column), ...withinDistances(second, column)]);
        const cross = numbers(first.flatMap((a) => second.map((b) => distance(a.table, b.table, column))));
        if (within.length === 0 || cross.length === 0) {
            row.note = 'the column is missing or the runs do not overlap';
            return row;
        }
        const spread = Math.max(...within);
        row.first = spread;
        const between = median(cross)!;
        row.second = between;
        row.allowed = spread;
        row.pass = between <= spread + EPSILON;
        return row;
    });
}
