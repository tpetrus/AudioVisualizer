import { describe, expect, it } from 'vitest';
import { LIVE_METRICS, TARGETS_VERSION, type LiveMetricTarget } from '../targets';
import {
    buildLiveCell,
    mergeLiveFile,
    median,
    recomputeFile,
    valueOfRuns,
    type LiveFile,
    type RunValue,
} from './liveCells';

const metricOf = (id: string): LiveMetricTarget => {
    const metric = LIVE_METRICS.find((candidate) => candidate.id === id);
    if (!metric) throw new Error(id);
    return metric;
};
const GATE = metricOf('live.gate.secondsAfterLock');
const HIT = metricOf('live.hit.share50ms');
const LOCK = metricOf('live.lock.spreadSeconds');
const CLIP = metricOf('live.clip.maxDeviationLoops');

const cell = (
    metric: LiveMetricTarget,
    current: RunValue[],
    prehub: RunValue[] = [],
    trackClass: 'synthetic' | 'tapped' = 'synthetic',
    kick = true,
) =>
    buildLiveCell({
        metric,
        track: 'drums-128.wav',
        visualizer: 'dancing-character',
        class: trackClass,
        kick,
        current,
        prehub,
    });

describe('median', () => {
    it('takes the middle, or the mean of the middle two', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 2, 3])).toBe(2.5);
        expect(median([])).toBeNull();
    });
});

describe('buildLiveCell for a per-run metric', () => {
    it('passes when 3 of 4 runs meet the floor, with the median, spread and run count', () => {
        const result = cell(GATE, [1, 2, 3, 9]);
        expect(result).toMatchObject({
            metric: 'live.gate.secondsAfterLock',
            applicable: true,
            floor: 4,
            stretch: 2,
            prehub: null,
            value: 2.5,
            spread: 8,
            runs: 4,
            source: 'live',
            blocking: false,
            pass: true,
            status: 'pass',
        });
    });

    it('fails when only 2 of 4 runs pass', () => {
        expect(cell(GATE, [1, 2, 8, 9])).toMatchObject({ pass: false, status: 'fail' });
    });

    it('needs every run to pass with fewer than 4', () => {
        expect(cell(GATE, [1, 2, 9])).toMatchObject({ status: 'fail' });
        expect(cell(GATE, [1, 2, 3])).toMatchObject({ status: 'pass' });
    });

    it('is unavailable with fewer than 3 runs with a value, and never passes', () => {
        expect(cell(GATE, [1, 2])).toMatchObject({ status: 'unavailable', pass: false, runs: 2 });
        expect(cell(HIT, [0.9, null, 0.9, null])).toMatchObject({ status: 'unavailable', runs: 2 });
        expect(cell(HIT, [])).toMatchObject({ status: 'unavailable', value: null, runs: 0, spread: 0 });
    });

    it('counts a gate that never opened as a failed run, not a missing one', () => {
        // Three opened in time and one never did: 3 of 4 pass.
        expect(cell(GATE, [1, 2, 3, null])).toMatchObject({ status: 'pass', runs: 3, value: 2 });
        // Two never opened: 2 of 4 pass.
        expect(cell(GATE, [1, 2, null, null])).toMatchObject({ status: 'fail', runs: 2 });
        // Nothing opened in 3 runs: a fail, not unavailable.
        expect(cell(GATE, [null, null, null])).toMatchObject({ status: 'fail', value: null });
    });

    it('bounds the floor by the pre-hub median and tolerance, and keeps a report-only metric passing', () => {
        // Hit share has no floor; pre-hub 0.9 minus 0.05 makes 0.85 the bound.
        expect(cell(HIT, [0.8, 0.8, 0.8, 0.8], [0.9, 0.9, 0.9])).toMatchObject({ prehub: 0.9, status: 'fail' });
        expect(cell(HIT, [0.86, 0.86, 0.86, 0.86], [0.9, 0.9, 0.9])).toMatchObject({ status: 'pass' });
        expect(cell(HIT, [0.1, 0.1, 0.1, 0.1])).toMatchObject({ prehub: null, status: 'pass' });
    });

    it("judges the dancer's hit share on the median of its runs and the other visualizers' on 3 of 4", () => {
        // drifting-tempo at the S3 review: the dancer's runs are bimodal, so 2 of 4 runs miss a floor the median meets.
        const runs = [0.25, 0.464, 0.464, 0];
        const prehub = [0, 0.357, 0.446, 0.357];
        expect(cell(HIT, runs, prehub)).toMatchObject({ value: 0.357, prehub: 0.357, status: 'pass' });
        const cubes = buildLiveCell({
            metric: HIT,
            track: 'drums-128.wav',
            visualizer: 'cubes',
            class: 'synthetic',
            kick: true,
            current: runs,
            prehub,
        });
        expect(cubes).toMatchObject({ status: 'fail' });
        expect(cell(HIT, [0.1, 0.1, 0, 0], [0.5, 0.5, 0.5])).toMatchObject({ status: 'fail' });
        // The median rule still needs 3 measured runs.
        expect(cell(HIT, [0.9, 0.9, null, null])).toMatchObject({ status: 'unavailable' });
    });

    it('is n/a for a track the metric does not apply to', () => {
        expect(cell(GATE, [1, 2, 3, 4], [], 'synthetic', false)).toMatchObject({
            applicable: false,
            status: 'n/a',
            value: null,
            runs: 0,
            pass: false,
        });
        expect(cell(CLIP, [0], [], 'synthetic')).toMatchObject({ status: 'n/a' });
    });
});

describe('buildLiveCell for a cross-run metric', () => {
    it('is the smallest 3-run range against the floor, with the full range as spread', () => {
        const result = cell(LOCK, [5, 5.5, 6, 20], [], 'tapped');
        expect(result).toMatchObject({ value: 1, spread: 15, runs: 4, status: 'pass', floor: 2 });
        expect(cell(LOCK, [5, 8, 11, 14], [], 'tapped')).toMatchObject({ value: 6, status: 'fail' });
    });

    it('is unavailable with fewer than 3 runs that locked', () => {
        expect(cell(LOCK, [5, 5.5, null, null], [], 'tapped')).toMatchObject({ status: 'unavailable', runs: 2 });
    });

    it('takes the pre-hub value from the pre-hub lock times', () => {
        expect(cell(LOCK, [5, 5.5, 6], [3, 3.2, 3.4], 'tapped').prehub).toBeCloseTo(0.4);
        expect(valueOfRuns(LOCK, [1, 2])).toBeNull();
    });
});

describe('mergeLiveFile', () => {
    const options = { viz: 'dancing-character' as const, prehub: false, revision: 'r', created: 'c' };
    const update = (track: string, gate: RunValue[]) => ({
        track,
        class: 'synthetic' as const,
        values: new Map<string, RunValue[]>([['live.gate.secondsAfterLock', gate]]),
    });

    it('creates a cell for every metric of the visualizer on each updated track', () => {
        const file = mergeLiveFile(undefined, [update('drums-128.wav', [1, 2, 3, 4])], options);
        expect(file.header.targetsVersion).toBe(TARGETS_VERSION);
        expect(file.cells.map((c) => c.metric)).toEqual(LIVE_METRICS.map((metric) => metric.id).sort());
        const gate = file.cells.find((c) => c.metric === 'live.gate.secondsAfterLock');
        expect(gate?.status).toBe('pass');
        // The metrics with no values are unavailable (or n/a on a synthetic track).
        expect(file.cells.find((c) => c.metric === 'live.hit.share50ms')?.status).toBe('unavailable');
        expect(file.cells.find((c) => c.metric === 'live.clip.maxDeviationLoops')?.status).toBe('n/a');
        expect(file.runValues.find((entry) => entry.metric === 'live.gate.secondsAfterLock')?.current).toEqual([
            1, 2, 3, 4,
        ]);
    });

    it('keeps other visualizers and other tracks, and replaces only the updated ones', () => {
        const first = mergeLiveFile(
            undefined,
            [update('drums-128.wav', [1, 2, 3, 4]), update('drums-100.wav', [9, 9, 9])],
            options,
        );
        const cubes = mergeLiveFile(first, [update('drums-128.wav', [])], { ...options, viz: 'cubes' });
        expect(cubes.cells.filter((c) => c.visualizer === 'cubes').length).toBe(3);
        expect(cubes.cells.filter((c) => c.visualizer === 'dancing-character').length).toBe(2 * 6);
        const again = mergeLiveFile(cubes, [update('drums-128.wav', [8, 8, 8])], options);
        const gateOf = (file: LiveFile, track: string) =>
            file.cells.find(
                (c) =>
                    c.metric === 'live.gate.secondsAfterLock' &&
                    c.track === track &&
                    c.visualizer === 'dancing-character',
            );
        expect(gateOf(again, 'drums-128.wav')?.value).toBe(8);
        expect(gateOf(again, 'drums-100.wav')?.value).toBe(9);
    });

    it('stores pre-hub runs without touching the value, then recomputes the pass from them', () => {
        const first = mergeLiveFile(undefined, [update('drums-128.wav', [3, 3, 3, 3])], options);
        expect(first.cells.find((c) => c.metric === 'live.gate.secondsAfterLock')?.status).toBe('pass');
        const withPrehub = mergeLiveFile(first, [update('drums-128.wav', [1, 1, 1, 1])], { ...options, prehub: true });
        const gate = withPrehub.cells.find((c) => c.metric === 'live.gate.secondsAfterLock');
        // Pre-hub 1 + tolerance 0.5 is 1.5, tighter than the floor of 4, so 3 s is now worse than pre-hub.
        expect(gate).toMatchObject({ value: 3, prehub: 1, status: 'fail' });
        const stored = withPrehub.runValues.find((entry) => entry.metric === 'live.gate.secondsAfterLock');
        expect(stored).toMatchObject({ current: [3, 3, 3, 3], prehub: [1, 1, 1, 1] });
    });

    it('makes a prehub-only cell unavailable', () => {
        const file = mergeLiveFile(undefined, [update('drums-128.wav', [1, 1, 1, 1])], { ...options, prehub: true });
        expect(file.cells.find((c) => c.metric === 'live.gate.secondsAfterLock')).toMatchObject({
            value: null,
            prehub: 1,
            status: 'unavailable',
        });
    });
});

describe('recomputeFile', () => {
    it('drops cells of metrics this build does not know', () => {
        const file = mergeLiveFile(undefined, [{ track: 'drums-128.wav', class: 'synthetic', values: new Map() }], {
            viz: 'cubes',
            prehub: false,
            revision: 'r',
            created: 'c',
        });
        const stale: LiveFile = { ...file, cells: [...file.cells, { ...file.cells[0], metric: 'live.gone' }] };
        expect(recomputeFile(stale).cells).toHaveLength(file.cells.length);
    });
});
