import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BassBump, GATE_BASS_BUMP } from '../../app/features/audio/hub/bassBump';
import { parseCsv } from '../debug-visualizer/csv';
import { findGateColumns, findGateRule, formatGateReplay, recordedOpening, replayGate } from './gateReplay';

// The committed gate recordings: the five inputs of the gate and its own gateOpen column, trimmed from one recording per
// kick-bearing track made with the first rule (kicks at one place in the beat). Replaying them through today's rule must
// give the opening below; a change to the gate that moves an opening makes the matching row fail on purpose. Today's
// rule (hub-regressions S5) weighs each kick that has an earlier bar against the chance that random bass would repeat
// it, places the kicks heard in the 3 s before the lock on the beat (these recordings have no bpm column, so the tempo
// comes from the beat clock), and opens at an evidence of 5.5. Against the rule before it, which opened at 6 with a
// smaller chance margin and nothing before the lock, four tracks open earlier after the lock (imyourgirl 2.28 s against
// 4.52, lonley 10.13 against 10.44, syncopationbass 2.86 against 3.47, syncopationbass2 3.57 against 4.03), and
// summer2000 no longer opens on this recording (14.91 s before): its dense, loosely repeating bass earns too little per
// repeat under the wider margin that halved the random-bass false opens. Offline the same rule opens summer2000 6.1 s
// after the lock; Trevor kept the margin and the live scorecard decides that track. `recorded` is the opening of the
// first rule, kept so the cost on real music stays visible.
const DIRECTORY = fileURLToPath(new URL('../fixtures/rhythm/gate', import.meta.url));
const MAX_BYTES = 200 * 1024;

// undefined where today's rule never opens on the recording.
const TODAY: Record<string, { firstOpen?: number; delayAfterLock?: number; recorded: number }> = {
    imyourgirl: { firstOpen: 5.5093, delayAfterLock: 2.28, recorded: 5.5093 },
    lonley: { firstOpen: 13.509, delayAfterLock: 10.1303, recorded: 14.459 },
    summer2000: { recorded: 8.9493 },
    syncopationbass: { firstOpen: 6.0907, delayAfterLock: 2.8614, recorded: 6.6987 },
    syncopationbass2: { firstOpen: 6.8, delayAfterLock: 3.5707, recorded: 5.4 },
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
            const today = TODAY[name];
            if (today.firstOpen === undefined) {
                expect(replay).toMatchObject({ firstOpen: undefined, delayAfterLock: undefined, openShare: 0 });
            } else {
                expect(replay.firstOpen).toBeCloseTo(today.firstOpen, 3);
                expect(replay.delayAfterLock).toBeCloseTo(today.delayAfterLock!, 3);
                // The gate stays open once found: no kick-bearing track loses it.
                expect(replay.openShare).toBe(1);
            }
            expect(recordedOpening(table)).toBe(today.recorded);
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
        expect(formatGateReplay('current', replay, undefined, 'x').join('\n')).toContain('first open: never');
        expect(formatGateReplay('current', replayGate(table, findGateRule('current')), 5.4, 'x')[2]).toBe(
            'first open: 6.8 s',
        );
    });

    it('reads the time step from t when there is no dt column, and a missing gateOpen column', () => {
        const keep = [0, 2, 3, 4, 5, 6];
        const bare = { columns: keep.map((i) => table.columns[i]), rows: table.rows.map((r) => keep.map((i) => r[i])) };
        expect(findGateColumns(bare.columns)).toMatchObject({ dt: -1, gateOpen: -1 });
        expect(recordedOpening(bare)).toBeUndefined();
        expect(replayGate(bare, findGateRule('current')).firstOpen).toBeCloseTo(6.8, 1);
    });

    it('refuses a table that is not a gate recording', () => {
        expect(() => findGateColumns(['t', 'fps'])).toThrow('not a gate recording');
        expect(() => findGateColumns(['t', 'x.in'])).toThrow('Missing column "x.beatPhase"');
    });
});

describe('replay through BassBump', () => {
    // Four minutes' worth is not needed: a locked 120 BPM kick on every beat (50 ms of 1 over a bed of 0.3), with `in`
    // recorded as the output of a BassBump with the options below.
    const options = { margin: 1.02, gain: 6 };
    const columns = ['t', 'dt', 'x.in', 'x.beatPhase', 'x.tempoLocked', 'x.beatCount', 'x.songChanges', 'x.lowEnd'];
    const dt = 1 / 60;
    function build(withLowEnd: boolean) {
        const bump = new BassBump(options);
        const rows: number[][] = [];
        for (let i = 0; i < 60 * 30; i++) {
            const t = i * dt;
            const beat = t * 2;
            const lowEnd = beat % 1 < 0.1 ? 1 : 0.3;
            const row = [t, dt, bump.step(lowEnd, dt), beat % 1, 1, Math.floor(beat), 0, lowEnd];
            rows.push(withLowEnd ? row : row.slice(0, -1));
        }
        return { columns: withLowEnd ? columns : columns.slice(0, -1), rows };
    }

    it('gives the recorded opening when replayed with the options that made the recording', () => {
        const table = build(true);
        const recorded = replayGate(table, findGateRule('current'));
        const replayed = replayGate(table, findGateRule('current'), options);
        expect(recorded.firstOpen).toBeDefined();
        expect(replayed).toEqual(recorded);
        expect(findGateColumns(columns).lowEnd).toBe(7);
    });

    it('changes the gate input when the options differ', () => {
        const table = build(true);
        const flat = replayGate(table, findGateRule('current'), { margin: 5, gain: 0.1 });
        expect(flat.firstOpen).toBeUndefined();
    });

    it('refuses to replay through BassBump without a lowEnd column', () => {
        const table = build(false);
        expect(findGateColumns(table.columns).lowEnd).toBe(-1);
        expect(() => replayGate(table, findGateRule('current'), options)).toThrow(
            'Missing column "x.lowEnd": record with a newer build to replay through BassBump',
        );
        expect(replayGate(table, findGateRule('current')).firstOpen).toBeDefined();
    });

    it('names the input in the printed lines, after the rule line', () => {
        const replay = replayGate(build(true), findGateRule('current'));
        expect(formatGateReplay('current', replay, undefined, 'dancing-character').slice(0, 2)).toEqual([
            'rule current',
            'input: dancing-character.in as recorded',
        ]);
        expect(formatGateReplay('current', replay, undefined, 'x', { margin: 2, gain: 3 })[1]).toBe(
            'input: x.lowEnd through BassBump margin 2 gain 3',
        );
        expect(findGateColumns(build(true).columns).probe).toBe('x');
    });

    describe('--input gateBass', () => {
        const gateColumns = [...columns, 'x.gateBass'];
        // The gateBass column holds the pre-envelope bass; `in` is its GATE_BASS_BUMP output.
        function buildGateBass(withColumn: boolean) {
            const bump = new BassBump(GATE_BASS_BUMP);
            const rows: number[][] = [];
            for (let i = 0; i < 60 * 30; i++) {
                const t = i * dt;
                const beat = t * 2;
                const bass = beat % 1 < 0.1 ? 1 : 0.3;
                const row = [t, dt, bump.step(bass, dt), beat % 1, 1, Math.floor(beat), 0, 0.5, bass];
                rows.push(withColumn ? row : row.slice(0, -1));
            }
            return { columns: withColumn ? gateColumns : gateColumns.slice(0, -1), rows };
        }
        const shipped = { margin: GATE_BASS_BUMP.margin, gain: GATE_BASS_BUMP.gain, input: 'gateBass' as const };

        it('reproduces the recorded opening with the shipped settings and reads the gateBass column', () => {
            const table = buildGateBass(true);
            const recorded = replayGate(table, findGateRule('current'));
            const replayed = replayGate(table, findGateRule('current'), shipped);
            expect(recorded.firstOpen).toBeDefined();
            expect(replayed).toEqual(recorded);
            expect(findGateColumns(gateColumns).gateBass).toBe(8);
        });

        it('lets margin and gain override the shipped settings', () => {
            const flat = replayGate(buildGateBass(true), findGateRule('current'), {
                margin: 5,
                gain: 0.1,
                input: 'gateBass',
            });
            expect(flat.firstOpen).toBeUndefined();
        });

        it('keeps lowEnd as the default input', () => {
            const table = buildGateBass(true);
            const viaDefault = replayGate(table, findGateRule('current'), { margin: 1.02, gain: 6 });
            const viaLowEnd = replayGate(table, findGateRule('current'), { margin: 1.02, gain: 6, input: 'lowEnd' });
            expect(viaDefault).toEqual(viaLowEnd);
        });

        it('refuses a recording without a gateBass column and names the input in the output', () => {
            expect(() => replayGate(buildGateBass(false), findGateRule('current'), shipped)).toThrow(
                'Missing column "x.gateBass": record with a newer build to replay through BassBump',
            );
            const replay = replayGate(buildGateBass(true), findGateRule('current'));
            expect(formatGateReplay('current', replay, undefined, 'x', shipped)[1]).toBe(
                'input: x.gateBass through BassBump margin 1.15 gain 1.5',
            );
        });
    });
});
