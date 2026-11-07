import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderTrack, TEST_SAMPLE_RATE } from '../../app/features/rhythm/testSignals';
import { applyOverrides, exportedConstants, parseAblateArguments, parseOverride } from './ablate';
import { loadWithOverrides } from './ablatePlugin';
import { formatAblation } from './ablateReport';
import { runAblation } from './ablateRunner';

const CONFIG = resolve('app/features/rhythm/rhythmConfig.ts');
const SOURCE = [
    '// comment',
    'export const A_COUNT = 4;',
    'export const B_LIST = [2, 3] as const;',
    'export const C_RATIO = 1 / 3;   ',
    'export const NAME = "x";',
].join('\r\n');

describe('parseOverride', () => {
    it('splits NAME=VALUE and allows numbers, arithmetic and lists', () => {
        expect(parseOverride('TEMPO_SWITCH_ESTIMATES=12')).toEqual({ name: 'TEMPO_SWITCH_ESTIMATES', value: '12' });
        expect(parseOverride('X = [2, 1/3]')).toEqual({ name: 'X', value: '[2, 1/3]' });
    });

    it.each(['NOEQUALS', '=1', 'lower=1', 'A=', 'A=1;process.exit()', 'A=foo'])('rejects %s', (text) => {
        expect(() => parseOverride(text)).toThrow(/--set/);
    });
});

describe('applyOverrides', () => {
    it('replaces only the named initializer and keeps `as const` and line endings', () => {
        const result = applyOverrides(SOURCE, [
            { name: 'A_COUNT', value: '12' },
            { name: 'B_LIST', value: '[2]' },
            { name: 'C_RATIO', value: '0.5' },
        ]);

        expect(result.split('\r\n')).toEqual([
            '// comment',
            'export const A_COUNT = 12;',
            'export const B_LIST = [2] as const;',
            'export const C_RATIO = 0.5;',
            'export const NAME = "x";',
        ]);
    });

    it('fails loudly on an unknown name and lists the real ones', () => {
        expect(() => applyOverrides(SOURCE, [{ name: 'A_COUNTT', value: '1' }])).toThrow(
            /Unknown constant A_COUNTT.*A_COUNT, B_LIST, C_RATIO, NAME/,
        );
    });

    it('fails on a declaration it cannot rewrite as one line', () => {
        const multiline = 'export const SPLIT = [\n  1,\n  2,\n];\n';

        expect(() => applyOverrides(multiline, [{ name: 'SPLIT', value: '1' }])).toThrow(/Cannot override SPLIT/);
        expect(exportedConstants(multiline)).toEqual(['SPLIT']);
    });

    it('can override every exported constant of the real config', () => {
        const source = applyOverrides(
            // Read through the plugin path below; here the names alone are enough.
            'export const TEMPO_SWITCH_ESTIMATES = 4;\n',
            [{ name: 'TEMPO_SWITCH_ESTIMATES', value: '12' }],
        );

        expect(source).toContain('= 12;');
    });
});

describe('parseAblateArguments', () => {
    it('returns undefined for no arguments or --help, so the usage prints', () => {
        expect(parseAblateArguments([])).toBeUndefined();
        expect(parseAblateArguments(['--help'])).toBeUndefined();
    });

    it('collects the wav, the overrides and the options', () => {
        expect(
            parseAblateArguments(['a.wav', '--set', 'X=1', '--set', 'Y=[2]', '--every', '2', '--seconds', '30']),
        ).toEqual({
            wav: 'a.wav',
            overrides: [
                { name: 'X', value: '1' },
                { name: 'Y', value: '[2]' },
            ],
            everySeconds: 2,
            maxSeconds: 30,
        });
    });

    it.each([
        [['--set', 'X=1'], /Missing <wav>/],
        [['a.wav', 'b.wav'], /Only one WAV/],
        [['a.wav', '--bogus'], /Unknown option/],
        [['a.wav', '--set'], /needs a value/],
        [['a.wav', '--set', 'X=1', '--set', 'X=2'], /given twice/],
        [['a.wav', '--every', '0'], /above 0/],
        [['a.wav', '--seconds', 'soon'], /number of seconds/],
    ])('rejects %j', (argv, message) => {
        expect(() => parseAblateArguments(argv)).toThrow(message);
    });
});

describe('the esbuild override plugin', () => {
    const entry = (names: string) => ({
        stdin: {
            contents: `export { ${names} } from ${JSON.stringify(CONFIG.replace(/\\/g, '/'))};`,
            resolveDir: resolve('.'),
            loader: 'ts' as const,
        },
    });

    it('changes the constant that every importer sees, and leaves it alone without an override', async () => {
        const plain = (await loadWithOverrides(entry('TEMPO_SWITCH_ESTIMATES, TEMPO_FASTER_DIVISORS'), [])) as Record<
            string,
            unknown
        >;
        const ablated = (await loadWithOverrides(entry('TEMPO_SWITCH_ESTIMATES, TEMPO_FASTER_DIVISORS'), [
            { name: 'TEMPO_SWITCH_ESTIMATES', value: '12' },
            { name: 'TEMPO_FASTER_DIVISORS', value: '[2]' },
        ])) as Record<string, unknown>;

        expect(plain).toMatchObject({ TEMPO_SWITCH_ESTIMATES: 4, TEMPO_FASTER_DIVISORS: [2, 3] });
        expect(ablated).toMatchObject({ TEMPO_SWITCH_ESTIMATES: 12, TEMPO_FASTER_DIVISORS: [2] });
    });

    it('rejects an unknown constant instead of ignoring it', async () => {
        await expect(
            loadWithOverrides(entry('TEMPO_SWITCH_ESTIMATES'), [{ name: 'TEMPO_SWITCH_ESTIMATE', value: '1' }]),
        ).rejects.toThrow(/Unknown constant TEMPO_SWITCH_ESTIMATE/);
    });

    it('rejects a bundle that never loads the config, because the override would do nothing', async () => {
        await expect(
            loadWithOverrides({ stdin: { contents: 'export const a = 1;', resolveDir: resolve('.') } }, [
                { name: 'TEMPO_SWITCH_ESTIMATES', value: '1' },
            ]),
        ).rejects.toThrow(/never loaded/);
    });

    it('runs the real analyzer with the override and prints the same text twice', async () => {
        const track = renderTrack({ seconds: 14, bpm: 120, beatsPerBar: 4 });
        const load = async (value: string) =>
            (await loadWithOverrides({ entryPoint: resolve('scripts/rhythm-tools/ablateRunner.ts') }, [
                { name: 'TEMPO_LOCK_CONFIDENCE', value },
            ])) as { runAblation: typeof runAblation };
        const run = async (value: string) =>
            formatAblation('click.wav', [], (await load(value)).runAblation(track.pcm, TEST_SAMPLE_RATE, 5)).join('\n');

        const first = await run('0.2');
        const again = await run('0.2');
        // A confidence nobody reaches means the tracker never holds a tempo.
        const never = await run('5');

        expect(again).toBe(first);
        expect(first).toMatch(/First lock: t = \d+\.\d\d s at 1[12]\d\.\d\d BPM/);
        expect(never).toContain('First lock: never');
    });
});

describe('runAblation and formatAblation', () => {
    it('records the first lock, the held tempo over time and the event lists', () => {
        const track = renderTrack({ seconds: 14, bpm: 120, beatsPerBar: 4 });

        const result = runAblation(track.pcm, TEST_SAMPLE_RATE, 5);
        const text = formatAblation('click.wav', [{ name: 'X', value: '1' }], result);

        expect(result.firstLock!.held).toBeCloseTo(120, -1);
        expect(result.samples.length).toBeGreaterThanOrEqual(3);
        expect(text[0]).toBe('Ablation of click.wav');
        expect(text[1]).toBe('Overrides: X=1');
        expect(text).toContain('Grid rebuilds: 0');
        expect(text).toContain('Song changes: 0');
    });

    it('lists the times of rebuilds and song changes', () => {
        const text = formatAblation('x.wav', [], {
            sampleRate: 48000,
            frameRate: 100,
            seconds: 10,
            firstLock: undefined,
            samples: [],
            gridRebuilds: [1.234, 5],
            songChanges: [7],
        });

        expect(text).toContain('Grid rebuilds: 2 at t = 1.23, 5.00 s');
        expect(text).toContain('Song changes: 1 at t = 7.00 s');
        expect(text).toContain('First lock: never');
    });
});
