// Offline evaluation of the rhythm tracker. It runs the very same pure pipeline as the app (OnsetExtractor ->
// RhythmAnalyzer) over a directory of labelled audio and prints the numbers that say how far the tracker can be
// trusted. Run it with `npm run eval:rhythm -- <dataset-dir>`; with no arguments it prints the usage.
//
// Not part of the app bundle: nothing under app/ imports this file.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { concat, createRandom, runPipeline, silence, timeToLock } from '../app/features/rhythm/testSignals';
import type { RunResult } from '../app/features/rhythm/testSignals';
import type { BeatsPerBar } from '../app/features/rhythm/types';
import { detectFromPcm } from '../app/features/rhythm/eval/detect';
import {
    buildEvalReport,
    formatEvalReports,
    formatTempoLine,
    tempoFigures,
} from '../app/features/rhythm/eval/evalReport';
import { parseBeatSidecar } from '../app/features/rhythm/eval/sidecar';
import { formatOnsetRates, onsetRates } from './rhythm-tools/onsetRates';
import { tempoStability } from './rhythm-tools/tempoStability';

const USAGE = `Usage: npm run eval:rhythm -- <dataset-dir> [options]
       npm run eval:rhythm -- <wav-dir> --alignment [--annotations <dir>] [--max-seconds <s>]

Evaluates the rhythm tracker over labelled WAV files (16/24/32-bit PCM or 32/64-bit float, any channel count).

The dataset follows the Ballroom layout: one folder per genre holding the audio, e.g.
  <dataset-dir>/ChaChaCha/Albums-Cafe_Paradiso-05.wav
  <dataset-dir>/Waltz/...
Waltz and VienneseWaltz are 3/4, every other genre is 4/4.

Optional ground truth, looked up per file as <name>.beats (rows of "time beatNumber", beat number 1 = downbeat, as in
the Krebs annotations) or <name>.bpm (one number) in --annotations/<genre>/, then --annotations/, then next to the wav:
  tempo accuracy needs a .beats or .bpm file, downbeat F1 needs a .beats file with beat numbers.

Options:
  --annotations <dir>   Folder holding the .beats / .bpm files.
  --pairs <n>           Random song pairs per join mode for the song-change test (default 20, 0 to skip).
  --seed <n>            Seed for the pair selection (default 1).
  --max-files <n>       Use at most n files, spread evenly over the dataset (default all).
  --max-seconds <s>     Only analyse the first s seconds of each file (default 30, 0 = whole file).
  --gap <s>             Silence between the songs in the gap test (default 2).
  --alignment           Alignment mode: <wav-dir> holds WAV files directly (no genre folders). Each WAV with a
                        <name>.beats.json sidecar (exact beat times, and per-band onset times for synthetic tracks) gets
                        its alignment report: tempo ratio and lock time, beat error at the lock, and onset scores at
                        50 and 20 ms. A WAV with only a <name>.bpm gets tempo ratio and lock time. Sidecars are looked
                        up in --annotations, then next to the wav. The whole file is used unless --max-seconds is given.
                        Make synthetic tracks with: npm run ground-truth -- <out-dir>
  --help                Show this text.`;

// Tempo tolerance for Acc1 and Acc2, as a fraction of the true tempo.
const TEMPO_TOLERANCE = 0.04;
// Downbeat F1 tolerance in seconds.
const DOWNBEAT_TOLERANCE = 0.07;
// The meter must hold for the final stretch of the file to count as the file's answer.
const FINAL_WINDOW_SECONDS = 5;
// Soft resets in this many seconds after a join are expected (the new song is being recognised), later ones are false.
const EXPECTED_RESET_SECONDS = 10;
const THREE_FOUR_GENRES = new Set(['waltz', 'viennesewaltz']);

interface Options {
    dataset: string;
    annotations: string | undefined;
    pairs: number;
    seed: number;
    maxFiles: number;
    maxSeconds: number;
    gapSeconds: number;
    alignment: boolean;
    // Whether --max-seconds was given: the alignment mode otherwise reads whole files.
    maxSecondsGiven: boolean;
}

interface Clip {
    path: string;
    genre: string;
    meter: BeatsPerBar;
    sampleRate: number;
    pcm: Float32Array;
    bpm: number | undefined;
    downbeats: number[] | undefined;
}

function parseArguments(argv: string[]): Options | undefined {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        return undefined;
    }
    const options: Options = {
        dataset: '',
        annotations: undefined,
        pairs: 20,
        seed: 1,
        maxFiles: Infinity,
        maxSeconds: 30,
        gapSeconds: 2,
        alignment: false,
        maxSecondsGiven: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined) {
                throw new Error(`${argument} needs a value`);
            }
            return next;
        };
        switch (argument) {
            case '--annotations':
                options.annotations = value();
                break;
            case '--pairs':
                options.pairs = Number(value());
                break;
            case '--seed':
                options.seed = Number(value());
                break;
            case '--max-files':
                options.maxFiles = Number(value());
                break;
            case '--max-seconds':
                options.maxSeconds = Number(value());
                options.maxSecondsGiven = true;
                break;
            case '--alignment':
                options.alignment = true;
                break;
            case '--gap':
                options.gapSeconds = Number(value());
                break;
            default:
                if (argument.startsWith('--')) {
                    throw new Error(`Unknown option ${argument}`);
                }
                options.dataset = argument;
        }
    }
    if (options.dataset === '') {
        throw new Error('Missing <dataset-dir>');
    }
    return options;
}

// ---- WAV reading ----

// Reads a RIFF/WAVE file and mixes it down to mono floats in -1..1. Handles integer PCM (8, 16, 24, 32 bit), IEEE
// float (32, 64 bit) and the WAVE_FORMAT_EXTENSIBLE wrapper around either.
function readWav(buffer: Buffer): { sampleRate: number; samples: Float32Array } {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Not a RIFF/WAVE file');
    }
    let format = 0;
    let channels = 0;
    let sampleRate = 0;
    let bits = 0;
    let dataStart = -1;
    let dataLength = 0;
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === 'fmt ') {
            format = buffer.readUInt16LE(body);
            channels = buffer.readUInt16LE(body + 2);
            sampleRate = buffer.readUInt32LE(body + 4);
            bits = buffer.readUInt16LE(body + 14);
            if (format === 0xfffe && size >= 26) {
                // The real format is the first two bytes of the sub-format GUID.
                format = buffer.readUInt16LE(body + 24);
            }
        } else if (id === 'data') {
            dataStart = body;
            // Streamed files may declare a size past the end of the buffer.
            dataLength = Math.min(size, buffer.length - body);
            break;
        }
        // Chunks are padded to an even size.
        offset = body + size + (size % 2);
    }
    if (dataStart < 0 || channels === 0 || sampleRate === 0) {
        throw new Error('Missing fmt or data chunk');
    }
    const bytesPerSample = bits / 8;
    const frames = Math.floor(dataLength / (bytesPerSample * channels));
    const samples = new Float32Array(frames);
    const read = (position: number): number => {
        if (format === 3 && bits === 32) {
            return buffer.readFloatLE(position);
        }
        if (format === 3 && bits === 64) {
            return buffer.readDoubleLE(position);
        }
        if (format === 1) {
            switch (bits) {
                case 8:
                    return (buffer.readUInt8(position) - 128) / 128;
                case 16:
                    return buffer.readInt16LE(position) / 32768;
                case 24:
                    return buffer.readIntLE(position, 3) / 8388608;
                case 32:
                    return buffer.readInt32LE(position) / 2147483648;
            }
        }
        throw new Error(`Unsupported WAV format ${format} with ${bits} bits`);
    };
    for (let frame = 0; frame < frames; frame++) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel++) {
            sum += read(dataStart + (frame * channels + channel) * bytesPerSample);
        }
        samples[frame] = sum / channels;
    }
    return { sampleRate, samples };
}

// ---- Annotations ----

interface Annotation {
    bpm: number | undefined;
    downbeats: number[] | undefined;
}

function median(values: number[]): number {
    if (values.length === 0) {
        return NaN;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function findSidecar(
    wavPath: string,
    genre: string,
    annotations: string | undefined,
    extension: string,
): string | undefined {
    const name = basename(wavPath, extname(wavPath)) + extension;
    const candidates = [
        annotations ? join(annotations, genre, name) : '',
        annotations ? join(annotations, name) : '',
        join(wavPath, '..', name),
    ].filter((path) => path !== '');
    return candidates.find((path) => existsSync(path));
}

function readAnnotation(wavPath: string, genre: string, annotations: string | undefined): Annotation {
    const result: Annotation = { bpm: undefined, downbeats: undefined };
    const beatsPath = findSidecar(wavPath, genre, annotations, '.beats');
    if (beatsPath) {
        const times: number[] = [];
        const downbeats: number[] = [];
        let hasNumbers = false;
        for (const line of readFileSync(beatsPath, 'utf8').split(/\r?\n/)) {
            const columns = line.trim().split(/\s+/);
            const time = Number(columns[0]);
            if (columns[0] === '' || !Number.isFinite(time)) {
                continue;
            }
            times.push(time);
            if (columns.length > 1 && Number.isFinite(Number(columns[1]))) {
                hasNumbers = true;
                if (Number(columns[1]) === 1) {
                    downbeats.push(time);
                }
            }
        }
        if (times.length > 3) {
            const intervals = times.slice(1).map((time, i) => time - times[i]);
            result.bpm = 60 / median(intervals);
        }
        if (hasNumbers) {
            result.downbeats = downbeats;
        }
    }
    const bpmPath = findSidecar(wavPath, genre, annotations, '.bpm');
    if (result.bpm === undefined && bpmPath) {
        const value = Number(readFileSync(bpmPath, 'utf8').trim().split(/\s+/)[0]);
        if (Number.isFinite(value) && value > 0) {
            result.bpm = value;
        }
    }
    return result;
}

// ---- Loading ----

function listWavs(directory: string): string[] {
    return readdirSync(directory)
        .filter((name) => name.toLowerCase().endsWith('.wav'))
        .sort()
        .map((name) => join(directory, name));
}

function loadClips(options: Options): Clip[] {
    const genres = readdirSync(options.dataset)
        .filter((name) => statSync(join(options.dataset, name)).isDirectory())
        .sort();
    const paths: { path: string; genre: string }[] = [];
    for (const genre of genres) {
        for (const path of listWavs(join(options.dataset, genre))) {
            paths.push({ path, genre });
        }
    }
    // Spread a limited selection evenly so every genre is still represented.
    const selected =
        paths.length > options.maxFiles
            ? Array.from(
                  { length: options.maxFiles },
                  (_, i) => paths[Math.floor((i * paths.length) / options.maxFiles)],
              )
            : paths;
    const clips: Clip[] = [];
    for (const { path, genre } of selected) {
        const wav = readWav(readFileSync(path));
        const limit = options.maxSeconds > 0 ? Math.round(options.maxSeconds * wav.sampleRate) : wav.samples.length;
        const annotation = readAnnotation(path, genre, options.annotations);
        clips.push({
            path,
            genre,
            meter: THREE_FOUR_GENRES.has(genre.toLowerCase()) ? 3 : 4,
            sampleRate: wav.sampleRate,
            pcm: wav.samples.subarray(0, limit),
            bpm: annotation.bpm,
            downbeats: annotation.downbeats?.filter((time) => time <= limit / wav.sampleRate),
        });
    }
    return clips;
}

// ---- Metrics ----

function isTempoMatch(estimate: number, truth: number, ratios: readonly number[]): boolean {
    return ratios.some((ratio) => Math.abs(estimate / (truth * ratio) - 1) <= TEMPO_TOLERANCE);
}

// F-measure of detected events against truth times, matched one to one within the tolerance.
function fMeasure(events: number[], truth: number[], tolerance: number): number {
    if (events.length === 0 || truth.length === 0) {
        return 0;
    }
    let matched = 0;
    let t = 0;
    for (const event of events) {
        while (t < truth.length && truth[t] < event - tolerance) {
            t++;
        }
        if (t < truth.length && Math.abs(truth[t] - event) <= tolerance) {
            matched++;
            t++;
        }
    }
    const precision = matched / events.length;
    const recall = matched / truth.length;
    return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

// Majority meter and median tempo over the last few seconds of a run: the answer the tracker settled on.
function finalAnswer(run: RunResult): { meter: BeatsPerBar | undefined; bpm: number } {
    const end = run.samples[run.samples.length - 1]?.time ?? 0;
    const tail = run.samples.filter((sample) => sample.time >= end - FINAL_WINDOW_SECONDS);
    const votes = new Map<BeatsPerBar | undefined, number>();
    for (const sample of tail) {
        votes.set(sample.beatsPerBar, (votes.get(sample.beatsPerBar) ?? 0) + 1);
    }
    let meter: BeatsPerBar | undefined;
    let best = -1;
    for (const [candidate, count] of votes) {
        if (count > best) {
            best = count;
            meter = candidate;
        }
    }
    return { meter, bpm: median(tail.map((sample) => sample.bpm)) };
}

function percent(part: number, whole: number): string {
    return whole === 0 ? 'n/a' : `${((100 * part) / whole).toFixed(1)}% (${part}/${whole})`;
}

function seconds(values: number[]): string {
    return values.length === 0 ? 'n/a' : `${median(values).toFixed(1)} s`;
}

// ---- Evaluation ----

function evaluateSingles(clips: Clip[]): void {
    let acc1 = 0;
    let acc2 = 0;
    let tempoTotal = 0;
    const meterHits = new Map<BeatsPerBar, { hit: number; total: number }>([
        [3, { hit: 0, total: 0 }],
        [4, { hit: 0, total: 0 }],
    ]);
    let unsure = 0;
    const lockTimes: number[] = [];
    let neverLocked = 0;
    let f1Total = 0;
    let f1Files = 0;
    let steadyF1Total = 0;
    let falseResets = 0;
    let stableTotal = 0;
    let stableFiles = 0;
    let jumpTotal = 0;

    for (const clip of clips) {
        const run = runPipeline(clip.pcm, { sampleRate: clip.sampleRate });
        const stability = tempoStability(run.samples);
        if (stability) {
            stableFiles++;
            stableTotal += stability.nearFinalShare;
            jumpTotal += stability.jumps;
        }
        const answer = finalAnswer(run);
        const tally = meterHits.get(clip.meter);
        if (tally) {
            tally.total++;
            if (answer.meter === clip.meter) {
                tally.hit++;
            }
        }
        if (answer.meter === undefined) {
            unsure++;
        }
        const lock = timeToLock(run.samples, clip.meter);
        if (lock === undefined) {
            neverLocked++;
        } else {
            lockTimes.push(lock);
        }
        falseResets += run.songChangeEvents.length;

        if (clip.bpm !== undefined) {
            tempoTotal++;
            if (isTempoMatch(answer.bpm, clip.bpm, [1])) {
                acc1++;
            }
            if (isTempoMatch(answer.bpm, clip.bpm, [1, 0.5, 2, 1 / 3, 3])) {
                acc2++;
            }
        }
        if (clip.downbeats !== undefined && clip.downbeats.length > 0) {
            f1Files++;
            f1Total += fMeasure(run.downbeatEvents, clip.downbeats, DOWNBEAT_TOLERANCE);
            // The steady-state score only judges the part after the tracker first reported the right meter.
            const lockedAt = lock === undefined ? Infinity : lock;
            const events = run.downbeatEvents.filter((time) => time >= lockedAt);
            const truth = clip.downbeats.filter((time) => time >= lockedAt);
            steadyF1Total += fMeasure(events, truth, DOWNBEAT_TOLERANCE);
        }
    }

    const three = meterHits.get(3) ?? { hit: 0, total: 0 };
    const four = meterHits.get(4) ?? { hit: 0, total: 0 };
    const recalls = [three, four].filter((entry) => entry.total > 0).map((entry) => entry.hit / entry.total);
    const balanced = recalls.length === 0 ? NaN : recalls.reduce((sum, value) => sum + value, 0) / recalls.length;

    console.log('\nSingle files');
    console.log(`  files                 ${clips.length}`);
    console.log(`  tempo Acc1 (4%)       ${percent(acc1, tempoTotal)}`);
    console.log(`  tempo Acc2 (octaves)  ${percent(acc2, tempoTotal)}`);
    console.log(`  3/4 recall            ${percent(three.hit, three.total)}`);
    console.log(`  4/4 recall            ${percent(four.hit, four.total)}`);
    console.log(`  balanced meter acc.   ${Number.isNaN(balanced) ? 'n/a' : `${(100 * balanced).toFixed(1)}%`}`);
    console.log(`  ended unsure          ${percent(unsure, clips.length)}`);
    console.log(`  median time-to-lock   ${seconds(lockTimes)} (${neverLocked} never locked)`);
    console.log(
        `  downbeat F1 (+-70ms)  ${f1Files === 0 ? 'n/a (no beat annotations)' : `${(f1Total / f1Files).toFixed(3)} whole file, ${(steadyF1Total / f1Files).toFixed(3)} after lock (${f1Files} files)`}`,
    );
    console.log(
        `  song changes per file ${(falseResets / Math.max(1, clips.length)).toFixed(2)} (every one is a false reset)`,
    );
    // Added after the lines above, which keep their text. The share is the mean over files that held a tempo at the end.
    console.log(
        `  tempo stability       ${stableFiles === 0 ? 'n/a (no file held a tempo)' : `${((100 * stableTotal) / stableFiles).toFixed(1)}% of time after lock within 1% of the final tempo, ${jumpTotal} held-tempo jumps over 4% (${stableFiles} files)`}`,
    );
}

function evaluatePairs(clips: Clip[], options: Options): void {
    if (options.pairs <= 0 || clips.length < 2) {
        return;
    }
    const random = createRandom(options.seed);
    const pick = (): Clip => clips[Math.floor(random() * clips.length)];
    const pairs: [Clip, Clip][] = [];
    while (pairs.length < options.pairs) {
        const first = pick();
        const second = pick();
        // Resampling is out of scope: pairs must share a sample rate to be joined.
        if (first !== second && first.sampleRate === second.sampleRate) {
            pairs.push([first, second]);
        }
    }

    for (const gap of [options.gapSeconds, 0]) {
        const relock: number[] = [];
        let failedToRelock = 0;
        let falseResets = 0;
        let missed = 0;
        for (const [first, second] of pairs) {
            const rate = first.sampleRate;
            const pcm = gap > 0 ? concat(first.pcm, silence(gap, rate), second.pcm) : concat(first.pcm, second.pcm);
            const run = runPipeline(pcm, { sampleRate: rate });
            const join = first.pcm.length / rate;
            const resume = join + gap;
            const lock = timeToLock(run.samples, second.meter, resume);
            if (lock === undefined) {
                failedToRelock++;
            } else {
                relock.push(lock);
            }
            // Expected: anything from the join to a few seconds after the music resumed. Everything else is false.
            const expected = run.songChangeEvents.filter(
                (time) => time >= join - 0.5 && time <= resume + EXPECTED_RESET_SECONDS,
            );
            falseResets += run.songChangeEvents.length - expected.length;
            if (gap > 0 && !run.songChangeEvents.some((time) => time >= join - 0.5 && time <= resume)) {
                missed++;
            }
        }
        console.log(`\nSong pairs, ${gap > 0 ? `${gap} s gap` : 'gapless'} (${pairs.length} pairs)`);
        console.log(
            `  median re-lock time   ${seconds(relock)} after the second song starts (${failedToRelock} never re-locked)`,
        );
        console.log(`  false resets          ${falseResets} (${(falseResets / pairs.length).toFixed(2)} per pair)`);
        if (gap > 0) {
            console.log(`  gaps with no hard reset ${missed}`);
        }
    }
}

// ---- Alignment ----

// Reports for every WAV directly in the folder that has a ground-truth sidecar. Detected beats, tempo and onsets come from
// the real pipeline (see app/features/rhythm/eval/detect.ts).
function evaluateAlignment(options: Options): void {
    const wavs = listWavs(options.dataset);
    if (wavs.length === 0) {
        console.error(`No .wav files found in ${options.dataset}`);
        process.exitCode = 1;
        return;
    }
    console.log(`Alignment over ${wavs.length} files in ${options.dataset}`);
    for (const path of wavs) {
        const name = basename(path);
        const beatsPath = findSidecar(path, '', options.annotations, '.beats.json');
        const bpm = readAnnotation(path, '', options.annotations).bpm;
        if (beatsPath === undefined && bpm === undefined) {
            console.log(`\n${name}: no .beats.json or .bpm sidecar, skipped`);
            continue;
        }
        const wav = readWav(readFileSync(path));
        const limit =
            options.maxSecondsGiven && options.maxSeconds > 0
                ? Math.round(options.maxSeconds * wav.sampleRate)
                : wav.samples.length;
        const detected = detectFromPcm(wav.samples.subarray(0, limit), wav.sampleRate);
        console.log('');
        if (beatsPath !== undefined) {
            try {
                const sidecar = parseBeatSidecar(readFileSync(beatsPath, 'utf8'));
                // A truncated run has nothing to say about the truth after its end.
                const end = limit / wav.sampleRate;
                const upTo = (times: number[]): number[] => times.filter((time) => time <= end);
                sidecar.beats = upTo(sidecar.beats);
                if (sidecar.onsets) {
                    for (const band of Object.keys(sidecar.onsets) as (keyof typeof sidecar.onsets)[]) {
                        sidecar.onsets[band] = upTo(sidecar.onsets[band]);
                    }
                }
                // The report names the audio file that was actually analysed.
                sidecar.track = name;
                console.log(formatEvalReports([buildEvalReport(sidecar, detected)]).join('\n'));
                if (sidecar.source === 'tapped') {
                    console.log(formatOnsetRates(onsetRates(sidecar.beats, detected.onsets)).join('\n'));
                }
            } catch (error) {
                console.error(`${name}: ${beatsPath}: ${error instanceof Error ? error.message : String(error)}`);
                process.exitCode = 1;
            }
        } else if (bpm !== undefined) {
            console.log(`${name} (tempo only, from .bpm)\n  ${formatTempoLine(tempoFigures(bpm, detected.tempo))}`);
        }
    }
}

function main(): void {
    let options: Options | undefined;
    try {
        options = parseArguments(process.argv.slice(2));
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
    if (!existsSync(options.dataset) || !statSync(options.dataset).isDirectory()) {
        console.error(`Not a directory: ${options.dataset}`);
        process.exitCode = 1;
        return;
    }
    if (options.alignment) {
        evaluateAlignment(options);
        return;
    }
    const clips = loadClips(options);
    if (clips.length === 0) {
        console.error(`No .wav files found in the genre folders of ${options.dataset}`);
        process.exitCode = 1;
        return;
    }
    console.log(`Loaded ${clips.length} clips from ${options.dataset}`);
    evaluateSingles(clips);
    evaluatePairs(clips, options);
}

main();
