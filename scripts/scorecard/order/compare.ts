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

// Reaction rows: the median of the self runs (the visualizer's second play after itself) against the median of the other
// runs (its second play after the other visualizer). The allowance is the larger of the committed live cell's spread
// (when there is a cell) and the spread of the lead and self values, which is the run-to-run noise of this recording.
export function reactionRows(
    pair: string,
    track: string,
    viz: LiveVisualizer,
    lead: readonly OrderRun[],
    self: readonly OrderRun[],
    other: readonly OrderRun[],
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
        const leadValues = withBeats(lead);
        const selfValues = withBeats(self);
        const otherValues = withBeats(other);
        if ([...lead, ...self, ...other].every((run) => run.beats === undefined) && lead.length + self.length > 0) {
            row.note = 'the track has no beats';
        } else if (selfValues.length === 0 || otherValues.length === 0) {
            row.note = selfValues.length === 0 ? 'no self run measured' : 'no run after the other visualizer measured';
        } else {
            const cell = cellOf(id, track, viz);
            const spreadValues = [...leadValues, ...selfValues];
            const own = Math.max(...spreadValues) - Math.min(...spreadValues);
            const first = median(selfValues)!;
            const second = median(otherValues)!;
            row.first = first;
            row.second = second;
            row.allowed = Math.max(cell?.spread ?? 0, own);
            row.pass = Math.abs(second - first) <= row.allowed + EPSILON;
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

// All rows of one pair: for each track and each visualizer V, V's lead runs (play 1 of every session V led), its self
// runs (play 2 of V's control sessions) and its other runs (play 2 after the other visualizer).
export function orderRows(
    pair: readonly [string, string],
    sessionsByTrack: ReadonlyMap<string, readonly LoadedSession[]>,
    cellOf: LiveCellLookup,
): OrderRow[] {
    const rows: OrderRow[] = [];
    for (const [track, sessions] of sessionsByTrack) {
        for (const viz of pair) {
            const lead = sessions.filter((session) => session.leadViz === viz).map((session) => session.lead);
            const self = sessions
                .filter((session) => session.leadViz === viz && session.followViz === viz)
                .map((session) => session.follow);
            const other = sessions
                .filter((session) => session.leadViz !== viz && session.followViz === viz)
                .map((session) => session.follow);
            rows.push(
                ...hubRows(pair.join(','), track, viz as LiveVisualizer, lead, self, other),
                ...reactionRows(pair.join(','), track, viz as LiveVisualizer, lead, self, other, cellOf),
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

// Hub rows. The hub signals are the shared inputs the visualizers read, so a visualizer's second play should look the
// same whichever visualizer played before it. First is how far the lead runs are from the self runs (the same visualizer
// after itself, the cost of the navigate and re-select path alone); second is how far they are from the runs after the
// other visualizer. The allowance is the larger of the lead runs' own spread and first, so only a difference the control
// does not explain fails.
export function hubRows(
    pair: string,
    track: string,
    viz: LiveVisualizer,
    lead: readonly OrderRun[],
    self: readonly OrderRun[],
    other: readonly OrderRun[],
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
        if (lead.length < 2 || self.length === 0 || other.length === 0) {
            row.note = 'needs at least 2 lead runs and at least 1 self and 1 other run';
            return row;
        }
        const within = numbers(withinDistances(lead, column));
        const toSelf = numbers(lead.flatMap((a) => self.map((b) => distance(a.table, b.table, column))));
        const toOther = numbers(lead.flatMap((a) => other.map((b) => distance(a.table, b.table, column))));
        if (within.length === 0 || toSelf.length === 0 || toOther.length === 0) {
            row.note = 'the column is missing or the runs do not overlap';
            return row;
        }
        row.first = median(toSelf)!;
        row.second = median(toOther)!;
        row.allowed = Math.max(Math.max(...within), row.first);
        row.pass = row.second <= row.allowed + EPSILON;
        return row;
    });
}
