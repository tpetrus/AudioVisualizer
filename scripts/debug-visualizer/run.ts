// Plays a local track through a visualizer in a real browser and records the telemetry the app exposes in dev mode.
// Run it with `npm run debug:viz -- --help`. Not part of the app bundle: nothing under app/ imports this file.

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import {
    formatTelemetryCsv,
    parseTelemetryCsv,
    summarizeTelemetry,
} from '../../app/features/audio/devTelemetrySummary';
import { VISUALIZATIONS } from '../../app/features/landing/visualizations';
import { listAudioFiles, parseArgs, scheduleShots, trackBaseName, USAGE } from './args';

const SERVER_TIMEOUT_MS = 60_000;
const PLAYBACK_TIMEOUT_MS = 30_000;
const POLL_MS = 50;
// The recorder keeps rows past the requested end so the last frames of the range are never cut off.
const CAPACITY_MARGIN_SECONDS = 5;
// The recorder holds capacitySeconds * 120 rows (contract C2), sized for 120 Hz. Asking for 2.5x the seconds leaves
// room for a 240 Hz display plus slack, so headed runs on 144/165/240 Hz screens do not overflow.
const CAPACITY_FACTOR = 2.5;
const SERVER_LOG_LINES = 20;

class UserError extends Error {}

// Set by a signal handler. Closing the browser then makes in-flight page calls throw, which is not a real failure.
let signalExitCode: number | undefined;

function fail(reason: string): never {
    process.stderr.write(`${reason}\n`);
    process.exit(1);
}

function sleep(ms: number): Promise<void> {
    return new Promise((done) => setTimeout(done, ms));
}

function freePort(): Promise<number> {
    return new Promise((done, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close(() => done(port));
        });
    });
}

// Stops the dev server and anything it started. On Windows a plain kill leaves the children behind.
function killTree(child: ChildProcess): void {
    if (child.pid === undefined || child.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        child.kill('SIGTERM');
    }
}

// Keeps the last few lines the dev server printed. Reading the pipes also stops it blocking on a full buffer.
function captureLines(child: ChildProcess): string[] {
    const lines: string[] = [];
    for (const stream of [child.stdout, child.stderr]) {
        let partial = '';
        stream?.setEncoding('utf8');
        stream?.on('data', (chunk: string) => {
            const parts = (partial + chunk).split(/\r?\n/);
            partial = parts.pop() ?? '';
            lines.push(...parts);
            if (lines.length > SERVER_LOG_LINES) lines.splice(0, lines.length - SERVER_LOG_LINES);
        });
        stream?.on('end', () => {
            if (partial) lines.push(partial);
        });
    }
    return lines;
}

// The last non-empty line is usually the cause (a port clash, a syntax error), so the one-line error carries it.
function lastLineNote(lines: string[]): string {
    // Escape sequences from the dev server's colored output would garble the error line.
    // eslint-disable-next-line no-control-regex
    const ansi = /\u001b\[[0-9;]*m/g;
    const last = lines
        .map((line) => line.replace(ansi, '').trim())
        .filter(Boolean)
        .pop();
    return last ? ` Last output: ${last}` : '';
}

async function waitForServer(url: string, server: ChildProcess, lines: string[]): Promise<void> {
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new UserError(`The dev server exited before it answered.${lastLineNote(lines)}`);
        }
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Not listening yet.
        }
        await sleep(250);
    }
    throw new UserError(`The dev server did not answer within ${SERVER_TIMEOUT_MS / 1000} s.${lastLineNote(lines)}`);
}

function num(value: number): string {
    return String(Math.round(value * 100) / 100);
}

async function main(): Promise<void> {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.kind === 'help') {
        console.log(`${USAGE}\n\nPlays the track through the visualizer and records telemetry into .debug-out/.`);
        return;
    }
    if (parsed.kind === 'error') fail(parsed.message);
    const { dir, track, viz, seconds: requestedSeconds, from, shots, headless } = parsed.args;

    // Validate everything that needs no browser first, so a typo costs nothing.
    const dirPath = resolve(dir);
    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) fail(`Folder not found: ${dir}`);
    if (readdirSync(dirPath).length === 0) fail(`Folder is empty: ${dir}`);
    const audioFiles = listAudioFiles(dirPath);
    if (!audioFiles.includes(track)) {
        fail(
            `Unknown track "${track}". Audio files in ${dir}: ${audioFiles.length ? audioFiles.join(', ') : '(none)'}`,
        );
    }
    const names = VISUALIZATIONS.map((visualization) => visualization.to.replace(/^\//, ''));
    if (!names.includes(viz)) fail(`Unknown visualizer "${viz}". Valid names: ${names.join(', ')}`);

    const port = await freePort();
    const origin = `http://localhost:${port}`;
    let server: ChildProcess | undefined;
    let browser: Browser | undefined;
    // Memoized so every caller (the finally and a signal handler) awaits the same run; a boolean guard let the second
    // caller return early and the process exit before the server was killed.
    let cleanupRun: Promise<void> | undefined;
    const cleanup = (): Promise<void> => {
        cleanupRun ??= (async () => {
            // The server goes first because it is the one thing that outlives this process; each step has its own
            // try so a failure in one never skips the other.
            try {
                if (server) killTree(server);
            } catch {
                // Nothing more can be done for a server that will not die.
            }
            try {
                await browser?.close();
            } catch {
                // Already closed.
            }
        })();
        return cleanupRun;
    };
    for (const [signal, code] of [
        ['SIGINT', 130],
        ['SIGTERM', 143],
    ] as const) {
        process.on(signal, () => {
            signalExitCode = code;
            void cleanup().finally(() => process.exit(code));
        });
    }

    try {
        server = spawn(
            process.execPath,
            [resolve('node_modules/@react-router/dev/bin.cjs'), 'dev', '--port', String(port), '--strictPort'],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        const serverLines = captureLines(server);
        // Without a listener a failed spawn would surface as an uncaught exception instead of the one-line error.
        server.on('error', (error) => serverLines.push(`spawn failed: ${error.message}`));
        await waitForServer(origin, server, serverLines);

        browser = await chromium.launch({
            headless,
            // The full Chromium build in new headless mode keeps GPU rendering. The default headless shell draws WebGL
            // in software, which is too slow here for the frame rate the telemetry should reflect.
            channel: headless ? 'chromium' : undefined,
            args: ['--autoplay-policy=no-user-gesture-required'],
        });
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
        await page.goto(`${origin}/${viz}`);
        await page.getByLabel('Audio file').setInputFiles(join(dirPath, track));

        // Playback starting and the dialog reporting a failure are the two outcomes; wait for either.
        const startDeadline = Date.now() + PLAYBACK_TIMEOUT_MS;
        for (;;) {
            if (await page.evaluate(() => window.__vizTelemetry?.playback() != null)) break;
            const alert = page.getByRole('alert');
            if (await alert.count()) throw new UserError((await alert.first().innerText()).trim().split('\n')[0]);
            if (Date.now() > startDeadline) {
                throw new UserError(`Playback did not start within ${PLAYBACK_TIMEOUT_MS / 1000} s.`);
            }
            await sleep(100);
        }

        // The source dialog stays open after a source starts; close it so screenshots show the scene alone.
        const done = page.getByRole('button', { name: 'Done' });
        if (await done.count()) await done.first().click();

        const duration = await page.evaluate(() => window.__vizTelemetry?.playback()?.duration ?? 0);
        const available = Math.max(0, duration - from);
        if (available <= 0) throw new UserError(`--from ${from} is past the end of the track (${num(duration)} s).`);
        const seconds = Math.min(requestedSeconds ?? available, available);
        const end = from + seconds;
        const clamped = requestedSeconds !== undefined && requestedSeconds > available;
        const { due, skipped } = scheduleShots(shots, end);

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outDir = resolve('.debug-out', `${viz}-${trackBaseName(track)}-${stamp}`);
        mkdirSync(outDir, { recursive: true });

        await page.evaluate(
            ([start, capacity]) => {
                window.__vizTelemetry?.seek(start);
                window.__vizTelemetry?.reset(capacity);
            },
            [from, (seconds + CAPACITY_MARGIN_SECONDS) * CAPACITY_FACTOR],
        );

        const pending = [...due];
        const taken: string[] = [];
        // A stalled player (paused tab, throttled clock) would otherwise poll forever.
        const stallSeconds = seconds * 1.5 + 30;
        const playDeadline = Date.now() + stallSeconds * 1000;
        let lastPosition = from;
        for (;;) {
            const playback = await page.evaluate(() => window.__vizTelemetry?.playback() ?? null);
            if (!playback) break;
            lastPosition = playback.position;
            while (pending.length && playback.position >= pending[0]) {
                const name = `shot-${pending.shift()}.png`;
                await page.screenshot({ path: join(outDir, name) });
                taken.push(name);
            }
            if (playback.position >= end || playback.ended) break;
            if (Date.now() > playDeadline) {
                throw new UserError(
                    `Playback stalled: did not reach ${num(end)} s within ${num(stallSeconds)} s; last position ${num(lastPosition)} s.`,
                );
            }
            await sleep(POLL_MS);
        }
        // A track that ended before a shot time passed still owes the shots it never reached.
        skipped.push(...pending);

        const snapshot = await page.evaluate(() => {
            const hook = window.__vizTelemetry;
            return hook
                ? {
                      columns: hook.columns,
                      data: Array.from(hook.snapshot()),
                      rowCount: hook.rowCount,
                      overflowed: hook.overflowed,
                  }
                : undefined;
        });
        if (!snapshot || snapshot.rowCount === 0) throw new UserError('No telemetry rows were recorded.');

        // Once the track ends the engine drops its graph and the clock column falls back to 0, so rows after the first
        // step backward in time are not part of the playback and would skew the summary.
        const stride = snapshot.columns.length;
        let rowCount = 1;
        while (
            rowCount < snapshot.rowCount &&
            snapshot.data[rowCount * stride] >= snapshot.data[(rowCount - 1) * stride]
        ) {
            rowCount++;
        }
        const csv = formatTelemetryCsv(snapshot.columns, snapshot.data, rowCount);
        writeFileSync(join(outDir, 'telemetry.csv'), csv);

        const table = parseTelemetryCsv(csv);
        const span = table.rows[table.rows.length - 1][0] - table.rows[0][0];
        const fps = span > 0 ? (table.rows.length - 1) / span : 0;

        const clampNote = clamped ? ` (clamped from ${requestedSeconds}; track is ${num(duration)} s)` : '';
        console.log(`Run: viz=${viz} track=${track} from=${num(from)} s seconds=${num(seconds)}${clampNote}`);
        console.log(`Rows: ${rowCount}, measured mean fps: ${num(fps)}`);
        if (snapshot.overflowed)
            console.log('Warning: the recorder filled up and stopped; the tail of the run is missing from the CSV.');
        if (taken.length) console.log(`Shots: ${taken.join(', ')}`);
        if (skipped.length) console.log(`Skipped shots past the end of the range: ${skipped.join(', ')}`);
        console.log(`Output: ${outDir}`);
        console.log(summarizeTelemetry(table).join('\n'));
    } finally {
        await cleanup();
    }
}

main().then(
    () => process.exit(0),
    (error: unknown) => {
        // The signal handler exits with its own code once cleanup finishes; stay quiet until then.
        if (signalExitCode !== undefined) return;
        fail(error instanceof Error ? error.message.split('\n')[0] : String(error));
    },
);
