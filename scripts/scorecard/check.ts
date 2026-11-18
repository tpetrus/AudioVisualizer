// `npm run scorecard:check`: compares the current scorecard (run `npm run scorecard` first) with the committed baseline and
// exits 1 when a blocking cell that passed there fails now, or a .beats.json hash differs. Not part of the app bundle:
// nothing under app/ imports this file.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateCheck } from './checkLogic';
import { BASELINE_PATH, DEFAULT_OUT } from './inputs';
import type { Scorecard } from './types';

const USAGE = `Usage: npm run scorecard:check -- [--current <file.json>] [--baseline <file.json>]

Reads the scorecard written by npm run scorecard (default ${DEFAULT_OUT}.json) and the baseline (default ${BASELINE_PATH}),
prints every cell that got worse and exits 1 if there is any.`;

function readScorecard(path: string): Scorecard {
    return JSON.parse(readFileSync(path, 'utf8')) as Scorecard;
}

function main(): number {
    const argv = process.argv.slice(2);
    let current = `${DEFAULT_OUT}.json`;
    let baseline = BASELINE_PATH;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--help' || argv[i] === '-h') {
            console.log(USAGE);
            return 0;
        }
        if (argv[i] === '--current' || argv[i] === '--baseline') {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
            if (argv[i] === '--current') current = value;
            else baseline = value;
            i++;
        } else {
            throw new Error(`Unexpected argument "${argv[i]}"`);
        }
    }
    const currentPath = resolve(current);
    if (!existsSync(currentPath))
        throw new Error(`No current scorecard at ${currentPath}: run npm run scorecard first`);
    const baselinePath = resolve(baseline);
    const outcome = evaluateCheck(
        existsSync(baselinePath) ? readScorecard(baselinePath) : null,
        readScorecard(currentPath),
    );
    for (const line of outcome.lines) console.log(line);
    return outcome.exitCode;
}

try {
    process.exit(main());
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
