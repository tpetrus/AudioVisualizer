import { describe, expect, it } from 'vitest';
import { parseTapArgs } from './args';

describe('parseTapArgs', () => {
    it('prints help without arguments and on --help', () => {
        expect(parseTapArgs([]).kind).toBe('help');
        expect(parseTapArgs(['--dir', 'd', '--help']).kind).toBe('help');
    });

    it('parses a full command with defaults', () => {
        expect(parseTapArgs(['--dir', 'd', '--track', 't.wav'])).toEqual({
            kind: 'run',
            args: { dir: 'd', track: 't.wav', viz: 'cubes', calibrate: false, force: false },
        });
        expect(parseTapArgs(['--dir', 'd', '--track', 't.wav', '--viz', 'x', '--calibrate', '--force'])).toEqual({
            kind: 'run',
            args: { dir: 'd', track: 't.wav', viz: 'x', calibrate: true, force: true },
        });
    });

    it.each([
        [['--dir', 'd'], '--track is required'],
        [['--track', 't'], '--dir is required'],
        [['--dir', '--track', 't'], '--dir needs a value'],
        [['--dir'], '--dir needs a value'],
        [['--nope'], 'Unknown option'],
        [['stray'], 'Unexpected argument'],
    ])('rejects %j', (argv, message) => {
        const parsed = parseTapArgs(argv);
        expect(parsed.kind).toBe('error');
        expect(parsed.kind === 'error' && parsed.message).toContain(message);
    });
});
