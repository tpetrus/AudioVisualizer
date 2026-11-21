// Reading debug:viz output folders: finding run folders, ordering them by when they were recorded, and loading a run's
// telemetry and beat truth. The naming rule is playFolderName in scripts/debug-visualizer/args.ts: `<viz>-<track>-<stamp>`
// with `-play<N>` appended when one page played the track several times; the stamp is an ISO time with ":" and "." turned
// into "-". Copied here as a pattern because that module's helper only builds the name.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import type { BeatSidecar } from '../../../app/features/rhythm/eval/evalTypes';
import { parseBeatSidecar } from '../../../app/features/rhythm/eval/sidecar';
import { parseCsv } from '../../debug-visualizer/csv';

export interface RunFolder {
    path: string;
    viz: string;
    track: string;
    // Sortable: the folder's ISO-like stamp, or '' when the name carries none.
    stamp: string;
    play: number;
    // Set only by `debug:viz --then` order runs (the visualizer played next, or the one played before). Live cells are
    // measured on fresh page loads, so a folder with either is not a live-cell run.
    then?: string;
    after?: string;
}

const STAMP = /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-play(\d+))?$/;

// The stamp and play number a folder name ends with; ('', 1) when it has none.
export function parseFolderStamp(name: string): { stamp: string; play: number } {
    const match = STAMP.exec(name);
    return match ? { stamp: match[1], play: match[2] === undefined ? 1 : Number(match[2]) } : { stamp: '', play: 1 };
}

export const isRunFolder = (path: string): boolean =>
    existsSync(join(path, 'telemetry.csv')) && existsSync(join(path, 'options.json'));

// A run folder is itself; any other folder is a parent whose run-folder children are the runs. A path that does not exist
// gives none.
export function discoverRunFolders(path: string): string[] {
    if (!existsSync(path) || !statSync(path).isDirectory()) return [];
    if (isRunFolder(path)) return [path];
    return readdirSync(path)
        .map((name) => join(path, name))
        .filter((child) => statSync(child).isDirectory() && isRunFolder(child));
}

// The folder's identity from options.json (what the run played) and its name (when). null when options.json is unreadable.
export function describeRunFolder(path: string): RunFolder | null {
    try {
        const options = JSON.parse(readFileSync(join(path, 'options.json'), 'utf8')) as {
            viz?: unknown;
            track?: unknown;
            then?: unknown;
            after?: unknown;
        };
        if (typeof options.viz !== 'string' || typeof options.track !== 'string') return null;
        const name =
            path
                .replace(/[\\/]+$/, '')
                .split(/[\\/]/)
                .pop() ?? '';
        return {
            path,
            viz: options.viz,
            track: options.track,
            ...parseFolderStamp(name),
            ...(typeof options.then === 'string' ? { then: options.then } : {}),
            ...(typeof options.after === 'string' ? { after: options.after } : {}),
        };
    } catch {
        return null;
    }
}

// The newest `count` folders, newest first: by stamp, then by play number within one stamp.
export function newestRunFolders(folders: readonly RunFolder[], count: number): RunFolder[] {
    return [...folders]
        .sort((a, b) => (a.stamp === b.stamp ? b.play - a.play : a.stamp < b.stamp ? 1 : -1))
        .slice(0, count);
}

// Folders of `viz`, optionally of the listed tracks, grouped by track, each group cut to its `count` newest. Order runs
// (a `then` or `after` in options.json) are left out: they belong to scorecard:order, not to a live cell.
export function groupRunFolders(
    folders: readonly RunFolder[],
    viz: string,
    tracks: readonly string[] | undefined,
    count: number,
): Map<string, RunFolder[]> {
    const groups = new Map<string, RunFolder[]>();
    for (const folder of folders) {
        if (folder.then !== undefined || folder.after !== undefined) continue;
        if (folder.viz !== viz || (tracks !== undefined && !tracks.includes(folder.track))) continue;
        groups.set(folder.track, [...(groups.get(folder.track) ?? []), folder]);
    }
    for (const [track, group] of groups) groups.set(track, newestRunFolders(group, count));
    return groups;
}

export interface LoadedRun {
    table: TelemetryTable;
    sidecar: BeatSidecar | undefined;
}

const stemOf = (track: string): string => track.replace(/\.[^.\\/]*$/, '');

// A beat sidecar from a file, or undefined when the file is missing or does not parse (an unreadable sidecar is no truth).
export function readSidecar(path: string): BeatSidecar | undefined {
    if (!existsSync(path)) return undefined;
    try {
        return parseBeatSidecar(readFileSync(path, 'utf8'));
    } catch {
        return undefined;
    }
}

// A run's telemetry and its beat truth: the run folder's own copy of the sidecar, else the one beside the audio in `dir`.
// `dir` may be undefined in ingest mode when no music folder is at hand.
export function loadRun(folder: RunFolder, dir: string | undefined): LoadedRun {
    const table = parseCsv(readFileSync(join(folder.path, 'telemetry.csv'), 'utf8'));
    const sidecar =
        readSidecar(join(folder.path, 'track.beats.json')) ??
        (dir === undefined ? undefined : readSidecar(join(dir, `${stemOf(folder.track)}.beats.json`)));
    return { table, sidecar };
}
