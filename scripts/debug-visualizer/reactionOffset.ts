// How late a visualizer reacts to a click: for each click time of a ground-truth sidecar, the first rise of one
// telemetry column after it. Pure: debug:summary reads the files and prints what this returns. Not part of the app
// bundle.

import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';

// A rise counts once the column is this fraction of its whole-recording range above its level at the click.
const RISE_FRACTION = 0.2;
// How long after a click a reaction is looked for. A reaction later than this belongs to the next beat or to nothing.
const SEARCH_WINDOW_SECONDS = 0.25;

export interface ReactionOptions {
    riseFraction?: number;
    windowSeconds?: number;
}

export interface ReactionOffset {
    // Median and 95th percentile of (reaction time minus click time) in ms, in track time. undefined with no hit.
    medianMs: number | undefined;
    p95Ms: number | undefined;
    hits: number;
    misses: number;
    // Median interval between recorded rows in ms: the reaction time is a row time, so the figures are only this precise.
    frameAllowanceMs: number;
    // A counter column reacts on its first increment instead of on a rise by a fraction of its range.
    counter: boolean;
}

function median(sorted: readonly number[]): number {
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Linear-interpolated percentile of an ascending list.
function percentile(sorted: readonly number[], fraction: number): number {
    const position = (sorted.length - 1) * fraction;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

// A column of whole numbers that never goes down and does go up is a counter.
function isCounter(values: readonly number[]): boolean {
    let rose = false;
    for (let i = 0; i < values.length; i++) {
        if (!Number.isInteger(values[i])) return false;
        if (i > 0 && values[i] < values[i - 1]) return false;
        if (i > 0 && values[i] > values[i - 1]) rose = true;
    }
    return rose;
}

export function measureReactionOffset(
    table: TelemetryTable,
    column: string,
    clicks: readonly number[],
    options: ReactionOptions = {},
): ReactionOffset | { unavailable: string } {
    const t = table.columns.indexOf('t');
    const c = table.columns.indexOf(column);
    if (t < 0) return { unavailable: 'the recording has no "t" column' };
    if (c < 0) return { unavailable: `the recording has no "${column}" column` };
    const rows = table.rows.filter((row) => Number.isFinite(row[t]) && Number.isFinite(row[c]));
    if (rows.length < 2) return { unavailable: `"${column}" has fewer than two usable rows` };
    const times = rows.map((row) => row[t]);
    const values = rows.map((row) => row[c]);
    const low = Math.min(...values);
    const range = Math.max(...values) - low;
    if (!(range > 0)) return { unavailable: `"${column}" never changes` };

    const counter = isCounter(values);
    const threshold = (options.riseFraction ?? RISE_FRACTION) * range;
    const windowSeconds = options.windowSeconds ?? SEARCH_WINDOW_SECONDS;
    const offsets: number[] = [];
    let misses = 0;
    for (const click of clicks) {
        // A click the recording does not cover (before its first row, or too near its end for the whole search window)
        // says nothing about the visualizer, so it is neither a hit nor a miss.
        if (click <= times[0] || click + windowSeconds > times[times.length - 1]) continue;
        let before = -1;
        while (before + 1 < times.length && times[before + 1] < click) before++;
        // The level is the last row strictly before the click, so a rise recorded at the click's own row still counts.
        const level = values[before];
        let found = -1;
        for (let i = before + 1; i < times.length && times[i] <= click + windowSeconds; i++) {
            if (counter ? values[i] > level : values[i] > level + threshold) {
                found = i;
                break;
            }
        }
        if (found < 0) misses++;
        else offsets.push((times[found] - click) * 1000);
    }
    offsets.sort((a, b) => a - b);

    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) gaps.push((times[i] - times[i - 1]) * 1000);
    gaps.sort((a, b) => a - b);
    return {
        medianMs: offsets.length > 0 ? median(offsets) : undefined,
        p95Ms: offsets.length > 0 ? percentile(offsets, 0.95) : undefined,
        hits: offsets.length,
        misses,
        frameAllowanceMs: gaps.length > 0 ? median(gaps) : 0,
        counter,
    };
}

export function formatReactionOffset(column: string, result: ReactionOffset): string {
    if (result.medianMs === undefined || result.p95Ms === undefined) {
        return `  reaction offset (${column}): no reaction found (${result.misses} clicks missed)`;
    }
    const sign = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
    return (
        `  reactionOffsetMs (${column}): median ${sign(result.medianMs)} ms, p95 ${sign(result.p95Ms)} ms, ` +
        `${result.hits} hit, ${result.misses} missed; frame allowance +/-${result.frameAllowanceMs.toFixed(1)} ms`
    );
}
