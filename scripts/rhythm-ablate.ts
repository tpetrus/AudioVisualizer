// Offline ablation of the rhythm tracker: runs the real OnsetExtractor and RhythmAnalyzer over one WAV with one or more
// rhythmConfig.ts constants overridden, and prints when the tracker first locked, the held tempo over time, grid rebuilds
// and song changes. Run it with `npm run ablate:rhythm -- <wav> --set NAME=VALUE`; with no arguments it prints the usage.
//
// The override is made at bundle time by an esbuild plugin (scripts/rhythm-tools/ablatePlugin.ts); no file under app/ is
// touched. It leaves out the live chain's gain control and block timing, so confirm anything it suggests with
// `npm run debug:viz`. Not part of the app bundle: nothing under app/ imports this file.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyOverrides, parseAblateArguments } from './rhythm-tools/ablate';
import { loadWithOverrides } from './rhythm-tools/ablatePlugin';
import { formatAblation, type AblationResult } from './rhythm-tools/ablateReport';
import { readWav } from './rhythm-tools/wav';

const USAGE = `Usage: npm run ablate:rhythm -- <wav> [--set NAME=VALUE]... [options]

Runs the real onset extractor and rhythm analyzer over one WAV (16/24/32-bit PCM or 32/64-bit float, any channel count)
with constants of app/features/rhythm/rhythmConfig.ts overridden, and prints the first lock, the held tempo over time,
grid rebuilds and song changes. The same input and overrides always print the same text.

Options:
  --set NAME=VALUE   Override an exported constant, e.g. --set TEMPO_SWITCH_ESTIMATES=12 or
                     --set TEMPO_FASTER_DIVISORS=[2]. VALUE is numbers, arithmetic and [ ] lists. An unknown NAME
                     is an error. Repeat the option to override several constants.
  --every <s>        Seconds between rows of the held-tempo list (default 5).
  --seconds <s>      Only analyze the first s seconds (default: the whole file).
  --help             Show this text.`;

type RunnerModule = {
    runAblation: (pcm: Float32Array, sampleRate: number, everySeconds: number) => AblationResult;
};

async function main(): Promise<void> {
    let options;
    try {
        options = parseAblateArguments(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(`\n${USAGE}`);
        process.exitCode = 1;
        return;
    }
    if (options === undefined) {
        console.log(USAGE);
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
        const wav = readWav(readFileSync(options.wav));
        const limit = options.maxSeconds > 0 ? Math.round(options.maxSeconds * wav.sampleRate) : wav.samples.length;
        // The entry is found from the working directory, which `npm run` sets to the repository root.
        const runner = (await loadWithOverrides(
            { entryPoint: resolve('scripts/rhythm-tools/ablateRunner.ts') },
            options.overrides,
        )) as RunnerModule;
        const result = runner.runAblation(wav.samples.subarray(0, limit), wav.sampleRate, options.everySeconds);
        const name = options.wav.replace(/\\/g, '/').split('/').pop() ?? options.wav;
        console.log(formatAblation(name, options.overrides, result).join('\n'));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

void main();
