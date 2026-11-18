// Replays a recording's gate inputs through a named gate rule and prints when the gate first opens, the delay after the
// tempo locks and the share of time it stays open. Run it with `npm run replay:gate -- <telemetry.csv> --rule NAME`.
// Not part of the app bundle: nothing under app/ imports this file.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from './debug-visualizer/csv';
import { BUMP_GAIN, BUMP_MARGIN } from '../app/features/audio/hub/bassBump';
import { GATE_RULES, findGateRule, formatGateReplay, recordedOpening, replayGate } from './rhythm-tools/gateReplay';

const USAGE = `Usage: npm run replay:gate -- <telemetry.csv> [--rule NAME] [--bump-margin N] [--bump-gain N]

Feeds the recording's in, beatPhase, tempoLocked, beatCount and songChanges columns into the gate rule and prints the
first open time, the delay after lock and the open share, next to the opening the recording itself shows.
With --bump-margin or --bump-gain (the other defaults to the shipped ${BUMP_MARGIN} / ${BUMP_GAIN}) the gate's input is
the recording's lowEnd column stepped through a BassBump with those values, not the recorded in. Recordings made before
the lowEnd column cannot be replayed that way.
Rules: ${Object.keys(GATE_RULES).join(', ')} (default current). An unknown rule is an error.`;

function main(): void {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help')) {
        console.log(USAGE);
        return;
    }
    let rule = 'current';
    let path: string | undefined;
    let margin: number | undefined;
    let gain: number | undefined;
    const number = (flag: string, text: string | undefined): number => {
        const value = text === undefined || text.trim() === '' ? NaN : Number(text);
        if (!Number.isFinite(value)) throw new Error(`${flag} needs a finite number`);
        return value;
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--rule') {
            const name = args[++i];
            if (name === undefined) throw new Error('--rule needs a name');
            rule = name;
        } else if (args[i] === '--bump-margin') {
            margin = number('--bump-margin', args[++i]);
        } else if (args[i] === '--bump-gain') {
            gain = number('--bump-gain', args[++i]);
        } else if (path === undefined && !args[i].startsWith('--')) {
            path = args[i];
        } else {
            throw new Error(`Unexpected argument "${args[i]}"`);
        }
    }
    if (path === undefined) throw new Error('Give the telemetry CSV to replay');
    const table = parseCsv(readFileSync(resolve(path), 'utf8'));
    const bump =
        margin === undefined && gain === undefined
            ? undefined
            : { margin: margin ?? BUMP_MARGIN, gain: gain ?? BUMP_GAIN };
    const replay = replayGate(table, findGateRule(rule), bump);
    const input =
        bump === undefined
            ? undefined
            : `input: <probe>.lowEnd through BassBump margin ${bump.margin} gain ${bump.gain}`;
    console.log(formatGateReplay(rule, replay, recordedOpening(table), input).join('\n'));
}

try {
    main();
} catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    process.exit(1);
}
