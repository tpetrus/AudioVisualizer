// Recording one order session by spawning the debug:viz bundle with node. The argument building and output parsing are
// pure; only `recordSession` starts a process. This follows scripts/scorecard/live/record.ts, which cannot be reused
// because its job has no --then.

import { spawn } from 'node:child_process';
import { build } from 'esbuild';

export interface SessionOptions {
    dir: string;
    track: string;
    lead: string;
    then: string;
    seconds: number | undefined;
    headless: boolean;
}

// The folders debug:viz reports in its "Output: <dir>" lines, in the order it printed them (one per play).
export function parseOutputFolders(stdout: string): string[] {
    return [...stdout.matchAll(/^Output: (.+?)\s*$/gm)].map((match) => match[1]);
}

// Only the debug:viz arguments; they follow the bundle path on the node command line.
export function sessionArgs(options: SessionOptions): string[] {
    const args = ['--dir', options.dir, '--track', options.track, '--viz', options.lead, '--then', options.then];
    if (options.seconds !== undefined) args.push('--seconds', String(options.seconds));
    if (options.headless) args.push('--headless');
    return args;
}

export interface SessionResult {
    folders: string[];
    // The exit code, or null when the process could not start or was killed.
    code: number | null;
    // The last lines of output, for the log when a session fails.
    tail: string;
}

// Its own bundle file, so a scorecard:live run in another terminal never rewrites the file this one is executing.
const BUNDLE = 'node_modules/.cache/debug-viz-order.mjs';

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

// Runs one session to the end and returns the folders it wrote. Spawning node on the bundle needs no shell, which
// npm.cmd on Windows would.
export async function recordSession(options: SessionOptions): Promise<SessionResult> {
    const buildError = await buildBundle();
    if (buildError !== undefined) return { folders: [], code: null, tail: `bundle build failed: ${buildError}` };
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [BUNDLE, ...sessionArgs(options)], {
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
