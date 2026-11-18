import { describe, expect, it } from 'vitest';
import { buildScorecard, scenarioNotes, type ScorecardInput } from './cells';
import { TARGETS_VERSION } from './targets';
import { EXPECTED_TRACK_NAMES } from './tracks';
import type { Scorecard, ScorecardCell, TrackMeasures } from './types';

function measures(track: string, overrides: Partial<TrackMeasures> = {}): TrackMeasures {
    return {
        track,
        class: 'synthetic',
        seconds: 30,
        everLocked: true,
        lockSeconds: 5,
        tempoWithinShareAfterLock: 1,
        maxTempoErrorAfterLock: 0.01,
        falseSongChanges: 0,
        beatErrorMedianMs: 10,
        onsetF50: { kick: 0.95, bass: 0.95, snare: 0.95, highs: 0.95 },
        gateFirstOpenSeconds: 1,
        gateOpenShare: 0.5,
        dancerLockSeconds: 0.5,
        prehubGateFirstOpenSeconds: 1,
        prehubGateOpenShare: 0.5,
        ...overrides,
    };
}

function build(overrides: Partial<ScorecardInput> = {}): Scorecard {
    return buildScorecard({
        revision: 'abc',
        created: '2026-01-01T00:00:00Z',
        measures: [],
        scenarios: [],
        sidecarHashes: { 'click-90.wav': 'h' },
        available: [],
        ...overrides,
    });
}

function cell(card: Scorecard, metric: string, track: string): ScorecardCell {
    const found = card.cells.find((candidate) => candidate.metric === metric && candidate.track === track);
    if (!found) throw new Error(`no cell ${metric} ${track}`);
    return found;
}

describe('buildScorecard', () => {
    it('writes the header and one cell per metric and expected track plus the scenarios', () => {
        const card = build();
        expect(card.header).toEqual({
            targetsVersion: TARGETS_VERSION,
            revision: 'abc',
            created: '2026-01-01T00:00:00Z',
            sidecarHashes: { 'click-90.wav': 'h' },
        });
        // 12 track metrics (4 onset bands) times 25 tracks, plus 2 scenario cells.
        expect(card.cells).toHaveLength(12 * EXPECTED_TRACK_NAMES.length + 2);
    });

    it('sorts cells by metric, then track', () => {
        const keys = build().cells.map((entry) => `${entry.metric}|${entry.track}`);
        expect(keys).toEqual([...keys].sort());
    });

    it('scores a passing offline cell', () => {
        const card = build({
            measures: [measures('click-90.wav')],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        expect(cell(card, 'beat.errorMedianMs', 'click-90.wav')).toEqual({
            metric: 'beat.errorMedianMs',
            track: 'click-90.wav',
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
        });
    });

    it('fails a cell whose value misses the floor, in either direction', () => {
        const card = build({
            measures: [measures('click-90.wav', { beatErrorMedianMs: 25, onsetF50: { kick: 0.5 } })],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        const slow = cell(card, 'beat.errorMedianMs', 'click-90.wav');
        expect(slow).toMatchObject({ pass: false, status: 'fail', value: 25 });
        expect(cell(card, 'onset.f50.kick', 'click-90.wav')).toMatchObject({ pass: false, status: 'fail' });
    });

    it('passes exactly at the floor', () => {
        const card = build({
            measures: [measures('click-90.wav', { beatErrorMedianMs: 20 })],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        expect(cell(card, 'beat.errorMedianMs', 'click-90.wav').status).toBe('pass');
    });

    it('marks non-applicable cells n/a with no value', () => {
        const card = build({
            measures: [measures('beatless.wav', { class: 'beatless' })],
            available: [{ track: 'beatless.wav', hasBeats: false }],
        });
        expect(cell(card, 'beat.errorMedianMs', 'beatless.wav')).toMatchObject({
            applicable: false,
            status: 'n/a',
            pass: false,
            value: null,
        });
        // Beatless needs no sidecar for its own metric.
        expect(cell(card, 'tempo.beatlessNeverLocks', 'beatless.wav')).toMatchObject({
            status: 'fail',
            value: 1,
        });
    });

    it('uses the expected class when a track has no measures', () => {
        const card = build();
        expect(cell(card, 'tempo.beatlessNeverLocks', 'beatless.wav')).toMatchObject({
            applicable: true,
            status: 'unavailable',
            class: 'beatless',
        });
        expect(cell(card, 'tempo.beatlessNeverLocks', 'click-90.wav').status).toBe('n/a');
    });

    it('marks a missing track unavailable, and a track measured but not found unavailable too', () => {
        const card = build({ measures: [measures('click-120.wav')], available: [] });
        expect(cell(card, 'tempo.falseSongChanges', 'click-90.wav')).toMatchObject({
            applicable: true,
            status: 'unavailable',
            pass: false,
            value: null,
        });
        expect(cell(card, 'tempo.falseSongChanges', 'click-120.wav').status).toBe('unavailable');
    });

    it('marks cells that need beats unavailable when the sidecar is missing', () => {
        const card = build({
            measures: [measures('lonley.wav', { class: 'tapped' })],
            available: [{ track: 'lonley.wav', hasBeats: false }],
        });
        expect(cell(card, 'tempo.maxErrorAfterLock', 'lonley.wav').status).toBe('unavailable');
        expect(cell(card, 'tempo.lockSeconds', 'lonley.wav').status).toBe('unavailable');
        // These need no truth.
        expect(cell(card, 'tempo.falseSongChanges', 'lonley.wav').status).toBe('pass');
        expect(cell(card, 'gate.firstOpenSeconds', 'lonley.wav').status).toBe('pass');
    });

    it('fails a measured track whose measure is null, because the tracker never got there', () => {
        const card = build({
            measures: [measures('click-90.wav', { maxTempoErrorAfterLock: null })],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        expect(cell(card, 'tempo.maxErrorAfterLock', 'click-90.wav')).toMatchObject({
            status: 'fail',
            value: null,
            pass: false,
        });
    });

    it('treats an unlabelled onset band as n/a', () => {
        const card = build({
            measures: [measures('click-90.wav', { onsetF50: { kick: 1 } })],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        expect(cell(card, 'onset.f50.kick', 'click-90.wav').status).toBe('pass');
        expect(cell(card, 'onset.f50.snare', 'click-90.wav')).toMatchObject({ applicable: false, status: 'n/a' });
    });

    it('fails, rather than hides, a kick track whose gate never opens', () => {
        const card = build({
            measures: [measures('drums-100.wav', { gateFirstOpenSeconds: null })],
            available: [{ track: 'drums-100.wav', hasBeats: true }],
        });
        expect(cell(card, 'gate.secondsAfterLock', 'drums-100.wav')).toMatchObject({
            visualizer: 'dancing-character',
            status: 'fail',
            pass: false,
            value: null,
        });
    });

    it('fails a slow gate and passes a fast one, timed from the dancer lock', () => {
        const card = build({
            measures: [
                measures('drums-100.wav', {
                    dancerLockSeconds: 3,
                    gateFirstOpenSeconds: 7.5,
                    prehubGateFirstOpenSeconds: null,
                }),
                measures('drums-128.wav', {
                    dancerLockSeconds: 3,
                    gateFirstOpenSeconds: 7,
                    prehubGateFirstOpenSeconds: null,
                }),
            ],
            available: [
                { track: 'drums-100.wav', hasBeats: true },
                { track: 'drums-128.wav', hasBeats: true },
            ],
        });
        expect(cell(card, 'gate.secondsAfterLock', 'drums-100.wav').status).toBe('fail');
        expect(cell(card, 'gate.secondsAfterLock', 'drums-128.wav')).toMatchObject({ status: 'pass', stretch: 2 });
        // Time from track start is still shown, but it no longer blocks (AC6 restated from the lock at the S3 review).
        expect(cell(card, 'gate.firstOpenSeconds', 'drums-100.wav')).toMatchObject({
            value: 7.5,
            blocking: false,
            floor: null,
            status: 'pass',
        });
    });

    it('passes report-only cells whenever a value exists and does not block', () => {
        const card = build({
            measures: [measures('click-90.wav', { gateFirstOpenSeconds: 2 })],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        expect(cell(card, 'gate.closedOnNoKick', 'click-90.wav')).toMatchObject({
            value: 1,
            floor: null,
            blocking: false,
            pass: true,
            status: 'pass',
        });
        expect(cell(card, 'tempo.lockSeconds', 'click-90.wav')).toMatchObject({ blocking: false, status: 'pass' });
    });

    it('builds the scenario cells from their measures', () => {
        const card = build({
            scenarios: [
                { id: 'scenario:dotted-100-150', songChanges: 1, softBoundaries: 0 },
                { id: 'scenario:dotted-passage', songChanges: 0, softBoundaries: 1 },
            ],
        });
        expect(cell(card, 'ac9.dottedChangeCounted', 'scenario:dotted-100-150')).toMatchObject({
            class: 'synthetic',
            visualizer: 'rhythm',
            floor: 1,
            value: 1,
            status: 'pass',
        });
        expect(cell(card, 'ac9.dottedPassageQuiet', 'scenario:dotted-passage')).toMatchObject({
            value: 1,
            floor: 0,
            status: 'fail',
        });
    });

    it('scores an unobservable soft boundary count on song changes alone', () => {
        const card = build({ scenarios: [{ id: 'scenario:dotted-passage', songChanges: 0, softBoundaries: -1 }] });
        expect(cell(card, 'ac9.dottedPassageQuiet', 'scenario:dotted-passage')).toMatchObject({
            value: 0,
            status: 'pass',
        });
    });

    it('marks a missing scenario unavailable', () => {
        const card = build();
        expect(cell(card, 'ac9.dottedChangeCounted', 'scenario:dotted-100-150')).toMatchObject({
            status: 'unavailable',
            value: null,
            pass: false,
        });
    });
});

describe('pre-hub gate rule', () => {
    // The dancer locks at 0 here, so the times from the lock equal the times given.
    const gateCell = (open: number | null, prehub: number | null): ScorecardCell =>
        cell(
            build({
                measures: [
                    measures('drums-100.wav', {
                        dancerLockSeconds: 0,
                        gateFirstOpenSeconds: open,
                        prehubGateFirstOpenSeconds: prehub,
                    }),
                ],
                available: [{ track: 'drums-100.wav', hasBeats: true }],
            }),
            'gate.secondsAfterLock',
            'drums-100.wav',
        );

    it('passes a gate at 3 s when it never opened pre-hub, keeping the 4 s floor', () => {
        expect(gateCell(3, null)).toMatchObject({ status: 'pass', pass: true, prehub: null, floor: 4 });
    });

    it('fails a gate at 3.5 s when it opened at 2 s pre-hub', () => {
        expect(gateCell(3.5, 2)).toMatchObject({ status: 'fail', pass: false, prehub: 2, floor: 4 });
    });

    it('passes a gate that is no later than pre-hub', () => {
        expect(gateCell(2, 2)).toMatchObject({ status: 'pass', prehub: 2 });
    });

    it('fails a gate at 5 s even when pre-hub was 6 s, because the 4 s floor still holds', () => {
        expect(gateCell(5, 6)).toMatchObject({ status: 'fail', pass: false, prehub: 6 });
    });

    it('records the pre-hub value on a gate that never opened', () => {
        expect(gateCell(null, 2)).toMatchObject({ status: 'fail', pass: false, value: null, prehub: 2 });
    });

    it('leaves prehub null on rhythm metrics', () => {
        const card = build({
            measures: [measures('click-90.wav')],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        for (const metric of ['beat.errorMedianMs', 'tempo.lockSeconds', 'tempo.falseSongChanges']) {
            expect(cell(card, metric, 'click-90.wav').prehub).toBeNull();
        }
    });
});

describe('gate.secondsAfterLock', () => {
    const lagCell = (overrides: Partial<TrackMeasures>): ScorecardCell =>
        cell(
            build({
                measures: [measures('drums-100.wav', overrides)],
                available: [{ track: 'drums-100.wav', hasBeats: true }],
            }),
            'gate.secondsAfterLock',
            'drums-100.wav',
        );

    it('blocks with the AC6 floor and judges against the pre-hub gap', () => {
        expect(
            lagCell({ gateFirstOpenSeconds: 3, prehubGateFirstOpenSeconds: 2, dancerLockSeconds: 0.5 }),
        ).toMatchObject({
            value: 2.5,
            prehub: 1.5,
            floor: 4,
            stretch: 2,
            blocking: true,
            pass: false,
            status: 'fail',
        });
        expect(
            lagCell({ gateFirstOpenSeconds: 3, prehubGateFirstOpenSeconds: 3.5, dancerLockSeconds: 0.5 }),
        ).toMatchObject({ value: 2.5, prehub: 3, pass: true, status: 'pass' });
    });

    it('fails a kick track whose dancer never locks or whose gate never opens', () => {
        expect(lagCell({ dancerLockSeconds: null, prehubGateFirstOpenSeconds: null })).toMatchObject({
            applicable: true,
            value: null,
            prehub: null,
            pass: false,
            status: 'fail',
            blocking: true,
        });
        expect(lagCell({ gateFirstOpenSeconds: null })).toMatchObject({ value: null, status: 'fail' });
    });

    it('is n/a on a track with no kick', () => {
        const card = build({
            measures: [measures('click-90.wav')],
            available: [{ track: 'click-90.wav', hasBeats: true }],
        });
        expect(cell(card, 'gate.secondsAfterLock', 'click-90.wav')).toMatchObject({ applicable: false, status: 'n/a' });
    });
});

describe('scenarioNotes', () => {
    it('names only the scenarios whose soft boundaries were unobservable', () => {
        expect(
            scenarioNotes([
                { id: 'scenario:a', songChanges: 0, softBoundaries: -1 },
                { id: 'scenario:b', songChanges: 0, softBoundaries: 0 },
            ]),
        ).toEqual(['scenario:a: soft boundaries were not observable, scored on song changes alone']);
    });
});
