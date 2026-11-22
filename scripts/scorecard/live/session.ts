// One `scorecard:live` invocation: gather the runs (record them or read existing folders), measure them and fold the
// result into the live file. The process-starting recorder is passed in so the flow is tested with a fake.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { EXPECTED_TRACKS, resolveTrack } from '../tracks';
import { TARGETS_VERSION } from '../targets';
import type { BeatSidecar } from '../../../app/features/rhythm/eval/evalTypes';
import type { LiveArgs } from './args';
import { measureRuns, type MeasuredRun } from './collect';
import { clipReport, clipSkippedShare, clipSpanShare } from './measures';
import { discoverRunFolders, describeRunFolder, groupRunFolders, loadRun, readSidecar, type RunFolder } from './ingest';
import { mergeLiveFile, liveMetricsFor, type LiveFile, type RunValue, type TrackUpdate } from './liveCells';
import { planJobs, type JobResult, type RecordJob, type RecordOptions } from './record';

export interface SessionDeps {
    recordJob: (options: RecordOptions, job: RecordJob) => Promise<JobResult>;
    revision: string;
    created: string;
    log: (line: string) => void;
}

// Reads the live file, or undefined when there is none. A file from another targets version is dropped with a warning:
// its floors and metric definitions are not this build's, so mixing its cells in would be meaningless.
export function readLiveFile(path: string, log: (line: string) => void): LiveFile | undefined {
    if (!existsSync(path)) return undefined;
    const file = JSON.parse(readFileSync(path, 'utf8')) as LiveFile;
    if (file.header?.targetsVersion !== TARGETS_VERSION) {
        log(
            `warning: ${path} is targets version ${file.header?.targetsVersion}, this build is ${TARGETS_VERSION}; starting a new live file`,
        );
        return undefined;
    }
    return { ...file, runValues: file.runValues ?? [] };
}

export function writeLiveFile(path: string, file: LiveFile): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

const stemOf = (track: string): string => track.replace(/\.[^.\\/]*$/, '');

function updateFrom(
    track: string,
    sidecar: BeatSidecar | undefined,
    runs: readonly MeasuredRun[],
    viz: LiveArgs['viz'],
): TrackUpdate {
    return {
        track,
        class: resolveTrack(track, sidecar?.source).class,
        values: measureRuns(viz!, runs),
    };
}

const emptyUpdate = (track: string, sidecar: BeatSidecar | undefined): TrackUpdate => ({
    track,
    class: resolveTrack(track, sidecar?.source).class,
    values: new Map<string, RunValue[]>(),
});

// Record mode: the tracks in scope are --tracks, else every expected track. A track no metric of this visualizer applies
// to gets n/a cells, and a track whose WAV is missing from the folder gets unavailable cells, so neither is skipped
// silently. Recordings run strictly one after another: they are real time and CPU sensitive.
async function recordUpdates(args: LiveArgs, deps: SessionDeps): Promise<TrackUpdate[]> {
    const viz = args.viz!;
    const dir = resolve(args.dir);
    const names = args.tracks ?? EXPECTED_TRACKS.map((track) => track.name);
    const updates: TrackUpdate[] = [];
    for (const track of names) {
        const sidecar = readSidecar(join(dir, `${stemOf(track)}.beats.json`));
        const resolved = resolveTrack(track, sidecar?.source);
        if (!liveMetricsFor(viz).some((metric) => metric.applies(resolved.class, resolved.kick))) {
            updates.push(emptyUpdate(track, sidecar));
            continue;
        }
        if (!existsSync(join(dir, track))) {
            deps.log(`${track}: not in ${dir}; its cells are unavailable`);
            updates.push(emptyUpdate(track, sidecar));
            continue;
        }
        const folders: RunFolder[] = [];
        const jobs = planJobs(args.runs);
        for (const [index, job] of jobs.entries()) {
            const started = Date.now();
            const result = await deps.recordJob(
                { dir, track, viz, seconds: args.seconds, headless: args.headless },
                job,
            );
            const seconds = ((Date.now() - started) / 1000).toFixed(1);
            if (result.code !== 0 || result.folders.length === 0) {
                deps.log(
                    `${track}: job ${index + 1}/${jobs.length} failed after ${seconds} s (${result.tail}); ${job.reselect} run(s) missing`,
                );
                continue;
            }
            deps.log(
                `${track}: job ${index + 1}/${jobs.length} recorded ${result.folders.length} run(s) in ${seconds} s`,
            );
            for (const path of result.folders) {
                const folder = describeRunFolder(path);
                if (folder) folders.push(folder);
                else deps.log(`${track}: ${path} has no readable options.json; run left out`);
            }
        }
        updates.push(measuredUpdate(track, folders, dir, viz, deps));
    }
    return updates;
}

function measuredUpdate(
    track: string,
    folders: readonly RunFolder[],
    dir: string | undefined,
    viz: LiveArgs['viz'],
    deps: SessionDeps,
): TrackUpdate {
    const loaded = folders.flatMap((folder) => {
        try {
            return [loadRun(folder, dir)];
        } catch (error) {
            deps.log(`${track}: ${folder.path} could not be read (${(error as Error).message}); run left out`);
            return [];
        }
    });
    const sidecar = loaded.find((run) => run.sidecar !== undefined)?.sidecar;
    if (loaded.length > 0 && sidecar === undefined) {
        deps.log(`${track}: no .beats.json found; the metrics that need beats are unavailable`);
    }
    // The clip metric (dancer only) compares within the bar only where enough runs are meter-locked on loops of a bar or
    // more; say how much of it fell back to the beat and how much of the span was scored, so a thin cell can be seen.
    if (viz === 'dancing-character' && loaded.length > 1) {
        const report = clipReport(loaded.map((run) => run.table));
        if (report.spanSamples > 0) {
            deps.log(
                `${track}: clip scored ${Math.round(100 * clipSpanShare(report))}% of the span, ${Math.round(100 * clipSkippedShare(report))}% of that on the beat unit (bar comparison skipped)`,
            );
        }
    }
    return updateFrom(
        track,
        sidecar,
        loaded.map((run) => ({ table: run.table, beats: run.sidecar?.beats })),
        viz,
    );
}

// Ingest mode: every argument is a run folder or a parent of run folders; only the tracks that have runs are updated.
function ingestUpdates(args: LiveArgs, deps: SessionDeps): TrackUpdate[] {
    const viz = args.viz!;
    const all: RunFolder[] = [];
    for (const path of args.ingest) {
        const found = discoverRunFolders(resolve(path));
        if (found.length === 0) deps.log(`${path}: no run folders found`);
        for (const folderPath of found) {
            const folder = describeRunFolder(folderPath);
            if (folder) all.push(folder);
        }
    }
    const groups = groupRunFolders(all, viz, args.tracks, args.runs);
    const dir = existsSync(resolve(args.dir)) ? resolve(args.dir) : undefined;
    return [...groups.entries()].map(([track, folders]) => {
        deps.log(`${track}: ${folders.length} run(s) ingested`);
        return measuredUpdate(track, folders, dir, viz, deps);
    });
}

export async function runLive(args: LiveArgs, deps: SessionDeps): Promise<LiveFile> {
    const out = resolve(args.out);
    const existing = readLiveFile(out, deps.log);
    const updates = args.ingest.length > 0 ? ingestUpdates(args, deps) : await recordUpdates(args, deps);
    const file = mergeLiveFile(existing, updates, {
        viz: args.viz!,
        prehub: args.prehub,
        revision: deps.revision,
        created: deps.created,
    });
    writeLiveFile(out, file);
    return file;
}
