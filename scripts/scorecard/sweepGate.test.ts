import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GateTrace, firstOpenSeconds } from './engine/gateTrace';
import { RANDOM_BASS_BPM, RANDOM_BASS_SAMPLE_RATE, onBeatBassPcm } from './engine/gateInputs';
import { replayPcm } from './engine/replay';
import {
    expandRows,
    formatSweep,
    loadGateStepper,
    parseSweepGateArgs,
    summarizeKickTracks,
    sweepJson,
    validateRows,
    type SweepResult,
} from './sweepGate';

const CONFIG = readFileSync(resolve('app/features/rhythm/bassGateConfig.ts'), 'utf8');

describe('parseSweepGateArgs', () => {
    it('has the defaults of the contract', () => {
        expect(parseSweepGateArgs([])).toMatchObject({
            dir: '.debug-in',
            patterns: 300,
            beats: [120, 400],
            set: [],
            grid: [],
            detail: false,
            json: undefined,
            help: false,
        });
    });

    it('reads every option, and lets a repeated --grid NAME add to its axis', () => {
        const args = parseSweepGateArgs([
            ...['--dir', 'x', '--patterns', '5', '--beats', '8,16'],
            ...['--set', 'BASS_GATE_CLOSE_SCORE=2'],
            ...['--grid', 'BASS_GATE_OPEN_SCORE=4,6', '--grid', 'BASS_GATE_OPEN_SCORE=5'],
            ...['--detail', '--json', 'out.json'],
        ]);
        expect(args).toMatchObject({ dir: 'x', patterns: 5, beats: [8, 16], detail: true, json: 'out.json' });
        expect(args.set).toEqual([{ name: 'BASS_GATE_CLOSE_SCORE', value: '2' }]);
        expect(args.grid).toEqual([{ name: 'BASS_GATE_OPEN_SCORE', values: ['4', '6', '5'] }]);
    });

    it.each([
        [['--bogus'], /Unknown option --bogus/],
        [['--patterns', '0'], /whole number/],
        [['--grid', 'BASS_GATE_OPEN_SCORE'], /--grid needs/],
        [['--set', 'lower=1'], /NAME=VALUE/],
        [['--dir'], /needs a value/],
        [['--set', 'A=1', '--grid', 'A=1,2'], /given twice/],
    ])('rejects %j', (argv, message) => {
        expect(() => parseSweepGateArgs(argv)).toThrow(message);
    });
});

describe('expandRows', () => {
    it('is the base alone with nothing to override', () => {
        expect(expandRows([], [])).toEqual([{ label: 'base', overrides: [] }]);
    });

    it('is the base plus one row for a --set without a grid', () => {
        const rows = expandRows([{ name: 'BASS_GATE_OPEN_SCORE', value: '5' }], []);
        expect(rows.map((row) => row.label)).toEqual(['base', 'BASS_GATE_OPEN_SCORE=5']);
    });

    it('puts the base first, then the product of the grid with every --set applied', () => {
        const rows = expandRows(
            [{ name: 'BASS_GATE_CLOSE_SCORE', value: '2' }],
            [
                { name: 'BASS_GATE_OPEN_SCORE', values: ['4', '6'] },
                { name: 'BASS_GATE_PHASE_WINDOW', values: ['0.1', '0.2'] },
            ],
        );
        expect(rows.map((row) => row.label)).toEqual([
            'base',
            'BASS_GATE_CLOSE_SCORE=2 BASS_GATE_OPEN_SCORE=4 BASS_GATE_PHASE_WINDOW=0.1',
            'BASS_GATE_CLOSE_SCORE=2 BASS_GATE_OPEN_SCORE=4 BASS_GATE_PHASE_WINDOW=0.2',
            'BASS_GATE_CLOSE_SCORE=2 BASS_GATE_OPEN_SCORE=6 BASS_GATE_PHASE_WINDOW=0.1',
            'BASS_GATE_CLOSE_SCORE=2 BASS_GATE_OPEN_SCORE=6 BASS_GATE_PHASE_WINDOW=0.2',
        ]);
        expect(rows[0].overrides).toEqual([]);
    });
});

describe('validateRows', () => {
    it('accepts exported constants of bassGateConfig.ts and rejects any other name', () => {
        const known = expandRows([{ name: 'BASS_GATE_OPEN_SCORE', value: '5' }], []);
        const unknown = expandRows([{ name: 'TEMPO_LOCK_CONFIDENCE', value: '5' }], []);
        expect(() => validateRows(known, CONFIG)).not.toThrow();
        expect(() => validateRows(unknown, CONFIG)).toThrow(
            /Unknown constant TEMPO_LOCK_CONFIDENCE. bassGateConfig.ts exports/,
        );
    });
});

describe('loadGateStepper', () => {
    const trace = new GateTrace();
    const replay = replayPcm(onBeatBassPcm(40), RANDOM_BASS_SAMPLE_RATE, {
        lockedTempo: RANDOM_BASS_BPM,
        gateTrace: trace,
    });

    it("steps the unmodified bundle to the replay's opening, and an override changes the outcome", async () => {
        expect(replay.gate.firstOpenSeconds).not.toBeNull();
        expect(firstOpenSeconds(trace, await loadGateStepper([]))).toBe(replay.gate.firstOpenSeconds);
        const never = await loadGateStepper([{ name: 'BASS_GATE_OPEN_SCORE', value: '1e9' }]);
        expect(firstOpenSeconds(trace, never)).toBeNull();
    });

    it('treats the shipped open score as no override', async () => {
        const same = await loadGateStepper([{ name: 'BASS_GATE_OPEN_SCORE', value: '6' }]);
        expect(firstOpenSeconds(trace, same)).toBe(replay.gate.firstOpenSeconds);
    });
});

describe('the report', () => {
    const outcome = (secondsAfterLock: number | null, opened = true) => ({ secondsAfterLock, opened });
    const result: SweepResult = {
        patterns: 3,
        beats: [120],
        dancerLockSeconds: { 'a.wav': 5, 'b.wav': 6, 'c.wav': null, 'n.wav': 4 },
        rows: [
            {
                label: 'base',
                overrides: [],
                falseOpens: { '120': 1 },
                kickTracks: { 'a.wav': outcome(1.5), 'b.wav': outcome(30, false), 'c.wav': outcome(null, false) },
                noKickOpened: [],
            },
            {
                label: 'X=1',
                overrides: [{ name: 'X', value: '1' }],
                falseOpens: { '120': 2 },
                kickTracks: { 'a.wav': outcome(3.5), 'b.wav': outcome(3.9), 'c.wav': outcome(null, false) },
                noKickOpened: ['n.wav'],
            },
        ],
    };

    it('counts within 4 s and 2 s, sums, and leaves out tracks whose dancer never locks', () => {
        expect(summarizeKickTracks(Object.values(result.rows[0].kickTracks))).toEqual({
            locked: 2,
            within4: 1,
            within2: 1,
            sum: 31.5,
            max: 30,
        });
        expect(summarizeKickTracks(Object.values(result.rows[1].kickTracks))).toMatchObject({ within4: 2, within2: 0 });
    });

    it('prints a row per override set, the never-locked tracks and, with --detail, the per-track table', () => {
        const text = formatSweep(result, true).join('\n');
        expect(text).toContain('c.wav');
        expect(text).toMatch(/base\s+1\s+1\/2\s+1\/2\s+31\.5\s+30\.00\s+none/);
        expect(text).toMatch(/X=1\s+2\s+2\/2\s+0\/2\s+7\.4\s+3\.90\s+n\.wav/);
        expect(text).toMatch(/b\.wav\s+6\.00\s+30\.00\*\s+3\.90/);
        expect(formatSweep(result, false).join('\n')).not.toContain('Seconds after the dancer lock per track');
    });

    it('writes the numbers as JSON with null for a dancer that never locks', () => {
        const json = sweepJson(result) as { rows: { secondsAfterLock: Record<string, number | null> }[] };
        expect(json.rows[0].secondsAfterLock).toEqual({ 'a.wav': 1.5, 'b.wav': 30, 'c.wav': null });
        expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    });
});
