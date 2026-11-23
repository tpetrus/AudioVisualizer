// Beat trace: runs the app's rhythm pipeline over one WAV exactly as the offline scorecard does and prints one row per
// declared beat with what the phase check and the correction saw (see scripts/rhythm-tools/beatTrace.ts for the columns).
// Run it with `npm run trace:beats -- <wav> [--set NAME=VALUE]...`; with no arguments it prints the usage.
//
// Constants of rhythmConfig.ts are overridden at bundle time by the same esbuild plugin `ablate:rhythm` uses, so nothing
// under app/ changes. The truth (.beats.json, .bpm) is read from beside the WAV the way the scorecard's loader reads it.
// Dev only: nothing under app/ imports this file.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { BeatSidecar } from '../app/features/rhythm/eval/evalTypes';
import { parseBeatSidecar } from '../app/features/rhythm/eval/sidecar';
import { resolveTrack } from './scorecard/tracks';
import { applyOverrides } from './rhythm-tools/ablate';
import { loadWithOverrides } from './rhythm-tools/ablatePlugin';
import {
    TRACE_USAGE,
    formatHeader,
    formatRows,
    formatWindows,
    medianByWindow,
    parseTraceArguments,
    selectRows,
} from './rhythm-tools/beatTrace';
import type { TraceInput, TraceResult } from './rhythm-tools/beatTraceRunner';
import { readWav } from './rhythm-tools/wav';

type RunnerModule = { traceTrack: (input: TraceInput) => TraceResult };

// The sidecars the scorecard's loader (scripts/scorecard/inputs.ts) reads for a track: <stem>.beats.json and <stem>.bpm.
function readTruth(wavPath: string): { sidecar?: BeatSidecar; bpm?: number } {
    const stem = basename(wavPath).replace(/\.wav$/i, '');
    const dir = dirname(wavPath);
    const truth: { sidecar?: BeatSidecar; bpm?: number } = {};
    const beatsPath = join(dir, `${stem}.beats.json`);
    if (existsSync(beatsPath)) truth.sidecar = parseBeatSidecar(readFileSync(beatsPath, 'utf8'));
    const bpmPath = join(dir, `${stem}.bpm`);
    if (existsSync(bpmPath)) {
        const value = Number(readFileSync(bpmPath, 'utf8').trim());
        if (value > 0 && Number.isFinite(value)) truth.bpm = value;
    }
    return truth;
}

async function main(): Promise<void> {
    let options;
    try {
        options = parseTraceArguments(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(`\n${TRACE_USAGE}`);
        process.exitCode = 1;
        return;
    }
    if (options === undefined) {
        console.log(TRACE_USAGE);
        return;
    }
    if (!existsSync(options.wav)) {
        console.error(`No such file: ${options.wav}`);
        process.exitCode = 1;
        return;
    }
    try {
        // Checked before bundling so a mistyped name fails with its own message, not esbuild's wrapper around it.
        applyOverrides(readFileSync(resolve('app/features/rhythm/rhythmConfig.ts'), 'utf8'), options.overrides);
        const name = basename(options.wav);
        const wav = readWav(readFileSync(options.wav));
        const truth = readTruth(options.wav);
        const runner = (await loadWithOverrides(
            { entryPoint: resolve('scripts/rhythm-tools/beatTraceRunner.ts') },
            options.overrides,
        )) as RunnerModule;
        const result = runner.traceTrack({
            track: name,
            class: resolveTrack(name, truth.sidecar?.source).class,
            pcm: wav.samples,
            sampleRate: wav.sampleRate,
            ...truth,
        });
        const shown = selectRows(result.rows, options.from, options.to);
        const windows = medianByWindow(result.rows, options.windowSeconds);
        const scorecardWindows = medianByWindow(
            result.rows.map((row) => ({ time: row.time, errorMs: row.scorecardErrorMs })),
            options.windowSeconds,
        );
        console.log(formatHeader(name, options.overrides, result.summary).join('\n'));
        console.log(formatWindows(windows, scorecardWindows, options.windowSeconds).join('\n'));
        console.log(formatRows(shown).join('\n'));
        if (options.json !== undefined) {
            const payload = {
                track: name,
                overrides: options.overrides,
                summary: result.summary,
                windows,
                scorecardWindows,
                rows: shown,
            };
            writeFileSync(options.json, `${JSON.stringify(payload, null, 2)}\n`);
            console.log(`Wrote ${resolve(options.json)}`);
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

void main();
