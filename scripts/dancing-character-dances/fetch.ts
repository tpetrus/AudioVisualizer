// Downloads the CMU motion-capture inputs the dance clips are built from and checks every file against its pinned
// sha256 (manifests.ts). Run (from the repository root):
//   npx esbuild scripts/dancing-character-dances/fetch.ts --bundle --platform=node --format=esm --packages=external
//     --log-level=warning --outfile=node_modules/.cache/fetch-dances.mjs && node node_modules/.cache/fetch-dances.mjs [input-dir]
// The directory defaults to node_modules/.cache/cmu-mocap. Files already there that match their hash are kept. The site's
// https certificate is broken, so the download is plain http: the pinned hash is the integrity check, and a file that
// does not match is never written. Exits non-zero on any mismatch or failed download.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_INPUT_DIR, sha256Of, verifyBytes } from './inputs';
import { CMU_FILES, cmuUrl } from './manifests';

// Reads the cached copy in one step instead of checking that it exists first, so nothing can change between a check and
// the read. A missing or unreadable file simply counts as not cached.
function cachedMatches(path: string, sha256: string): boolean {
    try {
        return sha256Of(readFileSync(path)) === sha256;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    const dir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_INPUT_DIR;
    mkdirSync(dir, { recursive: true });
    const failures: string[] = [];
    for (const [name, { sha256 }] of Object.entries(CMU_FILES)) {
        const path = join(dir, name);
        if (cachedMatches(path, sha256)) {
            console.log(`ok (cached) ${name}`);
            continue;
        }
        try {
            const response = await fetch(cmuUrl(name));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            // Only bytes that match the pinned hash are written, so the file on disk is exactly the reviewed input.
            verifyBytes(name, bytes, sha256);
            writeFileSync(path, bytes);
            console.log(`ok (downloaded, ${bytes.length} bytes) ${name}`);
        } catch (error) {
            failures.push(`${name}: ${(error as Error).message}`);
        }
    }
    if (failures.length > 0) {
        for (const message of failures) console.error(`FAIL ${message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
