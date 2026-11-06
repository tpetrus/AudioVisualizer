// Pure comparison of several recordings of one track (contract C5): does the tempo tracker land on the same tempo, beat
// grid and dance loop position every time. Runs are compared on track time, so a different frame rate does not show up
// as a difference. No DOM and no node APIs. Not part of the app bundle.

import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import { computeTempoMetrics, findTempoColumns, normalizeOctave } from './tempoReport';

export interface RepeatTargets {
    bpmPercent: number;
    beatMs: number;
    clipLoops: number;
    lockSeconds: number;
}

export interface RepeatSpread {
    median: number;
    p95: number;
    max: number;
}

export interface RepeatComparison {
    runs: number;
    lockTimes: (number | undefined)[];
    medianBpms: number[];
    sameOctave: boolean;
    samples: number;
    // Each is the spread across runs at one sample time, summarized over all samples.
    bpmPercent: RepeatSpread;
    beatMs: RepeatSpread;
    clipLoops: RepeatSpread;
    lockSeconds: number; // Infinity when a run never locked
}

const DEFAULT_TARGETS: RepeatTargets = { bpmPercent: 1, beatMs: 40, clipLoops: 0.05, lockSeconds: 2 };
const SAMPLE_STEP_SECONDS = 0.25;
const NO_SPREAD: RepeatSpread = { median: NaN, p95: NaN, max: NaN };

function significant(value: number, digits = 3): string {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return String(Number(value.toPrecision(digits)));
}

// The smallest arc, as a fraction of the circle, that holds every value. It is the circle minus the widest gap between
// neighbors, the wrap-around gap included, so 0.99 and 0.01 are 0.02 apart.
function circularSpread(fractions: readonly number[]): number {
    if (fractions.length < 2) return 0;
    const sorted = fractions.map((value) => ((value % 1) + 1) % 1).sort((a, b) => a - b);
    let widest = sorted[0] + 1 - sorted[sorted.length - 1];
    for (let i = 1; i < sorted.length; i++) widest = Math.max(widest, sorted[i] - sorted[i - 1]);
    return 1 - widest;
}

function summarize(values: readonly number[]): RepeatSpread {
    if (values.length === 0) return NO_SPREAD;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return {
        median: sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
        // Nearest rank: the smallest value that at least 95% of the samples do not exceed.
        p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
        max: sorted[sorted.length - 1],
    };
}

interface RunSeries {
    t: number[];
    bpm: number[];
    beatPhase: number[];
    clipPhase: number[];
}

// A run with no tempo columns has empty series, so it never yields a sample.
function seriesOf(table: TelemetryTable): RunSeries {
    const series: RunSeries = { t: [], bpm: [], beatPhase: [], clipPhase: [] };
    const columns = findTempoColumns(table.columns);
    if (!columns) return series;
    for (const row of table.rows) {
        series.t.push(row[columns.t]);
        series.bpm.push(row[columns.bpm]);
        series.beatPhase.push(columns.beatPhase < 0 ? NaN : row[columns.beatPhase]);
        series.clipPhase.push(columns.clipPhase < 0 ? NaN : row[columns.clipPhase]);
    }
    return series;
}

export function compareRuns(tables: readonly TelemetryTable[]): RepeatComparison {
    if (tables.length < 2) throw new Error('Need at least two recordings to compare.');

    const metrics = tables.map((table) => computeTempoMetrics(table));
    const lockTimes = metrics.map((m) => m?.lockTime);
    const medianBpms = metrics.map((m) => m?.medianBpm ?? NaN);
    const first = medianBpms[0];
    const sameOctave = medianBpms.every(
        (median) => Number.isFinite(median) && Number.isFinite(first) && Math.round(Math.log2(median / first)) === 0,
    );

    const lockSeconds = lockTimes.some((lock) => lock === undefined)
        ? Infinity
        : Math.max(...(lockTimes as number[])) - Math.min(...(lockTimes as number[]));

    const series = tables.map(seriesOf);
    const bpmValues: number[] = [];
    const beatValues: number[] = [];
    const clipValues: number[] = [];
    let samples = 0;

    const everyRunLocked = lockTimes.every((lock) => lock !== undefined);
    if (everyRunLocked) {
        const start = Math.max(...lockTimes);
        // The runs share track time, so the comparison ends where the shortest one does.
        const end = Math.min(...series.map((s) => s.t[s.t.length - 1]));
        const period = 60 / first;
        // Index of each run's latest usable row at or before the current sample; only moves forward.
        const latest = series.map(() => -1);
        const next = series.map(() => 0);
        for (let k = 0; start + k * SAMPLE_STEP_SECONDS <= end + 1e-9; k++) {
            const sampleT = start + k * SAMPLE_STEP_SECONDS;
            series.forEach((s, run) => {
                while (next[run] < s.t.length && s.t[next[run]] <= sampleT) {
                    const i = next[run]++;
                    if (s.bpm[i] > 0 && Number.isFinite(s.beatPhase[i])) latest[run] = i;
                }
            });
            if (latest.some((index) => index < 0)) continue;

            samples++;
            const bpms = series.map((s, run) => normalizeOctave(s.bpm[latest[run]], first));
            const meanBpm = bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length;
            bpmValues.push(((Math.max(...bpms) - Math.min(...bpms)) / meanBpm) * 100);
            if (sameOctave) {
                // Beat time uses the row's own bpm and phase, so a coarse frame rate does not blur the grid.
                const beatTimes = series.map((s, run) => {
                    const i = latest[run];
                    return (s.t[i] - (s.beatPhase[i] * 60) / s.bpm[i]) / period;
                });
                beatValues.push(circularSpread(beatTimes) * period * 1000);
            }
            clipValues.push(circularSpread(series.map((s, run) => s.clipPhase[latest[run]])));
        }
    }

    return {
        runs: tables.length,
        lockTimes,
        medianBpms,
        sameOctave,
        samples,
        bpmPercent: summarize(bpmValues),
        beatMs: sameOctave ? summarize(beatValues) : NO_SPREAD,
        clipLoops: summarize(clipValues),
        lockSeconds,
    };
}

// Names of the targets this comparison misses. NaN misses, because a number that cannot be measured has not passed.
function missedTargets(comparison: RepeatComparison, targets: RepeatTargets): string[] {
    const missed: string[] = [];
    if (!comparison.sameOctave) missed.push('same octave');
    if (!(comparison.bpmPercent.p95 <= targets.bpmPercent)) missed.push('bpm spread');
    if (!(comparison.beatMs.p95 <= targets.beatMs)) missed.push('beat spread');
    if (!(comparison.clipLoops.p95 <= targets.clipLoops)) missed.push('clip spread');
    if (!(comparison.lockSeconds <= targets.lockSeconds)) missed.push('lock time spread');
    return missed;
}

export function formatRepeatReport(comparison: RepeatComparison, targets: Partial<RepeatTargets> = {}): string[] {
    const goals: RepeatTargets = { ...DEFAULT_TARGETS, ...targets };
    const spread = (label: string, value: RepeatSpread, unit: string, target: number) =>
        `${label}: median ${significant(value.median)}${unit}, p95 ${significant(value.p95)}${unit}, ` +
        `max ${significant(value.max)}${unit} (target p95 <= ${significant(target)}${unit})`;
    const lines = [
        `Repeat: ${comparison.runs} runs, ${comparison.samples} samples every ${SAMPLE_STEP_SECONDS} s of track time`,
        `lock times: ${comparison.lockTimes.map((t) => (t === undefined ? 'never' : `${significant(t)} s`)).join(', ')}`,
        `median bpm: ${comparison.medianBpms.map((bpm) => significant(bpm)).join(', ')}` +
            (comparison.sameOctave
                ? ''
                : ' (the runs are not in the same octave or never locked, so beat spread is not comparable)'),
        spread('bpm spread', comparison.bpmPercent, '%', goals.bpmPercent),
        spread('beat spread', comparison.beatMs, ' ms', goals.beatMs),
        spread('clip spread', comparison.clipLoops, ' loops', goals.clipLoops),
        `lock time spread: ${significant(comparison.lockSeconds)} s (target <= ${significant(goals.lockSeconds)} s)`,
    ];
    const missed = missedTargets(comparison, goals);
    lines.push(missed.length === 0 ? 'REPEAT VERDICT: PASS' : `REPEAT VERDICT: FAIL (${missed.join(', ')})`);
    return lines;
}

// One line per run with how far its median tempo is from the reference, octave-normalized.
export function describeRunDeviations(medianBpms: readonly number[], referenceBpm: number): string[] {
    return medianBpms.map((bpm, index) => {
        const deviation = (Math.abs(normalizeOctave(bpm, referenceBpm) - referenceBpm) / referenceBpm) * 100;
        return `run ${index + 1}: median ${significant(bpm)} bpm, ${significant(deviation)}% from ${significant(referenceBpm)} bpm`;
    });
}
