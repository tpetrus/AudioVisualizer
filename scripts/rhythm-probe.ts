// Evidence tables for the tempo tracker's first choice. For each WAV in a folder that has a `<name>.bpm` sidecar it prints
// Markdown: the tempo over time, the winner and its dotted rivals with the autocorrelation support behind each, and how
// much support the first-held pulse keeps. It only measures; it does not decide anything. Run it with
// `npm run probe:rhythm -- <dir>`; with no arguments it prints the usage.
//
// With `--write-fixtures <out>` it also writes one derived fixture per WAV (the onset envelope, no audio) for the specs
// to replay. Not part of the app bundle: nothing under app/ imports this file.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseBpmSidecar } from './debug-visualizer/tempoReport';
import { encodeFixture, FIXTURE_SECONDS, serializeFixture } from './rhythm-tools/fixture';
import { extractOnsetSeries } from './rhythm-tools/onset';
import { buildProbeReport } from './rhythm-tools/probe';
import { readWav } from './rhythm-tools/wav';

const USAGE = `Usage: npm run probe:rhythm -- <dir> [options]

For every <name>.wav in <dir> that has a <name>.bpm sidecar (one number, the format eval:rhythm reads), prints Markdown
evidence for the tempo tracker's first choice: raw and held tempo over time, the winner and its dotted (4/3, 3/4) rivals
with autocorrelation support at each rival's own 4L and 8L, kick-band and per-band support, L/2 and L/3 subdivision
support, and the support the first-held pulse keeps over time. It reports numbers and does not interpret them.

Options:
  --seconds <s>             Analyze at most the first s seconds of each track (default 60).
  --every <s>               Seconds between rows of the over-time table (default 5).
  --write-fixtures <out>    Also write <out>/<name>.json for every WAV: the frame rate, the reference tempo and the
                            first ${FIXTURE_SECONDS} s of the combined onset envelope. No audio is written.
  --help                    Show this text.`;

interface Options {
    dir: string;
    maxSeconds: number;
    everySeconds: number;
    fixturesDir: string | undefined;
}

function parseArguments(argv: string[]): Options | undefined {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        return undefined;
    }
    const options: Options = { dir: '', maxSeconds: 60, everySeconds: 5, fixturesDir: undefined };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined) {
                throw new Error(`${argument} needs a value`);
            }
            return next;
        };
        const seconds = (): number => {
            const number = Number(value());
            if (!Number.isFinite(number) || number <= 0) {
                throw new Error(`${argument} needs a number of seconds above 0`);
            }
            return number;
        };
        switch (argument) {
            case '--seconds':
                options.maxSeconds = seconds();
                break;
            case '--every':
                options.everySeconds = seconds();
                break;
            case '--write-fixtures':
                options.fixturesDir = value();
                break;
            default:
                if (argument.startsWith('--')) {
                    throw new Error(`Unknown option ${argument}`);
                }
                options.dir = argument;
        }
    }
    if (options.dir === '') {
        throw new Error('Missing <dir>');
    }
    return options;
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
    if (!existsSync(options.dir) || !statSync(options.dir).isDirectory()) {
        console.error(`Not a directory: ${options.dir}`);
        process.exitCode = 1;
        return;
    }
    const wavs = readdirSync(options.dir)
        .filter((name) => name.toLowerCase().endsWith('.wav'))
        .sort();
    if (wavs.length === 0) {
        console.error(`No .wav files in ${options.dir}`);
        process.exitCode = 1;
        return;
    }
    if (options.fixturesDir !== undefined) {
        mkdirSync(options.fixturesDir, { recursive: true });
    }

    const skipped: string[] = [];
    const output: string[] = ['# Rhythm probe', ''];
    for (const file of wavs) {
        const name = basename(file, extname(file));
        const sidecar = join(options.dir, `${name}.bpm`);
        const referenceBpm = existsSync(sidecar) ? parseBpmSidecar(readFileSync(sidecar, 'utf8')) : undefined;
        if (referenceBpm === undefined && options.fixturesDir === undefined) {
            skipped.push(name);
            continue;
        }
        const wav = readWav(readFileSync(join(options.dir, file)));
        const series = extractOnsetSeries(wav.samples, wav.sampleRate);
        if (options.fixturesDir !== undefined) {
            const fixture = encodeFixture(name, series.combined, series.frameRate, referenceBpm);
            writeFileSync(join(options.fixturesDir, `${name}.json`), serializeFixture(fixture));
        }
        if (referenceBpm === undefined) {
            skipped.push(name);
            continue;
        }
        output.push(
            ...buildProbeReport(
                { name, series, referenceBpm },
                { everySeconds: options.everySeconds, maxSeconds: options.maxSeconds },
            ),
        );
    }
    if (skipped.length > 0) {
        output.push(`Skipped (no usable .bpm sidecar): ${skipped.join(', ')}`, '');
    }
    console.log(output.join('\n'));
}

main();
