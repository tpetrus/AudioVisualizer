import { describe, expect, it } from 'vitest';
import { parseOutputFolders, sessionArgs } from './record';

describe('record helpers settle', () => {
    it('passes --settle only above 0', () => {
        const base = { dir: 'd', track: 't.wav', lead: 'cubes', then: 'bass-ink', seconds: undefined, headless: false };
        expect(sessionArgs({ ...base, settle: 0 })).not.toContain('--settle');
        expect(sessionArgs({ ...base, settle: 3 })).toEqual([...sessionArgs(base), '--settle', '3']);
    });
});

describe('record helpers', () => {
    it('builds the debug:viz arguments', () => {
        expect(
            sessionArgs({
                dir: 'd',
                track: 't.wav',
                lead: 'cubes',
                then: 'bass-ink',
                seconds: undefined,
                headless: false,
            }),
        ).toEqual(['--dir', 'd', '--track', 't.wav', '--viz', 'cubes', '--then', 'bass-ink']);
        expect(
            sessionArgs({ dir: 'd', track: 't.wav', lead: 'cubes', then: 'bass-ink', seconds: 20, headless: true }),
        ).toEqual([
            '--dir',
            'd',
            '--track',
            't.wav',
            '--viz',
            'cubes',
            '--then',
            'bass-ink',
            '--seconds',
            '20',
            '--headless',
        ]);
    });

    it('reads the output folders in order', () => {
        expect(parseOutputFolders('x\nOutput: C:\\a\\one \nmore\nOutput: /b/two\n')).toEqual(['C:\\a\\one', '/b/two']);
    });
});
