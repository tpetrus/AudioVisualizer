// Measures the runs of one track: every live metric of a visualizer over its recordings. Pure.

import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import type { LiveVisualizer } from '../targets';
import type { RunValue } from './liveCells';
import { liveMetricsFor } from './liveCells';
import {
    clipMaxDeviations,
    falseFireShare,
    gateSecondsAfterLock,
    hitShare,
    lockSeconds,
    reactionLatencyMs,
} from './measures';

export interface MeasuredRun {
    table: TelemetryTable;
    // The track's labeled beats, when it has a sidecar.
    beats: readonly number[] | undefined;
}

// Per metric id, the value of each run. A metric that needs beats gives null for every run without them.
export function measureRuns(viz: LiveVisualizer, runs: readonly MeasuredRun[]): Map<string, RunValue[]> {
    const perRun = (
        measure: (run: MeasuredRun, beats: readonly number[]) => RunValue,
        needsBeats: boolean,
    ): RunValue[] =>
        runs.map((run) => {
            if (!needsBeats) return measure(run, []);
            return run.beats === undefined ? null : measure(run, run.beats);
        });
    const measures: Record<string, () => RunValue[]> = {
        'live.gate.secondsAfterLock': () => perRun((run) => gateSecondsAfterLock(run.table), false),
        'live.clip.maxDeviationLoops': () => clipMaxDeviations(runs.map((run) => run.table)),
        'live.lock.spreadSeconds': () => perRun((run) => lockSeconds(run.table), false),
        'live.hit.share50ms': () => perRun((run, beats) => hitShare(run.table, viz, beats), true),
        'live.falseFire.share': () => perRun((run, beats) => falseFireShare(run.table, viz, beats), true),
        'live.reaction.latencyMs': () => perRun((run, beats) => reactionLatencyMs(run.table, viz, beats), true),
    };
    const values = new Map<string, RunValue[]>();
    for (const metric of liveMetricsFor(viz)) values.set(metric.id, measures[metric.id]?.() ?? runs.map(() => null));
    return values;
}
