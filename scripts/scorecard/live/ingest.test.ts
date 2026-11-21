import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    describeRunFolder,
    discoverRunFolders,
    groupRunFolders,
    isRunFolder,
    loadRun,
    newestRunFolders,
    parseFolderStamp,
    readSidecar,
    type RunFolder,
} from './ingest';

const dirs: string[] = [];
const makeDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'live-ingest-'));
    dirs.push(dir);
    return dir;
};
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SIDECAR = JSON.stringify({ track: 'a.wav', tempo: 120, beats: [1, 2], source: 'tapped', tapOffsetMs: 0 });

function writeRun(parent: string, name: string, viz: string, track: string, withBeats = false): string {
    const path = join(parent, name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'telemetry.csv'), 't,cubes.out\n0,0\n1,1\n');
    writeFileSync(join(path, 'options.json'), JSON.stringify({ viz, track, from: 0, noNormalize: false }) + '\n');
    if (withBeats) writeFileSync(join(path, 'track.beats.json'), SIDECAR);
    return path;
}

describe('parseFolderStamp', () => {
    it('reads the stamp and the play number', () => {
        expect(parseFolderStamp('cubes-a-2026-11-06T00-29-55-997Z')).toEqual({
            stamp: '2026-11-06T00-29-55-997Z',
            play: 1,
        });
        expect(parseFolderStamp('cubes-a-2026-11-06T00-29-55-997Z-play2')).toEqual({
            stamp: '2026-11-06T00-29-55-997Z',
            play: 2,
        });
        expect(parseFolderStamp('something-else')).toEqual({ stamp: '', play: 1 });
    });
});

describe('finding run folders', () => {
    it('takes a run folder as itself and a parent as its run-folder children', () => {
        const parent = makeDir();
        const one = writeRun(parent, 'cubes-a-2026-11-06T00-29-55-997Z', 'cubes', 'a.wav');
        mkdirSync(join(parent, 'not-a-run'));
        writeFileSync(join(parent, 'file.txt'), 'x');
        expect(isRunFolder(one)).toBe(true);
        expect(discoverRunFolders(one)).toEqual([one]);
        expect(discoverRunFolders(parent)).toEqual([one]);
        expect(discoverRunFolders(join(parent, 'missing'))).toEqual([]);
        expect(discoverRunFolders(join(parent, 'file.txt'))).toEqual([]);
    });

    it('describes a folder from options.json and its name', () => {
        const parent = makeDir();
        const path = writeRun(parent, 'cubes-a-2026-11-06T00-29-55-997Z-play2', 'cubes', 'a.wav');
        expect(describeRunFolder(path)).toEqual({
            path,
            viz: 'cubes',
            track: 'a.wav',
            stamp: '2026-11-06T00-29-55-997Z',
            play: 2,
        });
        writeFileSync(join(path, 'options.json'), '{"viz":1}');
        expect(describeRunFolder(path)).toBeNull();
        writeFileSync(join(path, 'options.json'), 'not json');
        expect(describeRunFolder(path)).toBeNull();
    });
});

describe('choosing runs', () => {
    const folder = (viz: string, track: string, stamp: string, play = 1): RunFolder => ({
        path: `${viz}/${track}/${stamp}/${play}`,
        viz,
        track,
        stamp,
        play,
    });

    it('orders by stamp, then play, newest first, and cuts to the count', () => {
        const folders = [
            folder('cubes', 'a.wav', '2026-11-06T00-00-00-000Z'),
            folder('cubes', 'a.wav', '2026-11-07T00-00-00-000Z', 1),
            folder('cubes', 'a.wav', '2026-11-07T00-00-00-000Z', 2),
        ];
        expect(newestRunFolders(folders, 2).map((f) => f.play)).toEqual([2, 1]);
        expect(newestRunFolders(folders, 2).every((f) => f.stamp.startsWith('2026-11-07'))).toBe(true);
    });

    it('keeps only the visualizer and tracks asked for, grouped by track', () => {
        const folders = [
            folder('cubes', 'a.wav', '2026-11-06T00-00-00-000Z'),
            folder('cubes', 'b.wav', '2026-11-06T00-00-00-000Z'),
            folder('dancing-character', 'a.wav', '2026-11-06T00-00-00-000Z'),
            folder('cubes', 'a.wav', '2026-11-08T00-00-00-000Z'),
        ];
        const groups = groupRunFolders(folders, 'cubes', undefined, 1);
        expect([...groups.keys()]).toEqual(['a.wav', 'b.wav']);
        expect(groups.get('a.wav')?.[0].stamp).toBe('2026-11-08T00-00-00-000Z');
        expect([...groupRunFolders(folders, 'cubes', ['b.wav'], 4).keys()]).toEqual(['b.wav']);
    });
});

describe('order runs', () => {
    it('are read with their then/after and left out of live grouping', () => {
        const parent = makeDir();
        const lead = writeRun(parent, 'cubes-a-2026-11-06T00-29-55-997Z-play1', 'cubes', 'a.wav');
        writeFileSync(
            join(lead, 'options.json'),
            JSON.stringify({ viz: 'cubes', track: 'a.wav', from: 0, noNormalize: false, then: 'bass-ink' }),
        );
        const follow = writeRun(parent, 'bass-ink-a-2026-11-06T00-29-55-997Z-play2', 'bass-ink', 'a.wav');
        writeFileSync(
            join(follow, 'options.json'),
            JSON.stringify({ viz: 'bass-ink', track: 'a.wav', from: 0, noNormalize: false, after: 'cubes' }),
        );
        const plain = writeRun(parent, 'cubes-a-2026-11-07T00-29-55-997Z', 'cubes', 'a.wav');
        const described = [lead, follow, plain].map((path) => describeRunFolder(path)!);
        expect(described[0].then).toBe('bass-ink');
        expect(described[1].after).toBe('cubes');
        expect(described[2].then).toBeUndefined();
        const groups = groupRunFolders(described, 'cubes', undefined, 4);
        expect(groups.get('a.wav')?.map((folder) => folder.path)).toEqual([plain]);
        expect(groupRunFolders(described, 'bass-ink', undefined, 4).size).toBe(0);
    });
});

describe('loading a run', () => {
    it('reads the telemetry and the run folder copy of the sidecar', () => {
        const parent = makeDir();
        const path = writeRun(parent, 'cubes-a-2026-11-06T00-29-55-997Z', 'cubes', 'a.wav', true);
        const run = loadRun(describeRunFolder(path)!, undefined);
        expect(run.table.columns).toEqual(['t', 'cubes.out']);
        expect(run.sidecar?.beats).toEqual([1, 2]);
    });

    it('falls back to the sidecar beside the audio, and to none', () => {
        const parent = makeDir();
        const music = makeDir();
        const path = writeRun(parent, 'cubes-a-2026-11-06T00-29-55-997Z', 'cubes', 'a.wav');
        const folder = describeRunFolder(path)!;
        expect(loadRun(folder, music).sidecar).toBeUndefined();
        expect(loadRun(folder, undefined).sidecar).toBeUndefined();
        writeFileSync(join(music, 'a.beats.json'), SIDECAR);
        expect(loadRun(folder, music).sidecar?.beats).toEqual([1, 2]);
        writeFileSync(join(music, 'a.beats.json'), '{}');
        expect(readSidecar(join(music, 'a.beats.json'))).toBeUndefined();
    });
});
