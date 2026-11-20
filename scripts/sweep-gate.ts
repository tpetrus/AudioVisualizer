// Entry point of `npm run sweep:gate`; the rule-tuning logic lives in scorecard/sweepGate.ts. The entry is its own file
// because a guard comparing import.meta.url with argv[1] cannot tell an entry from a module inside a bundle: both are
// the bundle, so importing sweepGate.ts from another bundled entry would have started a sweep. Not part of the app
// bundle: nothing under app/ imports this file.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    GATE_CONFIG,
    USAGE,
    expandRows,
    formatSweep,
    parseSweepGateArgs,
    runSweep,
    sweepJson,
    validateRows,
} from './scorecard/sweepGate';

async function main(): Promise<void> {
    const args = parseSweepGateArgs(process.argv.slice(2));
    if (args.help) {
        console.log(USAGE);
        return;
    }
    const rows = expandRows(args.set, args.grid);
    validateRows(rows, readFileSync(resolve(GATE_CONFIG), 'utf8'));
    const started = Date.now();
    const result = await runSweep(
        args,
        rows,
        (text) => console.log(text),
        (text) => console.error(text),
    );
    console.log('');
    for (const line of formatSweep(result, args.detail)) console.log(line);
    if (args.json !== undefined) {
        writeFileSync(
            args.json,
            `${JSON.stringify(sweepJson(result), null, 2)}
`,
        );
        console.log(`Wrote ${args.json}`);
    }
    console.log(`Total time ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
