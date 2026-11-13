// Reprints the windowed summary of a telemetry CSV written by the debug harness, followed by the tempo report. Run it
// with `npm run debug:summary -- <csv> [--bpm N] [--window S]`. Not part of the app bundle: nothing under app/ imports
// this file.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { summarizeTelemetry } from '../../app/features/audio/devTelemetrySummary';
import { alignmentReportLines } from './alignmentReport';
import { parseCsv } from './csv';
import { chooseReference, parseSummaryArgs, SUMMARY_USAGE } from './args';
import { parseBpmSidecar, summarizeTempo } from './tempoReport';

function fail(reason: string): never {
    process.stderr.write(`${reason}\n`);
    process.exit(1);
}

function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const parsed = parseSummaryArgs(process.argv.slice(2));
if (parsed.kind === 'help') {
    console.log(SUMMARY_USAGE);
    process.exit(0);
}
if (parsed.kind === 'error') fail(parsed.message);
const { path, bpm, window } = parsed.args;

let text = '';
try {
    text = readFileSync(path, 'utf8');
} catch (error) {
    fail(`Cannot read ${path}: ${reasonOf(error)}`);
}

try {
    const table = parseCsv(text);
    // The flag wins; otherwise the sidecar the harness copied beside the CSV, if there is one.
    const sidecarPath = join(dirname(path), 'track.bpm');
    let sidecarText: string | undefined;
    if (bpm === undefined && existsSync(sidecarPath)) {
        try {
            sidecarText = readFileSync(sidecarPath, 'utf8');
        } catch (error) {
            console.log(`Warning: cannot read ${sidecarPath}: ${reasonOf(error)}; ignoring it.`);
        }
    }
    const reference = chooseReference(bpm, sidecarText, sidecarPath, parseBpmSidecar);
    if (reference.warning) console.log(reference.warning);
    const lines = summarizeTelemetry(table, { maxLines: 20, windowSeconds: window });
    lines.push(...summarizeTempo(table, { referenceBpm: reference.bpm, windowSeconds: window }));
    // Ground truth the harness copied beside the CSV, when the track had a `.beats.json`.
    const beatsPath = join(dirname(path), 'track.beats.json');
    if (existsSync(beatsPath)) {
        try {
            lines.push(...alignmentReportLines(table, readFileSync(beatsPath, 'utf8')));
        } catch (error) {
            lines.push(`Alignment: cannot read ${beatsPath}: ${reasonOf(error)}`);
        }
    }
    console.log(lines.join('\n'));
} catch (error) {
    fail(`${path}: ${reasonOf(error)}`);
}
