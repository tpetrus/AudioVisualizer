// Builds the scorecard from the engine's measures: one cell per metric and expected track, plus the scenario cells.
// Nothing here reads files or audio, so every rule (n/a, unavailable, pass, fail) is a plain unit test.

import {
    METRICS,
    SCENARIO_TARGETS,
    TARGETS_VERSION,
    effectiveFloor,
    floorFor,
    type MetricDirection,
    type MetricTarget,
    type ScenarioTarget,
} from './targets';
import { EXPECTED_TRACKS } from './tracks';
import type { Scorecard, ScorecardCell, ScenarioMeasures, TrackClass, TrackMeasures } from './types';

export interface ScorecardInput {
    revision: string;
    created: string;
    measures: TrackMeasures[];
    scenarios: ScenarioMeasures[];
    sidecarHashes: Record<string, string>;
    // The expected tracks the runner found, and whether each has a .beats.json.
    available: { track: string; hasBeats: boolean }[];
}

type CellBase = Pick<ScorecardCell, 'metric' | 'track' | 'visualizer' | 'class' | 'floor' | 'stretch' | 'blocking'>;

function offlineCell(
    base: CellBase,
    applicable: boolean,
    value: number | null,
    status: ScorecardCell['status'],
    pass: boolean,
): ScorecardCell {
    return { ...base, applicable, prehub: null, value, spread: 0, runs: 1, source: 'offline', pass, status };
}

function meetsFloor(direction: MetricDirection, value: number, floor: number | null): boolean {
    if (floor === null) return true;
    return direction === 'lower' ? value <= floor : value >= floor;
}

function scoredCell(base: CellBase, direction: MetricDirection, value: number): ScorecardCell {
    // The effective floor folds in the pre-hub value; it is null in this slice but the rule is already in place.
    const floor = effectiveFloor(direction, base.floor, null);
    const pass = meetsFloor(direction, value, floor);
    return offlineCell(base, true, value, pass ? 'pass' : 'fail', pass);
}

function trackCell(
    metric: MetricTarget,
    track: string,
    trackClass: TrackClass,
    kick: boolean,
    measures: TrackMeasures | undefined,
    hasBeats: boolean | undefined,
): ScorecardCell {
    const base: CellBase = {
        metric: metric.id,
        track,
        visualizer: metric.visualizer,
        class: trackClass,
        floor: floorFor(metric, trackClass),
        stretch: metric.stretch,
        blocking: metric.blocking,
    };
    if (!metric.applies(trackClass, kick)) return offlineCell(base, false, null, 'n/a', false);
    // A track the runner did not find, or whose truth is missing, cannot be measured.
    if (!measures || hasBeats === undefined || (metric.needsBeats && !hasBeats)) {
        return offlineCell(base, true, null, 'unavailable', false);
    }
    if (metric.notApplicable?.(measures)) return offlineCell(base, false, null, 'n/a', false);
    const value = metric.value(measures);
    if (value === null) {
        return metric.nullValueFails
            ? offlineCell(base, true, null, 'fail', false)
            : offlineCell(base, true, null, 'unavailable', false);
    }
    return scoredCell(base, metric.direction, value);
}

function scenarioCell(target: ScenarioTarget, measures: ScenarioMeasures | undefined): ScorecardCell {
    const base: CellBase = {
        metric: target.id,
        track: target.scenario,
        visualizer: target.visualizer,
        class: 'synthetic',
        floor: target.floor,
        stretch: target.stretch,
        blocking: target.blocking,
    };
    if (!measures) return offlineCell(base, true, null, 'unavailable', false);
    return scoredCell(base, target.direction, target.value(measures));
}

// Plain code-unit order, so the output does not depend on the machine's locale.
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildScorecard(input: ScorecardInput): Scorecard {
    const measuresByTrack = new Map(input.measures.map((entry) => [entry.track, entry]));
    const availableByTrack = new Map(input.available.map((entry) => [entry.track, entry.hasBeats]));
    const scenarioById = new Map(input.scenarios.map((entry) => [entry.id, entry]));

    const cells: ScorecardCell[] = [];
    for (const metric of METRICS) {
        for (const spec of EXPECTED_TRACKS) {
            const measures = measuresByTrack.get(spec.name);
            cells.push(
                trackCell(
                    metric,
                    spec.name,
                    measures?.class ?? spec.class,
                    spec.kick,
                    measures,
                    availableByTrack.get(spec.name),
                ),
            );
        }
    }
    for (const target of SCENARIO_TARGETS) cells.push(scenarioCell(target, scenarioById.get(target.scenario)));

    cells.sort((a, b) => compare(a.metric, b.metric) || compare(a.track, b.track));
    return {
        header: {
            targetsVersion: TARGETS_VERSION,
            revision: input.revision,
            created: input.created,
            sidecarHashes: input.sidecarHashes,
        },
        cells,
    };
}

// The cell shape has no room for a caveat, so the runner prints these next to the report.
export function scenarioNotes(scenarios: ScenarioMeasures[]): string[] {
    return scenarios
        .filter((scenario) => scenario.softBoundaries < 0)
        .map((scenario) => `${scenario.id}: soft boundaries were not observable, scored on song changes alone`);
}
