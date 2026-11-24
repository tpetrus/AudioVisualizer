// `npx esbuild scripts/rhythm-tools/phaseStepMain.ts --bundle --platform=node --format=esm --packages=external
//   --log-level=warning --outfile=node_modules/.cache/phase-step.mjs && node node_modules/.cache/phase-step.mjs
//   [--dir <folder>] [--set NAME=VALUE]...`
// Prints the published beat phase's largest per-render-call excess step (contract OD5) for every scorecard track, and the
// largest over the tracks with at least one grid move, which must stay at most 0.10 beat. `--set` overrides
// rhythmConfig.ts constants at bundle time like `scorecard --set` does (for example PHASE_GLIDE_MS=0 for the old jump).
// Dev only: nothing under app/ imports this file.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyOverrides, parseOverride, type Override } from './ablate';
import { loadWithOverrides } from './ablatePlugin';
import type { PhaseStepResult } from './phaseStep';
import { loadTracks } from '../scorecard/inputs';

type StepModule = {
    measurePhaseSteps: (pcm: Float32Array, sampleRate: number) => PhaseStepResult;
    worstOverMovedTracks: (results: ReadonlyMap<string, PhaseStepResult>) => number;
    PHASE_STEP_LIMIT: number;
};

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    let dir = '.debug-in';
    const overrides: Override[] = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--dir') dir = argv[++i];
        else if (argv[i] === '--set') overrides.push(parseOverride(argv[++i]));
        else throw new Error(`Unexpected argument "${argv[i]}"`);
    }
    // Checked before bundling so a mistyped name fails with its own message.
    applyOverrides(readFileSync(resolve('app/features/rhythm/rhythmConfig.ts'), 'utf8'), overrides);
    const steps = (await loadWithOverrides(
        { entryPoint: resolve('scripts/rhythm-tools/phaseStep.ts') },
        overrides,
    )) as StepModule;
    const results = new Map<string, PhaseStepResult>();
    for (const source of loadTracks(dir).sources) {
        const result = steps.measurePhaseSteps(source.pcm, source.sampleRate);
        results.set(source.name, result);
        console.log(
            `${source.name.padEnd(28)} moves ${String(result.gridMoves).padStart(3)}  max excess ${result.maxExcess.toFixed(4)} beat at ${result.atSeconds.toFixed(2)} s`,
        );
    }
    const worst = steps.worstOverMovedTracks(results);
    const set = overrides.map((override) => `${override.name}=${override.value}`).join(' ');
    console.log(
        `\nOD5 measure${set ? ` (${set})` : ''}: ${worst.toFixed(4)} beat over tracks with grid moves, limit ${steps.PHASE_STEP_LIMIT}: ${worst <= steps.PHASE_STEP_LIMIT ? 'pass' : 'fail'}`,
    );
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
