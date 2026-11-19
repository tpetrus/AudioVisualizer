// Replays a recording's gate inputs through a named gate rule and prints when the gate first opens, the delay after the
// tempo locks and the share of time it stays open. Run it with `npm run replay:gate -- <telemetry.csv> --rule NAME`.
// Not part of the app bundle: nothing under app/ imports this file.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from './debug-visualizer/csv';
import { BUMP_GAIN, BUMP_MARGIN, GATE_BASS_BUMP } from '../app/features/audio/hub/bassBump';
import {
    GATE_RULES,
    type BumpInput,
    findGateColumns,
    findGateRule,
    formatGateReplay,
    recordedOpening,
    replayGate,
} from './rhythm-tools/gateReplay';

const USAGE = `Usage: npm run replay:gate -- <telemetry.csv> [--rule NAME] [--bump-margin N] [--bump-gain N] [--input lowEnd|gateBass]

Feeds the recording's in, beatPhase, tempoLocked, beatCount and songChanges columns into the gate rule and prints the
first open time, the delay after lock and the open share, next to the opening the recording itself shows.
With --bump-margin or --bump-gain (the other defaults to the shipped ${BUMP_MARGIN} / ${BUMP_GAIN}) the gate's input is
the recording's lowEnd column stepped through a BassBump with those values, not the recorded in. Recordings made before
the lowEnd column cannot be replayed that way.
With --input gateBass the gate's input is the recording's gateBass column (what the gate hears since S4) stepped through a
BassBump with the shipped GATE_BASS_BUMP settings (margin ${GATE_BASS_BUMP.margin}, gain ${GATE_BASS_BUMP.gain}); --bump-margin and
--bump-gain still override those two. A recording without a gateBass column is an error. --input lowEnd is the default.
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
    let input: BumpInput | undefined;
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
        } else if (args[i] === '--input') {
            const name = args[++i];
            if (name !== 'lowEnd' && name !== 'gateBass') throw new Error('--input needs lowEnd or gateBass');
            input = name;
        } else if (path === undefined && !args[i].startsWith('--')) {
            path = args[i];
        } else {
            throw new Error(`Unexpected argument "${args[i]}"`);
        }
    }
    if (path === undefined) throw new Error('Give the telemetry CSV to replay');
    const table = parseCsv(readFileSync(resolve(path), 'utf8'));
    const gateBass = input === 'gateBass';
    const bump =
        margin === undefined && gain === undefined && input === undefined
            ? undefined
            : {
                  margin: margin ?? (gateBass ? GATE_BASS_BUMP.margin : BUMP_MARGIN),
                  gain: gain ?? (gateBass ? GATE_BASS_BUMP.gain : BUMP_GAIN),
                  input,
              };
    const replay = replayGate(table, findGateRule(rule), bump);
    const { probe } = findGateColumns(table.columns);
    console.log(formatGateReplay(rule, replay, recordedOpening(table), probe, bump).join('\n'));
}

try {
    main();
} catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    process.exit(1);
}
