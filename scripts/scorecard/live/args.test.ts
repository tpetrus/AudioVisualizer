import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNS, LIVE_DIR, LIVE_FILE, LIVE_USAGE, parseLiveArgs } from './args';

describe('parseLiveArgs', () => {
    it('has defaults', () => {
        expect(parseLiveArgs(['--viz', 'cubes'])).toEqual({
            viz: 'cubes',
            dir: LIVE_DIR,
            tracks: undefined,
            runs: DEFAULT_RUNS,
            seconds: undefined,
            headless: false,
            ingest: [],
            prehub: false,
            out: LIVE_FILE,
            help: false,
        });
    });

    it('reads every flag', () => {
        const args = parseLiveArgs([
            '--viz',
            'dancing-character',
            '--dir',
            'd',
            '--tracks',
            'a.wav, b.wav',
            '--runs',
            '3',
            '--seconds',
            '12.5',
            '--headless',
            '--ingest',
            'x',
            'y',
            '--prehub',
            '--out',
            'o.json',
            '--ingest',
            'z',
        ]);
        expect(args).toMatchObject({
            viz: 'dancing-character',
            dir: 'd',
            tracks: ['a.wav', 'b.wav'],
            runs: 3,
            seconds: 12.5,
            headless: true,
            ingest: ['x', 'y', 'z'],
            prehub: true,
            out: 'o.json',
        });
    });

    it('lets --help stand without --viz', () => {
        expect(parseLiveArgs(['--help']).help).toBe(true);
        expect(LIVE_USAGE).toMatch(/--viz NAME/);
    });

    it('rejects bad input', () => {
        expect(() => parseLiveArgs([])).toThrow(/--viz is required/);
        expect(() => parseLiveArgs(['--viz', 'nope'])).toThrow(/must be one of/);
        expect(() => parseLiveArgs(['--viz'])).toThrow(/needs a value/);
        expect(() => parseLiveArgs(['--viz', 'cubes', '--runs', '0'])).toThrow(/whole number/);
        expect(() => parseLiveArgs(['--viz', 'cubes', '--runs', 'x'])).toThrow(/whole number/);
        expect(() => parseLiveArgs(['--viz', 'cubes', '--seconds', '0'])).toThrow(/greater than 0/);
        expect(() => parseLiveArgs(['--viz', 'cubes', '--ingest', '--prehub'])).toThrow(/needs a value/);
        expect(() => parseLiveArgs(['--viz', 'cubes', 'extra'])).toThrow(/Unexpected/);
    });
});
