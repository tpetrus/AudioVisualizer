// `npm run probe:gate-inputs`: the measurements behind the choice of contract C1's gate input (hub-regressions S4). It
// prints how many random-bass patterns open the dancer's bass gate for each candidate input, against the bounds of the
// gate specs, and how soon each input opens the gate after the dancer's lock on every kick track of a folder. Not part
// of the app bundle: nothing under app/ imports this file.

import { resolve } from 'node:path';
import {
    GATE_INPUTS,
    countFalseOpens,
    onBeatBassPcm,
    opensOnLockedClock,
    secondsAfterLock,
    type GateInput,
} from './engine/gateInputs';
import { replayPcm } from './engine/replay';
import { DEFAULT_DIR, loadTracks } from './inputs';
import { resolveTrack } from './tracks';

// The bounds of the gate specs' random-bass checks (bassGate.test.ts): the two-gate input is chosen only if it stays
// within them (the S4 amendment of the hub-regressions plan).
const FALSE_OPEN_BOUNDS: Readonly<Record<number, number>> = { 120: 6, 400: 16 };

const USAGE = `Usage: npm run probe:gate-inputs -- [--patterns N] [--beats 120,400] [--dir <folder>]

Random bass: for N seeded patterns (default 300) of two random bass notes per beat at 120 bpm, over each number of beats
(default 120 and 400), counts the patterns that open the dancer's bass gate for each input, with the beat clock locked.
Kick tracks: for every kick track in <folder> (default ${DEFAULT_DIR}), prints the seconds from the dancer's lock to each
input's first opening (the rest of the track if it never opens) and the sum per input.
Inputs: gateBass (the hub's gate-input bass, shipped since S4), hubLowEnd (the hub's normalized low end, from the hub
until S4), frameTimed (BassPulse's pre-hub chain read at the newest delivered worklet frame), prehub (BassPulse at the
render time, before the hub) and twoGates (hubLowEnd and gateBass, open when either is).`;

interface ProbeArgs {
    patterns: number;
    beats: number[];
    dir: string;
    help: boolean;
}

function parseProbeArgs(argv: readonly string[]): ProbeArgs {
    const args: ProbeArgs = { patterns: 300, beats: [120, 400], dir: DEFAULT_DIR, help: false };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        const value = argv[i + 1];
        if (flag === '--help' || flag === '-h') {
            args.help = true;
        } else if (flag === '--patterns' && value !== undefined) {
            args.patterns = positiveInteger(flag, value);
            i++;
        } else if (flag === '--beats' && value !== undefined) {
            args.beats = value.split(',').map((part) => positiveInteger(flag, part));
            i++;
        } else if (flag === '--dir' && value !== undefined) {
            args.dir = value;
            i++;
        } else {
            throw new Error(`Unknown or incomplete option ${flag}\n\n${USAGE}`);
        }
    }
    return args;
}

function positiveInteger(flag: string, text: string): number {
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} needs a whole number above 0, got ${text}`);
    return value;
}

const pad = (text: string, width: number): string => text.padStart(width);

function printFalseOpens(patterns: number, beatCounts: readonly number[]): void {
    // The control first: a count of 0 means something only if the same notes on the beat do open every input.
    const control = opensOnLockedClock(onBeatBassPcm(Math.min(...beatCounts)));
    console.log(
        `Control (the same notes on every beat, ${Math.min(...beatCounts)} beats) opens: ` +
            GATE_INPUTS.map((input) => `${input} ${control[input] ? 'yes' : 'NO'}`).join(', '),
    );
    console.log(`Random bass: patterns of ${patterns} that open the gate`);
    console.log(['beats', ...GATE_INPUTS, 'bound'].map((text) => pad(text, 11)).join(''));
    for (const beats of beatCounts) {
        const started = Date.now();
        const counts = countFalseOpens(patterns, beats, (seed) => {
            if (seed % 50 === 0) console.error(`  ${beats} beats: ${seed} of ${patterns}`);
        });
        const bound = FALSE_OPEN_BOUNDS[beats];
        const cells = GATE_INPUTS.map((input) => String(counts[input]));
        console.log(
            [String(beats), ...cells, bound === undefined ? '-' : String(bound)].map((text) => pad(text, 11)).join('') +
                `   (${((Date.now() - started) / 1000).toFixed(0)} s)`,
        );
    }
    console.log('');
}

function printKickTracks(dir: string): void {
    const { sources, warnings } = loadTracks(resolve(dir));
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    const kickTracks = sources.filter((source) => resolveTrack(source.name).kick);
    console.log('Kick tracks: seconds from the dancer lock to the first opening (rest of the track if never)');
    console.log(
        ['track', 'lock', ...GATE_INPUTS].map((text, i) => (i === 0 ? text.padEnd(24) : pad(text, 11))).join(''),
    );
    const sums = {} as Record<GateInput, number>;
    for (const input of GATE_INPUTS) sums[input] = 0;
    for (const source of kickTracks) {
        const replay = replayPcm(source.pcm, source.sampleRate);
        const after = secondsAfterLock(replay);
        if (after === undefined) {
            console.log(`${source.name.padEnd(24)}${pad('never', 11)}`);
            continue;
        }
        const cells = GATE_INPUTS.map((input) => {
            sums[input] += after[input];
            return after[input].toFixed(2);
        });
        console.log(
            [
                source.name.padEnd(24),
                pad(replay.dancerLockSeconds!.toFixed(2), 11),
                ...cells.map((c) => pad(c, 11)),
            ].join(''),
        );
    }
    console.log(
        ['sum'.padEnd(24), pad('', 11), ...GATE_INPUTS.map((input) => pad(sums[input].toFixed(1), 11))].join(''),
    );
}

function main(): void {
    const args = parseProbeArgs(process.argv.slice(2));
    if (args.help) {
        console.log(USAGE);
        return;
    }
    const started = Date.now();
    printFalseOpens(args.patterns, args.beats);
    printKickTracks(args.dir);
    console.log(`Total time ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
