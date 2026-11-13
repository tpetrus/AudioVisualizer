// Pure helpers for the debug:viz command (argument parsing, track lookup, shot scheduling). Kept apart from run.ts so
// the process and browser handling there stays readable. Not part of the app bundle.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a'];

export const USAGE =
    'Usage: npm run debug:viz -- --dir <folder> --track <file> --viz <name> [--seconds N] [--from T] [--shots t1,t2] [--reselect N] [--no-normalize] [--headless]';

export const SUMMARY_USAGE =
    'Usage: npm run debug:summary -- <telemetry.csv> [--bpm N] [--window S] [--reaction <column>]';

export const REPEAT_USAGE = 'Usage: npm run debug:repeat -- <a.csv> <b.csv> [...] [--bpm N]';

export interface RunArgs {
    dir: string;
    track: string;
    viz: string;
    seconds: number | undefined; // undefined: play to the end of the track
    from: number;
    shots: number[];
    reselect: number; // how many times the track is played in one page, choosing it again each time
    headless: boolean;
    // Turns the engine's volume normalization off for the run.
    noNormalize: boolean;
}

export type ParsedArgs = { kind: 'help' } | { kind: 'run'; args: RunArgs } | { kind: 'error'; message: string };

// Reads a non-negative number option, or returns an error message.
function readNumber(name: string, text: string | undefined): number | string {
    const value = text === undefined || text.trim() === '' ? NaN : Number(text);
    return Number.isFinite(value) && value >= 0 ? value : `--${name} needs a non-negative number, got "${text ?? ''}".`;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
    const values = new Map<string, string>();
    let headless = false;
    let noNormalize = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') return { kind: 'help' };
        if (arg === '--headless') {
            headless = true;
        } else if (arg === '--no-normalize') {
            noNormalize = true;
        } else if (['--dir', '--track', '--viz', '--seconds', '--from', '--shots', '--reselect'].includes(arg)) {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--'))
                return { kind: 'error', message: `${arg} needs a value.` };
            values.set(arg.slice(2), value);
            i++;
        } else {
            return { kind: 'error', message: `Unknown argument "${arg}". ${USAGE}` };
        }
    }
    for (const required of ['dir', 'track', 'viz']) {
        if (!values.has(required)) return { kind: 'error', message: `Missing --${required}. ${USAGE}` };
    }

    let seconds: number | undefined;
    if (values.has('seconds')) {
        const parsed = readNumber('seconds', values.get('seconds'));
        if (typeof parsed === 'string') return { kind: 'error', message: parsed };
        if (parsed === 0) return { kind: 'error', message: '--seconds must be greater than 0.' };
        seconds = parsed;
    }
    const from = values.has('from') ? readNumber('from', values.get('from')) : 0;
    if (typeof from === 'string') return { kind: 'error', message: from };

    const shots: number[] = [];
    for (const part of (values.get('shots') ?? '').split(',').filter((p) => p.trim() !== '')) {
        const parsed = readNumber('shots', part.trim());
        if (typeof parsed === 'string') return { kind: 'error', message: parsed };
        shots.push(parsed);
    }
    shots.sort((a, b) => a - b);

    let reselect = 1;
    if (values.has('reselect')) {
        const text = values.get('reselect') ?? '';
        const parsed = text.trim() === '' ? NaN : Number(text);
        if (!Number.isInteger(parsed) || parsed < 1) {
            return { kind: 'error', message: `--reselect needs a whole number of at least 1, got "${text}".` };
        }
        reselect = parsed;
    }
    // Shots are timed against one play; with several plays there is no single folder for them to belong to.
    if (reselect > 1 && shots.length > 0) {
        return { kind: 'error', message: '--reselect above 1 cannot be combined with --shots.' };
    }

    return {
        kind: 'run',
        args: {
            dir: values.get('dir') ?? '',
            track: values.get('track') ?? '',
            viz: values.get('viz') ?? '',
            seconds,
            from,
            shots: shots.filter((shot, index) => shots.indexOf(shot) === index),
            reselect,
            headless,
            noNormalize,
        },
    };
}

function linksToFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

// The audio files in a folder, by name.
export function listAudioFiles(dir: string): string[] {
    // Only regular files count: a folder named "album.mp3" is not a track. A symlink counts when its target is a
    // regular file (Dirent.isFile() is false for links); broken links and links to folders are dropped.
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() || (entry.isSymbolicLink() && linksToFile(join(dir, entry.name))))
        .map((entry) => entry.name)
        .filter((name) => AUDIO_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension)))
        .sort();
}

// Splits the requested shot times into those the run will reach and those past the end of the played range.
export function scheduleShots(shots: readonly number[], end: number) {
    return {
        due: shots.filter((shot) => shot <= end),
        skipped: shots.filter((shot) => shot > end),
    };
}

// The file name part of a track, without folders or extension, safe for a folder name.
export function trackBaseName(track: string): string {
    const name = track.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
    return name.replace(/[^\w.-]+/g, '_');
}

// The sidecar that sits beside a track: the same name with the extension replaced by ".bpm".
export function sidecarName(track: string): string {
    const name = track.replace(/^.*[\\/]/, '');
    const dot = name.lastIndexOf('.');
    return `${dot > 0 ? name.slice(0, dot) : name}.bpm`;
}

// The output folder name for one play. A single play keeps the plain name; with several, each gets its own suffix so
// plays that start within the same second cannot share a folder.
export function playFolderName(viz: string, track: string, stamp: string, play: number, plays: number): string {
    const base = `${viz}-${trackBaseName(track)}-${stamp}`;
    return plays > 1 ? `${base}-play${play}` : base;
}

export interface Reference {
    bpm: number | undefined;
    warning: string | undefined;
}

// Picks the reference tempo: --bpm first, then the text of a sidecar, else none. A sidecar that does not parse is a
// warning and counts as none. An explicit --bpm wins, so the sidecar is not even read then.
export function chooseReference(
    flag: number | undefined,
    sidecarText: string | undefined,
    sidecarLabel: string,
    parse: (text: string) => number | undefined,
): Reference {
    if (flag !== undefined) return { bpm: flag, warning: undefined };
    if (sidecarText === undefined) return { bpm: undefined, warning: undefined };
    const bpm = parse(sidecarText);
    return bpm === undefined
        ? { bpm: undefined, warning: `Warning: ${sidecarLabel} does not hold a tempo above 0; ignoring it.` }
        : { bpm, warning: undefined };
}

export interface SummaryArgs {
    path: string;
    bpm: number | undefined;
    window: number | undefined;
    // Telemetry column whose reaction to each click of track.beats.json is timed.
    reaction: string | undefined;
}

export type ParsedSummaryArgs =
    { kind: 'help' } | { kind: 'run'; args: SummaryArgs } | { kind: 'error'; message: string };

// Reads a number option that must be above 0, or returns an error message.
function readPositive(name: string, text: string | undefined): number | string {
    const value = text === undefined || text.trim() === '' ? NaN : Number(text);
    return Number.isFinite(value) && value > 0 ? value : `--${name} needs a number above 0, got "${text ?? ''}".`;
}

// Splits a command line into positional arguments and the --bpm / --window values it accepts.
function splitPositional(
    argv: readonly string[],
    flags: readonly string[],
): { positional: string[]; values: Map<string, string>; help: boolean } | string {
    const positional: string[] = [];
    const values = new Map<string, string>();
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') return { positional, values, help: true };
        if (flags.includes(arg)) {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) return `${arg} needs a value.`;
            values.set(arg.slice(2), value);
            i++;
        } else if (arg.startsWith('--')) {
            return `Unknown argument "${arg}".`;
        } else {
            positional.push(arg);
        }
    }
    return { positional, values, help: false };
}

export function parseSummaryArgs(argv: readonly string[]): ParsedSummaryArgs {
    const split = splitPositional(argv, ['--bpm', '--window', '--reaction']);
    if (typeof split === 'string') return { kind: 'error', message: `${split} ${SUMMARY_USAGE}` };
    if (split.help) return { kind: 'help' };
    if (split.positional.length !== 1) return { kind: 'error', message: SUMMARY_USAGE };
    const bpm = split.values.has('bpm') ? readPositive('bpm', split.values.get('bpm')) : undefined;
    if (typeof bpm === 'string') return { kind: 'error', message: bpm };
    const window = split.values.has('window') ? readPositive('window', split.values.get('window')) : undefined;
    if (typeof window === 'string') return { kind: 'error', message: window };
    return { kind: 'run', args: { path: split.positional[0], bpm, window, reaction: split.values.get('reaction') } };
}

export interface RepeatArgs {
    paths: string[];
    bpm: number | undefined;
}

export type ParsedRepeatArgs =
    { kind: 'help' } | { kind: 'run'; args: RepeatArgs } | { kind: 'error'; message: string };

export function parseRepeatArgs(argv: readonly string[]): ParsedRepeatArgs {
    const split = splitPositional(argv, ['--bpm']);
    if (typeof split === 'string') return { kind: 'error', message: `${split} ${REPEAT_USAGE}` };
    if (split.help) return { kind: 'help' };
    if (split.positional.length < 2) return { kind: 'error', message: REPEAT_USAGE };
    const bpm = split.values.has('bpm') ? readPositive('bpm', split.values.get('bpm')) : undefined;
    if (typeof bpm === 'string') return { kind: 'error', message: bpm };
    return { kind: 'run', args: { paths: split.positional, bpm } };
}
