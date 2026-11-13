import {
    ONSET_BANDS,
    ONSET_TOLERANCES_MS,
    type BeatSidecar,
    type EvalReport,
    type OnsetBand,
    type OnsetReport,
} from './evalTypes';
import { beatError, lockSeconds, scoreOnsets, tempoRatio, type TempoSample } from './metrics';

// Builds the C2 report for one run from ground truth plus what the pipeline detected, and prints reports as text.

// What one run of the pipeline detected, all times in seconds from the start of the track.
export interface DetectedRun {
    // Beat times, ascending.
    beats: number[];
    // The held tempo over time.
    tempo: TempoSample[];
    // Detected onsets per band, ascending. A band the pipeline cannot detect is left out, and then it is left out of the
    // report as well.
    onsets?: Partial<Record<OnsetBand, number[]>>;
}

export interface TempoFigures {
    tempoRatio: number | undefined;
    lockSeconds: number | undefined;
}

// The two figures a tempo label alone (a `.bpm` file) can judge.
export function tempoFigures(labelBpm: number, tempo: readonly TempoSample[]): TempoFigures {
    return { tempoRatio: tempoRatio(tempo, labelBpm), lockSeconds: lockSeconds(tempo, labelBpm) };
}

// One entry per tolerance. A band is scored when the truth or the detections have something in it, so a band with
// nothing on either side stays out of the report instead of reading as a perfect or a failed score.
function onsetReports(
    truth: Record<OnsetBand, number[]>,
    detected: Partial<Record<OnsetBand, number[]>>,
): OnsetReport[] {
    return ONSET_TOLERANCES_MS.map((toleranceMs) => {
        const bands: OnsetReport['bands'] = {};
        for (const band of ONSET_BANDS) {
            const found = detected[band];
            if (found === undefined || (found.length === 0 && truth[band].length === 0)) continue;
            bands[band] = scoreOnsets(truth[band], found, toleranceMs);
        }
        return { toleranceMs, bands };
    });
}

export function buildEvalReport(sidecar: BeatSidecar, run: DetectedRun): EvalReport {
    const figures = tempoFigures(sidecar.tempo, run.tempo);
    const report: EvalReport = {
        track: sidecar.track,
        source: sidecar.source,
        ...figures,
        beatErrorMs: beatError(sidecar.beats, run.beats, figures.lockSeconds),
        // A tapped beat is not an onset label, and a run without detected onsets has nothing to score.
        onsets: sidecar.onsets && run.onsets ? onsetReports(sidecar.onsets, run.onsets) : [],
    };
    if (sidecar.tapNoiseFloorMs !== undefined) report.tapNoiseFloorMs = sidecar.tapNoiseFloorMs;
    return report;
}

function fixed(value: number, digits = 1): string {
    return value.toFixed(digits);
}

function signed(value: number): string {
    return `${value >= 0 ? '+' : '-'}${fixed(Math.abs(value))}`;
}

export function formatTempoLine(figures: TempoFigures): string {
    const ratio = figures.tempoRatio === undefined ? 'no tempo found' : `tempo ratio ${fixed(figures.tempoRatio, 3)}`;
    const lock = figures.lockSeconds === undefined ? 'never locked' : `locked at ${fixed(figures.lockSeconds)} s`;
    return `${ratio}, ${lock}`;
}

function formatOnsetLine(report: OnsetReport): string {
    const bands = ONSET_BANDS.flatMap((band) => {
        const score = report.bands[band];
        return score === undefined
            ? []
            : [`${band} P ${fixed(score.precision, 2)} R ${fixed(score.recall, 2)} F ${fixed(score.f, 2)}`];
    });
    return `onsets at ${report.toleranceMs} ms: ${bands.length === 0 ? 'no bands scored' : bands.join(', ')}`;
}

// Printable lines for the reports, one block per report. A tapped track's beat error is printed next to its tap noise
// floor, because the floor is the smallest error that can be told apart from the tapper's own scatter.
export function formatEvalReports(reports: readonly EvalReport[]): string[] {
    const lines: string[] = [];
    for (const report of reports) {
        lines.push(`${report.track} (${report.source})`);
        lines.push(`  ${formatTempoLine(report)}`);
        const error = report.beatErrorMs;
        let beats =
            error === undefined
                ? 'beat error n/a (no lock or no beats)'
                : `beat error median ${fixed(error.median)} ms, p95 ${fixed(error.p95)} ms, bias ${signed(error.bias)} ms`;
        if (report.tapNoiseFloorMs !== undefined) beats += ` (tap noise floor ${fixed(report.tapNoiseFloorMs)} ms)`;
        lines.push(`  ${beats}`);
        if (report.onsets.length > 0) {
            // The gate tolerance first, then the tighter one that shows the headroom.
            for (const onset of [...report.onsets].sort((a, b) => b.toleranceMs - a.toleranceMs)) {
                lines.push(`  ${formatOnsetLine(onset)}`);
            }
        }
        if (report.reactionOffsetMs !== undefined) {
            lines.push(`  reaction offset median ${signed(report.reactionOffsetMs)} ms`);
        }
    }
    return lines;
}
