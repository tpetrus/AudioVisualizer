// Pure helpers of `npm run bench:tracker`: reading the command line, the statistics over the timings and the text it prints.
// The extraction of the base ref, the bundling and the timing are in scripts/bench-tracker.ts.

export const DEFAULT_BENCH_TRACKS: readonly string[] = [
    'summer2000.wav',
    'low-bpm-rnb.wav',
    'drums-128.wav',
    'imyourgirl.wav',
    'beatless.wav',
];

export interface BenchArguments {
    dir: string;
    tracks: string[];
    runs: number;
    base: string;
}

export const BENCH_USAGE = `Usage: npm run bench:tracker -- [--dir <folder>] [--tracks a.wav,b.wav] [--runs N] [--base <git ref>]

Times the rhythm tracker (RhythmAnalyzer.pushFrame and updatePhase per frame, which includes BeatTracker) of a base git ref
and of the working tree, twice: kickless (frames only, as before the kick input existed) and with kicks (every batch's
kick events are pushed with pushKicks before its frames, as RhythmTracker does; a base ref without pushKicks is run
without them and the output says so), interleaved in one process so machine load hits both alike. The base ref's app/ is extracted with
git archive into node_modules/.cache and bundled there; the working tree is bundled as it is. The feature frames of each
track are computed once with the working tree's OnsetExtractor and BandOnsets (not timed, as the worklet does that work
off the main thread) and fed to both trackers, so the two must share
the frame layout. Advisory only: timings on a shared machine are noisy, and this is not a CI gate.

Options:
  --dir <folder>      Folder of WAVs (default .debug-in).
  --tracks a.wav,b.wav  Tracks to time (default ${DEFAULT_BENCH_TRACKS.join(',')}).
  --runs N            Timed runs per track and side, alternating which side goes first (default 7).
  --base <git ref>    The ref to compare against (default main).
  --help              Show this text.`;

export function parseBenchArguments(argv: readonly string[]): BenchArguments | undefined {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return undefined;
    const result: BenchArguments = { dir: '.debug-in', tracks: [...DEFAULT_BENCH_TRACKS], runs: 7, base: 'main' };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined || next.startsWith('--')) throw new Error(`${argument} needs a value`);
            return next;
        };
        switch (argument) {
            case '--dir':
                result.dir = value();
                break;
            case '--tracks': {
                const names = value()
                    .split(',')
                    .map((name) => name.trim())
                    .filter((name) => name !== '');
                if (names.length === 0) throw new Error('--tracks needs at least one file name');
                result.tracks = names.map((name) => (/\.wav$/i.test(name) ? name : `${name}.wav`));
                break;
            }
            case '--runs': {
                const text = value();
                const runs = Number(text);
                if (!Number.isInteger(runs) || runs < 1)
                    throw new Error(`--runs needs a whole number above 0, got "${text}"`);
                result.runs = runs;
                break;
            }
            case '--base':
                result.base = value();
                break;
            default:
                throw new Error(`Unknown argument ${argument}`);
        }
    }
    return result;
}

export function median(values: readonly number[]): number {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Nanoseconds per frame for one run.
export function nsPerFrame(elapsedNs: number, frames: number): number {
    return elapsedNs / frames;
}

// One timed pair: the two sides of the same run on the same track.
export interface BenchSample {
    baseNs: number;
    branchNs: number;
}

export interface TrackBench {
    track: string;
    frames: number;
    samples: BenchSample[];
}

export interface BenchSummary {
    // Per track: the medians of each side and the median of the per-pair ratios branch / base.
    tracks: { track: string; frames: number; baseNs: number; branchNs: number; ratio: number }[];
    overall: { baseNs: number; branchNs: number; ratio: number };
}

export function summarizeBench(results: readonly TrackBench[]): BenchSummary {
    const pair = (samples: readonly BenchSample[]) => ({
        baseNs: median(samples.map((sample) => sample.baseNs)),
        branchNs: median(samples.map((sample) => sample.branchNs)),
        ratio: median(samples.map((sample) => sample.branchNs / sample.baseNs)),
    });
    return {
        tracks: results.map((result) => ({ track: result.track, frames: result.frames, ...pair(result.samples) })),
        overall: pair(results.flatMap((result) => result.samples)),
    };
}

// The line that says whether the base side was given kick events in the with-kicks run.
export function kickNote(baseHasPushKicks: boolean): string {
    return baseHasPushKicks
        ? 'with kicks: both sides were given the kick events (pushKicks per batch before its frames)'
        : 'with kicks: the base ref has no pushKicks, so only the working tree was given the kick events';
}

export function formatBench(summary: BenchSummary, base: string, runs: number, label = 'kickless'): string[] {
    const lines = [
        `tracker timing (${label}), ${runs} runs per side, base ${base} vs working tree (median ns per frame)`,
    ];
    const row = (name: string, frames: string, baseNs: number, branchNs: number, ratio: number): string =>
        `${name.padEnd(22)} ${frames.padStart(8)} ${baseNs.toFixed(0).padStart(10)} ${branchNs.toFixed(0).padStart(10)} ${ratio.toFixed(3).padStart(8)}`;
    lines.push(
        `${'track'.padEnd(22)} ${'frames'.padStart(8)} ${'base'.padStart(10)} ${'branch'.padStart(10)} ${'ratio'.padStart(8)}`,
    );
    for (const track of summary.tracks) {
        lines.push(row(track.track, String(track.frames), track.baseNs, track.branchNs, track.ratio));
    }
    const { overall } = summary;
    lines.push(row('overall', '', overall.baseNs, overall.branchNs, overall.ratio));
    return lines;
}
