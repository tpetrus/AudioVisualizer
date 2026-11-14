import { describe, expect, it } from 'vitest';
import { parseCaptureArgs, pickDevice, USAGE } from './args';

describe('parseCaptureArgs', () => {
    it('prints usage for no arguments and for --help', () => {
        expect(parseCaptureArgs([])).toEqual({ kind: 'help' });
        expect(parseCaptureArgs(['--source', 'direct', '--help'])).toEqual({ kind: 'help' });
    });

    it('applies the defaults', () => {
        expect(parseCaptureArgs(['--source', 'tab'])).toEqual({
            kind: 'run',
            args: {
                source: 'tab',
                device: undefined,
                clicks: 20,
                interval: 0.5,
                out: undefined,
                headless: false,
            },
        });
    });

    it('reads every option', () => {
        const parsed = parseCaptureArgs([
            '--source',
            'device',
            '--device',
            'Stereo Mix',
            '--clicks',
            '8',
            '--interval',
            '0.25',
            '--out',
            'r.json',
        ]);
        expect(parsed).toMatchObject({
            kind: 'run',
            args: { source: 'device', device: 'Stereo Mix', clicks: 8, interval: 0.25, out: 'r.json' },
        });
    });

    it('allows --headless only with the direct source', () => {
        expect(parseCaptureArgs(['--source', 'direct', '--headless'])).toMatchObject({
            kind: 'run',
            args: { headless: true },
        });
        for (const source of ['tab', 'device']) {
            expect(parseCaptureArgs(['--source', source, '--headless'])).toMatchObject({
                kind: 'error',
                message: expect.stringContaining('--headless is only allowed with --source direct'),
            });
        }
    });

    it.each([
        [['--clicks', '5'], '--source is required'],
        [['--source', 'cable'], 'Unknown source'],
        [['--source', 'tab', '--clicks', '0'], '--clicks'],
        [['--source', 'tab', '--clicks', '2.5'], '--clicks'],
        [['--source', 'tab', '--interval', '0.01'], '--interval'],
        [['--source', 'tab', '--interval', 'x'], '--interval'],
        [['--source', 'device', '--device', '--clicks'], '--device needs a value'],
        [['--source'], '--source needs a value'],
        [['--bogus'], 'Unknown option'],
        [['stray'], 'Unexpected argument'],
    ])('rejects %j with a message and the usage', (argv, text) => {
        const parsed = parseCaptureArgs(argv);
        expect(parsed.kind).toBe('error');
        if (parsed.kind === 'error') {
            expect(parsed.message).toContain(text);
            expect(parsed.message).toContain(USAGE);
        }
    });
});

describe('pickDevice', () => {
    const devices = [
        { deviceId: 'a', label: 'Microphone (Realtek)' },
        { deviceId: 'b', label: 'Stereo Mix (Realtek)' },
    ];

    it('matches a label substring ignoring case', () => {
        expect(pickDevice(devices, 'stereo mix')?.deviceId).toBe('b');
    });

    it('gives undefined for no match, an empty text or no text', () => {
        expect(pickDevice(devices, 'cable')).toBeUndefined();
        expect(pickDevice(devices, '')).toBeUndefined();
        expect(pickDevice(devices, undefined)).toBeUndefined();
    });
});
