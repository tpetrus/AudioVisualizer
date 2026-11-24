import { describe, expect, it } from 'vitest';
import {
    checkSetRun,
    OVERRIDES_ENV,
    overridesFromEnv,
    overridesRecord,
    splitSetArgs,
    withOverrides,
} from './setOverrides';
import type { Scorecard } from './types';

const card: Scorecard = {
    header: { targetsVersion: 1, revision: 'abc', created: 'now', sidecarHashes: {} },
    cells: [],
};

describe('splitSetArgs', () => {
    it('separates the overrides from the other arguments', () => {
        expect(splitSetArgs(['--dir', 'd', '--set', 'A_B=1', '--out', 'o', '--set', 'C=[2, 3]'])).toEqual({
            overrides: [
                { name: 'A_B', value: '1' },
                { name: 'C', value: '[2, 3]' },
            ],
            rest: ['--dir', 'd', '--out', 'o'],
        });
        expect(splitSetArgs(['--help'])).toEqual({ overrides: [], rest: ['--help'] });
    });

    it('fails on a malformed, missing or repeated override', () => {
        expect(() => splitSetArgs(['--set', 'nope'])).toThrow(/NAME=VALUE/);
        expect(() => splitSetArgs(['--set', 'A=process.exit()'])).toThrow(/numbers/);
        expect(() => splitSetArgs(['--set'])).toThrow(/NAME=VALUE/);
        expect(() => splitSetArgs(['--set', 'A=1', '--set', 'A=2'])).toThrow(/twice/);
    });
});

describe('checkSetRun', () => {
    const sets = [{ name: 'A', value: '1' }];

    it('accepts a run without overrides whatever else it holds', () => {
        expect(() => checkSetRun([], ['--write-baseline'])).not.toThrow();
        expect(() => checkSetRun([], [])).not.toThrow();
    });

    it('refuses overrides with --write-baseline, or without --out', () => {
        expect(() => checkSetRun(sets, ['--write-baseline', '--out', 'x'])).toThrow(/write-baseline/);
        expect(() => checkSetRun(sets, [])).toThrow(/--out/);
        expect(() => checkSetRun(sets, ['--out', 'x'])).not.toThrow();
    });
});

describe('overrides record', () => {
    it('maps names to value text', () => {
        expect(overridesRecord([{ name: 'A', value: '1' }])).toEqual({ A: '1' });
    });

    it('reads the environment value the parent wrote', () => {
        expect(overridesFromEnv(undefined)).toBeUndefined();
        expect(overridesFromEnv('{"A":"1"}')).toEqual({ A: '1' });
        expect(() => overridesFromEnv('[1]')).toThrow(OVERRIDES_ENV);
        expect(() => overridesFromEnv('null')).toThrow(OVERRIDES_ENV);
    });

    it('adds header.overrides only when there are overrides', () => {
        expect(withOverrides(card, undefined)).toBe(card);
        expect(withOverrides(card, { A: '1' }).header.overrides).toEqual({ A: '1' });
        expect('overrides' in withOverrides(card, undefined).header).toBe(false);
    });
});
