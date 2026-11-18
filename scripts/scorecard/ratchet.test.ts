import { describe, expect, it } from 'vitest';
import { compareToBaseline } from './ratchet';
import type { Scorecard, ScorecardCell } from './types';

function cell(overrides: Partial<ScorecardCell> = {}): ScorecardCell {
    return {
        metric: 'beat.errorMedianMs',
        track: 'a.wav',
        visualizer: 'rhythm',
        class: 'synthetic',
        applicable: true,
        floor: 20,
        stretch: null,
        prehub: null,
        value: 10,
        spread: 0,
        runs: 1,
        source: 'offline',
        blocking: true,
        pass: true,
        status: 'pass',
        ...overrides,
    };
}

function card(cells: ScorecardCell[], header: Partial<Scorecard['header']> = {}): Scorecard {
    return {
        header: { targetsVersion: 1, revision: 'r', created: 'c', sidecarHashes: { 'a.wav': 'h1' }, ...header },
        cells,
    };
}

describe('compareToBaseline', () => {
    it('accepts an identical scorecard', () => {
        expect(compareToBaseline(card([cell()]), card([cell()]))).toEqual({ ok: true, problems: [] });
    });

    it('accepts improvements, new cells, new hashes and cells that did not pass before', () => {
        const baseline = card([cell({ track: 'b.wav', status: 'fail', pass: false, value: 30 })]);
        const current = card([cell({ track: 'b.wav' }), cell({ track: 'new.wav' })], {
            sidecarHashes: { 'a.wav': 'h1', 'new.wav': 'h2' },
        });
        expect(compareToBaseline(baseline, current).ok).toBe(true);
    });

    it('fails when the targets version differs, and says to regenerate', () => {
        const result = compareToBaseline(card([cell()]), card([cell()], { targetsVersion: 2 }));
        expect(result.ok).toBe(false);
        expect(result.problems).toEqual([expect.stringContaining('regenerate the baseline')]);
    });

    it('fails when a blocking cell that passed now fails, is unavailable or is missing', () => {
        const baseline = card([cell()]);
        const failing = compareToBaseline(baseline, card([cell({ status: 'fail', pass: false })]));
        expect(failing.problems).toEqual([
            'beat.errorMedianMs on a.wav (rhythm): blocking cell is fail, it passed in the baseline',
        ]);
        const unavailable = compareToBaseline(baseline, card([cell({ status: 'unavailable', pass: false })]));
        expect(unavailable.problems[0]).toContain('is unavailable');
        const missing = compareToBaseline(baseline, card([]));
        expect(missing.problems).toEqual([
            'beat.errorMedianMs on a.wav (rhythm): blocking cell is missing, it passed in the baseline',
        ]);
    });

    it('does not hold a non-blocking cell to the pass rule', () => {
        const baseline = card([cell({ blocking: false })]);
        expect(compareToBaseline(baseline, card([])).ok).toBe(true);
    });

    it('fails a live cell that worsened beyond the spread, respecting direction', () => {
        const live = { source: 'live' as const, blocking: false, spread: 2, runs: 4 };
        const lower = card([cell({ ...live, value: 10 })]);
        expect(compareToBaseline(lower, card([cell({ ...live, value: 12 })])).ok).toBe(true);
        const worseLower = compareToBaseline(lower, card([cell({ ...live, value: 12.5 })]));
        expect(worseLower.ok).toBe(false);
        expect(worseLower.problems[0]).toContain('worse than the baseline');

        const higher = card([cell({ ...live, metric: 'onset.f50.kick', value: 0.9, spread: 0.02 })]);
        const higherNow = (value: number) => card([cell({ ...live, metric: 'onset.f50.kick', value, spread: 0.02 })]);
        expect(compareToBaseline(higher, higherNow(0.95)).ok).toBe(true);
        expect(compareToBaseline(higher, higherNow(0.89)).ok).toBe(true);
        expect(compareToBaseline(higher, higherNow(0.8)).ok).toBe(false);
    });

    it('skips live comparison for missing values, missing cells, offline cells and unknown metrics', () => {
        const live = { source: 'live' as const, blocking: false };
        expect(compareToBaseline(card([cell({ ...live, value: null })]), card([cell({ ...live, value: 99 })])).ok).toBe(
            true,
        );
        expect(compareToBaseline(card([cell({ ...live, value: 1 })]), card([cell({ ...live, value: null })])).ok).toBe(
            true,
        );
        expect(compareToBaseline(card([cell({ ...live })]), card([])).ok).toBe(true);
        expect(compareToBaseline(card([cell({ value: 1, blocking: false })]), card([cell({ value: 99 })])).ok).toBe(
            true,
        );
        const unknown = { ...live, metric: 'live.newMetric' };
        expect(
            compareToBaseline(card([cell({ ...unknown, value: 1 })]), card([cell({ ...unknown, value: 99 })])).ok,
        ).toBe(true);
    });

    it('fails when a sidecar hash differs or is missing', () => {
        const changed = compareToBaseline(card([]), card([], { sidecarHashes: { 'a.wav': 'h2' } }));
        expect(changed.problems).toEqual(['sidecar for a.wav changed: regenerate the baseline after re-tapping']);
        const missing = compareToBaseline(card([]), card([], { sidecarHashes: {} }));
        expect(missing.problems).toEqual(['sidecar for a.wav is missing: regenerate the baseline after re-tapping']);
    });
});
