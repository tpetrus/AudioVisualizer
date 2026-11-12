// The CMU input files and how they are verified. Raw mocap is never committed, and downloads are never written to disk:
// the build downloads each file into memory (or reads a local copy the developer provides) and checks it against the
// sha256 pinned in manifests.ts before parsing it.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CMU_FILES, cmuUrl } from './manifests';

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

// Reads a file of a local input directory and verifies it.
export function readVerified(dir: string, name: string): Buffer {
    const path = join(dir, name);
    // Read in one step (no exists check first, which could race with the read) and explain a missing file.
    let bytes: Buffer;
    try {
        bytes = readFileSync(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`${path} is missing; run the build without an input directory to download the inputs`, {
                cause: error,
            });
        }
        throw error;
    }
    verifyBytes(name, bytes, pinnedHash(name));
    return bytes;
}

// Where the build gets one input's verified bytes from.
export type InputSource = (name: string) => Promise<Buffer>;

export function directorySource(dir: string): InputSource {
    // Reading inside the executor makes a missing or mismatched file reject the promise like a failed download does,
    // instead of throwing synchronously.
    return (name) => new Promise((resolve) => resolve(readVerified(dir, name)));
}

// Downloads one input into memory and verifies it. The site's https certificate is broken, so this is plain http; the
// pinned hash is the integrity check, and bytes that do not match are rejected before anything reads them.
export async function fetchVerified(name: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
    const response = await fetchImpl(cmuUrl(name));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyBytes(name, bytes, pinnedHash(name));
    return bytes;
}

// Loads every named input once, in order, so a file shared by two dances is downloaded or read only once.
export async function loadInputs(names: readonly string[], source: InputSource): Promise<Map<string, Buffer>> {
    const inputs = new Map<string, Buffer>();
    for (const name of names) if (!inputs.has(name)) inputs.set(name, await source(name));
    return inputs;
}
