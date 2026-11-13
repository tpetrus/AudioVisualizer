// Argument parsing for `npm run tap:beats`. Pure, so a typo costs no browser start. Not part of the app bundle.

export const USAGE = 'Usage: npm run tap:beats -- --dir <folder> --track <file> [--viz <name>] [--calibrate] [--force]';

export const DEFAULT_VIZ = 'cubes';

export interface TapArgs {
    dir: string;
    track: string;
    viz: string;
    calibrate: boolean;
    force: boolean;
}

export type ParsedTapArgs = { kind: 'help' } | { kind: 'run'; args: TapArgs } | { kind: 'error'; message: string };

const VALUE_OPTIONS = ['dir', 'track', 'viz'];
const FLAG_OPTIONS = ['calibrate', 'force'];

export function parseTapArgs(argv: readonly string[]): ParsedTapArgs {
    if (argv.length === 0) return { kind: 'help' };
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') return { kind: 'help' };
        if (!arg.startsWith('--')) return { kind: 'error', message: `Unexpected argument "${arg}".\n${USAGE}` };
        const name = arg.slice(2);
        if (FLAG_OPTIONS.includes(name)) {
            flags.add(name);
        } else if (VALUE_OPTIONS.includes(name)) {
            const value = argv[i + 1];
            // A following option is not a value: `--dir --track x` is a missing folder, not a folder named "--track".
            if (value === undefined || value.startsWith('--')) {
                return { kind: 'error', message: `--${name} needs a value.\n${USAGE}` };
            }
            values.set(name, value);
            i++;
        } else {
            return { kind: 'error', message: `Unknown option "${arg}".\n${USAGE}` };
        }
    }
    const dir = values.get('dir');
    const track = values.get('track');
    if (dir === undefined) return { kind: 'error', message: `--dir is required.\n${USAGE}` };
    if (track === undefined) return { kind: 'error', message: `--track is required.\n${USAGE}` };
    return {
        kind: 'run',
        args: {
            dir,
            track,
            viz: values.get('viz') ?? DEFAULT_VIZ,
            calibrate: flags.has('calibrate'),
            force: flags.has('force'),
        },
    };
}
