// Measures how long captured audio takes to reach an AudioContext, by loopback: a page plays clicks at known context
// times through the speakers and records a capture of this machine's own audio in the same context. Run it with
// `capture-delay` and no arguments for usage (see docs/agents/capture-delay.md). Dev only; nothing under app/ imports
// this file and it uses nothing from app/.
//
// The page is served from a tiny node http server on http://localhost:<free port>. getUserMedia and getDisplayMedia
// need a secure context and localhost is one, so no certificate is needed; request routing on a made-up URL would
// also work but would leave the page without a real origin for the microphone permission.
//
// The page only records. Samples come back to this process and the pure modules decide what arrived when, so the
// detection that the specs cover is the detection that runs.

import { createServer, type Server } from 'node:http';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { parseCaptureArgs, pickDevice, USAGE, type CaptureArgs, type InputDevice } from './args';
import { detectClicks } from './detect';
import { buildReport, formatReport } from './report';

// How long after its scheduled time a click may arrive and still count; the next click's time clips it further.
const MAX_DELAY_SECONDS = 1;
const SIGNAL_CLEANUP_MS = 5_000;

interface PageResult {
    sampleRate: number;
    baseLatency: number | undefined;
    outputLatency: number | undefined;
    // AudioContext time of samples[0], from the currentFrame of the first recorded block.
    startTime: number;
    samples: number[];
    scheduled: number[];
}

// The recorder's AudioWorklet. Each render quantum of the captured stream is posted with its currentFrame, the
// context's own sample counter, so every sample has an exact context time. It has no output, so nothing the capture
// carries can reach the speakers and feed back.
const WORKLET_SOURCE = `
class CaptureRecorder extends AudioWorkletProcessor {
    process(inputs) {
        const channels = inputs[0];
        if (channels && channels.length > 0) {
            const mono = new Float32Array(channels[0].length);
            for (const channel of channels) {
                for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
            }
            this.port.postMessage({ frame: currentFrame, data: mono }, [mono.buffer]);
        }
        return true;
    }
}
registerProcessor('capture-recorder', CaptureRecorder);
`;

const PAGE_SCRIPT = `
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const status = (text) => { document.getElementById('status').textContent = text; };

// Device labels stay empty until the page has been granted the microphone, so ask once and release it.
window.listInputs = async () => {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label }));
};

// One short click: a 5 ms burst of 2 kHz that starts at its peak, so its first sample is already loud and the
// arrival is not smeared by a slow attack, then decays linearly.
function clickBuffer(context) {
    const length = Math.round(context.sampleRate * 0.005);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = 0.5 * Math.cos((2 * Math.PI * 2000 * i) / context.sampleRate) * (1 - i / length);
    }
    return buffer;
}

async function openStream(config, context, bus) {
    if (config.source === 'direct') {
        const destination = context.createMediaStreamDestination();
        bus.connect(destination);
        return destination.stream;
    }
    if (config.source === 'device') {
        return navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: config.deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });
    }
    // Tab capture needs a user gesture for the picker, so wait for the Start button.
    const button = document.getElementById('start');
    button.hidden = false;
    status('Click Start, choose THIS TAB in the picker and tick "Also share tab audio" (Chrome: "Share tab audio").');
    await new Promise((done) => { button.onclick = done; });
    button.hidden = true;
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('The share has no audio track: choose this tab and tick the tab audio box.');
    }
    return stream;
}

window.measure = async (config) => {
    // Default options, like the app's own context, so baseLatency and outputLatency describe what production gets.
    const context = new AudioContext();
    let stream;
    try {
        const url = URL.createObjectURL(new Blob([config.workletSource], { type: 'text/javascript' }));
        await context.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        // Clicks go to the speakers; in direct mode the same bus also feeds the stream that is captured back.
        const bus = context.createGain();
        bus.connect(context.destination);
        stream = await openStream(config, context, bus);
        await context.resume();

        const blocks = [];
        const recorder = new AudioWorkletNode(context, 'capture-recorder', { numberOfInputs: 1, numberOfOutputs: 0 });
        recorder.port.onmessage = (event) => blocks.push(event.data);
        // The capture is only ever connected to the recorder, never to the destination.
        context.createMediaStreamSource(stream).connect(recorder);

        status('Playing clicks. Keep the speakers on and the room quiet.');
        const buffer = clickBuffer(context);
        const first = Math.ceil((context.currentTime + 1) * context.sampleRate) / context.sampleRate;
        const scheduled = [];
        for (let i = 0; i < config.clicks; i++) {
            // Snapped to a whole sample so the scheduled time is exactly the one the engine starts the click at.
            const time = Math.round((first + i * config.interval) * context.sampleRate) / context.sampleRate;
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(bus);
            source.start(time);
            scheduled.push(time);
        }
        const end = scheduled[scheduled.length - 1] + 1;
        while (context.currentTime < end) await sleep(50);
        // Messages from the worklet arrive a little after the audio thread produced them.
        await sleep(200);
        recorder.disconnect();
        recorder.port.close();

        if (blocks.length === 0) throw new Error('The capture delivered no audio at all.');
        const startFrame = blocks[0].frame;
        const last = blocks[blocks.length - 1];
        const samples = new Float32Array(last.frame + last.data.length - startFrame);
        // Blocks that never arrived (an empty input) stay zero, so every other sample keeps its exact position.
        for (const block of blocks) samples.set(block.data, block.frame - startFrame);
        return {
            sampleRate: context.sampleRate,
            baseLatency: context.baseLatency,
            outputLatency: context.outputLatency,
            startTime: startFrame / context.sampleRate,
            samples: Array.from(samples),
            scheduled,
        };
    } finally {
        stream?.getTracks().forEach((track) => track.stop());
        await context.close();
    }
};
`;

const PAGE_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Capture delay</title>
<body style="font:20px system-ui,sans-serif;margin:2em">
<h1>Capture delay</h1>
<p id="status">Starting...</p>
<button id="start" hidden style="font-size:24px;padding:12px 24px">Start</button>
<script>${PAGE_SCRIPT}</script>
</body>`;

let signalExitCode: number | undefined;

function fail(reason: string): never {
    process.stderr.write(`${reason}\n`);
    process.exit(1);
}

function sleep(ms: number): Promise<void> {
    return new Promise((done) => setTimeout(done, ms));
}

function listen(): Promise<{ server: Server; port: number }> {
    return new Promise((done, reject) => {
        const server = createServer((request, response) => {
            if (request.url === '/') {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                response.end(PAGE_HTML);
            } else {
                response.writeHead(404).end();
            }
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            done({ server, port: typeof address === 'object' && address ? address.port : 0 });
        });
    });
}

// A page error carries a long stack; the first line is the reason.
function firstLine(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).split('\n')[0];
}

async function resolveDevice(page: Page, args: CaptureArgs): Promise<InputDevice> {
    let devices: InputDevice[];
    try {
        devices = await page.evaluate(() =>
            (window as unknown as { listInputs: () => Promise<InputDevice[]> }).listInputs(),
        );
    } catch (error) {
        fail(`Could not list audio inputs: ${firstLine(error)}`);
    }
    const device = pickDevice(devices, args.device);
    if (device) return device;
    const reason = args.device
        ? `No audio input matches "${args.device}".`
        : '--device is required with --source device.';
    const labels = devices.map((d) => `  ${d.label || '(no label)'}`).join('\n');
    fail(`${reason} Available audio inputs:\n${labels || '  (none)'}`);
}

async function main(): Promise<void> {
    const parsed = parseCaptureArgs(process.argv.slice(2));
    if (parsed.kind === 'help') {
        console.log(
            `${USAGE}\n\nPlays clicks through the speakers and times their arrival through a capture of this machine's\n` +
                'own audio. tab: pick this tab and tick the tab audio box. device: --device "Stereo Mix" with the\n' +
                'speakers on. direct: self-check of the measuring pipeline, no hardware, runs with --headless.',
        );
        return;
    }
    if (parsed.kind === 'error') fail(parsed.message);
    const args = parsed.args;

    const { server, port } = await listen();
    let browser: Browser | undefined;
    let cleanupRun: Promise<void> | undefined;
    const cleanup = (): Promise<void> => {
        cleanupRun ??= (async () => {
            try {
                await browser?.close();
            } catch {
                // Already closed.
            }
            server.close();
            server.closeAllConnections();
        })();
        return cleanupRun;
    };
    for (const [signal, code] of [
        ['SIGINT', 130],
        ['SIGTERM', 143],
    ] as const) {
        process.on(signal, () => {
            if (signalExitCode !== undefined) process.exit(code);
            signalExitCode = code;
            void Promise.race([cleanup(), sleep(SIGNAL_CLEANUP_MS)]).finally(() => process.exit(code));
        });
    }

    let result: PageResult;
    let deviceLabel: string | undefined;
    try {
        console.log('Opening the browser...');
        browser = await chromium.launch({
            headless: args.headless,
            args: [
                // Lets the direct source start the context with no click, and the others resume it after Start.
                '--autoplay-policy=no-user-gesture-required',
                // A device capture would otherwise stop at the microphone permission prompt. The tab source must not get
                // this flag: it also answers the share picker by itself, and the person has to pick the tab and its audio.
                ...(args.source === 'device' ? ['--use-fake-ui-for-media-stream'] : []),
            ],
        });
        const context = await browser.newContext({ viewport: { width: 1000, height: 500 } });
        if (args.source === 'device') await context.grantPermissions(['microphone']);
        const page = await context.newPage();
        await page.goto(`http://localhost:${port}/`);

        let deviceId: string | undefined;
        if (args.source === 'device') {
            const device = await resolveDevice(page, args);
            deviceId = device.deviceId;
            deviceLabel = device.label;
        }
        console.log(
            args.source === 'tab'
                ? 'Waiting for you in the browser window: click Start, choose this tab, tick "Also share tab audio".'
                : `Measuring ${args.clicks} clicks, ${args.interval} s apart...`,
        );
        const config = { ...args, deviceId, workletSource: WORKLET_SOURCE };
        try {
            result = await page.evaluate(
                (value) => (window as unknown as { measure: (c: typeof value) => Promise<PageResult> }).measure(value),
                config,
            );
        } catch (error) {
            const hint =
                args.source === 'tab'
                    ? ' (the picker was canceled, or tab audio was not shared)'
                    : args.source === 'device'
                      ? ' (the input could not be opened; is it enabled and not in use exclusively?)'
                      : '';
            fail(`Measurement failed: ${firstLine(error)}${hint}`);
        }
    } finally {
        await cleanup();
    }

    const detection = detectClicks({
        samples: result.samples,
        sampleRate: result.sampleRate,
        startTime: result.startTime,
        scheduled: result.scheduled,
        maxDelaySeconds: MAX_DELAY_SECONDS,
    });
    const report = buildReport({
        source: args.source,
        deviceLabel,
        delaysMs: detection.clicks.map((click) => click.delayMs),
        sampleRate: result.sampleRate,
        baseLatency: result.baseLatency,
        outputLatency: result.outputLatency,
    });
    console.log(formatReport(report));
    if (args.out) {
        const { clicks, noiseFloor, peak, threshold } = detection;
        writeFileSync(
            resolve(args.out),
            `${JSON.stringify({ ...report, clicksDetail: clicks, noiseFloor, peak, threshold }, null, 2)}\n`,
        );
        console.log(`Wrote ${resolve(args.out)}`);
    }
    if (report.failed) process.exitCode = 1;
}

main().then(
    () => process.exit(process.exitCode ?? 0),
    (error: unknown) => {
        if (signalExitCode !== undefined) return;
        fail(firstLine(error));
    },
);
