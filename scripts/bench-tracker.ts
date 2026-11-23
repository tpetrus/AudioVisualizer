// Tracker benchmark: times RhythmAnalyzer (pushFrame and updatePhase per frame, BeatTracker included) of a base git ref and
// of the working tree, interleaved in one process, over a few tracks. Run it with `npm run bench:tracker`; with no
// arguments it prints the usage. Advisory only: it is not a CI gate, and nothing under app/ imports this file.
//
// The base ref's app/ is extracted with `git archive` into node_modules/.cache (not a git worktree, which would need its
// own node_modules) and bundled there with esbuild, the working tree is bundled as it is. The feature frames of each
// track are computed once, outside the timing, with the working tree's extractor.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OnsetExtractor, packFrame } from '../app/features/rhythm/onsetExtractor';
import { FRAME_STRIDE } from '../app/features/rhythm/rhythmConfig';
import { loadWithOverrides } from './rhythm-tools/ablatePlugin';
import {
    BENCH_USAGE,
    formatBench,
    nsPerFrame,
    parseBenchArguments,
    summarizeBench,
    type TrackBench,
} from './rhythm-tools/benchTracker';
import { readWav } from './rhythm-tools/wav';
import { applyAgc } from './scorecard/engine/agc';

interface Tracker {
    pushFrame: (time: number, frames: Float32Array, offset: number) => void;
    updatePhase: (now: number) => void;
}
interface TrackerModule {
    RhythmAnalyzer: new (frameRate: number) => Tracker;
    FRAME_STRIDE: number;
}

// What each side's bundle exports: the tracker and the frame layout it reads.
const ENTRY = `export { RhythmAnalyzer } from './app/features/rhythm/rhythmAnalyzer';
export { FRAME_STRIDE } from './app/features/rhythm/rhythmConfig';`;

async function load(directory: string): Promise<TrackerModule> {
    return (await loadWithOverrides(
        { stdin: { contents: ENTRY, resolveDir: directory, loader: 'ts' } },
        [],
    )) as TrackerModule;
}

// Extracts the base ref's app/ into a fresh folder under node_modules/.cache. `git archive` fails on an unknown ref.
function extractBase(ref: string): string {
    const target = resolve('node_modules/.cache/bench-tracker-base');
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    const archive = execFileSync('git', ['archive', '--format=tar', ref, 'app'], { maxBuffer: 1 << 30 });
    // The folder is the working directory rather than a -C argument: GNU tar reads `C:...` as a remote host.
    execFileSync('tar', ['-x'], { input: archive, cwd: target });
    return target;
}

interface TrackFrames {
    name: string;
    frames: Float32Array;
    count: number;
    frameRate: number;
}

// The packed frames the tracker would be given for a track, computed once. The AGC is applied first as the replay does.
function extractFrames(name: string, path: string): TrackFrames {
    const wav = readWav(readFileSync(path));
    const audio = applyAgc(wav.samples, wav.sampleRate);
    const extractor = new OnsetExtractor(wav.sampleRate);
    const chunks: Float32Array[] = [];
    for (let offset = 0; offset < audio.length; offset += 128) {
        extractor.push(audio.subarray(offset, Math.min(audio.length, offset + 128)), (frame) => {
            const packed = new Float32Array(FRAME_STRIDE);
            packFrame(frame, packed, 0);
            chunks.push(packed);
        });
    }
    const frames = new Float32Array(chunks.length * FRAME_STRIDE);
    chunks.forEach((chunk, index) => frames.set(chunk, index * FRAME_STRIDE));
    return { name, frames, count: chunks.length, frameRate: extractor.frameRate };
}

// One timed pass over a track's frames with a fresh tracker.
function timeRun(module: TrackerModule, track: TrackFrames): number {
    const tracker = new module.RhythmAnalyzer(track.frameRate);
    const started = process.hrtime.bigint();
    for (let i = 0; i < track.count; i++) {
        const time = i / track.frameRate;
        tracker.pushFrame(time, track.frames, i * FRAME_STRIDE);
        tracker.updatePhase(time);
    }
    return nsPerFrame(Number(process.hrtime.bigint() - started), track.count);
}

async function main(): Promise<void> {
    let options;
    try {
        options = parseBenchArguments(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(`\n${BENCH_USAGE}`);
        process.exitCode = 1;
        return;
    }
    if (options === undefined) {
        console.log(BENCH_USAGE);
        return;
    }
    try {
        const dir = resolve(options.dir);
        const tracks: TrackFrames[] = [];
        for (const name of options.tracks) {
            const path = join(dir, name);
            if (!existsSync(path)) throw new Error(`No such file: ${path}`);
            tracks.push(extractFrames(name, path));
        }
        const baseDirectory = extractBase(options.base);
        const base = await load(baseDirectory);
        const branch = await load(resolve('.'));
        if (base.FRAME_STRIDE !== branch.FRAME_STRIDE || base.FRAME_STRIDE !== FRAME_STRIDE) {
            throw new Error(
                `The frame layout of ${options.base} differs from the working tree's, so shared frames do not fit`,
            );
        }
        const results: TrackBench[] = tracks.map((track) => ({ track: track.name, frames: track.count, samples: [] }));
        // One untimed pass per side first, so the timed ones run warm.
        for (const track of tracks) {
            timeRun(base, track);
            timeRun(branch, track);
        }
        for (let run = 0; run < options.runs; run++) {
            tracks.forEach((track, index) => {
                // Which side goes first alternates, so a drifting machine state does not favor one.
                const baseFirst = (run + index) % 2 === 0;
                let baseNs: number;
                let branchNs: number;
                if (baseFirst) {
                    baseNs = timeRun(base, track);
                    branchNs = timeRun(branch, track);
                } else {
                    branchNs = timeRun(branch, track);
                    baseNs = timeRun(base, track);
                }
                results[index].samples.push({ baseNs, branchNs });
            });
        }
        console.log(formatBench(summarizeBench(results), options.base, options.runs).join('\n'));
        rmSync(baseDirectory, { recursive: true, force: true });
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

void main();
