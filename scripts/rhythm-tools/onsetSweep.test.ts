import { describe, expect, it } from 'vitest';
import {
    expandGrid,
    formatPoint,
    parseSweepArguments,
    rankPoints,
    scorePoint,
    type LocalResult,
    type SyntheticResult,
} from './onsetSweep';

const goodLocal = (track: string, overrides: Partial<LocalResult> = {}): LocalResult => ({
    track,
    noKick: false,
    perBeat: { kick: 1, bass: 1, snare: 1, highs: 2 },
    coverage: 0.95,
    ...overrides,
});
const goodSynthetic: SyntheticResult = { track: 'a', f: { kick: 1, snare: 0.95 } };

describe('parseSweepArguments', () => {
    it('prints usage without arguments or with --help', () => {
        expect(parseSweepArguments([])).toBeUndefined();
        expect(parseSweepArguments(['--help'])).toBeUndefined();
    });

    it('reads every option with defaults', () => {
        const parsed = parseSweepArguments(['--grid', 'A=[1,2]|3', '--set', 'B=4', '--grid', 'C=1|2']);
        expect(parsed).toEqual({
            grid: [
                { name: 'A', values: ['[1,2]', '3'] },
                { name: 'C', values: ['1', '2'] },
            ],
            fixed: [{ name: 'B', value: '4' }],
            dir: undefined,
            seconds: 60,
            noKick: [],
            top: 0,
        });
        const more = parseSweepArguments([
            '--dir',
            'd',
            '--seconds',
            '30',
            '--no-kick',
            'x',
            '--no-kick',
            'y',
            '--top',
            '3',
        ]);
        expect(more).toMatchObject({ dir: 'd', seconds: 30, noKick: ['x', 'y'], top: 3 });
    });

    it.each([
        [['--grid', 'A'], 'NAME=v1'],
        [['--grid', 'A=1||2'], 'NAME=v1'],
        [['--grid', 'A=x'], 'numbers'],
        [['--set', 'nope'], 'NAME=VALUE'],
        [['--seconds', '0'], 'above 0'],
        [['--top', '1.5'], 'whole number'],
        [['--dir'], 'needs a value'],
        [['--bogus'], 'Unknown option'],
        [['--grid', 'A=1', '--set', 'A=2'], 'twice'],
    ])('rejects %j', (argv, message) => {
        expect(() => parseSweepArguments(argv)).toThrow(message);
    });
});

describe('expandGrid', () => {
    it('gives one empty point without axes', () => {
        expect(expandGrid([])).toEqual([[]]);
    });

    it('is the cartesian product with the first axis slowest', () => {
        const points = expandGrid([
            { name: 'A', values: ['1', '2'] },
            { name: 'B', values: ['x', 'y', 'z'] },
        ]);
        expect(points).toHaveLength(6);
        expect(points[0]).toEqual([
            { name: 'A', value: '1' },
            { name: 'B', value: 'x' },
        ]);
        expect(points[3]).toEqual([
            { name: 'A', value: '2' },
            { name: 'B', value: 'x' },
        ]);
    });
});

describe('scorePoint', () => {
    it('passes when everything is within bounds', () => {
        const score = scorePoint([goodSynthetic], [goodLocal('l')]);
        expect(score.violations).toEqual([]);
        expect(score.worstMargin).toBeGreaterThan(0);
        expect(score.worstSynthetic).toEqual({ track: 'a', band: 'snare', f: 0.95 });
    });

    it('flags a synthetic band under F 0.9', () => {
        const score = scorePoint([{ track: 'a', f: { kick: 0.85 } }], []);
        expect(score.violations.map((entry) => entry.what)).toEqual(['synthetic a kick F']);
    });

    it('flags local rates, the stricter kick bound on a no-kick track and coverage', () => {
        const score = scorePoint(
            [],
            [
                goodLocal('busy', { perBeat: { kick: 2.5, bass: 2.5, snare: 2.5, highs: 4.5 } }),
                goodLocal('plain', { noKick: true, perBeat: { kick: 0.6, bass: 1, snare: 1, highs: 1 } }),
                goodLocal('quiet', { coverage: 0.5 }),
                goodLocal('none', { coverage: NaN }),
            ],
        );
        expect(score.violations.map((entry) => entry.what)).toEqual([
            'local busy kick',
            'local busy bass',
            'local busy snare',
            'local busy highs',
            'local plain kick',
            'local quiet coverage',
            'local none coverage',
        ]);
        expect(score.worstSynthetic).toBeUndefined();
    });

    it('allows a kick of 1 on an ordinary track but not on a no-kick one', () => {
        const perBeat = { kick: 1, bass: 1, snare: 1, highs: 1 };
        expect(scorePoint([], [goodLocal('a', { perBeat })]).violations).toEqual([]);
        expect(scorePoint([], [goodLocal('a', { perBeat, noKick: true })]).violations).toHaveLength(1);
    });
});

describe('rankPoints', () => {
    it('orders by violations then by worst margin and keeps grid order for ties', () => {
        const point = (name: string, violations: number, worstMargin: number) => ({
            name,
            score: {
                violations: Array.from({ length: violations }, () => ({ what: 'x', value: 0, margin: -1 })),
                worstMargin,
                worstSynthetic: undefined,
            },
        });
        const ranked = rankPoints([
            point('two', 2, -0.1),
            point('passLow', 0, 0.1),
            point('oneBad', 1, -0.5),
            point('passHigh', 0, 0.4),
            point('tieA', 1, -0.2),
            point('tieB', 1, -0.2),
        ]);
        expect(ranked.map((entry) => entry.name)).toEqual(['passHigh', 'passLow', 'tieA', 'tieB', 'oneBad', 'two']);
    });
});

describe('formatPoint', () => {
    it('prints one line per point plus one per local track with violations marked', () => {
        const local = [goodLocal('l', { coverage: 0.5, noKick: true })];
        const score = scorePoint([{ track: 'a', f: { kick: 0.5 } }], local);
        const lines = formatPoint('#1', [{ name: 'A', value: '1' }], score, local);
        expect(lines).toEqual([
            '#1 A=1: 3 violation(s), worst synthetic a/kick F 0.50, failing a kick F',
            '    l (no kick): kick 1.00! bass 1.00 snare 1.00 highs 2.00 coverage 0.50!',
        ]);
        expect(formatPoint('base', [], scorePoint([], []), [])).toEqual([
            'base (none): 0 violation(s), worst synthetic n/a',
        ]);
    });
});
