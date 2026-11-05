// Pure helpers for the debug:viz command (argument parsing, track lookup, shot scheduling). Kept apart from run.ts so
// the process and browser handling there stays readable. Not part of the app bundle.

import { readdirSync } from 'node:fs';

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a'];

export const USAGE =
    'Usage: npm run debug:viz -- --dir <folder> --track <file> --viz <name> [--seconds N] [--from T] [--shots t1,t2] [--headless]';

export interface RunArgs {
    dir: string;
    track: string;
    viz: string;
    seconds: number | undefined; // undefined: play to the end of the track
    from: number;
    shots: number[];
    headless: boolean;
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
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') return { kind: 'help' };
        if (arg === '--headless') {
            headless = true;
        } else if (['--dir', '--track', '--viz', '--seconds', '--from', '--shots'].includes(arg)) {
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

    return {
        kind: 'run',
        args: {
            dir: values.get('dir') ?? '',
            track: values.get('track') ?? '',
            viz: values.get('viz') ?? '',
            seconds,
            from,
            shots: shots.filter((shot, index) => shots.indexOf(shot) === index),
            headless,
        },
    };
}

// The audio files in a folder, by name.
export function listAudioFiles(dir: string): string[] {
    return readdirSync(dir)
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
