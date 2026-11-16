import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../debug-visualizer/csv';
import { findGateColumns, findGateRule, formatGateReplay, recordedOpening, replayGate } from './gateReplay';

// The committed gate recordings: the five inputs of the gate and its own gateOpen column, trimmed from one recording per
// kick-bearing track made with the first rule (kicks at one place in the beat). Replaying them through today's rule must
// give the opening below; a change to the gate that moves an opening makes the matching row fail on purpose. Today's
// rule weighs each kick that has an earlier bar (one bar back, or two when nothing landed near the first) against the
// chance that random bass would repeat it, and opens at an evidence of 6. Against the rule it replaced (six of the last
// eight kicks repeating the bar before, the latest three in a row), four tracks open earlier (imyourgirl by 0.43 s,
// lonley by 4.51 s, syncopationbass by 1.24 s, syncopationbass2 by 0.47 s) and summer2000 opens later (15.171 s before,
// 18.36 s now), so that track pays about 3 s for the stricter rule. `recorded` is the opening of the first rule, kept so
// the cost on real music stays visible: syncopationbass opens exactly when it did, and lonley now opens before it.
const DIRECTORY = fileURLToPath(new URL('../fixtures/rhythm/gate', import.meta.url));
const MAX_BYTES = 200 * 1024;

const TODAY: Record<string, { firstOpen: number; delayAfterLock: number; recorded: number }> = {
    imyourgirl: { firstOpen: 7.7493, delayAfterLock: 4.52, recorded: 5.5093 },
    lonley: { firstOpen: 13.819, delayAfterLock: 10.4403, recorded: 14.459 },
    summer2000: { firstOpen: 18.36, delayAfterLock: 14.9093, recorded: 8.9493 },
    syncopationbass: { firstOpen: 6.6987, delayAfterLock: 3.4694, recorded: 6.6987 },
    syncopationbass2: { firstOpen: 7.2587, delayAfterLock: 4.0294, recorded: 5.4 },
};

describe('gate fixtures', () => {
    const files = readdirSync(DIRECTORY)
        .filter((file) => file.endsWith('.csv'))
        .sort();

    it('has one fixture per kick-bearing track', () => {
        expect(files.map((file) => file.replace('.csv', ''))).toEqual(Object.keys(TODAY).sort());
    });

    for (const file of files) {
        const name = file.replace('.csv', '');
        it(`${name}: stays under the size cap and replays to today's opening`, () => {
            expect(statSync(join(DIRECTORY, file)).size).toBeLessThanOrEqual(MAX_BYTES);
            const table = parseCsv(readFileSync(join(DIRECTORY, file), 'utf8'));
            const replay = replayGate(table, findGateRule('current'));
            expect(replay.firstOpen).toBeCloseTo(TODAY[name].firstOpen, 3);
            expect(replay.delayAfterLock).toBeCloseTo(TODAY[name].delayAfterLock, 3);
            expect(recordedOpening(table)).toBe(TODAY[name].recorded);
            // The gate stays open once found: no kick-bearing track loses it.
            expect(replay.openShare).toBe(1);
            // Deterministic: a second pass gives the same numbers.
            expect(replayGate(table, findGateRule('current'))).toEqual(replay);
        });
    }
});

describe('gate rules', () => {
    const table = parseCsv(readFileSync(join(DIRECTORY, 'syncopationbass2.csv'), 'utf8'));

    it('rejects an unknown rule', () => {
        expect(() => findGateRule('nope')).toThrow('Unknown rule "nope"');
        expect(() => findGateRule('toString')).toThrow('Unknown rule');
    });

    it('lets the rule change the outcome', () => {
        const summer = parseCsv(readFileSync(join(DIRECTORY, 'summer2000.csv'), 'utf8'));
        const current = replayGate(summer, findGateRule('current'));
        const quarter = replayGate(summer, findGateRule('quarter-bass'));
        expect(quarter.firstOpen).not.toBe(current.firstOpen);
    });

    it('reports a gate that never opens and prints every line', () => {
        const silent = { columns: table.columns, rows: table.rows.map((row) => row.map((v, c) => (c === 2 ? 0 : v))) };
        const replay = replayGate(silent, findGateRule('current'));
        expect(replay).toMatchObject({ firstOpen: undefined, delayAfterLock: undefined, openShare: 0 });
        expect(formatGateReplay('current', replay, undefined).join('\n')).toContain('first open: never');
        expect(formatGateReplay('current', replayGate(table, findGateRule('current')), 5.4)[1]).toBe(
            'first open: 7.259 s',
        );
    });

    it('reads the time step from t when there is no dt column, and a missing gateOpen column', () => {
        const keep = [0, 2, 3, 4, 5, 6];
        const bare = { columns: keep.map((i) => table.columns[i]), rows: table.rows.map((r) => keep.map((i) => r[i])) };
        expect(findGateColumns(bare.columns)).toMatchObject({ dt: -1, gateOpen: -1 });
        expect(recordedOpening(bare)).toBeUndefined();
        expect(replayGate(bare, findGateRule('current')).firstOpen).toBeCloseTo(7.26, 1);
    });

    it('refuses a table that is not a gate recording', () => {
        expect(() => findGateColumns(['t', 'fps'])).toThrow('not a gate recording');
        expect(() => findGateColumns(['t', 'x.in'])).toThrow('Missing column "x.beatPhase"');
    });
});
