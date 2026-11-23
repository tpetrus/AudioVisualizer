import { describe, expect, it } from 'vitest';
import {
    DEFAULT_BENCH_TRACKS,
    formatBench,
    kickNote,
    median,
    nsPerFrame,
    parseBenchArguments,
    summarizeBench,
} from './benchTracker';

describe('parseBenchArguments', () => {
    it('prints the usage for no arguments and --help', () => {
        expect(parseBenchArguments([])).toBeUndefined();
        expect(parseBenchArguments(['--runs', '3', '-h'])).toBeUndefined();
    });

    it('has defaults and reads every option, adding .wav where it is missing', () => {
        expect(parseBenchArguments(['--runs', '7'])).toEqual({
            dir: '.debug-in',
            tracks: [...DEFAULT_BENCH_TRACKS],
            runs: 7,
            base: 'main',
        });
        expect(parseBenchArguments(['--dir', 'd', '--tracks', 'a, b.wav,', '--runs', '3', '--base', 'v1'])).toEqual({
            dir: 'd',
            tracks: ['a.wav', 'b.wav'],
            runs: 3,
            base: 'v1',
        });
    });

    it.each([
        [['--runs', '0'], /whole number/],
        [['--runs', '2.5'], /whole number/],
        [['--dir'], /needs a value/],
        [['--tracks', ','], /at least one/],
        [['--nope'], /Unknown argument/],
    ])('rejects %j', (argv, message) => {
        expect(() => parseBenchArguments(argv)).toThrow(message);
    });
});

describe('statistics', () => {
    it('takes medians and ns per frame', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 2, 3])).toBe(2.5);
        expect(median([])).toBeNaN();
        expect(nsPerFrame(1000, 4)).toBe(250);
    });

    it('summarizes per track and overall, with the ratio taken per pair', () => {
        const summary = summarizeBench([
            {
                track: 'a.wav',
                frames: 10,
                samples: [
                    { baseNs: 100, branchNs: 110 },
                    { baseNs: 200, branchNs: 200 },
                    { baseNs: 100, branchNs: 90 },
                ],
            },
            { track: 'b.wav', frames: 20, samples: [{ baseNs: 50, branchNs: 100 }] },
        ]);
        expect(summary.tracks[0]).toEqual({ track: 'a.wav', frames: 10, baseNs: 100, branchNs: 110, ratio: 1 });
        expect(summary.tracks[1].ratio).toBe(2);
        expect(summary.overall.baseNs).toBe(100);
        expect(summary.overall.ratio).toBe(1.05);
    });

    it('prints one row per track and an overall row', () => {
        const summary = summarizeBench([{ track: 'a.wav', frames: 10, samples: [{ baseNs: 100, branchNs: 105 }] }]);
        const lines = formatBench(summary, 'main', 1);
        expect(lines).toHaveLength(4);
        expect(lines[0]).toContain('base main');
        expect(lines[0]).toContain('(kickless)');
        expect(lines[2]).toContain('1.050');
        expect(lines[3]).toMatch(/^overall/);
    });

    it('labels the run and says whether the base side was given kicks', () => {
        const summary = summarizeBench([{ track: 'a.wav', frames: 10, samples: [{ baseNs: 100, branchNs: 105 }] }]);
        expect(formatBench(summary, 'main', 1, 'with kicks')[0]).toContain('(with kicks)');
        expect(kickNote(true)).toContain('both sides');
        expect(kickNote(false)).toContain('no pushKicks');
    });
});
