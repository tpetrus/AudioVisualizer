import { describe, expect, it } from 'vitest';
import {
    expandGrid,
    formatPoint,
    isBaselinePoint,
    parseSweepArguments,
    rankPoints,
    scorePoint,
    splitGridValues,
    type LocalResult,
    type SyntheticResult,
} from './onsetSweep';

const goodLocal = (track: string, overrides: Partial<LocalResult> = {}): LocalResult => ({
    track,
    noKick: false,
    perBeat: { kick: 1, bass: 1, snare: 1, highs: 2 },
    lift: 0.5,
    offsetMs: -20,
    chance: 0.4,
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

describe('grid value separators', () => {
    it('splits on commas outside lists and keeps list commas', () => {
        expect(splitGridValues('[3,3,3],[2,2,2]')).toEqual(['[3,3,3]', '[2,2,2]']);
        expect(splitGridValues('[3,3,3]')).toEqual(['[3,3,3]']);
        expect(splitGridValues('1,2|(3,4)')).toEqual(['1', '2', '(3,4)']);
    });

    it('accepts the comma form and a repeated --grid, and still accepts the pipe', () => {
        const axis = (values: string[]) => ({ grid: [{ name: 'A', values }] });
        expect(parseSweepArguments(['--grid', 'A=1,2'])).toMatchObject(axis(['1', '2']));
        expect(parseSweepArguments(['--grid', 'A=1|2'])).toMatchObject(axis(['1', '2']));
        expect(parseSweepArguments(['--grid', 'A=1', '--grid', 'A=2'])).toMatchObject(axis(['1', '2']));
        expect(parseSweepArguments(['--grid', 'A=[3,3,3],[2,2,2]'])).toMatchObject(axis(['[3,3,3]', '[2,2,2]']));
    });

    it('rejects an empty comma entry', () => {
        expect(() => parseSweepArguments(['--grid', 'A=1,'])).toThrow('NAME=v1');
    });
});

describe('isBaselinePoint', () => {
    const fixed = [{ name: 'A', value: '1' }];
    it('is true only for the fixed overrides themselves', () => {
        expect(isBaselinePoint([], [])).toBe(true);
        expect(isBaselinePoint(fixed, fixed)).toBe(true);
        expect(isBaselinePoint([{ name: 'A', value: '2' }], fixed)).toBe(false);
        expect(isBaselinePoint([{ name: 'B', value: '1' }], fixed)).toBe(false);
        expect(isBaselinePoint([...fixed, { name: 'B', value: '1' }], fixed)).toBe(false);
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

    it('flags local rates, the stricter kick bound on a no-kick track and lift', () => {
        const score = scorePoint(
            [],
            [
                goodLocal('busy', { perBeat: { kick: 2.5, bass: 2.5, snare: 2.5, highs: 4.5 } }),
                goodLocal('plain', { noKick: true, perBeat: { kick: 0.6, bass: 1, snare: 1, highs: 1 } }),
                goodLocal('quiet', { lift: 0.05 }),
                goodLocal('none', { lift: NaN }),
            ],
        );
        expect(score.violations.map((entry) => entry.what)).toEqual([
            'local busy kick',
            'local busy bass',
            'local busy snare',
            'local busy highs',
            'local plain kick',
            'local quiet lift',
            'local none lift',
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
        const local = [goodLocal('l', { lift: 0.05, noKick: true })];
        const score = scorePoint([{ track: 'a', f: { kick: 0.5 } }], local);
        const lines = formatPoint('#1', [{ name: 'A', value: '1' }], score, local);
        expect(lines).toEqual([
            '#1 A=1: 3 violation(s), worst synthetic a/kick F 0.50, failing a kick F',
            '    l (no kick): kick 1.00! bass 1.00 snare 1.00 highs 2.00 lift 0.05! offset -20 ms chance 0.40',
        ]);
        expect(formatPoint('base', [], scorePoint([], []), [])).toEqual([
            'base (none): 0 violation(s), worst synthetic n/a',
        ]);
    });

    it('prints n/a for a track with too few tapped beats', () => {
        const local = [goodLocal('l', { lift: NaN, offsetMs: NaN, chance: NaN })];
        const lines = formatPoint('#1', [], scorePoint([], local), local);
        expect(lines[1]).toBe('    l: kick 1.00 bass 1.00 snare 1.00 highs 2.00 lift n/a!');
    });

    it('prints a positive offset with a plus sign', () => {
        const local = [goodLocal('l', { offsetMs: 15 })];
        expect(formatPoint('#1', [], scorePoint([], local), local)[1]).toContain('lift 0.50 offset +15 ms chance 0.40');
    });
});
