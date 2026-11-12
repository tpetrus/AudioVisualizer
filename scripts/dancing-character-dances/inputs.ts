// The CMU input files: where they are cached and how they are verified. Raw mocap is never committed; every use of a
// file (the build, the fetch) checks it against the sha256 pinned in manifests.ts.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CMU_FILES } from './manifests';

export const DEFAULT_INPUT_DIR = resolve('node_modules/.cache/cmu-mocap');

export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// Throws unless the bytes hash to `expected`.
export function verifyBytes(name: string, bytes: Uint8Array, expected: string): void {
    const actual = sha256Of(bytes);
    if (actual !== expected) throw new Error(`${name}: sha256 is ${actual}, expected ${expected}`);
}

export function pinnedHash(name: string): string {
    const file = CMU_FILES[name];
    if (!file) throw new Error(`unknown CMU file ${name}`);
    return file.sha256;
}

// Reads a file of the input directory and verifies it; a missing file says how to fetch it.
export function readVerified(dir: string, name: string): Buffer {
    const path = join(dir, name);
    if (!existsSync(path)) throw new Error(`${path} is missing; run the fetch script first (see fetch.ts)`);
    const bytes = readFileSync(path);
    verifyBytes(name, bytes, pinnedHash(name));
    return bytes;
}
