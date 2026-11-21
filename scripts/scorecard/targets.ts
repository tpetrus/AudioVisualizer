// The acceptance targets of the offline scorecard: one table of metrics (how to read a value from a track's
// measures, which direction is better, the floor and stretch, and which tracks it applies to). The cell builder, the
// report and the ratchet all read this table, so a floor changes in one place. Bump TARGETS_VERSION whenever a floor,
// a stretch, a metric definition or an applicability rule changes: the ratchet refuses to compare across versions.
// A new visualizer whose cells are only added (no existing cell changes) does not bump it.

import type { OnsetBand } from '../../app/features/rhythm/eval/evalTypes';
import type { ScenarioMeasures, TrackClass, TrackMeasures } from './types';

export const TARGETS_VERSION = 8;

export type MetricDirection = 'lower' | 'higher';
export type MetricUnit = 'seconds' | 'ms' | 'fraction' | 'count' | 'beats';

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
    visualizer: 'rhythm' | 'dancing-character' | 'cubes';
    blocking: boolean;
    // How much worse than the pre-hub value the value may be (version 7). When set, the floor is the pre-hub value
    // widened by it, tightened by `floor` if that is set too, as the live cells judge their pre-hub column; a cell with
    // a pre-hub value but no value of its own then fails.
    prehubTolerance?: number;
    // Whether the metric applies to a track of this class and kick flag.
    applies: (trackClass: TrackClass, kick: boolean) => boolean;
    // True when the value is measured against the track's .beats.json truth, so a missing sidecar makes the cell
    // unavailable rather than failing it.
    needsBeats: boolean;
    value: (measures: TrackMeasures) => number | null;
    // The same metric on the pre-hub input (decision D8); absent for metrics the hub did not touch, whose pre-hub
    // value is today's value because the rhythm DSP is unchanged since the commit before the hub merge.
    prehubValue?: (measures: TrackMeasures) => number | null;
    // Data-dependent n/a: for example an onset band the track has no labels for.
    notApplicable?: (measures: TrackMeasures) => boolean;
}

const hasBeat = (trackClass: TrackClass): boolean => trackClass !== 'beatless';

// A gate that never opened or a dancer that never locked leaves no gap to report.
const secondsAfterLock = (open: number | null, lock: number | null): number | null =>
    open === null || lock === null ? null : open - lock;

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
        // Report-only since S3: AC6 is measured from the dancer's tempo lock (gate.secondsAfterLock), because the gate
        // cannot open before the lock and the lock alone comes at 3 to 11 s. Kept to show the whole wait a viewer sees.
        floor: null,
        stretch: null,
        visualizer: 'dancing-character',
        blocking: false,
        applies: (trackClass, kick) => kick && hasBeat(trackClass),
        needsBeats: false,
        value: (measures) => measures.gateFirstOpenSeconds,
        prehubValue: (measures) => measures.prehubGateFirstOpenSeconds,
    },
    {
        id: 'gate.secondsAfterLock',
        description: 'Seconds from the dancer tempo lock until the dancing character gate first opens',
        direction: 'lower',
        unit: 'seconds',
        // AC6 as restated at the S3 review (decision by Trevor): the gate opens within 4 s of the dancer's own tempo lock
        // and no later than the pre-hub input did; 2 s is the stretch. A gate that never opens, or a dancer that never
        // locks on a kick track, fails.
        floor: 4,
        stretch: 2,
        visualizer: 'dancing-character',
        blocking: true,
        applies: (trackClass, kick) => kick && hasBeat(trackClass),
        needsBeats: false,
        value: (measures) => secondsAfterLock(measures.gateFirstOpenSeconds, measures.dancerLockSeconds),
        prehubValue: (measures) => secondsAfterLock(measures.prehubGateFirstOpenSeconds, measures.dancerLockSeconds),
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
        // AC8 offline (version 7, S4): the cubes' bass trigger is a pure function the scene calls (stepCubesBass), so
        // the replay runs it on every kick track with beats. Same fire-to-beat rule and tolerances as the live cell: no
        // more than 0.05 below the pre-hub value (BassPulse's own pulse at the render time). 0.9 is the stretch.
        id: 'cubes.hit.share50ms',
        description: 'Share of labeled beats with a cubes bass reaction from 20 ms before to 50 ms after, offline',
        direction: 'higher',
        unit: 'fraction',
        floor: null,
        stretch: 0.9,
        prehubTolerance: 0.05,
        visualizer: 'cubes',
        blocking: true,
        applies: (trackClass, kick) => kick && hasBeat(trackClass),
        needsBeats: true,
        value: (measures) => measures.cubesHitShare,
        prehubValue: (measures) => measures.prehubCubesHitShare,
    },
    {
        // AC8 offline: the median reaction delay after a labeled beat, at most one 60 Hz frame later than pre-hub, as the
        // live cell; 30 ms plus a frame is the stretch.
        id: 'cubes.reaction.latencyMs',
        description: 'Median cubes bass reaction delay after a labeled beat, offline',
        direction: 'lower',
        unit: 'ms',
        floor: null,
        stretch: 30 + 1000 / 60,
        prehubTolerance: 1000 / 60,
        visualizer: 'cubes',
        blocking: true,
        applies: (trackClass, kick) => kick && hasBeat(trackClass),
        needsBeats: true,
        value: (measures) => measures.cubesLatencyMs,
        prehubValue: (measures) => measures.prehubCubesLatencyMs,
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

// The live cells (S3): measured from debug:viz recordings in a browser, 4 runs per track, advisory rather than blocking
// (decision D13). `npm run scorecard:live` reads this table; the ratchet knows their direction through directionOf.
export type LiveVisualizer = 'dancing-character' | 'cubes' | 'trio-color-wave' | 'bass-ink';

// The telemetry column whose rise is the visualizer's reaction to a beat (AC8).
export const LIVE_REACTION_COLUMN: Readonly<Record<LiveVisualizer, string>> = {
    'dancing-character': 'dancing-character.out',
    cubes: 'cubes.out',
    'trio-color-wave': 'trio-color-wave.out',
    // The gate's pulses, a counter that steps on each kick the bass gate lets through (S9 measures it before and after
    // bass-ink moves onto the hub's gate-input bass). Not `bass-ink.out`: that is a governed brightness, capped at two
    // kick flashes a second, with no per-hit reaction (docs/agents/audio-presentation-audit.md, finding 5). A counter
    // fires on each increment. Adding a visualizer adds cells and changes none, so the targets version stays.
    'bass-ink': 'bass-ink.kicks',
};

// AC8's fire-to-beat rule, defined once for live.hit.share50ms and live.falseFire.share (targets version 6). A fire is
// the first row at which the reaction column is LIVE_RISE_FRACTION of its whole-recording range above its minimum over
// the preceding LIVE_HIT_WINDOW_SECONDS, or, for a counter column, each row at which it increments. A fire belongs to a labeled beat when it lies in
// [beat - LIVE_TAP_TOLERANCE_SECONDS, beat + LIVE_HIT_WINDOW_SECONDS] (liveFireHitsBeat). A beat with a fire of its own is
// hit; a fire that belongs to no beat is a false fire. The tolerance before the beat absorbs the jitter of hand-tapped
// beats (about 20 ms): without it a reaction a few ms ahead of a tapped beat was a miss and a false fire.
export const LIVE_HIT_WINDOW_SECONDS = 0.05;
export const LIVE_TAP_TOLERANCE_SECONDS = 0.02;
export const LIVE_RISE_FRACTION = 0.2;

// The epsilon keeps a row time that is a float step off a window edge inside it.
const LIVE_WINDOW_EPSILON = 1e-9;

export function liveFireHitsBeat(fireSeconds: number, beatSeconds: number): boolean {
    return (
        beatSeconds - LIVE_TAP_TOLERANCE_SECONDS - LIVE_WINDOW_EPSILON <= fireSeconds &&
        fireSeconds <= beatSeconds + LIVE_HIT_WINDOW_SECONDS + LIVE_WINDOW_EPSILON
    );
}

export interface LiveMetricTarget {
    id: string;
    description: string;
    direction: MetricDirection;
    unit: MetricUnit;
    // The absolute target from the acceptance criteria; null when the pre-hub value is the only bound or none applies.
    floor: number | null;
    stretch: number | null;
    // How much worse than the pre-hub median a live median may be before it counts as worse than pre-hub. Browser runs
    // jitter, so an exact comparison would flap. null means the pre-hub value is shown but does not bound the floor.
    prehubTolerance: number | null;
    visualizers: readonly LiveVisualizer[];
    applies: (trackClass: TrackClass, kick: boolean) => boolean;
    // True when the metric is judged against the track's .beats.json; a missing sidecar makes the cell unavailable.
    needsBeats: boolean;
    // A per-run metric is judged run by run (the cell passes when at least 3 of 4 runs pass); a cross-run metric is one
    // number over the runs that already encodes the 3-of-4 rule.
    perRun: boolean;
    // Visualizers whose per-run cell is judged on the median of its runs instead (at least 3 runs measured), for a
    // metric whose runs are bimodal, so the 3-of-4 rule would fail on noise.
    medianFor?: readonly LiveVisualizer[];
}

const isReal = (trackClass: TrackClass): boolean => trackClass === 'tapped' || trackClass === 'drifting';
const kickWithBeat = (trackClass: TrackClass, kick: boolean): boolean => kick && hasBeat(trackClass);
const ALL_LIVE: readonly LiveVisualizer[] = ['dancing-character', 'cubes', 'trio-color-wave', 'bass-ink'];

export const LIVE_METRICS: readonly LiveMetricTarget[] = [
    {
        // AC6 in the browser, restated from the lock: per run, the first gateOpen row minus the first tempoLocked row.
        id: 'live.gate.secondsAfterLock',
        description: 'Seconds from the dancer tempo lock until the dancing character gate first opens, live',
        direction: 'lower',
        unit: 'seconds',
        floor: 4,
        stretch: 2,
        prehubTolerance: 0.5,
        visualizers: ['dancing-character'],
        applies: kickWithBeat,
        needsBeats: false,
        perRun: true,
    },
    {
        // AC7: per run, the largest distance (in beats) between the run's place in the dance and the median of all runs at
        // the same track time, sampled every 0.25 s from the latest run's meter lock, leaving each run 4 s after each of
        // its tempo and meter locks to slide into the bar (clipMaxDeviations, CLIP_SETTLE_SECONDS). The place is
        // compared within the bar where every run is meter-locked and within the beat otherwise, the alignment the
        // dancer keeps; which bar of a longer loop it is on is left free by design (Trevor, S8, targets version 8). The
        // floor, 0.2 beat, is the old 0.05 loop of a 4-beat clip (0.4 beat of an 8-beat one).
        id: 'live.clip.maxDeviationBeats',
        description:
            'Largest distance of the dance from the run median after lock, within the bar (beat before the meter lock), in beats',
        direction: 'lower',
        unit: 'beats',
        floor: 0.2,
        stretch: null,
        prehubTolerance: null,
        visualizers: ['dancing-character'],
        applies: (trackClass) => isReal(trackClass),
        needsBeats: false,
        perRun: true,
    },
    {
        // AC7: the first tempoLocked time of each run; the value is the range of the 3 runs closest together, so it
        // passes when at least 3 of 4 runs lock within 2 s of each other.
        id: 'live.lock.spreadSeconds',
        description: 'Range of the dancer lock times over the 3 closest of 4 runs',
        direction: 'lower',
        unit: 'seconds',
        floor: 2,
        stretch: null,
        prehubTolerance: null,
        visualizers: ['dancing-character'],
        applies: (trackClass) => isReal(trackClass),
        needsBeats: false,
        perRun: false,
    },
    {
        // AC8: hits / (hits + misses) over the labeled beats the recording covers, by liveFireHitsBeat (targets version
        // 6). The dancer's runs are bimodal in both builds (a run hits about 0.7 or 0), so its cell is judged on the
        // median (Trevor's S3 review, targets version 5).
        id: 'live.hit.share50ms',
        description: 'Share of labeled beats with a reaction from 20 ms before to 50 ms after',
        direction: 'higher',
        unit: 'fraction',
        floor: null,
        stretch: 0.9,
        prehubTolerance: 0.05,
        visualizers: ALL_LIVE,
        applies: kickWithBeat,
        needsBeats: true,
        perRun: true,
        medianFor: ['dancing-character'],
    },
    {
        // Success metric stretch only (at most 10% false fires): reported, not bounded by pre-hub. Same fires and
        // fire-to-beat rule as live.hit.share50ms.
        id: 'live.falseFire.share',
        description: 'Share of reaction fires that hit no labeled beat',
        direction: 'lower',
        unit: 'fraction',
        floor: null,
        stretch: 0.1,
        prehubTolerance: null,
        visualizers: ALL_LIVE,
        applies: kickWithBeat,
        needsBeats: true,
        perRun: true,
    },
    {
        // AC8: the median delay of a reaction after a labeled beat, as measureReactionOffset measures it (its default
        // 250 ms search window). The stretch is 30 ms plus one 60 Hz frame. The pre-hub tolerance is one frame, the
        // step a reaction moves by from run to run (Trevor's S3 review, targets version 5; it was 5 ms).
        id: 'live.reaction.latencyMs',
        description: 'Median reaction delay after a labeled beat',
        direction: 'lower',
        unit: 'ms',
        floor: null,
        stretch: 30 + 1000 / 60,
        prehubTolerance: 1000 / 60,
        visualizers: ALL_LIVE,
        applies: kickWithBeat,
        needsBeats: true,
        perRun: true,
    },
];

// The floor a live value is judged against: the AC floor, tightened by the pre-hub median widened by the tolerance.
export function liveEffectiveFloor(metric: LiveMetricTarget, prehub: number | null): number | null {
    if (prehub === null || metric.prehubTolerance === null) return metric.floor;
    const bound = metric.direction === 'lower' ? prehub + metric.prehubTolerance : prehub - metric.prehubTolerance;
    if (metric.floor === null) return bound;
    return metric.direction === 'lower' ? Math.min(metric.floor, bound) : Math.max(metric.floor, bound);
}

// Slack, in the metric's own unit, when a value is compared to a floor. A pre-hub bound such as prehub + 1000/60 is
// computed in floating point, so a value that sits exactly one tolerance away can land about 1e-12 past it. 1e-6 is
// far below any real measurement step (milliseconds, shares, seconds), so it only absorbs that noise.
export const FLOOR_EPSILON = 1e-6;

// Whether a value meets a floor, for both directions; a null floor is report-only and always met.
export function meetsFloor(direction: MetricDirection, value: number, floor: number | null): boolean {
    if (floor === null) return true;
    return direction === 'lower' ? value <= floor + FLOOR_EPSILON : value >= floor - FLOOR_EPSILON;
}

export function floorFor(metric: MetricTarget, trackClass: TrackClass): number | null {
    return metric.floorByClass?.[trackClass] ?? metric.floor;
}

// An offline metric's floor once its pre-hub value is known: with a pre-hub tolerance, the pre-hub value widened by it
// (tightened by the AC floor when there is one); otherwise the AC floor bounded by the pre-hub value.
export function offlineEffectiveFloor(
    metric: MetricTarget,
    floor: number | null,
    prehub: number | null,
): number | null {
    if (metric.prehubTolerance === undefined || prehub === null) return effectiveFloor(metric.direction, floor, prehub);
    const bound = metric.direction === 'lower' ? prehub + metric.prehubTolerance : prehub - metric.prehubTolerance;
    if (floor === null) return bound;
    return metric.direction === 'lower' ? Math.min(floor, bound) : Math.max(floor, bound);
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
    const live = LIVE_METRICS.find((candidate) => candidate.id === metricId);
    if (live) return live.direction;
    return SCENARIO_TARGETS.find((candidate) => candidate.id === metricId)?.direction ?? null;
}

export function unitOf(metricId: string): MetricUnit {
    const metric = METRICS.find((candidate) => candidate.id === metricId);
    if (metric) return metric.unit;
    const live = LIVE_METRICS.find((candidate) => candidate.id === metricId);
    if (live) return live.unit;
    return SCENARIO_TARGETS.find((candidate) => candidate.id === metricId)?.unit ?? 'fraction';
}
