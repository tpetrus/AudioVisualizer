// The alignment report (contract C2) for a recorded telemetry CSV, judged against a `track.beats.json` ground-truth
// sidecar. Pure: the summary command reads the files and prints what this returns. Not part of the app bundle.

import { buildEvalReport, formatEvalReports } from '../../app/features/rhythm/eval/evalReport';
import { parseBeatSidecar } from '../../app/features/rhythm/eval/sidecar';
import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import { findTempoColumns } from './tempoReport';

// A beat is the moment the recorded beat phase wraps from near 1 back to near 0. A drop smaller than this is a phase
// correction or a jitter, not a new beat.
const WRAP_DROP = 0.5;

export interface TelemetryDetection {
    beats: number[];
    tempo: { time: number; bpm: number }[];
}

// Beat times and the held tempo read back from the existing telemetry columns, or the reason they cannot be.
export function detectedFromTelemetry(table: TelemetryTable): TelemetryDetection | { unavailable: string } {
    const columns = findTempoColumns(table.columns);
    if (!columns) return { unavailable: 'the recording has no "<probe>.bpm" column' };
    if (columns.t < 0) return { unavailable: 'the recording has no "t" column' };
    if (columns.beatPhase < 0) return { unavailable: 'the recording has no "<probe>.beatPhase" column' };
    const tempo = table.rows.map((row) => ({
        time: row[columns.t],
        bpm: Number.isFinite(row[columns.bpm]) ? row[columns.bpm] : 0,
    }));
    const beats: number[] = [];
    let previous = NaN;
    for (const row of table.rows) {
        const phase = row[columns.beatPhase];
        const bpm = row[columns.bpm];
        if (Number.isFinite(phase) && bpm > 0 && previous - phase > WRAP_DROP) {
            // The wrap happened `phase` of a beat before this row.
            beats.push(row[columns.t] - (phase * 60) / bpm);
        }
        previous = phase;
    }
    return { beats, tempo };
}

// Printable lines. Onsets are never available from a recording: the telemetry has no per-band onset columns. Times are
// the recording's own t, so the figures assume the recording started at the beginning of the track.
export function alignmentReportLines(table: TelemetryTable, sidecarText: string): string[] {
    let sidecar;
    try {
        sidecar = parseBeatSidecar(sidecarText);
    } catch (error) {
        return [`Alignment: cannot use track.beats.json: ${error instanceof Error ? error.message : String(error)}`];
    }
    const detected = detectedFromTelemetry(table);
    if ('unavailable' in detected) return [`Alignment: not available, ${detected.unavailable}.`];
    const report = buildEvalReport(sidecar, detected);
    return [
        'Alignment (against track.beats.json):',
        ...formatEvalReports([report]),
        '  onsets: not available, a recording has no per-band onset columns',
        '  reaction offset: not available, a recording has no click-time column',
    ];
}
