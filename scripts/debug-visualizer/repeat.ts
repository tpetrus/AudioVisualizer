// Compares two or more telemetry CSVs of one track. Run it with
// `npm run debug:repeat -- <a.csv> <b.csv> [...] [--bpm N]`. Not part of the app bundle: nothing under app/ imports
// this file.

import { readFileSync } from 'node:fs';
import { parseTelemetryCsv } from '../../app/features/audio/devTelemetrySummary';
import { parseRepeatArgs, REPEAT_USAGE } from './args';
import { compareRuns, describeRunDeviations, formatRepeatReport } from './repeatReport';

function fail(reason: string): never {
    process.stderr.write(`${reason}\n`);
    process.exit(1);
}

function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const parsed = parseRepeatArgs(process.argv.slice(2));
if (parsed.kind === 'help') {
    console.log(REPEAT_USAGE);
    process.exit(0);
}
if (parsed.kind === 'error') fail(parsed.message);
const { paths, bpm } = parsed.args;

const tables = paths.map((path) => {
    let text = '';
    try {
        text = readFileSync(path, 'utf8');
    } catch (error) {
        fail(`Cannot read ${path}: ${reasonOf(error)}`);
    }
    try {
        return parseTelemetryCsv(text);
    } catch (error) {
        return fail(`${path}: ${reasonOf(error)}`);
    }
});

try {
    const comparison = compareRuns(tables);
    const lines = formatRepeatReport(comparison);
    // The reference lines go before the verdict so that stays the last line.
    if (bpm !== undefined) lines.splice(lines.length - 1, 0, ...describeRunDeviations(comparison.medianBpms, bpm));
    console.log(lines.join('\n'));
} catch (error) {
    fail(reasonOf(error));
}
