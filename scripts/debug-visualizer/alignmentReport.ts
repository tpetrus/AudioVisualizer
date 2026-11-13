// The alignment report (contract C2) for a recorded telemetry CSV, judged against a `track.beats.json` ground-truth
// sidecar. Pure: the summary command reads the files and prints what this returns. Not part of the app bundle.

import { buildEvalReport, formatEvalReports } from '../../app/features/rhythm/eval/evalReport';
import { parseBeatSidecar } from '../../app/features/rhythm/eval/sidecar';
import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import { DEFAULT_PEAK_OPTIONS, pickPeaks } from '../../app/features/rhythm/eval/detect';
import type { OnsetBand } from '../../app/features/rhythm/eval/evalTypes';
import { formatReactionOffset, measureReactionOffset } from './reactionOffset';
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

// The base columns that hold the tracker's per-band onset strengths, and the scored band each one stands for (the same
// mapping the offline evaluation uses: kick to kick, mid to snare, high to highs; bass is not scored).
const ONSET_COLUMN_BANDS: readonly (readonly [string, OnsetBand])[] = [
    ['onsetKick', 'kick'],
    ['onsetMid', 'snare'],
    ['onsetHigh', 'highs'],
];

// The recording is sampled once per rendered frame (about 16.7 ms), not every 10 ms like the offline analysis, so a
// peak must beat its neighbors within one frame and the mean is taken over about a quarter second of frames.
const LIVE_PEAK_OPTIONS = { ...DEFAULT_PEAK_OPTIONS, radiusFrames: 1, meanRadiusFrames: 15 };

// Onset times from the recorded per-band onset columns, or undefined when the recording has none. A time is the t of
// the frame the strength peaked in, so it is only as precise as the frame interval.
export function onsetsFromTelemetry(table: TelemetryTable): Partial<Record<OnsetBand, number[]>> | undefined {
    const t = table.columns.indexOf('t');
    if (t < 0) return undefined;
    const onsets: Partial<Record<OnsetBand, number[]>> = {};
    for (const [name, band] of ONSET_COLUMN_BANDS) {
        const column = table.columns.indexOf(name);
        if (column < 0) continue;
        const rows = table.rows.filter((row) => Number.isFinite(row[t]));
        const peaks = pickPeaks(
            rows.map((row) => (Number.isFinite(row[column]) ? row[column] : 0)),
            LIVE_PEAK_OPTIONS,
        );
        onsets[band] = peaks.map((index) => rows[index][t]);
    }
    return Object.keys(onsets).length > 0 ? onsets : undefined;
}

export interface AlignmentOptions {
    // A column whose first rise after each beat of the sidecar (a click track) is timed. Without it no reaction offset
    // is printed.
    reactionColumn?: string;
}

// Printable lines. Times are the recording's own t (track time), so the figures assume the recording started at the
// beginning of the track.
export function alignmentReportLines(
    table: TelemetryTable,
    sidecarText: string,
    options: AlignmentOptions = {},
): string[] {
    let sidecar;
    try {
        sidecar = parseBeatSidecar(sidecarText);
    } catch (error) {
        return [`Alignment: cannot use track.beats.json: ${error instanceof Error ? error.message : String(error)}`];
    }
    const detected = detectedFromTelemetry(table);
    if ('unavailable' in detected) return [`Alignment: not available, ${detected.unavailable}.`];
    const onsets = onsetsFromTelemetry(table);
    const report = buildEvalReport(sidecar, { ...detected, onsets });
    const lines = ['Alignment (against track.beats.json):', ...formatEvalReports([report])];
    if (!onsets) {
        lines.push('  onsets: not available, the recording has no onsetKick/onsetMid/onsetHigh columns');
    } else if (!sidecar.onsets) {
        lines.push('  onsets: not scored, the sidecar has no onset labels (a tapped track)');
    } else {
        lines.push(`  onsets: peaks of the recorded tracker onsets, frame allowance +/-${frameAllowance(table)} ms`);
    }
    if (options.reactionColumn === undefined) {
        lines.push('  reaction offset: not measured, pass --reaction <column> with a click track');
    } else {
        const reaction = measureReactionOffset(table, options.reactionColumn, sidecar.beats);
        lines.push(
            'unavailable' in reaction
                ? `  reaction offset: not available, ${reaction.unavailable}`
                : formatReactionOffset(options.reactionColumn, reaction),
        );
    }
    return lines;
}

// The median row interval in ms, to one decimal: a time read off a row can be late by up to this much.
function frameAllowance(table: TelemetryTable): string {
    const t = table.columns.indexOf('t');
    const gaps: number[] = [];
    for (let i = 1; i < table.rows.length; i++) {
        const gap = table.rows[i][t] - table.rows[i - 1][t];
        if (gap > 0) gaps.push(gap * 1000);
    }
    gaps.sort((a, b) => a - b);
    return gaps.length > 0 ? gaps[gaps.length >> 1].toFixed(1) : 'n/a';
}
