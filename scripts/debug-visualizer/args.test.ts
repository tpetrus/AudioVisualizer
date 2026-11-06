import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type TestContext } from 'vitest';
import {
    chooseReference,
    listAudioFiles,
    parseArgs,
    parseRepeatArgs,
    parseSummaryArgs,
    playFolderName,
    REPEAT_USAGE,
    scheduleShots,
    sidecarName,
    SUMMARY_USAGE,
    trackBaseName,
    USAGE,
} from './args';
import { parseBpmSidecar } from './tempoReport';

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
            reselect: 1,
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
            reselect: 1,
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

    it('lets the last repeated flag win', () => {
        expect(run(['--viz', 'waves']).viz).toBe('waves');
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

    it('sorts by code unit, so upper case names come first', () => {
        for (const name of ['alpha.mp3', 'Zed.mp3', 'beta.mp3']) writeFileSync(join(dir, name), '');
        expect(listAudioFiles(dir)).toEqual(['Zed.mp3', 'alpha.mp3', 'beta.mp3']);
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

describe('listAudioFiles with symlinks', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'args-link-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    // Creating links can need privileges on Windows; skip the spec then instead of failing.
    function link(ctx: TestContext, target: string, name: string, type?: 'dir' | 'file') {
        try {
            symlinkSync(target, join(dir, name), type);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EPERM') ctx.skip();
            else throw error;
        }
    }

    it('lists a symlink to a file and ignores links to folders and broken links', (ctx) => {
        writeFileSync(join(dir, 'real.flac'), '');
        mkdirSync(join(dir, 'folder'));
        link(ctx, join(dir, 'real.flac'), 'linked.ogg', 'file');
        link(ctx, join(dir, 'folder'), 'x.mp3', 'dir');
        link(ctx, join(dir, 'gone.wav'), 'y.wav', 'file');
        expect(listAudioFiles(dir)).toEqual(['linked.ogg', 'real.flac']);
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

describe('parseArgs --reselect', () => {
    it('reads a whole number', () => {
        expect(run(['--reselect', '3']).reselect).toBe(3);
    });

    it.each(['0', '-1', '1.5', 'two', ' '])('rejects %j', (value) => {
        expect(parseArgs([...base, '--reselect', value])).toEqual({
            kind: 'error',
            message: `--reselect needs a whole number of at least 1, got "${value}".`,
        });
    });

    it('needs a value', () => {
        expect(parseArgs([...base, '--reselect'])).toEqual({ kind: 'error', message: '--reselect needs a value.' });
    });

    it('rejects shots with more than one play, but allows them with one', () => {
        expect(parseArgs([...base, '--reselect', '2', '--shots', '5'])).toEqual({
            kind: 'error',
            message: '--reselect above 1 cannot be combined with --shots.',
        });
        expect(run(['--reselect', '1', '--shots', '5']).shots).toEqual([5]);
    });

    it('mentions --reselect in the usage text', () => {
        expect(USAGE).toContain('--reselect N');
    });
});

describe('sidecarName and playFolderName', () => {
    it('replaces the extension with .bpm', () => {
        expect(sidecarName('song.mp3')).toBe('song.bpm');
        expect(sidecarName('my.song.flac')).toBe('my.song.bpm');
        expect(sidecarName('noext')).toBe('noext.bpm');
        expect(sidecarName('sub/dir\\song.wav')).toBe('song.bpm');
    });

    it('keeps the plain name for one play and suffixes each of several', () => {
        expect(playFolderName('cubes', 'a b.mp3', 'S', 1, 1)).toBe('cubes-a_b-S');
        expect(playFolderName('cubes', 'a.mp3', 'S', 2, 3)).toBe('cubes-a-S-play2');
        expect(playFolderName('cubes', 'a.mp3', 'S', 1, 3)).not.toBe(playFolderName('cubes', 'a.mp3', 'S', 2, 3));
    });
});

describe('chooseReference', () => {
    it('prefers --bpm and ignores the sidecar', () => {
        expect(chooseReference(100, '128', 'track.bpm', parseBpmSidecar)).toEqual({ bpm: 100, warning: undefined });
    });

    it('uses the sidecar when there is no flag', () => {
        expect(chooseReference(undefined, '128\n', 'track.bpm', parseBpmSidecar)).toEqual({
            bpm: 128,
            warning: undefined,
        });
    });

    it('has none without either', () => {
        expect(chooseReference(undefined, undefined, 'track.bpm', parseBpmSidecar)).toEqual({
            bpm: undefined,
            warning: undefined,
        });
    });

    it('warns once about a bad sidecar and counts it as none', () => {
        const result = chooseReference(undefined, 'fast', 'track.bpm', parseBpmSidecar);
        expect(result.bpm).toBeUndefined();
        expect(result.warning).toBe('Warning: track.bpm does not hold a tempo above 0; ignoring it.');
    });
});

describe('parseSummaryArgs', () => {
    it('reads the path, --bpm and --window', () => {
        expect(parseSummaryArgs(['a.csv', '--bpm', '120', '--window', '2.5'])).toEqual({
            kind: 'run',
            args: { path: 'a.csv', bpm: 120, window: 2.5 },
        });
        expect(parseSummaryArgs(['--bpm', '90', 'a.csv'])).toEqual({
            kind: 'run',
            args: { path: 'a.csv', bpm: 90, window: undefined },
        });
    });

    it('returns help and usage errors', () => {
        expect(parseSummaryArgs(['--help'])).toEqual({ kind: 'help' });
        expect(parseSummaryArgs([])).toEqual({ kind: 'error', message: SUMMARY_USAGE });
        expect(parseSummaryArgs(['a.csv', 'b.csv'])).toEqual({ kind: 'error', message: SUMMARY_USAGE });
    });

    it('rejects unknown flags, missing values and bad numbers', () => {
        expect(parseSummaryArgs(['a.csv', '--x'])).toEqual({
            kind: 'error',
            message: `Unknown argument "--x". ${SUMMARY_USAGE}`,
        });
        expect(parseSummaryArgs(['a.csv', '--bpm'])).toEqual({
            kind: 'error',
            message: `--bpm needs a value. ${SUMMARY_USAGE}`,
        });
        expect(parseSummaryArgs(['a.csv', '--bpm', '0'])).toEqual({
            kind: 'error',
            message: '--bpm needs a number above 0, got "0".',
        });
        expect(parseSummaryArgs(['a.csv', '--window', 'x'])).toEqual({
            kind: 'error',
            message: '--window needs a number above 0, got "x".',
        });
    });
});

describe('parseRepeatArgs', () => {
    it('reads two or more paths and --bpm', () => {
        expect(parseRepeatArgs(['a.csv', 'b.csv', 'c.csv', '--bpm', '100'])).toEqual({
            kind: 'run',
            args: { paths: ['a.csv', 'b.csv', 'c.csv'], bpm: 100 },
        });
        expect(parseRepeatArgs(['a.csv', 'b.csv'])).toEqual({
            kind: 'run',
            args: { paths: ['a.csv', 'b.csv'], bpm: undefined },
        });
    });

    it('prints usage when fewer than two paths are given', () => {
        expect(parseRepeatArgs([])).toEqual({ kind: 'error', message: REPEAT_USAGE });
        expect(parseRepeatArgs(['a.csv'])).toEqual({ kind: 'error', message: REPEAT_USAGE });
        expect(parseRepeatArgs(['-h'])).toEqual({ kind: 'help' });
    });

    it('rejects unknown flags and a bad --bpm', () => {
        expect(parseRepeatArgs(['a.csv', 'b.csv', '--nope'])).toEqual({
            kind: 'error',
            message: `Unknown argument "--nope". ${REPEAT_USAGE}`,
        });
        expect(parseRepeatArgs(['a.csv', 'b.csv', '--bpm', '-3'])).toEqual({
            kind: 'error',
            message: '--bpm needs a number above 0, got "-3".',
        });
    });
});
