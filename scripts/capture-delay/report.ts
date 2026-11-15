// Builds the printed and JSON report from one measurement. Pure. Not part of the app bundle.

import type { CaptureSource } from './args';
import { summarizeDelays, type DelayStats } from './stats';

export interface ReportInput {
    source: CaptureSource;
    deviceLabel: string | undefined;
    // One entry per scheduled click, null for a miss.
    delaysMs: readonly (number | null)[];
    sampleRate: number;
    // Seconds; undefined when the browser does not report them.
    baseLatency: number | undefined;
    outputLatency: number | undefined;
    // The delay looks longer than the matching window; the medians would be off by one interval.
    lateSuspected?: boolean;
}

export interface CaptureReport extends DelayStats {
    source: CaptureSource;
    deviceLabel: string | null;
    clicks: number;
    sampleRate: number;
    baseLatencyMs: number | null;
    outputLatencyMs: number | null;
    // Median arrival minus outputLatency, for tab and device only; null otherwise.
    estimatedDelayRelativeToHearingMs: number | null;
    failed: boolean;
    lateSuspected: boolean;
}

const CAVEAT = "outputLatency is the browser's own estimate, and this is one machine's figure, not a guaranteed one.";

function toMs(seconds: number | undefined): number | null {
    return seconds === undefined || !Number.isFinite(seconds) ? null : seconds * 1000;
}

function ms(value: number | null): string {
    return value === null ? 'n/a' : `${value.toFixed(1)} ms`;
}

export function buildReport(input: ReportInput): CaptureReport {
    const stats = summarizeDelays(input.delaysMs);
    const outputLatencyMs = toMs(input.outputLatency);
    const median = stats.medianMs;
    const lateSuspected = input.lateSuspected ?? false;
    return {
        ...stats,
        source: input.source,
        deviceLabel: input.deviceLabel ?? null,
        clicks: input.delaysMs.length,
        sampleRate: input.sampleRate,
        baseLatencyMs: toMs(input.baseLatency),
        outputLatencyMs,
        estimatedDelayRelativeToHearingMs:
            input.source !== 'direct' && median !== null ? median - (outputLatencyMs ?? 0) : null,
        // Fewer than half found: too little to trust, and the usual cause is the setup, not the machine.
        failed: stats.found * 2 < input.delaysMs.length || lateSuspected,
        lateSuspected,
    };
}

export function formatReport(report: CaptureReport): string {
    const lines: string[] = [];
    lines.push(`Source: ${report.source}${report.deviceLabel ? ` (${report.deviceLabel})` : ''}`);
    lines.push(`Clicks found: ${report.found} of ${report.clicks} (${report.missed} missed)`);
    if (report.lateSuspected) {
        lines.push(
            'The measurement failed: the first click was missed but the others were found, so the delay is probably ' +
                'longer than --interval and every figure would be off by one interval. Raise --interval above the ' +
                'expected delay (for example 2) and run again.',
        );
        return lines.join('\n');
    }
    if (report.failed) {
        lines.push(
            'The measurement failed: fewer than half the clicks were found. This usually means the tab audio was not ' +
                'shared, the wrong device was chosen (it must carry what the speakers play), or the output was muted.',
        );
        return lines.join('\n');
    }
    lines.push(
        `Arrival minus scheduled: median ${ms(report.medianMs)}, p5 ${ms(report.p5Ms)}, p95 ${ms(report.p95Ms)}`,
    );
    lines.push(`Sample rate: ${report.sampleRate} Hz`);
    lines.push(`baseLatency: ${ms(report.baseLatencyMs)}, outputLatency: ${ms(report.outputLatencyMs)}`);
    if (report.source === 'direct') {
        lines.push(
            'Direct self-check: the measuring pipeline alone (the in-page stream round trip), the floor under any other source.',
        );
    } else {
        lines.push(`Estimated delay relative to hearing: ${ms(report.estimatedDelayRelativeToHearingMs)}`);
        lines.push(`Caveat: ${CAVEAT}`);
    }
    return lines.join('\n');
}
