// Builds the scorecard from the engine's measures: one cell per metric and expected track, plus the scenario cells.
// Nothing here reads files or audio, so every rule (n/a, unavailable, pass, fail) is a plain unit test.

import {
    METRICS,
    SCENARIO_TARGETS,
    TARGETS_VERSION,
    effectiveFloor,
    offlineEffectiveFloor,
    floorFor,
    meetsFloor,
    type MetricDirection,
    type MetricTarget,
    type ScenarioTarget,
} from './targets';
import type { SetDirectorMeasure } from './engine/setDirector';
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
    // The advisory set-director measure of each track (see setDirectorCells); absent when it was not measured.
    setDirector?: SetDirectorMeasure[];
}

type CellBase = Pick<ScorecardCell, 'metric' | 'track' | 'visualizer' | 'class' | 'floor' | 'stretch' | 'blocking'>;

function offlineCell(
    base: CellBase,
    applicable: boolean,
    value: number | null,
    status: ScorecardCell['status'],
    pass: boolean,
    prehub: number | null = null,
): ScorecardCell {
    return { ...base, applicable, prehub, value, spread: 0, runs: 1, source: 'offline', pass, status };
}

function scoredCell(
    base: CellBase,
    direction: MetricDirection,
    value: number,
    prehub: number | null = null,
    // The effective floor folds in the pre-hub value, so a gate must open within its floor and no later than before.
    floor: number | null = effectiveFloor(direction, base.floor, prehub),
): ScorecardCell {
    const pass = meetsFloor(direction, value, floor);
    return offlineCell(base, true, value, pass ? 'pass' : 'fail', pass, prehub);
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
    // The track and its truth are here, so a missing value is the tracker's doing (no lock, a gate that never opens),
    // not a missing measurement. Unavailable is kept for missing inputs only, as contract C2 defines it.
    const value = metric.value(measures);
    const prehub = metric.prehubValue?.(measures) ?? null;
    const floor = offlineEffectiveFloor(metric, base.floor, prehub);
    if (value === null) {
        // A report-only metric has no floor to miss, so a missing value is not a failure; it shows as a dash.
        if (floor === null) return offlineCell(base, true, null, 'pass', true, prehub);
        return offlineCell(base, true, null, 'fail', false, prehub);
    }
    return scoredCell(base, metric.direction, value, prehub, floor);
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

export const SET_DIRECTOR_VISUALIZER = 'bass-ink';
export const SET_DIRECTOR_COUNT_METRIC = 'setDirector.transitions';
// One cell per transition, numbered from 01 in the order the director started them, holding its scene time in seconds.
export const setDirectorTimeMetric = (index: number): string =>
    `setDirector.transitionSeconds.${String(index + 1).padStart(2, '0')}`;

// The advisory cells of bass-ink's set director on the real tracks (every class but synthetic): how many transitions to a
// new formation it started and when (AC6). They have no floor and never block: the count and the times only exist so that
// moving the director's energy onto the hub (FU-S9-bass-ink-energy) can be compared with what it did before. The
// ratchet compares only the baseline's cells, so these pass `scorecard:check` until a later baseline adds them.
export function setDirectorCells(measures: readonly SetDirectorMeasure[]): ScorecardCell[] {
    const cells: ScorecardCell[] = [];
    for (const measure of measures) {
        const trackClass = EXPECTED_TRACKS.find((spec) => spec.name === measure.track)?.class ?? 'tapped';
        if (trackClass === 'synthetic') continue;
        const base: CellBase = {
            metric: SET_DIRECTOR_COUNT_METRIC,
            track: measure.track,
            visualizer: SET_DIRECTOR_VISUALIZER,
            class: trackClass,
            floor: null,
            stretch: null,
            blocking: false,
        };
        cells.push(offlineCell(base, true, measure.transitionTimes.length, 'pass', true));
        measure.transitionTimes.forEach((time, index) => {
            // Millisecond resolution keeps the JSON stable and is far finer than a beat.
            const rounded = Math.round(time * 1000) / 1000;
            cells.push(offlineCell({ ...base, metric: setDirectorTimeMetric(index) }, true, rounded, 'pass', true));
        });
    }
    return cells;
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

    cells.push(...setDirectorCells(input.setDirector ?? []));

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
