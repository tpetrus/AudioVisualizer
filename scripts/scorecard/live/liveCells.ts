// Turns the per-run values of a live metric into a scorecard cell, and keeps the live file's two halves (the cells and
// the per-run values they were computed from) consistent. Pure: no files. The per-run values are stored beside the cells
// so a later --prehub ingest, or a rerun with other floors, can recompute every pass without re-measuring.

import {
    LIVE_METRICS,
    TARGETS_VERSION,
    liveEffectiveFloor,
    type LiveMetricTarget,
    type LiveVisualizer,
} from '../targets';
import { resolveTrack } from '../tracks';
import type { Scorecard, ScorecardCell, TrackClass } from '../types';
import { lockRange, smallestLockRange } from './measures';

// What one run of one cell measured: a number, or null. For live.gate.secondsAfterLock a null is a gate that never
// opened or a dancer that never locked (a failed run); for every other metric it is a run that could not be measured (a missing run).
export type RunValue = number | null;

export interface LiveRunValues {
    metric: string;
    track: string;
    visualizer: string;
    // Values of the runs of the current build, and of the pre-hub build when it was ingested.
    current: RunValue[];
    prehub: RunValue[];
}

// The live file: a C2 scorecard plus the per-run values behind each cell.
export interface LiveFile extends Scorecard {
    runValues: LiveRunValues[];
}

export const LIVE_GATE_METRIC = 'live.gate.secondsAfterLock';
// The cell passes when this many runs pass, or all of them when fewer than REQUIRED_RUNS + 1 were measured.
const REQUIRED_RUNS = 3;

export const cellKey = (metric: string, track: string, visualizer: string): string =>
    `${metric}|${track}|${visualizer}`;

export function liveMetricsFor(viz: string): LiveMetricTarget[] {
    return LIVE_METRICS.filter((metric) => (metric.visualizers as readonly string[]).includes(viz));
}

export function median(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const numbersOf = (values: readonly RunValue[]): number[] =>
    values.filter((value): value is number => value !== null && Number.isFinite(value));

const meets = (metric: LiveMetricTarget, value: number, floor: number | null): boolean => {
    if (floor === null) return true;
    return metric.direction === 'lower' ? value <= floor : value >= floor;
};

// The number a set of runs stands for: the median of the runs with a value, or for the cross-run metric the smallest lock
// range over any 3 runs.
export function valueOfRuns(metric: LiveMetricTarget, runs: readonly RunValue[]): number | null {
    return metric.perRun ? median(numbersOf(runs)) : smallestLockRange(runs);
}

export interface LiveCellInput {
    metric: LiveMetricTarget;
    track: string;
    visualizer: LiveVisualizer;
    class: TrackClass;
    kick: boolean;
    current: readonly RunValue[];
    prehub: readonly RunValue[];
}

export function buildLiveCell(input: LiveCellInput): ScorecardCell {
    const { metric, current } = input;
    const base = {
        metric: metric.id,
        track: input.track,
        visualizer: input.visualizer,
        class: input.class,
        floor: metric.floor,
        stretch: metric.stretch,
        source: 'live' as const,
        blocking: false,
    };
    if (!metric.applies(input.class, input.kick)) {
        return {
            ...base,
            applicable: false,
            prehub: null,
            value: null,
            spread: 0,
            runs: 0,
            pass: false,
            status: 'n/a',
        };
    }

    const prehub = valueOfRuns(metric, input.prehub);
    const floor = liveEffectiveFloor(metric, prehub);
    const isGate = metric.id === LIVE_GATE_METRIC;
    const valued = numbersOf(current);
    const spread = metric.perRun
        ? valued.length === 0
            ? 0
            : Math.max(...valued) - Math.min(...valued)
        : (lockRange(current) ?? 0);
    const value = valueOfRuns(metric, current);
    const unavailable: ScorecardCell = {
        ...base,
        applicable: true,
        prehub,
        value,
        spread,
        runs: valued.length,
        pass: false,
        status: 'unavailable',
    };

    if (!metric.perRun) {
        // The 3-of-4 rule is already inside the value, so the cell is the value against the floor.
        if (value === null) return unavailable;
        const pass = meets(metric, value, floor);
        return { ...unavailable, pass, status: pass ? 'pass' : 'fail' };
    }

    // A gate that never opened is a run that failed, so it counts as a run; any other metric without a value is a run
    // that is missing.
    const counted = isGate ? current.length : valued.length;
    if (counted < REQUIRED_RUNS) return unavailable;
    // A metric judged on the median for this visualizer passes when its median meets the floor.
    if (metric.medianFor?.includes(input.visualizer)) {
        const pass = value !== null && meets(metric, value, floor);
        return { ...unavailable, pass, status: pass ? 'pass' : 'fail' };
    }
    const passing = valued.filter((run) => meets(metric, run, floor)).length;
    // With 4 or more runs, 3 must pass; with 3 runs all must (nothing may fail when there is no run to spare).
    const required = counted > REQUIRED_RUNS ? REQUIRED_RUNS : counted;
    const pass = passing >= required;
    return { ...unavailable, pass, status: pass ? 'pass' : 'fail' };
}

const sortCells = (a: ScorecardCell, b: ScorecardCell): number =>
    a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : a.track < b.track ? -1 : a.track > b.track ? 1 : 0;

// Rebuilds every cell of the file from its stored per-run values. A cell with no stored values becomes unavailable (or
// n/a), which is how a track with no runs yet shows up. Cells of metrics this build does not know are dropped.
export function recomputeFile(file: LiveFile): LiveFile {
    const values = new Map(
        file.runValues.map((entry) => [cellKey(entry.metric, entry.track, entry.visualizer), entry]),
    );
    const cells: ScorecardCell[] = [];
    for (const cell of file.cells) {
        const metric = LIVE_METRICS.find((candidate) => candidate.id === cell.metric);
        if (!metric) continue;
        const stored = values.get(cellKey(cell.metric, cell.track, cell.visualizer));
        cells.push(
            buildLiveCell({
                metric,
                track: cell.track,
                visualizer: cell.visualizer as LiveVisualizer,
                class: cell.class,
                kick: resolveTrack(cell.track).kick,
                current: stored?.current ?? [],
                prehub: stored?.prehub ?? [],
            }),
        );
    }
    cells.sort(sortCells);
    const keep = new Set(cells.map((cell) => cellKey(cell.metric, cell.track, cell.visualizer)));
    return {
        header: file.header,
        cells,
        runValues: file.runValues.filter((entry) => keep.has(cellKey(entry.metric, entry.track, entry.visualizer))),
    };
}

export interface TrackUpdate {
    track: string;
    class: TrackClass;
    // Per metric id: the values of this invocation's runs.
    values: ReadonlyMap<string, readonly RunValue[]>;
}

export interface MergeOptions {
    viz: LiveVisualizer;
    // Whether the updates carry pre-hub runs (--prehub) or current ones.
    prehub: boolean;
    revision: string;
    created: string;
}

// Folds one invocation into the live file. For each updated track the matching list of every metric of `viz` is
// replaced (current, or pre-hub with --prehub; the other list is kept), and a cell exists for every metric of `viz` on
// every updated track. Cells of other visualizers and of tracks this invocation did not touch stay as they were. Then
// every cell is recomputed from its stored values.
export function mergeLiveFile(
    existing: LiveFile | undefined,
    updates: readonly TrackUpdate[],
    options: MergeOptions,
): LiveFile {
    const header = {
        targetsVersion: TARGETS_VERSION,
        revision: options.revision,
        created: options.created,
        sidecarHashes: {},
    };
    const runValues = new Map<string, LiveRunValues>(
        (existing?.runValues ?? []).map((entry) => [cellKey(entry.metric, entry.track, entry.visualizer), entry]),
    );
    const cells = new Map<string, ScorecardCell>(
        (existing?.cells ?? []).map((cell) => [cellKey(cell.metric, cell.track, cell.visualizer), cell]),
    );
    for (const update of updates) {
        for (const metric of liveMetricsFor(options.viz)) {
            const key = cellKey(metric.id, update.track, options.viz);
            const before = runValues.get(key);
            const incoming = [...(update.values.get(metric.id) ?? [])];
            runValues.set(key, {
                metric: metric.id,
                track: update.track,
                visualizer: options.viz,
                current: options.prehub ? (before?.current ?? []) : incoming,
                prehub: options.prehub ? incoming : (before?.prehub ?? []),
            });
            // The placeholder is rebuilt by recomputeFile; only its identity and class matter here.
            cells.set(
                key,
                buildLiveCell({
                    metric,
                    track: update.track,
                    visualizer: options.viz,
                    class: update.class,
                    kick: resolveTrack(update.track).kick,
                    current: [],
                    prehub: [],
                }),
            );
        }
    }
    return recomputeFile({ header, cells: [...cells.values()], runValues: [...runValues.values()] });
}
