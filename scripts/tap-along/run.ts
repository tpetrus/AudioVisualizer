// Lets a person tap along to a local track (Space) and writes the taps as a ground-truth beat sidecar. Run it with
// `npm run tap:beats` for usage. Dev only; nothing under app/ imports this file.
//
// The server and browser launch helpers below are copies of the small ones in scripts/debug-visualizer/run.ts, which
// cannot be imported because that file runs its CLI on import. The pure helpers (track lookup, tempo sidecar parsing,
// line collection) are imported from there.

import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { VISUALIZATIONS } from '../../app/features/landing/visualizations';
import { parseBeatSidecar } from '../../app/features/rhythm/eval/sidecar';
import { listAudioFiles } from '../debug-visualizer/args';
import { causeNote, createLineCollector, type LineCollector } from '../debug-visualizer/output';
import { parseBpmSidecar } from '../debug-visualizer/tempoReport';
import { parseTapArgs, USAGE } from './args';
import { calibrate, parseCalibration } from './calibration';
import { beatsSidecarName, buildTappedSidecar } from './sidecar';
import { cleanTaps } from './taps';

const SERVER_TIMEOUT_MS = 60_000;
const PLAYBACK_TIMEOUT_MS = 30_000;
const POLL_MS = 50;
const SERVER_LOG_LINES = 20;
const PARTIAL_LINE_CHARS = 500;
const NOTE_CHARS = 200;
const SIGNAL_CLEANUP_MS = 5_000;
const CALIBRATION_FILE = 'tap-calibration.json';

class UserError extends Error {}

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
function captureLines(child: ChildProcess): LineCollector {
    const collector = createLineCollector(SERVER_LOG_LINES, PARTIAL_LINE_CHARS);
    [child.stdout, child.stderr].forEach((stream, channel) => {
        stream?.setEncoding('utf8');
        stream?.on('data', (chunk: string) => collector.push(chunk, channel));
        stream?.on('end', () => collector.end(channel));
    });
    return collector;
}

async function waitForServer(url: string, server: ChildProcess, output: LineCollector): Promise<void> {
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new UserError(`The dev server exited before it answered.${causeNote(output.lines(), NOTE_CHARS)}`);
        }
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

// Waits for the playback to start, or throws the dialog's one-line failure.
async function waitForPlaybackStart(page: Page): Promise<void> {
    const deadline = Date.now() + PLAYBACK_TIMEOUT_MS;
    for (;;) {
        const position = await page.evaluate(() => window.__vizTelemetry?.playback()?.position ?? null);
        if (position !== null) return;
        const alert = page.getByRole('alert');
        if (await alert.count()) throw new UserError((await alert.first().innerText()).trim().split('\n')[0]);
        if (Date.now() > deadline)
            throw new UserError(`Playback did not start within ${PLAYBACK_TIMEOUT_MS / 1000} s.`);
        await sleep(100);
    }
}

// Installed before any page script runs. It reads the playback position at the instant of the key press, in the page,
// so the polling delay of this process never enters the taps. Auto-repeat is ignored; Enter or Escape ends the run.
function installTapRecorder(): void {
    const state = { taps: [] as number[], done: false };
    (window as unknown as { __tapAlong: typeof state }).__tapAlong = state;
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.repeat) return;
            if (event.code === 'Enter' || event.code === 'Escape') {
                state.done = true;
                return;
            }
            if (event.code !== 'Space') return;
            // A focused button would otherwise be clicked by the space bar.
            event.preventDefault();
            const playback = window.__vizTelemetry?.playback();
            if (playback && !playback.ended) state.taps.push(playback.position);
        },
        true,
    );
}

// Plays the track and returns the raw taps (seconds) once it ends or the user presses Enter or Escape.
async function recordTaps(page: Page): Promise<number[]> {
    let lastPosition = -1;
    let lastAdvance = Date.now();
    for (;;) {
        const state = await page.evaluate(() => ({
            playback: window.__vizTelemetry?.playback() ?? null,
            done: (window as unknown as { __tapAlong: { done: boolean } }).__tapAlong.done,
        }));
        if (state.done || !state.playback || state.playback.ended) break;
        if (state.playback.position !== lastPosition) {
            lastPosition = state.playback.position;
            lastAdvance = Date.now();
        } else if (Date.now() - lastAdvance > 15_000) {
            throw new UserError('Playback stalled: the position did not advance for 15 s.');
        }
        await sleep(POLL_MS);
    }
    return page.evaluate(() => (window as unknown as { __tapAlong: { taps: number[] } }).__tapAlong.taps);
}

async function main(): Promise<void> {
    const parsed = parseTapArgs(process.argv.slice(2));
    if (parsed.kind === 'help') {
        console.log(
            `${USAGE}\n\nTap Space along to the track. Run once with --calibrate on a click track from\n` +
                '`npm run ground-truth -- <dir>` (it needs <name>.beats.json beside it) to store your offset and spread in\n' +
                `<dir>/${CALIBRATION_FILE}; then tap real tracks. Enter or Escape ends a run early.`,
        );
        return;
    }
    if (parsed.kind === 'error') fail(parsed.message);
    const { dir, track, viz, calibrate: calibrating, force } = parsed.args;

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

    const trackPath = join(dirPath, track);
    const sidecarPath = join(dirPath, beatsSidecarName(track));
    const calibrationPath = join(dirPath, CALIBRATION_FILE);
    let trueBeats: number[] = [];
    if (calibrating) {
        if (!existsSync(sidecarPath)) {
            fail(
                `--calibrate needs ${beatsSidecarName(track)} beside the track; make it with: npm run ground-truth -- ${dir}`,
            );
        }
        trueBeats = parseBeatSidecar(readFileSync(sidecarPath, 'utf8')).beats;
    } else {
        if (!existsSync(calibrationPath)) {
            fail(`No ${CALIBRATION_FILE} in ${dir}. Run with --calibrate on a click track first.`);
        }
        if (existsSync(sidecarPath) && !force) {
            fail(`${beatsSidecarName(track)} already exists; pass --force to overwrite it.`);
        }
    }
    const calibration = calibrating ? undefined : parseCalibration(readFileSync(calibrationPath, 'utf8'));

    const port = await freePort();
    const origin = `http://localhost:${port}`;
    let server: ChildProcess | undefined;
    let browser: Browser | undefined;
    let cleanupRun: Promise<void> | undefined;
    const cleanup = (): Promise<void> => {
        cleanupRun ??= (async () => {
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
            if (signalExitCode !== undefined) {
                if (server) killTree(server);
                process.exit(code);
            }
            signalExitCode = code;
            void Promise.race([cleanup(), sleep(SIGNAL_CLEANUP_MS)]).finally(() => process.exit(code));
        });
    }

    let rawTaps: number[];
    try {
        // Starting the server and the browser takes several seconds with nothing to see, so say what is happening.
        console.log('Starting the dev server...');
        server = spawn(
            process.execPath,
            [resolve('node_modules/@react-router/dev/bin.cjs'), 'dev', '--port', String(port), '--strictPort'],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        const serverLines = captureLines(server);
        server.on('error', (error) => serverLines.push(`spawn failed: ${error.message}\n`, 2));
        await waitForServer(origin, server, serverLines);

        console.log('Opening the browser window...');
        // Always headed: the person taps in this window, so it must have focus.
        browser = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
        await page.addInitScript(installTapRecorder);
        await page.goto(`${origin}/${viz}`);
        console.log('Loading the track...');
        await page.getByLabel('Audio file').setInputFiles(trackPath);
        await waitForPlaybackStart(page);
        // The source dialog stays open after a source starts; close it so the window has the scene alone.
        const done = page.getByRole('button', { name: 'Done' });
        if (await done.count()) await done.first().click();
        // Focus the page body so the first Space press reaches the recorder.
        await page
            .locator('body')
            .click({ position: { x: 5, y: 5 } })
            .catch(() => undefined);
        // The person is looking at this window, not the terminal, so the instruction and a running tap count go on
        // the page. A tap that does not raise the count did not reach the recorder.
        await page.evaluate(() => {
            const banner = document.createElement('div');
            banner.style.cssText =
                'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 20px;' +
                'border-radius:8px;background:rgba(0,0,0,0.8);color:#fff;font:600 18px system-ui,sans-serif;' +
                'pointer-events:none';
            const state = (window as unknown as { __tapAlong: { taps: number[] } }).__tapAlong;
            const show = () => {
                banner.textContent = `Tap SPACE on every beat (${state.taps.length} taps). Enter or Esc to finish.`;
            };
            show();
            document.body.append(banner);
            window.addEventListener('keydown', () => setTimeout(show, 0), true);
        });
        console.log('Playing. Tap Space on every beat; Enter or Escape ends the run early.');
        rawTaps = await recordTaps(page);
    } finally {
        await cleanup();
    }

    const taps = cleanTaps(rawTaps);
    console.log(`Recorded ${rawTaps.length} taps, kept ${taps.length} after clean-up.`);
    try {
        if (calibrating) {
            const result = calibrate(taps, trueBeats, track);
            writeFileSync(calibrationPath, `${JSON.stringify(result, null, 2)}\n`);
            console.log(`Offset: ${result.offsetMs.toFixed(1)} ms (negative means you tap early).`);
            console.log(`Tap-noise floor: ${result.noiseFloorMs.toFixed(1)} ms.`);
            console.log(`Wrote ${calibrationPath}`);
        } else if (calibration) {
            const bpmPath = join(dirPath, `${beatsSidecarName(track).replace(/\.beats\.json$/, '')}.bpm`);
            const bpmSidecar = existsSync(bpmPath) ? parseBpmSidecar(readFileSync(bpmPath, 'utf8')) : undefined;
            const sidecar = buildTappedSidecar({ track, taps, calibration, bpmSidecar });
            writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
            console.log(`Wrote ${sidecarPath} (${sidecar.beats.length} beats, ${sidecar.tempo.toFixed(1)} BPM).`);
            console.log(
                `Offset removed: ${calibration.offsetMs.toFixed(1)} ms; tap-noise floor: ${calibration.noiseFloorMs.toFixed(1)} ms.`,
            );
        }
    } catch (error) {
        throw new UserError(error instanceof Error ? error.message : String(error));
    }
}

main().then(
    () => process.exit(0),
    (error: unknown) => {
        if (signalExitCode !== undefined) return;
        fail(error instanceof Error ? error.message.split('\n')[0] : String(error));
    },
);
