// Argument parsing for the capture-delay tool. Pure, so a typo costs no browser start. Not part of the app bundle.

export const USAGE =
    'Usage: capture-delay --source tab|device|direct [--device <label substring>] [--clicks N] [--interval S]\n' +
    '                     [--out <file.json>] [--headless]';

export const DEFAULT_CLICKS = 20;
export const DEFAULT_INTERVAL_SECONDS = 0.5;
export const MAX_CLICKS = 1000;
export const MIN_INTERVAL_SECONDS = 0.1;
export const MAX_INTERVAL_SECONDS = 10;

export type CaptureSource = 'tab' | 'device' | 'direct';

export interface CaptureArgs {
    source: CaptureSource;
    device: string | undefined;
    clicks: number;
    interval: number;
    out: string | undefined;
    headless: boolean;
}

export type ParsedCaptureArgs =
    { kind: 'help' } | { kind: 'run'; args: CaptureArgs } | { kind: 'error'; message: string };

const VALUE_OPTIONS = ['source', 'device', 'clicks', 'interval', 'out'];
const FLAG_OPTIONS = ['headless'];
const SOURCES: readonly string[] = ['tab', 'device', 'direct'];

function error(message: string): ParsedCaptureArgs {
    return { kind: 'error', message: `${message}\n${USAGE}` };
}

export function parseCaptureArgs(argv: readonly string[]): ParsedCaptureArgs {
    if (argv.length === 0) return { kind: 'help' };
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') return { kind: 'help' };
        if (!arg.startsWith('--')) return error(`Unexpected argument "${arg}".`);
        const name = arg.slice(2);
        if (FLAG_OPTIONS.includes(name)) {
            flags.add(name);
        } else if (VALUE_OPTIONS.includes(name)) {
            const value = argv[i + 1];
            // A following option is not a value: `--device --clicks 5` is a missing label, not a device named "--clicks".
            if (value === undefined || value.startsWith('--')) return error(`--${name} needs a value.`);
            values.set(name, value);
            i++;
        } else {
            return error(`Unknown option "${arg}".`);
        }
    }
    const source = values.get('source');
    if (source === undefined) return error('--source is required.');
    if (!SOURCES.includes(source)) return error(`Unknown source "${source}"; use tab, device or direct.`);
    const headless = flags.has('headless');
    // A person has to pick the tab or the device audio and hear the clicks, so only the self-check may run unseen.
    if (headless && source !== 'direct') return error('--headless is only allowed with --source direct.');

    const clicksText = values.get('clicks');
    const clicks = clicksText === undefined ? DEFAULT_CLICKS : Number(clicksText);
    if (!Number.isInteger(clicks) || clicks < 1 || clicks > MAX_CLICKS) {
        return error(`--clicks must be a whole number from 1 to ${MAX_CLICKS}.`);
    }
    const intervalText = values.get('interval');
    const interval = intervalText === undefined ? DEFAULT_INTERVAL_SECONDS : Number(intervalText);
    if (!Number.isFinite(interval) || interval < MIN_INTERVAL_SECONDS || interval > MAX_INTERVAL_SECONDS) {
        return error(`--interval must be from ${MIN_INTERVAL_SECONDS} to ${MAX_INTERVAL_SECONDS} seconds.`);
    }
    return {
        kind: 'run',
        args: {
            source: source as CaptureSource,
            device: values.get('device'),
            clicks,
            interval,
            out: values.get('out'),
            headless,
        },
    };
}

export interface InputDevice {
    deviceId: string;
    label: string;
}

// The first input whose label contains the text, ignoring case. undefined when there is none or no text was given.
export function pickDevice(devices: readonly InputDevice[], substring: string | undefined): InputDevice | undefined {
    if (!substring) return undefined;
    const needle = substring.toLowerCase();
    return devices.find((device) => device.label.toLowerCase().includes(needle));
}
