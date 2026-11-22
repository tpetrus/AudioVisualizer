// Reads the `settle` a follow play recorded in its options.json (debug:viz --settle). It lives here, not in the shared
// run-folder reader, because only the order check cares about it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunFolder } from '../live/ingest';

// The seconds waited before the track was chosen again; 0 when the folder has none or its options.json is unreadable.
export function folderSettle(folder: RunFolder): number {
    try {
        const options = JSON.parse(readFileSync(join(folder.path, 'options.json'), 'utf8')) as { settle?: unknown };
        return typeof options.settle === 'number' && Number.isFinite(options.settle) ? options.settle : 0;
    } catch {
        return 0;
    }
}
