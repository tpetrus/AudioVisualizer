// The command line of `npm run scorecard:live` (contract C3). Pure, so it is tested without a process.

import { LIVE_REACTION_COLUMN, type LiveVisualizer } from '../targets';

export const LIVE_DIR = '.debug-in';
export const LIVE_FILE = 'docs/agents/hub-scorecard.live.json';
export const DEFAULT_RUNS = 4;

export const LIVE_VISUALIZERS = Object.keys(LIVE_REACTION_COLUMN) as LiveVisualizer[];

export interface LiveArgs {
    viz: LiveVisualizer | undefined;
    dir: string;
    tracks: string[] | undefined;
    runs: number;
    seconds: number | undefined;
    headless: boolean;
    ingest: string[];
    prehub: boolean;
    out: string;
    help: boolean;
}

export const LIVE_USAGE = `Usage: npm run scorecard:live -- --viz NAME [--dir <folder>] [--tracks a.wav,b.wav] [--runs N] [--seconds S]
                                  [--headless] [--ingest <folder> ...] [--prehub] [--out <file.json>]

NAME is one of: ${LIVE_VISUALIZERS.join(', ')}.
Records N runs (default ${DEFAULT_RUNS}) of each track in <folder> (default ${LIVE_DIR}) that has a live metric for NAME, one at a
time through npm run debug:viz, and writes the live cells to <file.json> (default ${LIVE_FILE}). The last two runs
share one page (--reselect 2); the others are fresh page loads. A run that fails is logged and left out.
--tracks limits the tracks, --seconds and --headless go to debug:viz.
--ingest reads existing debug:viz output folders instead of recording; each is a run folder or a parent of run folders
(the N newest per track whose options.json names NAME are used).
--prehub marks the runs as the pre-hub build: their medians go into the pre-hub field and every pass is recomputed.
A run replaces only NAME's cells (and, with --tracks, only those tracks'); other visualizers' cells stay.
npm run scorecard merges the live file into the scorecard when its targets version matches.`;

function valueOf(argv: readonly string[], i: number): string {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
    return value;
}

function wholeNumber(text: string, flag: string, min: number): number {
    const value = Number(text);
    if (!Number.isInteger(value) || value < min) throw new Error(`${flag} needs a whole number of at least ${min}`);
    return value;
}

export function parseLiveArgs(argv: readonly string[]): LiveArgs {
    const args: LiveArgs = {
        viz: undefined,
        dir: LIVE_DIR,
        tracks: undefined,
        runs: DEFAULT_RUNS,
        seconds: undefined,
        headless: false,
        ingest: [],
        prehub: false,
        out: LIVE_FILE,
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') args.help = true;
        else if (arg === '--headless') args.headless = true;
        else if (arg === '--prehub') args.prehub = true;
        else if (arg === '--viz') {
            const name = valueOf(argv, i++);
            if (!(LIVE_VISUALIZERS as string[]).includes(name)) {
                throw new Error(`--viz must be one of ${LIVE_VISUALIZERS.join(', ')}, got "${name}"`);
            }
            args.viz = name as LiveVisualizer;
        } else if (arg === '--dir') args.dir = valueOf(argv, i++);
        else if (arg === '--out') args.out = valueOf(argv, i++);
        else if (arg === '--tracks') {
            args.tracks = valueOf(argv, i++)
                .split(',')
                .map((name) => name.trim())
                .filter((name) => name !== '');
        } else if (arg === '--runs') args.runs = wholeNumber(valueOf(argv, i++), '--runs', 1);
        else if (arg === '--seconds') {
            const seconds = Number(valueOf(argv, i++));
            if (!(seconds > 0) || !Number.isFinite(seconds)) throw new Error('--seconds must be greater than 0');
            args.seconds = seconds;
        } else if (arg === '--ingest') {
            // Every value up to the next flag is a folder, so `--ingest a b c` works as well as a repeated flag.
            const before = args.ingest.length;
            while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) args.ingest.push(argv[++i]);
            if (args.ingest.length === before) throw new Error('--ingest needs a value');
        } else throw new Error(`Unexpected argument "${arg}"`);
    }
    if (!args.help && args.viz === undefined) throw new Error(`--viz is required (${LIVE_VISUALIZERS.join(', ')})`);
    return args;
}
