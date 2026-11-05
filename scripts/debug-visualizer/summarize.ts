// Reprints the windowed summary of a telemetry CSV written by the debug harness. Run it with
// `npm run debug:summary -- <csv>`. Not part of the app bundle: nothing under app/ imports this file.

import { readFileSync } from 'node:fs';
import { parseTelemetryCsv, summarizeTelemetry } from '../../app/features/audio/devTelemetrySummary';

function fail(reason: string): never {
    process.stderr.write(`${reason}\n`);
    process.exit(1);
}

function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const path = process.argv[2];
if (path === undefined) fail('Usage: npm run debug:summary -- <telemetry.csv>');

let text = '';
try {
    text = readFileSync(path, 'utf8');
} catch (error) {
    fail(`Cannot read ${path}: ${reasonOf(error)}`);
}

try {
    console.log(summarizeTelemetry(parseTelemetryCsv(text)).join('\n'));
} catch (error) {
    fail(`${path}: ${reasonOf(error)}`);
}
