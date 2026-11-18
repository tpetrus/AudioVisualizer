import { describe, expect, it } from 'vitest';
import { debugVizArgs, parseOutputFolders, planJobs, shellQuote } from './record';

describe('planJobs', () => {
    it('runs the last two as one page and the others as fresh loads', () => {
        expect(planJobs(4)).toEqual([{ reselect: 1 }, { reselect: 1 }, { reselect: 2 }]);
        expect(planJobs(3)).toEqual([{ reselect: 1 }, { reselect: 2 }]);
        expect(planJobs(6).map((job) => job.reselect)).toEqual([1, 1, 1, 1, 2]);
    });

    it('makes every run a fresh load with fewer than 3', () => {
        expect(planJobs(2)).toEqual([{ reselect: 1 }, { reselect: 1 }]);
        expect(planJobs(1)).toEqual([{ reselect: 1 }]);
    });
});

describe('parseOutputFolders', () => {
    it('reads each Output line in order', () => {
        const text = 'a\nOutput: C:\\x\\out-1-play1\r\nsummary\nOutput: C:\\x\\out-1-play2\nlast';
        expect(parseOutputFolders(text)).toEqual(['C:\\x\\out-1-play1', 'C:\\x\\out-1-play2']);
        expect(parseOutputFolders('Error: nope')).toEqual([]);
    });
});

describe('debugVizArgs', () => {
    const options = { dir: 'C:/my music', track: 'a.wav', viz: 'cubes', seconds: 12, headless: true };

    it('passes the options through', () => {
        expect(debugVizArgs(options, { reselect: 2 })).toEqual([
            'run',
            'debug:viz',
            '--',
            '--dir',
            'C:/my music',
            '--track',
            'a.wav',
            '--viz',
            'cubes',
            '--seconds',
            '12',
            '--reselect',
            '2',
            '--headless',
        ]);
    });

    it('leaves out what is not set', () => {
        expect(debugVizArgs({ ...options, seconds: undefined, headless: false }, { reselect: 1 })).toEqual([
            'run',
            'debug:viz',
            '--',
            '--dir',
            'C:/my music',
            '--track',
            'a.wav',
            '--viz',
            'cubes',
        ]);
    });
});

describe('shellQuote', () => {
    it('quotes only what needs it', () => {
        expect(shellQuote('C:/music/a.wav')).toBe('C:/music/a.wav');
        expect(shellQuote('C:/my music')).toBe('"C:/my music"');
        expect(shellQuote('a"b')).toBe('"a\\"b"');
    });
});
