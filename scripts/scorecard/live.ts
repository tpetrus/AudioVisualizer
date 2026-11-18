// `npm run scorecard:live -- --viz NAME`: records (or ingests) runs of a visualizer in a real browser, measures the live
// metrics and writes them to the live file that `npm run scorecard` merges into the scorecard. Not part of the app bundle:
// nothing under app/ imports this file.

import { execSync } from 'node:child_process';
import { LIVE_USAGE, parseLiveArgs } from './live/args';
import { recordJob } from './live/record';
import { runLive } from './live/session';

function revision(): string {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return 'unknown';
    }
}

async function main(): Promise<void> {
    const args = parseLiveArgs(process.argv.slice(2));
    if (args.help) {
        console.log(LIVE_USAGE);
        return;
    }
    const started = Date.now();
    const file = await runLive(args, {
        recordJob,
        revision: revision(),
        created: new Date().toISOString(),
        log: (line) => console.log(line),
    });
    const mine = file.cells.filter((cell) => cell.visualizer === args.viz && cell.applicable);
    const count = (status: string): number => mine.filter((cell) => cell.status === status).length;
    console.log(
        `${args.viz}: ${mine.length} applicable live cells: ${count('pass')} passing, ${count('fail')} failing, ${count('unavailable')} unavailable (advisory).`,
    );
    console.log(`Wrote ${args.out}; total time ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
