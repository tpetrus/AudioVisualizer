import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSIONS, ORDER_DIR, ORDER_OUT, ORDER_TRACKS, ORDER_USAGE, parseOrderArgs } from './args';

const base = ['--pair', 'cubes,bass-ink'];

describe('parseOrderArgs', () => {
    it('has defaults', () => {
        expect(parseOrderArgs(base)).toEqual({
            pair: ['cubes', 'bass-ink'],
            dir: ORDER_DIR,
            tracks: ORDER_TRACKS,
            sessions: DEFAULT_SESSIONS,
            seconds: undefined,
            headless: false,
            ingest: [],
            topUp: false,
            out: ORDER_OUT,
            help: false,
        });
    });

    it('reads every flag', () => {
        const args = parseOrderArgs([
            ...base,
            '--dir',
            'music',
            '--tracks',
            'a.wav, b.wav',
            '--sessions',
            '3',
            '--seconds',
            '20',
            '--headless',
            '--top-up',
            '--ingest',
            'x',
            'y',
            '--ingest',
            'z',
            '--out',
            'scratch/order',
        ]);
        expect(args).toMatchObject({
            dir: 'music',
            tracks: ['a.wav', 'b.wav'],
            sessions: 3,
            seconds: 20,
            headless: true,
            topUp: true,
            ingest: ['x', 'y', 'z'],
            out: 'scratch/order',
        });
    });

    it('allows --help without a pair', () => {
        expect(parseOrderArgs(['--help']).help).toBe(true);
        expect(parseOrderArgs(['-h']).help).toBe(true);
        expect(ORDER_USAGE).toContain('--pair A,B');
        expect(ORDER_USAGE).toContain('--top-up');
    });

    it.each([
        [[], '--pair is required'],
        [['--pair', 'cubes'], 'two visualizer names'],
        [['--pair', 'cubes,'], 'two visualizer names'],
        [['--pair', 'cubes,bass-ink,x'], 'two visualizer names'],
        [['--pair', 'cubes,nope'], 'must be from'],
        [['--pair', 'cubes,cubes'], 'two different'],
        [[...base, '--tracks', ','], 'at least one track'],
        [[...base, '--sessions', '0'], 'whole number'],
        [[...base, '--sessions', '1.5'], 'whole number'],
        [[...base, '--seconds', '0'], 'greater than 0'],
        [[...base, '--seconds', 'x'], 'greater than 0'],
        [[...base, '--ingest'], '--ingest needs a value'],
        [[...base, '--dir'], '--dir needs a value'],
        [[...base, '--dir', '--headless'], '--dir needs a value'],
        [[...base, '--bogus'], 'Unexpected argument'],
    ])('rejects %j', (argv, message) => {
        expect(() => parseOrderArgs(argv)).toThrow(message);
    });
});
