// Recording runs by spawning `npm run debug:viz`, one at a time. The planning and the output parsing are pure; only
// `recordJob` starts a process.

import { spawn } from 'node:child_process';

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

// One argument for a shell command line: quoted when it holds anything the shell would split or expand. The command runs
// through a shell because npm is npm.cmd on Windows, which cannot be spawned directly.
export function shellQuote(arg: string): string {
    return /^[\w./:=\\@,+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

export interface RecordOptions {
    dir: string;
    track: string;
    viz: string;
    seconds: number | undefined;
    headless: boolean;
}

export function debugVizArgs(options: RecordOptions, job: RecordJob): string[] {
    const args = ['run', 'debug:viz', '--', '--dir', options.dir, '--track', options.track, '--viz', options.viz];
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

// Runs one debug:viz job to the end and returns the folders it wrote. Output is not echoed (debug:viz prints a long
// summary per run); the tail comes back so a failure can say why.
export function recordJob(options: RecordOptions, job: RecordJob): Promise<JobResult> {
    return new Promise((resolve) => {
        const child = spawn('npm', debugVizArgs(options, job).map(shellQuote), {
            shell: true,
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
