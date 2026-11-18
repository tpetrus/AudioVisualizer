// The live metrics, read from one debug:viz recording (a TelemetryTable) or, for the two metrics that compare runs, from
// all the recordings of one track. Pure: no files, no processes. Times are the CSV `t` column, which is track time, so
// runs that rendered at different frame rates compare directly.

import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import { measureReactionOffset } from '../../debug-visualizer/reactionOffset';
import { LIVE_HIT_WINDOW_SECONDS, LIVE_REACTION_COLUMN, LIVE_RISE_FRACTION, type LiveVisualizer } from '../targets';

const GATE_COLUMN = 'dancing-character.gateOpen';
const TEMPO_LOCK_COLUMN = 'dancing-character.tempoLocked';
const METER_LOCK_COLUMN = 'dancing-character.meterLocked';
const CLIP_COLUMN = 'dancing-character.clipPhase';
// compareRuns (scripts/debug-visualizer/repeatReport.ts) samples the dance loop at this step too.
const CLIP_SAMPLE_STEP_SECONDS = 0.25;
// A flag column is 0 or 1; anything above half is set.
const FLAG_THRESHOLD = 0.5;

// First t at which a flag column is set, or null when it never is (or the column is missing).
function firstSetSeconds(table: TelemetryTable, column: string): number | null {
    const t = table.columns.indexOf('t');
    const c = table.columns.indexOf(column);
    if (t < 0 || c < 0) return null;
    for (const row of table.rows) if (row[c] > FLAG_THRESHOLD && Number.isFinite(row[t])) return row[t];
    return null;
}

// AC6 in the browser. null is a run whose gate never opened, which the cell builder counts as a failed run.
export function gateFirstOpenSeconds(table: TelemetryTable): number | null {
    return firstSetSeconds(table, GATE_COLUMN);
}

// The dancer's own tempo lock in one run: the first row whose tempoLocked is set.
export function lockSeconds(table: TelemetryTable): number | null {
    return firstSetSeconds(table, TEMPO_LOCK_COLUMN);
}

// AC6 as restated at the S3 review: seconds from the run's first tempoLocked row to its first gateOpen row. null when
// either never happens, which the cell builder counts as a failed run.
export function gateSecondsAfterLock(table: TelemetryTable): number | null {
    const open = gateFirstOpenSeconds(table);
    const lock = lockSeconds(table);
    return open === null || lock === null ? null : open - lock;
}

// The smallest range (max minus min) over any 3 of the lock times: with 4 runs that is "3 of 4 lock within N seconds".
// null with fewer than 3 runs that locked. Values that are null are runs that never locked.
export function smallestLockRange(times: readonly (number | null)[]): number | null {
    const locked = times.filter((time): time is number => time !== null).sort((a, b) => a - b);
    if (locked.length < 3) return null;
    let best = Infinity;
    // Over a sorted list the closest 3 are always 3 neighbors.
    for (let i = 0; i + 2 < locked.length; i++) best = Math.min(best, locked[i + 2] - locked[i]);
    return best;
}

// Range over every run that locked; null with none.
export function lockRange(times: readonly (number | null)[]): number | null {
    const locked = times.filter((time): time is number => time !== null);
    return locked.length === 0 ? null : Math.max(...locked) - Math.min(...locked);
}

// Shortest distance between two positions on the loop, in loops (0 to 0.5).
export function circularDistance(a: number, b: number): number {
    const gap = Math.abs((((a - b) % 1) + 1) % 1);
    return Math.min(gap, 1 - gap);
}

// The circular median of positions on the loop: the point that minimizes the sum of circular distances to the values.
// That sum is piecewise linear with its corners at the values and at the points opposite them, so the minimum is found
// by trying those corners. When exactly two corners tie (two runs, or an even count whose middle is a flat stretch) the
// median is the midpoint of the shorter arc between them, so two runs are equally far from it and the result does not
// depend on their order; any other tie goes to the smallest position in [0, 1). Defined for any count of 1 or more; NaN
// for none.
export function circularMedian(values: readonly number[]): number {
    if (values.length === 0) return NaN;
    const wrap = (value: number): number => ((value % 1) + 1) % 1;
    const candidates = values.flatMap((value) => [wrap(value), wrap(value + 0.5)]).sort((a, b) => a - b);
    let tied: number[] = [];
    let bestCost = Infinity;
    for (const candidate of candidates) {
        let cost = 0;
        for (const value of values) cost += circularDistance(candidate, value);
        // The tolerance keeps a float-level difference from separating corners of a flat stretch.
        if (cost < bestCost - 1e-9) {
            bestCost = cost;
            tied = [candidate];
        } else if (cost <= bestCost + 1e-9 && !tied.some((other) => Math.abs(other - candidate) < 1e-9)) {
            tied.push(candidate);
        }
    }
    if (tied.length !== 2) return tied[0];
    const [low, high] = tied;
    const arc = high - low;
    // Whichever way round the circle is shorter: inside [low, high], or across the wrap.
    return arc <= 0.5 ? low + arc / 2 : wrap(high + (1 - arc) / 2);
}

// AC7: each run's largest circular distance, in loops, between its dance clip phase and the circular median of all runs,
// sampled every 0.25 s of track time. Sampling starts at the latest run's first meterLocked (the bar is only known from
// there), or the latest first tempoLocked when no run meter-locks, and ends where the shortest run ends. A run's phase at
// a sample is its last row at or before it. null for every run when no run locks or the span is empty.
export function clipMaxDeviations(tables: readonly TelemetryTable[]): (number | null)[] {
    const none = tables.map(() => null);
    const meterLocks = tables.map((table) => firstSetSeconds(table, METER_LOCK_COLUMN)).filter((time) => time !== null);
    const tempoLocks = tables.map((table) => lockSeconds(table)).filter((time) => time !== null);
    const locks = meterLocks.length > 0 ? meterLocks : tempoLocks;
    if (locks.length === 0) return none;
    const start = Math.max(...locks);

    const series = tables.map((table) => {
        const t = table.columns.indexOf('t');
        const phase = table.columns.indexOf(CLIP_COLUMN);
        return {
            t: phase < 0 || t < 0 ? [] : table.rows.map((row) => row[t]),
            phase: phase < 0 || t < 0 ? [] : table.rows.map((row) => row[phase]),
        };
    });
    if (series.some((s) => s.t.length === 0)) return none;
    const end = Math.min(...series.map((s) => s.t[s.t.length - 1]));

    const worst = tables.map(() => 0);
    let samples = 0;
    // Each run's index of its last row at or before the sample; samples only move forward, so it only moves forward.
    const at = series.map(() => -1);
    for (let k = 0; start + k * CLIP_SAMPLE_STEP_SECONDS <= end + 1e-9; k++) {
        const sampleT = start + k * CLIP_SAMPLE_STEP_SECONDS;
        const phases: number[] = [];
        series.forEach((s, run) => {
            while (at[run] + 1 < s.t.length && s.t[at[run] + 1] <= sampleT) at[run]++;
            phases.push(at[run] >= 0 ? s.phase[at[run]] : NaN);
        });
        const usable = phases.filter((phase) => Number.isFinite(phase));
        if (usable.length === 0) continue;
        samples++;
        const median = circularMedian(usable);
        phases.forEach((phase, run) => {
            if (Number.isFinite(phase)) worst[run] = Math.max(worst[run], circularDistance(phase, median));
        });
    }
    return samples === 0 ? none : worst;
}

// AC8: hits / (hits + misses), the hit being a rise of the reaction column within LIVE_HIT_WINDOW_SECONDS of a beat.
export function hitShare(table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]): number | null {
    const result = measureReactionOffset(table, LIVE_REACTION_COLUMN[viz], beats, {
        windowSeconds: LIVE_HIT_WINDOW_SECONDS,
        riseFraction: LIVE_RISE_FRACTION,
    });
    if ('unavailable' in result) return null;
    const total = result.hits + result.misses;
    return total === 0 ? null : result.hits / total;
}

// AC8: the median delay of a reaction after a beat, with measureReactionOffset's own search window.
export function reactionLatencyMs(table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]): number | null {
    const result = measureReactionOffset(table, LIVE_REACTION_COLUMN[viz], beats);
    if ('unavailable' in result) return null;
    return result.medianMs ?? null;
}

// The share of fires that are no beat's hit. A fire is a row where the reaction column is above (its minimum over the
// rows within LIVE_HIT_WINDOW_SECONDS before the row) by LIVE_RISE_FRACTION of the whole recording's range, and the row
// before it was not; it is a hit when it lies in [beat, beat + LIVE_HIT_WINDOW_SECONDS] of a labeled beat. Fires outside
// the span the beats cover (first beat to last beat plus the window) are not counted: the unlabeled part of a track
// says nothing about false fires. 0 with no fires; null when the column is missing or never changes.
export function falseFireShare(table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]): number | null {
    const tIndex = table.columns.indexOf('t');
    const cIndex = table.columns.indexOf(LIVE_REACTION_COLUMN[viz]);
    if (tIndex < 0 || cIndex < 0 || beats.length === 0) return null;
    const rows = table.rows.filter((row) => Number.isFinite(row[tIndex]) && Number.isFinite(row[cIndex]));
    if (rows.length < 2) return null;
    const times = rows.map((row) => row[tIndex]);
    const values = rows.map((row) => row[cIndex]);
    const range = Math.max(...values) - Math.min(...values);
    if (!(range > 0)) return null;
    const threshold = LIVE_RISE_FRACTION * range;

    const above: boolean[] = [];
    let windowStart = 0;
    for (let i = 0; i < times.length; i++) {
        while (windowStart < i && times[windowStart] < times[i] - LIVE_HIT_WINDOW_SECONDS) windowStart++;
        let floor = Infinity;
        for (let j = windowStart; j < i; j++) floor = Math.min(floor, values[j]);
        above.push(i > 0 && floor !== Infinity && values[i] > floor + threshold);
    }

    const spanStart = beats[0];
    const spanEnd = beats[beats.length - 1] + LIVE_HIT_WINDOW_SECONDS;
    let fires = 0;
    let falseFires = 0;
    let beat = 0;
    for (let i = 1; i < times.length; i++) {
        if (!above[i] || above[i - 1]) continue;
        const time = times[i];
        if (time < spanStart || time > spanEnd) continue;
        fires++;
        // Beats are ascending, so the pointer moves to the last beat at or before the fire.
        while (beat + 1 < beats.length && beats[beat + 1] <= time) beat++;
        const hit = beats[beat] <= time && time <= beats[beat] + LIVE_HIT_WINDOW_SECONDS + 1e-9;
        if (!hit) falseFires++;
    }
    return fires === 0 ? 0 : falseFires / fires;
}
