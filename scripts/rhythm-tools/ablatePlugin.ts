import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { build, type Plugin, type StdinOptions } from 'esbuild';
import { applyOverrides, type Override } from './ablate';

// The config file the overrides apply to unless a caller names another (sweep:gate overrides bassGateConfig.ts).
export const DEFAULT_TARGET = 'rhythmConfig.ts';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The esbuild plugin behind `npm run ablate:rhythm`. It rewrites the target config file (a file name such as
// rhythmConfig.ts) as esbuild loads it, so the overridden value reaches every module that imports the constant, and
// nothing under app/ changes on disk.
export function createOverridePlugin(
    overrides: readonly Override[],
    onApplied: () => void,
    target = DEFAULT_TARGET,
): Plugin {
    return {
        name: 'config-overrides',
        setup(builder) {
            builder.onLoad({ filter: new RegExp(`[\\\\/]${escapeRegExp(target)}$`) }, (args) => {
                onApplied();
                return {
                    contents: applyOverrides(readFileSync(args.path, 'utf8'), overrides, target),
                    loader: 'ts',
                };
            });
        },
    };
}

export type BundleEntry = { entryPoint: string } | { stdin: StdinOptions };

// Bundles an entry with the overrides applied to the `target` config file and evaluates it, returning its exports. A
// bundle that never loaded the target would silently ignore the overrides, so that is an error too.
export async function loadWithOverrides(
    entry: BundleEntry,
    overrides: readonly Override[],
    target = DEFAULT_TARGET,
): Promise<unknown> {
    let applied = false;
    const result = await build({
        ...('entryPoint' in entry ? { entryPoints: [entry.entryPoint] } : { stdin: entry.stdin }),
        bundle: true,
        platform: 'node',
        // CommonJS so the bundle can be evaluated in this process without writing a file; the maths has no imports.
        format: 'cjs',
        write: false,
        logLevel: 'silent',
        plugins: [createOverridePlugin(overrides, () => (applied = true), target)],
    });
    if (overrides.length > 0 && !applied) {
        throw new Error(`${target} was never loaded by the bundle, so the overrides would have had no effect`);
    }
    const module = { exports: {} as unknown };
    const run = runInThisContext(`(function (module, exports) {${result.outputFiles[0].text}\n})`) as (
        module: { exports: unknown },
        exports: unknown,
    ) => void;
    run(module, module.exports);
    return module.exports;
}
