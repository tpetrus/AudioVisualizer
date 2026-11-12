import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { directorySource, fetchVerified, loadInputs, pinnedHash, readVerified, sha256Of, verifyBytes } from './inputs';
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
            expect(() => readVerified(dir, '55.asf')).toThrow(/is missing; run the build without an input directory/);
            writeFileSync(join(dir, '55.asf'), 'not the real file');
            expect(() => readVerified(dir, '55.asf')).toThrow(/sha256 is/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('downloads into memory, rejects bytes that do not match the pin and reports a failed request', async () => {
        const requested: string[] = [];
        const serve = (body: string, status = 200): typeof fetch =>
            ((url: string) => {
                requested.push(url);
                return Promise.resolve(new Response(body, { status }));
            }) as unknown as typeof fetch;
        const pins = CMU_FILES as Record<string, { sha256: string }>;
        const original = pins['55.asf'].sha256;
        pins['55.asf'].sha256 = ABC;
        try {
            await expect(fetchVerified('55.asf', serve('abc'))).resolves.toEqual(Buffer.from('abc'));
            await expect(fetchVerified('55.asf', serve('tampered'))).rejects.toThrow(/sha256 is/);
            await expect(fetchVerified('55.asf', serve('', 404))).rejects.toThrow(/55\.asf: HTTP 404/);
        } finally {
            pins['55.asf'].sha256 = original;
        }
        expect(requested).toEqual(Array(3).fill('http://mocap.cs.cmu.edu/subjects/55/55.asf'));
    });

    it('loads each input once and reads a local directory through the same verification', async () => {
        const calls: string[] = [];
        const inputs = await loadInputs(['a', 'b', 'a'], (name) => {
            calls.push(name);
            return Promise.resolve(Buffer.from(name));
        });
        expect(calls).toEqual(['a', 'b']);
        expect([...inputs.keys()]).toEqual(['a', 'b']);
        const dir = mkdtempSync(join(tmpdir(), 'cmu-test-'));
        try {
            writeFileSync(join(dir, '55.asf'), 'not the real file');
            await expect(directorySource(dir)('55.asf')).rejects.toThrow(/sha256 is/);
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
