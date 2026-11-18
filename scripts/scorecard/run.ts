// `npm run scorecard`: replays the app's pipeline over every WAV in a folder (default .debug-in), applies the targets and
// writes the scorecard as JSON and markdown. With --write-baseline it also writes the baseline that `scorecard:check`
// holds later runs to. Not part of the app bundle: nothing under app/ imports this file.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildScorecard, scenarioNotes } from './cells';
import { measureScenarios } from './engine';
import {
    BASELINE_PATH,
    DEFAULT_DIR,
    DEFAULT_OUT,
    LIVE_PATH,
    loadTracks,
    measureSources,
    parseRunArgs,
    readLiveCells,
    summaryLine,
    withLiveCells,
} from './inputs';
import { renderMarkdown } from './report';

const USAGE = `Usage: npm run scorecard -- [--dir <folder>] [--out <basename>] [--write-baseline]

Measures every WAV in <folder> (default ${DEFAULT_DIR}) offline, with the .beats.json and .bpm files beside it as truth, and
writes <basename>.json and <basename>.md (default ${DEFAULT_OUT}). The generated tracks (bassline-kick-120,
pad-lead-groove-110) are rendered in memory when the folder lacks them. A listed track that is missing, or has no tempo
truth, shows up as unavailable cells.
--write-baseline also writes ${BASELINE_PATH}, the file npm run scorecard:check compares against.
When ${LIVE_PATH} (written by npm run scorecard:live) exists for this targets version, its cells are merged in.`;

function revision(): string {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return 'unknown';
    }
}

function write(path: string, text: string): void {
    const target = resolve(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    console.log(`Wrote ${target}`);
}

function main(): void {
    const args = parseRunArgs(process.argv.slice(2));
    if (args.help) {
        console.log(USAGE);
        return;
    }
    const started = Date.now();
    const { sources, warnings } = loadTracks(resolve(args.dir));
    for (const warning of warnings) console.warn(`warning: ${warning}`);

    const measured = measureSources(sources, (name, seconds) => console.log(`  ${name}: ${seconds.toFixed(1)} s`));
    const scenarioStarted = Date.now();
    const scenarios = measureScenarios();
    console.log(`  scenarios: ${((Date.now() - scenarioStarted) / 1000).toFixed(1)} s`);

    const offline = buildScorecard({
        revision: revision(),
        created: new Date().toISOString(),
        scenarios,
        ...measured,
    });
    // The live cells come from `npm run scorecard:live` and are advisory; they are merged in only when that file exists.
    const live = readLiveCells(resolve(LIVE_PATH));
    if (live.warning) console.warn(`warning: ${live.warning}`);
    const scorecard = withLiveCells(offline, live.cells);
    const json = `${JSON.stringify(scorecard, null, 2)}\n`;
    write(`${args.out}.json`, json);
    write(`${args.out}.md`, renderMarkdown(scorecard, scenarioNotes(scenarios)));
    if (args.writeBaseline) write(BASELINE_PATH, json);

    console.log(summaryLine(scorecard));
    console.log(`Total time ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
