import { describe, expect, it } from 'vitest';
import { evaluateCheck, MISSING_BASELINE_MESSAGE } from './checkLogic';
import type { Scorecard, ScorecardCell } from './types';

const cell = (status: ScorecardCell['status']): ScorecardCell => ({
    metric: 'tempo.within2pct',
    track: 'a.wav',
    visualizer: 'rhythm',
    class: 'tapped',
    applicable: true,
    floor: 1,
    stretch: null,
    prehub: null,
    value: status === 'pass' ? 1 : 0,
    spread: 0,
    runs: 1,
    source: 'offline',
    blocking: true,
    pass: status === 'pass',
    status,
});
const card = (status: ScorecardCell['status']): Scorecard => ({
    header: { targetsVersion: 1, revision: 'abc', created: 'now', sidecarHashes: {} },
    cells: [cell(status)],
});

describe('evaluateCheck', () => {
    it('fails and names the fix when the baseline is missing', () => {
        expect(evaluateCheck(null, card('pass'))).toEqual({ exitCode: 1, lines: [MISSING_BASELINE_MESSAGE] });
        expect(MISSING_BASELINE_MESSAGE).toContain('npm run scorecard -- --write-baseline');
    });

    it('passes when nothing got worse', () => {
        expect(evaluateCheck(card('pass'), card('pass')).exitCode).toBe(0);
        expect(evaluateCheck(card('fail'), card('fail')).exitCode).toBe(0);
    });

    it('accepts a scorecard whose header records overrides', () => {
        const overridden = card('pass');
        overridden.header.overrides = { KICK_STORE_CAPACITY: '128' };
        expect(evaluateCheck(card('pass'), overridden).exitCode).toBe(0);
        expect(evaluateCheck(overridden, overridden).exitCode).toBe(0);
    });

    it('fails and lists a blocking cell that stopped passing', () => {
        const outcome = evaluateCheck(card('pass'), card('fail'));
        expect(outcome.exitCode).toBe(1);
        expect(outcome.lines.join('\n')).toContain('tempo.within2pct on a.wav');
    });
});
