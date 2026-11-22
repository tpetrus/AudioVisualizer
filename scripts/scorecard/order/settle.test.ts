import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunFolder } from '../live/ingest';
import { folderSettle } from './settle';

const roots: string[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function folderWith(options: string | undefined): RunFolder {
    const path = mkdtempSync(join(tmpdir(), 'settle-'));
    roots.push(path);
    mkdirSync(path, { recursive: true });
    if (options !== undefined) writeFileSync(join(path, 'options.json'), options);
    return { path, viz: 'cubes', track: 'a.wav', stamp: '', play: 2 };
}

describe('folderSettle', () => {
    it('reads the recorded seconds', () => {
        expect(folderSettle(folderWith('{"viz":"cubes","settle":3}'))).toBe(3);
    });

    it('counts a missing, malformed or unreadable value as 0', () => {
        expect(folderSettle(folderWith('{"viz":"cubes"}'))).toBe(0);
        expect(folderSettle(folderWith('{"settle":"3"}'))).toBe(0);
        expect(folderSettle(folderWith('not json'))).toBe(0);
        expect(folderSettle(folderWith(undefined))).toBe(0);
    });
});
