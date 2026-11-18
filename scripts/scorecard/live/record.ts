// Recording runs by spawning the debug:viz bundle with node, one at a time. The planning and the output parsing are pure;
// only `recordJob` starts a process.

import { spawn } from 'node:child_process';
import { build } from 'esbuild';

export interface RecordJob {
    // How many plays the page makes (debug:viz --reselect); each play is one run.
    reselect: number;
}

// The last two runs share one page (--reselect 2) so the live file also sees the "choose the track again" path; the others
// are fresh page loads. With fewer than 3 runs every run is a fresh load, because one of the two would be most of them.
export function planJobs(runs: number): RecordJob[] {
    if (runs < 3) return Array.from({ length: runs }, () => ({ reselect: 1 }));
    return [...Array.from({ length: runs - 2 }, () => ({ reselect: 1 })), { reselect: 2 }];
}

// The folders debug:viz reports in its "Output: <dir>" lines, in the order it printed them (one per play).
export function parseOutputFolders(stdout: string): string[] {
    return [...stdout.matchAll(/^Output: (.+?)\s*$/gm)].map((match) => match[1]);
}

export interface RecordOptions {
    dir: string;
    track: string;
    viz: string;
    seconds: number | undefined;
    headless: boolean;
}

// Only the debug:viz arguments; they follow the bundle path on the node command line.
export function debugVizArgs(options: RecordOptions, job: RecordJob): string[] {
    const args = ['--dir', options.dir, '--track', options.track, '--viz', options.viz];
    if (options.seconds !== undefined) args.push('--seconds', String(options.seconds));
    if (job.reselect > 1) args.push('--reselect', String(job.reselect));
    if (options.headless) args.push('--headless');
    return args;
}

export interface JobResult {
    folders: string[];
    // The exit code, or null when the process could not start or was killed.
    code: number | null;
    // The last lines of output, for the log when a job fails.
    tail: string;
}

// The same bundle the `debug:viz` npm script builds. It is built here through esbuild's JS API instead of spawning npm:
// npm is npm.cmd on Windows, which can only be spawned through a shell, and a shell (DEP0190) breaks on arguments with
// quotes. Spawning node on the bundle needs no shell at all.
const BUNDLE = 'node_modules/.cache/debug-viz.mjs';

// Built once per process; every job after the first reuses the same promise (and the same failure, if it failed).
let bundled: Promise<string | undefined> | undefined;

function buildBundle(): Promise<string | undefined> {
    bundled ??= build({
        entryPoints: ['scripts/debug-visualizer/run.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        logLevel: 'silent',
        outfile: BUNDLE,
    }).then(
        () => undefined,
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    return bundled;
}

// Runs one debug:viz job to the end and returns the folders it wrote. Output is not echoed (debug:viz prints a long
// summary per run); the tail comes back so a failure can say why. A failed bundle build is a failed job, not a crash.
export async function recordJob(options: RecordOptions, job: RecordJob): Promise<JobResult> {
    const buildError = await buildBundle();
    if (buildError !== undefined) return { folders: [], code: null, tail: `bundle build failed: ${buildError}` };
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [BUNDLE, ...debugVizArgs(options, job)], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        const finish = (code: number | null): void => {
            const tail = `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-3).join(' | ');
            resolve({ folders: parseOutputFolders(stdout), code, tail });
        };
        child.on('error', () => finish(null));
        child.on('close', finish);
    });
}
