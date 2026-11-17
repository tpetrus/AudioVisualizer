// The acceptance targets of the offline scorecard: one table of metrics (how to read a value from a track's
// measures, which direction is better, the floor and stretch, and which tracks it applies to). The cell builder, the
// report and the ratchet all read this table, so a floor changes in one place. Bump TARGETS_VERSION whenever a floor,
// a stretch, a metric definition or an applicability rule changes: the ratchet refuses to compare across versions.

import type { OnsetBand } from '../../app/features/rhythm/eval/evalTypes';
import type { ScenarioMeasures, TrackClass, TrackMeasures } from './types';

export const TARGETS_VERSION = 1;

export type MetricDirection = 'lower' | 'higher';
export type MetricUnit = 'seconds' | 'ms' | 'fraction' | 'count';

export interface MetricTarget {
    id: string;
    description: string;
    // Which way is better: a 'lower' metric passes at or below its floor, a 'higher' one at or above it.
    direction: MetricDirection;
    // Decides how the report formats the numbers.
    unit: MetricUnit;
    // null means report-only: any measured value passes.
    floor: number | null;
    // Class-specific floors (tapped songs get more slack than synthetic ones); a class not listed uses `floor`.
    floorByClass?: Partial<Record<TrackClass, number>>;
    stretch: number | null;
    visualizer: 'rhythm' | 'dancing-character';
    blocking: boolean;
    // Whether the metric applies to a track of this class and kick flag.
    applies: (trackClass: TrackClass, kick: boolean) => boolean;
    // True when the value is measured against the track's .beats.json truth, so a missing sidecar makes the cell
    // unavailable rather than failing it.
    needsBeats: boolean;
    value: (measures: TrackMeasures) => number | null;
    // Data-dependent n/a: for example an onset band the track has no labels for.
    notApplicable?: (measures: TrackMeasures) => boolean;
    // A kick track whose gate never opens is a failure with no value, not a missing measurement.
    nullValueFails?: boolean;
}

const hasBeat = (trackClass: TrackClass): boolean => trackClass !== 'beatless';

const ONSET_BANDS_SCORED: readonly OnsetBand[] = ['kick', 'bass', 'snare', 'highs'];

function onsetTarget(band: OnsetBand): MetricTarget {
    return {
        id: `onset.f50.${band}`,
        description: `Onset F-score at 50 ms in the ${band} band`,
        direction: 'higher',
        unit: 'fraction',
        floor: 0.9,
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        applies: (trackClass) => trackClass === 'synthetic',
        needsBeats: true,
        value: (measures) => measures.onsetF50?.[band] ?? null,
        // A band the generator did not label has no truth to score against.
        notApplicable: (measures) => measures.onsetF50 === null || measures.onsetF50[band] === undefined,
    };
}

export const METRICS: readonly MetricTarget[] = [
    {
        id: 'tempo.maxErrorAfterLock',
        description: 'Largest octave-folded tempo error after the lock, as a fraction of the truth',
        direction: 'lower',
        unit: 'fraction',
        floor: 0.02,
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        // Drifting tracks are scored against the local truth; the engine handles that.
        applies: (trackClass) => hasBeat(trackClass),
        needsBeats: true,
        value: (measures) => measures.maxTempoErrorAfterLock,
    },
    {
        id: 'tempo.falseSongChanges',
        description: 'Song changes reported on a single-song track',
        direction: 'lower',
        unit: 'count',
        floor: 0,
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        applies: () => true,
        needsBeats: false,
        value: (measures) => measures.falseSongChanges,
    },
    {
        id: 'tempo.beatlessNeverLocks',
        description: 'The tracker locked on a track with no beat (1) or never did (0)',
        direction: 'lower',
        unit: 'count',
        floor: 0,
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        applies: (trackClass) => trackClass === 'beatless',
        needsBeats: false,
        value: (measures) => (measures.everLocked ? 1 : 0),
    },
    {
        id: 'beat.errorMedianMs',
        description: 'Median absolute beat error after the lock',
        direction: 'lower',
        unit: 'ms',
        floor: 40,
        floorByClass: { synthetic: 20 },
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        applies: (trackClass) => hasBeat(trackClass),
        needsBeats: true,
        value: (measures) => measures.beatErrorMedianMs,
    },
    ...ONSET_BANDS_SCORED.map(onsetTarget),
    {
        id: 'gate.firstOpenSeconds',
        description: 'Seconds from track start until the dancing character gate first opens',
        direction: 'lower',
        unit: 'seconds',
        floor: 4,
        stretch: 2,
        visualizer: 'dancing-character',
        blocking: true,
        applies: (trackClass, kick) => kick && hasBeat(trackClass),
        needsBeats: false,
        value: (measures) => measures.gateFirstOpenSeconds,
        nullValueFails: true,
    },
    {
        id: 'gate.closedOnNoKick',
        description: 'The dancing character gate opened on a track with no kick (1) or stayed closed (0)',
        direction: 'lower',
        unit: 'count',
        // Report-only: no acceptance criterion owns it yet.
        floor: null,
        stretch: null,
        visualizer: 'dancing-character',
        blocking: false,
        applies: (trackClass, kick) => !kick && hasBeat(trackClass),
        needsBeats: false,
        value: (measures) => (measures.gateFirstOpenSeconds === null ? 0 : 1),
    },
    {
        id: 'tempo.lockSeconds',
        description: 'Seconds until the tempo locks and stays locked',
        direction: 'lower',
        unit: 'seconds',
        floor: null,
        stretch: null,
        visualizer: 'rhythm',
        blocking: false,
        applies: (trackClass) => hasBeat(trackClass),
        needsBeats: true,
        value: (measures) => measures.lockSeconds,
    },
];

// The two AC9 cases run on constructed audio; their cells use the scenario id as the track.
export interface ScenarioTarget {
    id: string;
    scenario: string;
    description: string;
    direction: MetricDirection;
    unit: MetricUnit;
    floor: number | null;
    stretch: number | null;
    visualizer: 'rhythm';
    blocking: boolean;
    value: (scenario: ScenarioMeasures) => number;
}

export const SCENARIO_TARGETS: readonly ScenarioTarget[] = [
    {
        id: 'ac9.dottedChangeCounted',
        scenario: 'scenario:dotted-100-150',
        description: 'A real dotted song change is counted',
        direction: 'higher',
        unit: 'count',
        floor: 1,
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        value: (scenario) => scenario.songChanges,
    },
    {
        id: 'ac9.dottedPassageQuiet',
        scenario: 'scenario:dotted-passage',
        description: 'A dotted passage over the old pulse raises no song change or soft boundary',
        direction: 'lower',
        unit: 'count',
        floor: 0,
        stretch: null,
        visualizer: 'rhythm',
        blocking: true,
        // -1 means the soft boundary count could not be observed; the song changes still score.
        value: (scenario) => scenario.songChanges + Math.max(scenario.softBoundaries, 0),
    },
];

export function floorFor(metric: MetricTarget, trackClass: TrackClass): number | null {
    return metric.floorByClass?.[trackClass] ?? metric.floor;
}

// The pre-hub value also bounds the floor once it exists: a metric must not end up worse than it started.
export function effectiveFloor(direction: MetricDirection, floor: number | null, prehub: number | null): number | null {
    if (floor === null) return null;
    if (prehub === null) return floor;
    return direction === 'lower' ? Math.min(floor, prehub) : Math.max(floor, prehub);
}

export function directionOf(metricId: string): MetricDirection | null {
    const metric = METRICS.find((candidate) => candidate.id === metricId);
    if (metric) return metric.direction;
    return SCENARIO_TARGETS.find((candidate) => candidate.id === metricId)?.direction ?? null;
}

export function unitOf(metricId: string): MetricUnit {
    const metric = METRICS.find((candidate) => candidate.id === metricId);
    if (metric) return metric.unit;
    return SCENARIO_TARGETS.find((candidate) => candidate.id === metricId)?.unit ?? 'fraction';
}
