import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const folder = import.meta.dirname;

// The gate's bass comes only from the shared audio hub, so this folder must not grow a private filter chain or a time
// domain read of its own. `getByteFrequencyData` stays allowed: the spectrum field and the energy level read the
// scene's owned analyser, because a fine spectrum is not something the hub provides.
const BANNED = [
    'createBiquadFilter',
    'createAnalyser',
    'getFloatTimeDomainData',
    'getByteTimeDomainData',
    'BassPulse',
    'GateBassTap',
    "bassPulse'",
];

function sourceFiles(): string[] {
    return readdirSync(folder).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
}

describe('bass ink analysis', () => {
    it('finds source files to scan', () => {
        expect(sourceFiles().length).toBeGreaterThan(5);
    });

    it.each(BANNED)('has no %s in any source file', (banned) => {
        const offenders = sourceFiles().filter((name) => readFileSync(join(folder, name), 'utf8').includes(banned));
        expect(offenders).toEqual([]);
    });
});
