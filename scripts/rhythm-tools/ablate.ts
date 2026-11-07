// Pure helpers of `npm run ablate:rhythm`: reading the command line and rewriting rhythmConfig.ts source with constants
// overridden. The esbuild plugin that applies them lives in scripts/rhythm-ablate.ts.

export interface Override {
    name: string;
    // The replacement as source text, e.g. `12` or `[2, 3]`.
    value: string;
}

// A value may only be numbers, arithmetic and array brackets: it is pasted into source, so nothing else may get in.
const VALUE_PATTERN = /^[\d\s.eE+\-*/(),[\]]+$/;

export function parseOverride(text: string): Override {
    const at = text.indexOf('=');
    const name = at < 0 ? '' : text.slice(0, at).trim();
    const value = at < 0 ? '' : text.slice(at + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || value === '') {
        throw new Error(`--set needs NAME=VALUE, got "${text}"`);
    }
    if (!VALUE_PATTERN.test(value)) {
        throw new Error(`--set ${name}: the value may only hold numbers, arithmetic and [ ] lists, got "${value}"`);
    }
    return { name, value };
}

// A constant's declaration is one line: `export const NAME = <initializer>;`, optionally ending ` as const`.
function declarationPattern(name: string): RegExp {
    return new RegExp(`^export const ${name} = ([^\\r\\n]*?)( as const)?;[ \\t]*(?=\\r?$)`, 'm');
}

// Names of every exported constant of the config source, in file order.
export function exportedConstants(source: string): string[] {
    return [...source.matchAll(/^export const ([A-Z][A-Z0-9_]*) = /gm)].map((match) => match[1]);
}

// Returns the source with each named constant's initializer replaced. An unknown name, or a declaration that does not fit
// on one line, throws: a silent no-op would make an ablation look like it had no effect.
export function applyOverrides(source: string, overrides: readonly Override[]): string {
    let result = source;
    for (const { name, value } of overrides) {
        const pattern = declarationPattern(name);
        if (!pattern.test(result)) {
            const known = exportedConstants(source);
            throw new Error(
                known.includes(name)
                    ? `Cannot override ${name}: its declaration does not fit the one-line form this tool rewrites`
                    : `Unknown constant ${name}. rhythmConfig.ts exports: ${known.join(', ')}`,
            );
        }
        result = result.replace(pattern, (_whole, _initializer: string, asConst: string | undefined) => {
            return `export const ${name} = ${value}${asConst ?? ''};`;
        });
    }
    return result;
}

export interface AblateArguments {
    wav: string;
    overrides: Override[];
    // Seconds between rows of the held-tempo list, and how much of the track to run (0 = all of it).
    everySeconds: number;
    maxSeconds: number;
}

export function parseAblateArguments(argv: readonly string[]): AblateArguments | undefined {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        return undefined;
    }
    const result: AblateArguments = { wav: '', overrides: [], everySeconds: 5, maxSeconds: 0 };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined) {
                throw new Error(`${argument} needs a value`);
            }
            return next;
        };
        const positive = (text: string): number => {
            const number = Number(text);
            if (!Number.isFinite(number) || number < 0) {
                throw new Error(`${argument} needs a number of seconds, got "${text}"`);
            }
            return number;
        };
        switch (argument) {
            case '--set':
                result.overrides.push(parseOverride(value()));
                break;
            case '--every':
                result.everySeconds = positive(value());
                if (result.everySeconds === 0) {
                    throw new Error('--every must be above 0');
                }
                break;
            case '--seconds':
                result.maxSeconds = positive(value());
                break;
            default:
                if (argument.startsWith('--')) {
                    throw new Error(`Unknown option ${argument}`);
                }
                if (result.wav !== '') {
                    throw new Error(`Only one WAV file at a time, got "${result.wav}" and "${argument}"`);
                }
                result.wav = argument;
        }
    }
    if (result.wav === '') {
        throw new Error('Missing <wav>');
    }
    const seen = new Set<string>();
    for (const { name } of result.overrides) {
        if (seen.has(name)) {
            throw new Error(`--set ${name} was given twice`);
        }
        seen.add(name);
    }
    return result;
}
