// `npm run scorecard`: replays the app's pipeline over every WAV in a folder (default .debug-in), applies the targets and
// writes the scorecard as JSON and markdown. With --write-baseline it also writes the baseline that `scorecard:check`
// holds later runs to. Not part of the app bundle: nothing under app/ imports this file.

import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
import { build } from 'esbuild';
import { createOverridePlugin } from '../rhythm-tools/ablatePlugin';
import type { Override } from '../rhythm-tools/ablate';
import { renderMarkdown } from './report';
import {
    checkSetRun,
    OVERRIDES_ENV,
    overridesFromEnv,
    overridesRecord,
    setBundlePath,
    splitSetArgs,
    withOverrides,
} from './setOverrides';

const USAGE = `Usage: npm run scorecard -- [--dir <folder>] [--out <basename>] [--write-baseline] [--set NAME=VALUE]...

Measures every WAV in <folder> (default ${DEFAULT_DIR}) offline, with the .beats.json and .bpm files beside it as truth, and
writes <basename>.json and <basename>.md (default ${DEFAULT_OUT}). The generated tracks (bassline-kick-120,
pad-lead-groove-110) are rendered in memory when the folder lacks them. A listed track that is missing, or has no tempo
truth, shows up as unavailable cells.
--write-baseline also writes ${BASELINE_PATH}, the file npm run scorecard:check compares against.
--set NAME=VALUE (repeatable) overrides a rhythmConfig.ts constant for this run, as ablate:rhythm does, by bundling this
runner with the override applied. It needs an explicit --out, cannot be combined with --write-baseline, and is recorded
in the output's header.overrides.
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

// Re-bundles this runner with the overrides applied to rhythmConfig.ts and runs the bundle in a child process, which
// records the overrides in its output. Returns the child's exit code.
async function runWithOverrides(rest: readonly string[], overrides: readonly Override[]): Promise<number> {
    let applied = false;
    const outfile = resolve(setBundlePath(process.pid));
    // The bundle is this run's own file, removed whether the build, the check or the child fails.
    try {
        await build({
            entryPoints: [resolve('scripts/scorecard/run.ts')],
            bundle: true,
            platform: 'node',
            format: 'esm',
            packages: 'external',
            logLevel: 'warning',
            outfile,
            plugins: [createOverridePlugin(overrides, () => (applied = true))],
        });
        // A bundle that never loaded the config would silently ignore the overrides.
        if (!applied)
            throw new Error('rhythmConfig.ts was never loaded by the bundle, so the overrides would have no effect');
        const result = spawnSync(process.execPath, [outfile, ...rest], {
            stdio: 'inherit',
            env: { ...process.env, [OVERRIDES_ENV]: JSON.stringify(overridesRecord(overrides)) },
        });
        return result.status ?? 1;
    } finally {
        rmSync(outfile, { force: true });
    }
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
    const scorecard = withOverrides(withLiveCells(offline, live.cells), overridesFromEnv(process.env[OVERRIDES_ENV]));
    const json = `${JSON.stringify(scorecard, null, 2)}\n`;
    write(`${args.out}.json`, json);
    write(`${args.out}.md`, renderMarkdown(scorecard, scenarioNotes(scenarios)));
    if (args.writeBaseline) write(BASELINE_PATH, json);

    console.log(summaryLine(scorecard));
    console.log(`Total time ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

async function start(): Promise<void> {
    // The child of a --set run has the overrides in its environment and no --set arguments left.
    if (process.env[OVERRIDES_ENV] === undefined) {
        const { overrides, rest } = splitSetArgs(process.argv.slice(2));
        if (overrides.length > 0) {
            checkSetRun(overrides, rest);
            process.exitCode = await runWithOverrides(rest, overrides);
            return;
        }
    }
    main();
}

start().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
