import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseLiveArgs } from './args';
import type { LiveFile } from './liveCells';
import type { JobResult, RecordJob, RecordOptions } from './record';
import { readLiveFile, runLive, type SessionDeps } from './session';

const dirs: string[] = [];
const makeDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'live-session-'));
    dirs.push(dir);
    return dir;
};
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const BEATS = [1, 2, 3, 4];
const SIDECAR = JSON.stringify({
    track: 'drums-128.wav',
    tempo: 60,
    beats: BEATS,
    source: 'synthetic',
    tapOffsetMs: 0,
});

// A recording in which cubes.out jumps 20 ms after every beat.
function csv(): string {
    const lines = ['t,cubes.out'];
    for (let i = 0; i <= 600; i++) {
        const t = i / 100;
        const high = BEATS.some((beat) => t >= beat + 0.02 - 1e-9 && t < beat + 0.12) ? 1 : 0;
        lines.push(`${t},${high}`);
    }
    return `${lines.join('\n')}\n`;
}

function writeRun(parent: string, name: string, viz: string, track: string): string {
    const path = join(parent, name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'telemetry.csv'), csv());
    writeFileSync(join(path, 'options.json'), JSON.stringify({ viz, track, from: 0, noNormalize: false }));
    return path;
}

function fakeDeps(out: string, failures = 0): { deps: SessionDeps; jobs: RecordJob[]; log: string[] } {
    const jobs: RecordJob[] = [];
    const log: string[] = [];
    let count = 0;
    const deps: SessionDeps = {
        revision: 'abc',
        created: '2026-11-17T00:00:00.000Z',
        log: (line) => log.push(line),
        recordJob: async (options: RecordOptions, job: RecordJob): Promise<JobResult> => {
            jobs.push(job);
            if (jobs.length <= failures) return { folders: [], code: 1, tail: 'boom' };
            const folders = Array.from({ length: job.reselect }, (_, play) =>
                writeRun(
                    out,
                    `${options.viz}-x-2026-11-0${++count}T00-00-00-000Z-play${play + 1}`,
                    options.viz,
                    options.track,
                ),
            );
            return { folders, code: 0, tail: '' };
        },
    };
    return { deps, jobs, log };
}

describe('runLive in record mode', () => {
    it('records 4 runs of a track as 3 jobs, one at a time, and writes the live file', async () => {
        const music = makeDir();
        const runs = makeDir();
        const outFile = join(makeDir(), 'live.json');
        writeFileSync(join(music, 'drums-128.wav'), 'x');
        writeFileSync(join(music, 'drums-128.beats.json'), SIDECAR);
        const { deps, jobs } = fakeDeps(runs);
        const args = parseLiveArgs(['--viz', 'cubes', '--dir', music, '--tracks', 'drums-128.wav', '--out', outFile]);
        const file = await runLive(args, deps);
        expect(jobs).toEqual([{ reselect: 1 }, { reselect: 1 }, { reselect: 2 }]);
        const hit = file.cells.find((cell) => cell.metric === 'live.hit.share50ms');
        expect(hit).toMatchObject({
            value: 1,
            runs: 4,
            status: 'pass',
            visualizer: 'cubes',
            source: 'live',
            blocking: false,
        });
        expect(file.cells.find((cell) => cell.metric === 'live.reaction.latencyMs')?.value).toBeCloseTo(20);
        expect(file.cells.find((cell) => cell.metric === 'live.falseFire.share')?.value).toBe(0);
        expect(existsSync(outFile)).toBe(true);
        expect((JSON.parse(readFileSync(outFile, 'utf8')) as LiveFile).runValues.length).toBe(3);
    });

    it('logs a failed job, leaves its runs out and continues', async () => {
        const music = makeDir();
        const outFile = join(makeDir(), 'live.json');
        writeFileSync(join(music, 'drums-128.wav'), 'x');
        writeFileSync(join(music, 'drums-128.beats.json'), SIDECAR);
        const { deps, log } = fakeDeps(makeDir(), 1);
        const args = parseLiveArgs(['--viz', 'cubes', '--dir', music, '--tracks', 'drums-128.wav', '--out', outFile]);
        const file = await runLive(args, deps);
        expect(log.join('\n')).toMatch(/job 1\/3 failed/);
        // 3 runs remain: 1 fresh and the 2-play page.
        expect(file.cells.find((cell) => cell.metric === 'live.hit.share50ms')).toMatchObject({
            runs: 3,
            status: 'pass',
        });
    });

    it('gives unavailable cells for a track that is not in the folder, and n/a ones for a track with no kick', async () => {
        const music = makeDir();
        const outFile = join(makeDir(), 'live.json');
        const { deps, jobs } = fakeDeps(makeDir());
        const args = parseLiveArgs([
            '--viz',
            'cubes',
            '--dir',
            music,
            '--tracks',
            'drums-128.wav,click-90.wav',
            '--out',
            outFile,
        ]);
        const file = await runLive(args, deps);
        expect(jobs).toEqual([]);
        const statuses = (track: string) =>
            file.cells.filter((cell) => cell.track === track).map((cell) => cell.status);
        expect(new Set(statuses('drums-128.wav'))).toEqual(new Set(['unavailable']));
        expect(new Set(statuses('click-90.wav'))).toEqual(new Set(['n/a']));
    });

    it('makes the beat metrics unavailable when no sidecar exists', async () => {
        const music = makeDir();
        const outFile = join(makeDir(), 'live.json');
        writeFileSync(join(music, 'drums-128.wav'), 'x');
        const { deps, log } = fakeDeps(makeDir());
        const args = parseLiveArgs(['--viz', 'cubes', '--dir', music, '--tracks', 'drums-128.wav', '--out', outFile]);
        const file = await runLive(args, deps);
        expect(log.join('\n')).toMatch(/no \.beats\.json/);
        expect(file.cells.find((cell) => cell.metric === 'live.hit.share50ms')?.status).toBe('unavailable');
    });
});

describe('runLive in ingest mode', () => {
    it('reads folders, keeps the newest per track, and fills pre-hub without touching the value', async () => {
        const music = makeDir();
        writeFileSync(join(music, 'drums-128.beats.json'), SIDECAR);
        const parent = makeDir();
        for (let i = 1; i <= 5; i++)
            writeRun(parent, `cubes-drums-128-2026-11-0${i}T00-00-00-000Z`, 'cubes', 'drums-128.wav');
        writeRun(parent, 'dancing-character-drums-128-2026-11-01T00-00-00-000Z', 'dancing-character', 'drums-128.wav');
        const outFile = join(makeDir(), 'live.json');
        const { deps, log } = fakeDeps(makeDir());
        const base = ['--viz', 'cubes', '--dir', music, '--out', outFile, '--ingest', parent];
        const current = await runLive(parseLiveArgs(base), deps);
        expect(log.join('\n')).toMatch(/drums-128.wav: 4 run\(s\) ingested/);
        expect(current.cells.find((cell) => cell.metric === 'live.hit.share50ms')).toMatchObject({
            runs: 4,
            prehub: null,
        });
        // Only the ingested track has cells.
        expect(new Set(current.cells.map((cell) => cell.track))).toEqual(new Set(['drums-128.wav']));

        const both = await runLive(parseLiveArgs([...base, '--prehub', '--runs', '3']), deps);
        expect(both.cells.find((cell) => cell.metric === 'live.hit.share50ms')).toMatchObject({
            value: 1,
            prehub: 1,
            runs: 4,
        });
        const stored = both.runValues.find((entry) => entry.metric === 'live.hit.share50ms');
        expect(stored?.current).toHaveLength(4);
        expect(stored?.prehub).toHaveLength(3);
    });

    it('logs a path with no run folders', async () => {
        const { deps, log } = fakeDeps(makeDir());
        const outFile = join(makeDir(), 'live.json');
        const file = await runLive(
            parseLiveArgs(['--viz', 'cubes', '--out', outFile, '--ingest', join(makeDir(), 'nope')]),
            deps,
        );
        expect(log.join('\n')).toMatch(/no run folders found/);
        expect(file.cells).toEqual([]);
    });
});

describe('readLiveFile', () => {
    it('is undefined without a file, and drops a file of another targets version with a warning', () => {
        const dir = makeDir();
        const log: string[] = [];
        const path = join(dir, 'live.json');
        expect(readLiveFile(path, (line) => log.push(line))).toBeUndefined();
        writeFileSync(path, JSON.stringify({ header: { targetsVersion: 1 }, cells: [], runValues: [] }));
        expect(readLiveFile(path, (line) => log.push(line))).toBeUndefined();
        expect(log.join('\n')).toMatch(/targets version 1/);
    });
});
