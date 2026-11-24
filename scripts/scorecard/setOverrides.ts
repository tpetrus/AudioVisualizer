// The pure part of `npm run scorecard -- --set NAME=VALUE`: separating the overrides from the runner's own arguments,
// refusing the combinations that could damage the committed files, and recording the overrides in the output. The
// bundling and the child process that apply them live in run.ts. Not part of the app bundle.

import { parseOverride, type Override } from '../rhythm-tools/ablate';
import type { Scorecard } from './types';

// How the parent run hands the overrides to the bundled child, so the child can record them in the header.
export const OVERRIDES_ENV = 'SCORECARD_OVERRIDES';

// Where one --set run writes its bundle. The process id keeps two runs in one checkout from overwriting each other's
// file while the other is still executing it.
export function setBundlePath(pid: number): string {
    return `node_modules/.cache/scorecard-set-${pid}.mjs`;
}

export interface SplitArgs {
    overrides: Override[];
    // The arguments without the --set pairs, as the child run takes them.
    rest: string[];
}

// Pulls every `--set NAME=VALUE` out of the arguments. Parsing is parseOverride's, the one ablate:rhythm uses, so a
// malformed value fails the same way. Setting a constant twice is ambiguous, so it is an error.
export function splitSetArgs(argv: readonly string[]): SplitArgs {
    const overrides: Override[] = [];
    const rest: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] !== '--set') {
            rest.push(argv[i]);
            continue;
        }
        const value = argv[++i];
        if (value === undefined) throw new Error('--set needs NAME=VALUE');
        const override = parseOverride(value);
        if (overrides.some((existing) => existing.name === override.name)) {
            throw new Error(`--set ${override.name} was given twice`);
        }
        overrides.push(override);
    }
    return { overrides, rest };
}

// A run with overridden constants is an experiment: it must not become the baseline, and it must not overwrite the
// default output the committed cells live in, so it has to name its own --out.
export function checkSetRun(overrides: readonly Override[], rest: readonly string[]): void {
    if (overrides.length === 0) return;
    if (rest.includes('--write-baseline')) {
        throw new Error(
            '--set cannot be combined with --write-baseline: the baseline is measured at default constants',
        );
    }
    if (!rest.includes('--out')) {
        throw new Error('--set needs an explicit --out, so the committed cells are not overwritten');
    }
}

export function overridesRecord(overrides: readonly Override[]): Record<string, string> {
    return Object.fromEntries(overrides.map(({ name, value }) => [name, value]));
}

// Reads what the parent put in OVERRIDES_ENV; undefined when this is a plain run.
export function overridesFromEnv(text: string | undefined): Record<string, string> | undefined {
    if (text === undefined) return undefined;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${OVERRIDES_ENV} must hold a JSON object`);
    }
    return parsed as Record<string, string>;
}

// The scorecard with the overrides recorded in its header; without overrides it is returned unchanged, so a plain run's
// output keeps its shape.
export function withOverrides(scorecard: Scorecard, overrides: Record<string, string> | undefined): Scorecard {
    if (overrides === undefined) return scorecard;
    return { ...scorecard, header: { ...scorecard.header, overrides } };
}
