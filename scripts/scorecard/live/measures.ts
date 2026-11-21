// The live metrics, read from one debug:viz recording (a TelemetryTable) or, for the two metrics that compare runs, from
// all the recordings of one track. Pure: no files, no processes. Times are the CSV `t` column, which is track time, so
// runs that rendered at different frame rates compare directly.

import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import { measureReactionOffset } from '../../debug-visualizer/reactionOffset';
import {
    LIVE_HIT_WINDOW_SECONDS,
    LIVE_REACTION_COLUMN,
    LIVE_RISE_FRACTION,
    LIVE_TAP_TOLERANCE_SECONDS,
    liveFireHitsBeat,
    type LiveVisualizer,
} from '../targets';

const GATE_COLUMN = 'dancing-character.gateOpen';
const TEMPO_LOCK_COLUMN = 'dancing-character.tempoLocked';
const METER_LOCK_COLUMN = 'dancing-character.meterLocked';
const CLIP_COLUMN = 'dancing-character.clipPhase';
const LOOP_BEATS_COLUMN = 'dancing-character.beatsPerLoop';
// The dancer's meter lock only exists on a bar of four (dancingCharacterSync.ts).
const BEATS_PER_BAR = 4;
// How long AC7 leaves the dancer after a tempo or meter lock: at MAX_PHASE_NUDGE_PER_SECOND (0.06 loop a second) an
// 8-beat clip closes half a bar, the largest distance within a bar, in about 4 s. The same window follows the tempo lock
// (Trevor, S8: syncopationbass2's runs reach one place in the beat about 1.2 s after it).
export const CLIP_SETTLE_SECONDS = 4;
// The least time the AC7 samples must cover for the cell to have a value.
export const CLIP_MIN_SAMPLED_SECONDS = 4;
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

// AC7 (targets version 8): each run's largest distance, in beats, between its place in the dance and the median of all
// runs, sampled every 0.25 s of track time. The dancer aligns its clip within the beat, and within the bar once its meter
// locks, but by design not which beat or bar of a longer loop it is on (dancingCharacterSync.ts), so runs are compared
// in that unit: the place within the bar at a sample where every run is meter-locked, within the beat otherwise. A run's
// place is its clip phase times its beats per loop (the beatsPerLoop column), and its row at a sample is its last at or
// before it. Sampling starts at the latest run's first meterLocked, or the latest first tempoLocked when no run
// meter-locks, and ends where the shortest run ends. A sample within CLIP_SETTLE_SECONDS after any run's tempo or meter
// lock (each time it locks) is skipped: the dancer then slides onto the beat or into the bar at its capped correction
// rate rather than jumping, which is how it is meant to move, not a disagreement between runs. null for every run when no run locks, a
// column is missing (a recording from before version 8 has no beatsPerLoop) or the samples left cover less than
// CLIP_MIN_SAMPLED_SECONDS, so a late lock near the end of the recording cannot pass on a moment.
export function clipMaxDeviations(tables: readonly TelemetryTable[]): (number | null)[] {
    const none = tables.map(() => null);
    const meterLocks = tables.map((table) => firstSetSeconds(table, METER_LOCK_COLUMN)).filter((time) => time !== null);
    const tempoLocks = tables.map((table) => lockSeconds(table)).filter((time) => time !== null);
    const locks = meterLocks.length > 0 ? meterLocks : tempoLocks;
    if (locks.length === 0) return none;
    const start = Math.max(...locks);

    const runs: ClipSeries[] = [];
    for (const table of tables) {
        const index = ['t', CLIP_COLUMN, LOOP_BEATS_COLUMN, METER_LOCK_COLUMN, TEMPO_LOCK_COLUMN].map((column) =>
            table.columns.indexOf(column),
        );
        if (index.some((i) => i < 0) || table.rows.length === 0) return none;
        const [t, phase, beats, meter, tempo] = index;
        runs.push({
            t: table.rows.map((row) => row[t]),
            phase: table.rows.map((row) => row[phase]),
            beats: table.rows.map((row) => row[beats]),
            meter: table.rows.map((row) => row[meter] > FLAG_THRESHOLD),
            tempo: table.rows.map((row) => row[tempo] > FLAG_THRESHOLD),
        });
    }
    const end = Math.min(...runs.map((s) => s.t[s.t.length - 1]));

    const worst = tables.map(() => 0);
    let samples = 0;
    // Each run's index of its last row at or before the sample; samples only move forward, so it only moves forward.
    const at = runs.map(() => -1);
    // Each run's latest tempo and meter lock (a row where the flag turns on) at or before the sample.
    const tempoLockedAt = runs.map(() => -Infinity);
    const lockedAt = runs.map(() => -Infinity);
    const places = runs.map(() => NaN);
    for (let k = 0; start + k * CLIP_SAMPLE_STEP_SECONDS <= end + 1e-9; k++) {
        const sampleT = start + k * CLIP_SAMPLE_STEP_SECONDS;
        let allMeter = true;
        let settling = false;
        runs.forEach((s, run) => {
            while (at[run] + 1 < s.t.length && s.t[at[run] + 1] <= sampleT) {
                at[run]++;
                const i = at[run];
                if (s.meter[i] && (i === 0 || !s.meter[i - 1])) lockedAt[run] = s.t[i];
                if (s.tempo[i] && (i === 0 || !s.tempo[i - 1])) tempoLockedAt[run] = s.t[i];
            }
            const row = at[run];
            if (row >= 0 && s.meter[row] && sampleT - lockedAt[run] < CLIP_SETTLE_SECONDS) settling = true;
            if (row >= 0 && s.tempo[row] && sampleT - tempoLockedAt[run] < CLIP_SETTLE_SECONDS) settling = true;
            const usable = row >= 0 && Number.isFinite(s.phase[row]) && s.beats[row] > 0;
            places[run] = usable ? s.phase[row] * s.beats[row] : NaN;
            if (usable && !s.meter[row]) allMeter = false;
        });
        if (settling) continue;
        const unitBeats = allMeter ? BEATS_PER_BAR : 1;
        const fractions = places.map((place) => place / unitBeats);
        const usable = fractions.filter((fraction) => Number.isFinite(fraction));
        if (usable.length === 0) continue;
        samples++;
        const median = circularMedian(usable);
        fractions.forEach((fraction, run) => {
            if (Number.isFinite(fraction)) {
                worst[run] = Math.max(worst[run], circularDistance(fraction, median) * unitBeats);
            }
        });
    }
    return samples * CLIP_SAMPLE_STEP_SECONDS < CLIP_MIN_SAMPLED_SECONDS - 1e-9 ? none : worst;
}

// One run's columns for clipMaxDeviations.
interface ClipSeries {
    t: number[];
    phase: number[];
    beats: number[];
    meter: boolean[];
    tempo: boolean[];
}

// The reaction fires of one recording, as targets.ts defines them next to liveFireHitsBeat: a row where the reaction
// column is above (its minimum over the rows within LIVE_HIT_WINDOW_SECONDS before the row) by LIVE_RISE_FRACTION of the
// whole recording's range, and the row before it was not. null when the column is missing or never changes.
interface ReactionFires {
    firstSeconds: number;
    lastSeconds: number;
    // Ascending track times.
    fires: number[];
}

function reactionFires(table: TelemetryTable, viz: LiveVisualizer): ReactionFires | null {
    const tIndex = table.columns.indexOf('t');
    const cIndex = table.columns.indexOf(LIVE_REACTION_COLUMN[viz]);
    if (tIndex < 0 || cIndex < 0) return null;
    const rows = table.rows.filter((row) => Number.isFinite(row[tIndex]) && Number.isFinite(row[cIndex]));
    if (rows.length < 2) return null;
    const times = rows.map((row) => row[tIndex]);
    const values = rows.map((row) => row[cIndex]);
    const range = Math.max(...values) - Math.min(...values);
    if (!(range > 0)) return null;
    const threshold = LIVE_RISE_FRACTION * range;

    const fires: number[] = [];
    let windowStart = 0;
    let wasAbove = false;
    for (let i = 0; i < times.length; i++) {
        while (windowStart < i && times[windowStart] < times[i] - LIVE_HIT_WINDOW_SECONDS) windowStart++;
        let floor = Infinity;
        for (let j = windowStart; j < i; j++) floor = Math.min(floor, values[j]);
        const above = floor !== Infinity && values[i] > floor + threshold;
        if (above && !wasAbove) fires.push(times[i]);
        wasAbove = above;
    }
    return { firstSeconds: times[0], lastSeconds: times[times.length - 1], fires };
}

// AC8: hits / (hits + misses), a beat being hit when one of the recording's fires belongs to it by liveFireHitsBeat. A
// beat whose whole window the recording does not cover says nothing about the visualizer and is skipped.
export function hitShare(table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]): number | null {
    const result = reactionFires(table, viz);
    if (result === null) return null;
    let hits = 0;
    let judged = 0;
    let fire = 0;
    for (const beat of beats) {
        if (beat - LIVE_TAP_TOLERANCE_SECONDS <= result.firstSeconds) continue;
        if (beat + LIVE_HIT_WINDOW_SECONDS > result.lastSeconds) continue;
        judged++;
        // Beats are ascending, so the pointer skips the fires that come before this beat's window for good.
        while (fire < result.fires.length && result.fires[fire] < beat - LIVE_TAP_TOLERANCE_SECONDS - 1e-9) fire++;
        if (fire < result.fires.length && liveFireHitsBeat(result.fires[fire], beat)) hits++;
    }
    return judged === 0 ? null : hits / judged;
}

// AC8: the median delay of a reaction after a beat, with measureReactionOffset's own search window.
export function reactionLatencyMs(table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]): number | null {
    const result = measureReactionOffset(table, LIVE_REACTION_COLUMN[viz], beats);
    if ('unavailable' in result) return null;
    return result.medianMs ?? null;
}

// The share of fires that belong to no labeled beat by liveFireHitsBeat (the fires of hitShare). Fires outside the span
// the beats cover (the first beat's window start to the last beat's window end) are not counted: the unlabeled part of a
// track says nothing about false fires. 0 with no fires; null when the column is missing or never changes.
export function falseFireShare(table: TelemetryTable, viz: LiveVisualizer, beats: readonly number[]): number | null {
    if (beats.length === 0) return null;
    const result = reactionFires(table, viz);
    if (result === null) return null;
    const spanStart = beats[0] - LIVE_TAP_TOLERANCE_SECONDS - 1e-9;
    const spanEnd = beats[beats.length - 1] + LIVE_HIT_WINDOW_SECONDS + 1e-9;
    let fires = 0;
    let falseFires = 0;
    let beat = 0;
    for (const time of result.fires) {
        if (time < spanStart || time > spanEnd) continue;
        fires++;
        // Beats are ascending and their windows do not overlap, so the only candidate is the first beat whose window
        // has not ended before the fire.
        while (beat + 1 < beats.length && beats[beat] + LIVE_HIT_WINDOW_SECONDS + 1e-9 < time) beat++;
        if (!liveFireHitsBeat(time, beats[beat])) falseFires++;
    }
    return fires === 0 ? 0 : falseFires / fires;
}
