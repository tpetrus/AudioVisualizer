import { describe, expect, it } from 'vitest';
import { parseOutputFolders, sessionArgs } from './record';

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
