import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const folder = import.meta.dirname;

// Beat, bar and tempo come only from the shared rhythm tracker, and the bass only from the shared BassPulse. This
// folder must not grow an analysis path of its own (a second filter chain or FFT read would duplicate work and drift
// from the tracker). The scan bans the analysis calls themselves. The bare `AnalyserNode` type is allowed, but only
// as a type annotation (`: AnalyserNode`, `| AnalyserNode`, `<AnalyserNode`), because the hook has to name the type of
// the source it hands to BassPulse and a type cannot analyze anything. Any other use, such as `new` or `instanceof`,
// still fails.
const BANNED_CALLS = [
    'getByteFrequencyData',
    'getFloatFrequencyData',
    'getFloatTimeDomainData',
    'getByteTimeDomainData',
    'createBiquadFilter',
    'createAnalyser',
];

function sourceFiles(): string[] {
    return readdirSync(folder).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
}

function read(name: string): string {
    return readFileSync(join(folder, name), 'utf8');
}

describe('dancing character analysis', () => {
    it('finds source files to scan', () => {
        expect(sourceFiles().length).toBeGreaterThan(5);
    });

    it.each(BANNED_CALLS)('has no %s in any source file', (call) => {
        expect(sourceFiles().filter((name) => read(name).includes(call))).toEqual([]);
    });

    it('uses AnalyserNode only as a type annotation', () => {
        const offenders = sourceFiles().filter((name) => {
            const source = read(name);
            for (const match of source.matchAll(/AnalyserNode/g)) {
                const before = source.slice(Math.max(0, match.index - 2), match.index);
                if (!/(: |\| |<)$/.test(before)) return true;
            }
            return false;
        });
        expect(offenders).toEqual([]);
    });

    it('keeps no private bass pulse of its own', () => {
        expect(existsSync(join(folder, 'dancingCharacterBassPulse.ts'))).toBe(false);
    });
});
