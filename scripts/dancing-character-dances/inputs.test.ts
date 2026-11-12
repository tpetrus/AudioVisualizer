import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinnedHash, readVerified, sha256Of, verifyBytes } from './inputs';
import { CMU_FILES, cmuUrl, evenBeats } from './manifests';

const bytes = new TextEncoder().encode('abc');
// The well-known sha256 of "abc".
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('input verification', () => {
    it('hashes bytes with sha256', () => {
        expect(sha256Of(bytes)).toBe(ABC);
    });

    it('accepts bytes that match and throws, naming both hashes, on a mismatch', () => {
        expect(() => verifyBytes('a.amc', bytes, ABC)).not.toThrow();
        expect(() => verifyBytes('a.amc', bytes, '0'.repeat(64))).toThrow(
            new RegExp(`a\\.amc: sha256 is ${ABC}, expected 0{64}`),
        );
    });

    it('refuses a file whose content is not the pinned one and one that is missing', () => {
        const dir = mkdtempSync(join(tmpdir(), 'cmu-test-'));
        try {
            expect(() => readVerified(dir, '55.asf')).toThrow(/is missing; run the fetch script/);
            writeFileSync(join(dir, '55.asf'), 'not the real file');
            expect(() => readVerified(dir, '55.asf')).toThrow(/sha256 is/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('knows only the pinned files', () => {
        expect(Object.keys(CMU_FILES)).toHaveLength(7);
        expect(pinnedHash('55.asf')).toMatch(/^[0-9a-f]{64}$/);
        expect(() => pinnedHash('nope.asf')).toThrow(/unknown CMU file/);
        expect(() => cmuUrl('nope.asf')).toThrow(/unknown CMU file/);
        expect(cmuUrl('60_01.amc')).toBe('http://mocap.cs.cmu.edu/subjects/60/60_01.amc');
    });

    it('lists beats + 1 evenly spaced source frames', () => {
        expect(evenBeats(100, 25, 4)).toEqual([100, 125, 150, 175, 200]);
    });
});
