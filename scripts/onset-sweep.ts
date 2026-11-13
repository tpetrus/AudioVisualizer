// Sweeps rhythmConfig.ts constants of the band onset detector and scores every grid point against the acceptance bounds:
// F at 50 ms on every synthetic ground-truth band, and events per beat plus beat coverage on tapped local tracks. Run it
// with `npm run sweep:onsets -- --grid NAME=v1|v2`; with no arguments it prints the usage.
//
// Each point bundles scripts/rhythm-tools/onsetSweepRunner.ts with the overrides applied by the esbuild plugin of
// `npm run ablate:rhythm`; nothing under app/ is touched. Not part of the app bundle.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseBeatSidecar } from '../app/features/rhythm/eval/sidecar';
import { applyOverrides, type Override } from './rhythm-tools/ablate';
import { loadWithOverrides } from './rhythm-tools/ablatePlugin';
import { onsetRates } from './rhythm-tools/onsetRates';
import {
    expandGrid,
    formatPoint,
    parseSweepArguments,
    rankPoints,
    scorePoint,
    type LocalResult,
    type PointScore,
    type SyntheticResult,
} from './rhythm-tools/onsetSweep';
import type { LocalInput, LocalOnsets } from './rhythm-tools/onsetSweepRunner';
import { readWav } from './rhythm-tools/wav';

const USAGE = `Usage: npm run sweep:onsets -- [--grid NAME=v1|v2|...]... [--set NAME=VALUE]... [options]

Runs the band onset detector over every synthetic ground-truth track (scripts/ground-truth) and, with --dir, over every
tapped WAV of a folder, once per grid point (the cartesian product of the --grid axes), and checks the acceptance bounds:
  synthetic: every labelled band F >= 0.9 at 50 ms
  local:     kick, bass, snare <= 2 and highs <= 4 events per beat (kick <= 0.5 on --no-kick tracks), coverage >= 0.9
Prints the baseline (--set only) first, then the points ranked: no violations first, then fewer, then the larger worst
margin. A "!" marks a violated figure. Not a tuner: it only reports.

Options:
  --grid NAME=v1|v2  An rhythmConfig.ts constant and the values to try, '|' between them; values are numbers,
                     arithmetic and [ ] lists, e.g. --grid "BAND_ONSET_NOISE_FACTOR=[3,3,3]|[2,2,2]". Repeatable.
  --set NAME=VALUE   A fixed override applied to every point, including the baseline. Repeatable.
  --dir <folder>     WAVs with a .beats.json sidecar of source "tapped" next to them are checked as local tracks.
  --seconds <s>      Analyze at most the first s seconds of each local track (default 60).
  --no-kick <name>   A local track (file name without extension) that has no kick. Repeatable.
  --top <n>          Print only the n best ranked points (default all).
  --help             Show this text.`;

interface RunnerModule {
    runSynthetic: () => SyntheticResult[];
    runLocal: (inputs: readonly LocalInput[]) => LocalOnsets[];
}

interface LocalTrack {
    name: string;
    beats: number[];
    input: LocalInput;
}

function loadLocalTracks(dir: string, seconds: number): LocalTrack[] {
    const tracks: LocalTrack[] = [];
    for (const file of readdirSync(dir).sort()) {
        if (extname(file).toLowerCase() !== '.wav') continue;
        const name = basename(file, extname(file));
        const sidecarPath = join(dir, `${name}.beats.json`);
        if (!existsSync(sidecarPath)) continue;
        const sidecar = parseBeatSidecar(readFileSync(sidecarPath, 'utf8'));
        if (sidecar.source !== 'tapped') continue;
        const wav = readWav(readFileSync(join(dir, file)));
        const limit = Math.min(wav.samples.length, Math.round(seconds * wav.sampleRate));
        tracks.push({
            name,
            beats: sidecar.beats,
            input: { name, pcm: wav.samples.subarray(0, limit), sampleRate: wav.sampleRate },
        });
    }
    return tracks;
}

async function evaluate(
    overrides: readonly Override[],
    tracks: readonly LocalTrack[],
    noKick: readonly string[],
    seconds: number,
): Promise<{ score: PointScore; local: LocalResult[] }> {
    const runner = (await loadWithOverrides(
        { entryPoint: resolve('scripts/rhythm-tools/onsetSweepRunner.ts') },
        overrides,
    )) as RunnerModule;
    const synthetic = runner.runSynthetic();
    const detected = runner.runLocal(tracks.map((track) => track.input));
    const local = tracks.map((track, index): LocalResult => {
        const rates = onsetRates(track.beats, detected[index].onsets, seconds);
        return {
            track: track.name,
            noKick: noKick.includes(track.name),
            perBeat: rates.perBeat,
            coverage: rates.coverage,
        };
    });
    return { score: scorePoint(synthetic, local), local };
}

async function main(): Promise<void> {
    try {
        const options = parseSweepArguments(process.argv.slice(2));
        if (options === undefined) {
            console.log(USAGE);
            return;
        }
        if (options.dir !== undefined && (!existsSync(options.dir) || !statSync(options.dir).isDirectory())) {
            throw new Error(`Not a directory: ${options.dir}`);
        }
        const points = expandGrid(options.grid).map((point) => [...options.fixed, ...point]);
        // Checked before bundling so a mistyped name fails with its own message, not esbuild's wrapper around it.
        const config = readFileSync(resolve('app/features/rhythm/rhythmConfig.ts'), 'utf8');
        for (const point of points) applyOverrides(config, point);
        const tracks = options.dir === undefined ? [] : loadLocalTracks(options.dir, options.seconds);
        for (const name of options.noKick) {
            if (!tracks.some((track) => track.name === name)) {
                console.error(`Note: --no-kick ${name} matches no local track`);
            }
        }

        const baseline = await evaluate(options.fixed, tracks, options.noKick, options.seconds);
        const scored: { overrides: Override[]; score: PointScore; local: LocalResult[] }[] = [];
        for (const point of points) {
            scored.push({ overrides: point, ...(await evaluate(point, tracks, options.noKick, options.seconds)) });
        }
        const ranked = rankPoints(scored);
        const shown = options.top > 0 ? ranked.slice(0, options.top) : ranked;
        const lines = [
            `Onset sweep: ${points.length} point(s), ${tracks.length} local track(s), local tracks capped at ${options.seconds} s`,
            ...formatPoint('baseline', options.fixed, baseline.score, baseline.local),
        ];
        shown.forEach((point, index) => {
            lines.push(...formatPoint(`#${index + 1}`, point.overrides, point.score, point.local));
        });
        console.log(lines.join('\n'));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(`\n${USAGE}`);
        process.exitCode = 1;
    }
}

void main();
