import { describe, expect, it } from 'vitest';
import { METRICS, SCENARIO_TARGETS, TARGETS_VERSION, directionOf, effectiveFloor, floorFor, unitOf } from './targets';
import type { TrackMeasures } from './types';

function measures(overrides: Partial<TrackMeasures> = {}): TrackMeasures {
    return {
        track: 't.wav',
        class: 'synthetic',
        seconds: 30,
        everLocked: true,
        lockSeconds: 5,
        tempoWithinShareAfterLock: 1,
        maxTempoErrorAfterLock: 0.01,
        falseSongChanges: 0,
        beatErrorMedianMs: 10,
        onsetF50: { kick: 0.95 },
        gateFirstOpenSeconds: 1,
        gateOpenShare: 0.5,
        ...overrides,
    };
}

const metric = (id: string) => {
    const found = METRICS.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`no metric ${id}`);
    return found;
};

describe('targets', () => {
    it('has a version and unique metric ids', () => {
        expect(TARGETS_VERSION).toBe(1);
        const ids = [...METRICS, ...SCENARIO_TARGETS].map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('makes every offline metric blocking except the report-only ones', () => {
        const reportOnly = METRICS.filter((entry) => !entry.blocking).map((entry) => entry.id);
        expect(reportOnly.sort()).toEqual(['gate.closedOnNoKick', 'tempo.lockSeconds']);
        for (const entry of METRICS.filter((candidate) => !candidate.blocking)) expect(entry.floor).toBeNull();
    });

    it('applies tempo.maxErrorAfterLock to everything but beatless', () => {
        const entry = metric('tempo.maxErrorAfterLock');
        expect(entry.applies('synthetic', false)).toBe(true);
        expect(entry.applies('tapped', true)).toBe(true);
        expect(entry.applies('drifting', false)).toBe(true);
        expect(entry.applies('beatless', false)).toBe(false);
        expect(entry.value(measures())).toBe(0.01);
    });

    it('applies tempo.falseSongChanges to every class', () => {
        const entry = metric('tempo.falseSongChanges');
        expect(entry.applies('beatless', false)).toBe(true);
        expect(entry.value(measures({ falseSongChanges: 2 }))).toBe(2);
    });

    it('scores the beatless lock as 1 or 0 on beatless tracks only', () => {
        const entry = metric('tempo.beatlessNeverLocks');
        expect(entry.applies('beatless', false)).toBe(true);
        expect(entry.applies('synthetic', false)).toBe(false);
        expect(entry.value(measures({ everLocked: true }))).toBe(1);
        expect(entry.value(measures({ everLocked: false }))).toBe(0);
    });

    it('uses a tighter beat error floor on synthetic tracks', () => {
        const entry = metric('beat.errorMedianMs');
        expect(floorFor(entry, 'synthetic')).toBe(20);
        expect(floorFor(entry, 'tapped')).toBe(40);
        expect(floorFor(entry, 'drifting')).toBe(40);
        expect(entry.applies('beatless', false)).toBe(false);
        expect(entry.applies('tapped', false)).toBe(true);
        expect(entry.value(measures())).toBe(10);
    });

    it('scores each onset band on synthetic tracks and treats an unlabelled band as n/a', () => {
        for (const band of ['kick', 'bass', 'snare', 'highs']) {
            const entry = metric(`onset.f50.${band}`);
            expect(entry.floor).toBe(0.9);
            expect(entry.direction).toBe('higher');
            expect(entry.applies('synthetic', false)).toBe(true);
            expect(entry.applies('tapped', false)).toBe(false);
        }
        const kick = metric('onset.f50.kick');
        expect(kick.value(measures())).toBe(0.95);
        expect(kick.notApplicable?.(measures())).toBe(false);
        expect(kick.notApplicable?.(measures({ onsetF50: null }))).toBe(true);
        expect(kick.value(measures({ onsetF50: null }))).toBeNull();
        const bass = metric('onset.f50.bass');
        expect(bass.notApplicable?.(measures())).toBe(true);
        expect(bass.value(measures())).toBeNull();
    });

    it('applies the gate opening time to kick tracks that have a beat', () => {
        const entry = metric('gate.firstOpenSeconds');
        expect(entry.visualizer).toBe('dancing-character');
        expect(entry.floor).toBe(4);
        expect(entry.stretch).toBe(2);
        expect(entry.nullValueFails).toBe(true);
        expect(entry.applies('synthetic', true)).toBe(true);
        expect(entry.applies('synthetic', false)).toBe(false);
        expect(entry.applies('beatless', true)).toBe(false);
        expect(entry.value(measures({ gateFirstOpenSeconds: null }))).toBeNull();
    });

    it('reports whether the gate opened on a track with no kick', () => {
        const entry = metric('gate.closedOnNoKick');
        expect(entry.applies('synthetic', false)).toBe(true);
        expect(entry.applies('synthetic', true)).toBe(false);
        expect(entry.applies('beatless', false)).toBe(false);
        expect(entry.value(measures({ gateFirstOpenSeconds: null }))).toBe(0);
        expect(entry.value(measures({ gateFirstOpenSeconds: 3 }))).toBe(1);
    });

    it('reports the lock time without a floor', () => {
        const entry = metric('tempo.lockSeconds');
        expect(entry.applies('tapped', false)).toBe(true);
        expect(entry.applies('beatless', false)).toBe(false);
        expect(entry.value(measures())).toBe(5);
    });

    it('scores the AC9 scenarios and ignores an unobservable soft boundary count', () => {
        const [counted, quiet] = SCENARIO_TARGETS;
        expect(counted.scenario).toBe('scenario:dotted-100-150');
        expect(counted.value({ id: counted.scenario, songChanges: 1, softBoundaries: 0 })).toBe(1);
        expect(quiet.scenario).toBe('scenario:dotted-passage');
        expect(quiet.value({ id: quiet.scenario, songChanges: 0, softBoundaries: 2 })).toBe(2);
        expect(quiet.value({ id: quiet.scenario, songChanges: 1, softBoundaries: -1 })).toBe(1);
    });
});

describe('effectiveFloor', () => {
    it('is null for a report-only floor', () => {
        expect(effectiveFloor('lower', null, 3)).toBeNull();
    });

    it('keeps the floor without a pre-hub value', () => {
        expect(effectiveFloor('lower', 4, null)).toBe(4);
    });

    it('takes the stricter of floor and pre-hub value by direction', () => {
        expect(effectiveFloor('lower', 4, 2)).toBe(2);
        expect(effectiveFloor('lower', 4, 6)).toBe(4);
        expect(effectiveFloor('higher', 0.9, 0.95)).toBe(0.95);
        expect(effectiveFloor('higher', 0.9, 0.5)).toBe(0.9);
    });
});

describe('lookups', () => {
    it('finds direction and unit for track and scenario metrics', () => {
        expect(directionOf('beat.errorMedianMs')).toBe('lower');
        expect(directionOf('ac9.dottedChangeCounted')).toBe('higher');
        expect(directionOf('nope')).toBeNull();
        expect(unitOf('beat.errorMedianMs')).toBe('ms');
        expect(unitOf('ac9.dottedChangeCounted')).toBe('count');
        expect(unitOf('nope')).toBe('fraction');
    });
});
