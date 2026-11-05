import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAudioFiles, parseArgs, scheduleShots, trackBaseName, USAGE } from './args';

const base = ['--dir', 'music', '--track', 'a.mp3', '--viz', 'cubes'];

function run(extra: string[] = []) {
    const parsed = parseArgs([...base, ...extra]);
    if (parsed.kind !== 'run') throw new Error(`expected run, got ${JSON.stringify(parsed)}`);
    return parsed.args;
}

describe('parseArgs', () => {
    it('returns help for --help and -h, even after other flags', () => {
        expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
        expect(parseArgs(['-h'])).toEqual({ kind: 'help' });
        expect(parseArgs([...base, '--help'])).toEqual({ kind: 'help' });
    });

    it('applies defaults', () => {
        expect(run()).toEqual({
            dir: 'music',
            track: 'a.mp3',
            viz: 'cubes',
            seconds: undefined,
            from: 0,
            shots: [],
            headless: false,
        });
    });

    it('reads every flag', () => {
        expect(run(['--seconds', '12.5', '--from', '3', '--shots', '5,1', '--headless'])).toEqual({
            dir: 'music',
            track: 'a.mp3',
            viz: 'cubes',
            seconds: 12.5,
            from: 3,
            shots: [1, 5],
            headless: true,
        });
    });

    it('sorts and de-duplicates shots and ignores blank entries', () => {
        expect(run(['--shots', '4, 2,,4,0']).shots).toEqual([0, 2, 4]);
    });

    it.each([
        ['dir', ['--track', 'a.mp3', '--viz', 'cubes']],
        ['track', ['--dir', 'music', '--viz', 'cubes']],
        ['viz', ['--dir', 'music', '--track', 'a.mp3']],
    ])('reports a missing --%s', (name, argv) => {
        expect(parseArgs(argv)).toEqual({ kind: 'error', message: `Missing --${name}. ${USAGE}` });
    });

    it('rejects an unknown flag', () => {
        expect(parseArgs([...base, '--bogus'])).toEqual({
            kind: 'error',
            message: `Unknown argument "--bogus". ${USAGE}`,
        });
    });

    it('rejects a flag without a value', () => {
        expect(parseArgs(['--dir'])).toEqual({ kind: 'error', message: '--dir needs a value.' });
        expect(parseArgs(['--dir', '--track', 'a'])).toEqual({ kind: 'error', message: '--dir needs a value.' });
    });

    it.each(['abc', '-5', '', ' '])('rejects --seconds "%s"', (text) => {
        const parsed = parseArgs([...base, '--seconds', text]);
        expect(parsed.kind).toBe('error');
        // "-5" is a value, not a flag, so it reaches the number check.
        expect(parsed).toEqual({
            kind: 'error',
            message: `--seconds needs a non-negative number, got "${text}".`,
        });
    });

    it('rejects --seconds 0', () => {
        expect(parseArgs([...base, '--seconds', '0'])).toEqual({
            kind: 'error',
            message: '--seconds must be greater than 0.',
        });
    });

    it('rejects a bad --from', () => {
        expect(parseArgs([...base, '--from', 'x'])).toEqual({
            kind: 'error',
            message: '--from needs a non-negative number, got "x".',
        });
        expect(parseArgs([...base, '--from', '-1']).kind).toBe('error');
    });

    it('rejects malformed --shots', () => {
        expect(parseArgs([...base, '--shots', '1,abc'])).toEqual({
            kind: 'error',
            message: '--shots needs a non-negative number, got "abc".',
        });
    });
});

describe('listAudioFiles', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'args-test-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('keeps audio files case-insensitively, sorted, and drops other files', () => {
        for (const name of ['b.WAV', 'a.mp3', 'c.flac', 'd.ogg', 'e.m4a', 'notes.txt', 'mp3']) {
            writeFileSync(join(dir, name), '');
        }
        expect(listAudioFiles(dir)).toEqual(['a.mp3', 'b.WAV', 'c.flac', 'd.ogg', 'e.m4a']);
    });

    it('returns an empty list for an empty folder', () => {
        expect(listAudioFiles(dir)).toEqual([]);
    });

    it('throws for a missing folder', () => {
        expect(() => listAudioFiles(join(dir, 'missing'))).toThrow();
    });

    it('ignores directories whose names end in an audio extension', () => {
        mkdirSync(join(dir, 'album.mp3'));
        writeFileSync(join(dir, 'real.wav'), '');
        expect(listAudioFiles(dir)).toEqual(['real.wav']);
    });
});

describe('scheduleShots', () => {
    it('splits shots into due and skipped, keeping order', () => {
        expect(scheduleShots([1, 5, 10, 20], 10)).toEqual({ due: [1, 5, 10], skipped: [20] });
    });

    it('keeps duplicates as given', () => {
        expect(scheduleShots([2, 2, 30, 30], 10)).toEqual({ due: [2, 2], skipped: [30, 30] });
    });

    it('handles no shots', () => {
        expect(scheduleShots([], 10)).toEqual({ due: [], skipped: [] });
    });
});

describe('trackBaseName', () => {
    it('strips folders and the extension', () => {
        expect(trackBaseName('C:\\music\\song.mp3')).toBe('song');
        expect(trackBaseName('/a/b/song.v2.flac')).toBe('song.v2');
    });

    it('replaces unsafe characters', () => {
        expect(trackBaseName('my song (live)!.wav')).toBe('my_song_live_');
    });

    it('keeps a name without an extension', () => {
        expect(trackBaseName('plain')).toBe('plain');
    });
});
