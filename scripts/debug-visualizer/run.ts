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

class UserError extends Error {}

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

async function waitForServer(url: string, server: ChildProcess): Promise<void> {
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) throw new UserError('The dev server exited before it answered.');
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Not listening yet.
        }
        await sleep(250);
    }
    throw new UserError(`The dev server did not answer within ${SERVER_TIMEOUT_MS / 1000} s.`);
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
    let cleaned = false;
    const cleanup = async (): Promise<void> => {
        if (cleaned) return;
        cleaned = true;
        await browser?.close().catch(() => {});
        if (server) killTree(server);
    };
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            void cleanup().finally(() => process.exit(130));
        });
    }

    try {
        server = spawn(
            process.execPath,
            [resolve('node_modules/@react-router/dev/bin.cjs'), 'dev', '--port', String(port), '--strictPort'],
            { stdio: 'ignore' },
        );
        await waitForServer(origin, server);

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
            [from, seconds + CAPACITY_MARGIN_SECONDS],
        );

        const pending = [...due];
        const taken: string[] = [];
        for (;;) {
            const playback = await page.evaluate(() => window.__vizTelemetry?.playback() ?? null);
            if (!playback) break;
            while (pending.length && playback.position >= pending[0]) {
                const name = `shot-${pending.shift()}.png`;
                await page.screenshot({ path: join(outDir, name) });
                taken.push(name);
            }
            if (playback.position >= end || playback.ended) break;
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
            console.log('Warning: the recorder filled up and stopped; the end of the run is missing.');
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
    (error: unknown) => fail(error instanceof Error ? error.message.split('\n')[0] : String(error)),
);
