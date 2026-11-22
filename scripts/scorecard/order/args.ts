// The command line of `npm run scorecard:order` (contract C-ORDER-CLI). Pure, so it is tested without a process.

import { LIVE_VISUALIZERS } from '../live/args';

export const ORDER_DIR = '.debug-in';
export const ORDER_TRACKS = ['drums-128.wav', 'imyourgirl.wav', 'syncopationbass2.wav'];
export const DEFAULT_SESSIONS = 2;
// The same range debug:viz --settle accepts, in seconds.
export const MAX_SETTLE = 10;
export const ORDER_OUT = 'docs/agents/hub-scorecard.order';

export interface OrderArgs {
    pair: [string, string] | undefined;
    dir: string;
    tracks: string[];
    // Sessions per combination (A then B, B then A, A then A, B then B), per track.
    sessions: number;
    seconds: number | undefined;
    // Seconds each session waits after moving to the second visualizer (debug:viz --settle); only sessions recorded
    // with this value are reported.
    settle: number;
    headless: boolean;
    ingest: string[];
    // Record only the planned sessions .debug-out does not already hold, then report from .debug-out.
    topUp: boolean;
    out: string;
    help: boolean;
}

export const ORDER_USAGE = `Usage: npm run scorecard:order -- --pair A,B [--dir <folder>] [--tracks a.wav,b.wav] [--sessions N]
                                   [--seconds S] [--settle S] [--headless] [--ingest <folder> ...] [--top-up] [--out <basename>]

A and B are two different visualizers from: ${LIVE_VISUALIZERS.join(', ')}.
Records, per track (default ${ORDER_TRACKS.join(', ')}; the audio is read from <folder>, default ${ORDER_DIR}), N sessions
(default ${DEFAULT_SESSIONS}) of each of four combinations, interleaved: A-then-B, B-then-A, A-then-A and B-then-B, one at
a time. A session is one page: the track plays on the first visualizer, the page moves to the second (possibly the same
one) without a reload, and the track plays again there (debug:viz --then). The same-visualizer sessions are the control:
they show what the navigate and re-select path alone changes. Then it compares each visualizer's second play after the
other visualizer with its second play after itself, against the spread of its first plays (AC11).
--settle S (0 to 10, default 0) makes each session wait S seconds after the move before the track plays again; only sessions
recorded with that value count, when recording, with --top-up and with --ingest (a folder without a recorded value is 0).
--ingest reads existing debug:viz output folders instead of recording (the newest N sessions per track and combination).
--top-up records only the sessions .debug-out lacks (the shortfall per track and combination up to N), then reports from
.debug-out as --ingest .debug-out would.
Writes <basename>.json and <basename>.md (default ${ORDER_OUT}). It is a report: the exit code is 0 even when rows fail.`;

function valueOf(argv: readonly string[], i: number): string {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
    return value;
}

function parsePair(text: string): [string, string] {
    const names = text.split(',').map((name) => name.trim());
    if (names.length !== 2 || names.some((name) => name === '')) {
        throw new Error(`--pair needs two visualizer names separated by a comma, got "${text}"`);
    }
    for (const name of names) {
        if (!(LIVE_VISUALIZERS as string[]).includes(name)) {
            throw new Error(`--pair names must be from ${LIVE_VISUALIZERS.join(', ')}, got "${name}"`);
        }
    }
    if (names[0] === names[1]) throw new Error('--pair needs two different visualizers');
    return [names[0], names[1]];
}

export function parseOrderArgs(argv: readonly string[]): OrderArgs {
    const args: OrderArgs = {
        pair: undefined,
        dir: ORDER_DIR,
        tracks: ORDER_TRACKS,
        sessions: DEFAULT_SESSIONS,
        seconds: undefined,
        settle: 0,
        headless: false,
        ingest: [],
        topUp: false,
        out: ORDER_OUT,
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') args.help = true;
        else if (arg === '--headless') args.headless = true;
        else if (arg === '--top-up') args.topUp = true;
        else if (arg === '--pair') args.pair = parsePair(valueOf(argv, i++));
        else if (arg === '--dir') args.dir = valueOf(argv, i++);
        else if (arg === '--out') args.out = valueOf(argv, i++);
        else if (arg === '--tracks') {
            args.tracks = valueOf(argv, i++)
                .split(',')
                .map((name) => name.trim())
                .filter((name) => name !== '');
            if (args.tracks.length === 0) throw new Error('--tracks needs at least one track');
        } else if (arg === '--sessions') {
            const sessions = Number(valueOf(argv, i++));
            if (!Number.isInteger(sessions) || sessions < 1) {
                throw new Error('--sessions needs a whole number of at least 1');
            }
            args.sessions = sessions;
        } else if (arg === '--seconds') {
            const seconds = Number(valueOf(argv, i++));
            if (!(seconds > 0) || !Number.isFinite(seconds)) throw new Error('--seconds must be greater than 0');
            args.seconds = seconds;
        } else if (arg === '--settle') {
            const settle = Number(valueOf(argv, i++));
            if (!Number.isFinite(settle) || settle < 0 || settle > MAX_SETTLE) {
                throw new Error(`--settle needs a number from 0 to ${MAX_SETTLE}`);
            }
            args.settle = settle;
        } else if (arg === '--ingest') {
            // Every value up to the next flag is a folder, so `--ingest a b c` works as well as a repeated flag.
            const before = args.ingest.length;
            while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) args.ingest.push(argv[++i]);
            if (args.ingest.length === before) throw new Error('--ingest needs a value');
        } else throw new Error(`Unexpected argument "${arg}"`);
    }
    if (!args.help && args.pair === undefined) throw new Error('--pair is required (A,B)');
    return args;
}
