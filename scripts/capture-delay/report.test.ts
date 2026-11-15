import { describe, expect, it } from 'vitest';
import { buildReport, formatReport, type ReportInput } from './report';

const base: ReportInput = {
    source: 'device',
    deviceLabel: 'Stereo Mix (Realtek)',
    delaysMs: [100, 110, 120, 130, null],
    sampleRate: 48000,
    baseLatency: 0.01,
    outputLatency: 0.04,
};

describe('buildReport', () => {
    it('subtracts outputLatency from the median for a device', () => {
        const report = buildReport(base);
        expect(report).toMatchObject({
            found: 4,
            missed: 1,
            clicks: 5,
            medianMs: 115,
            baseLatencyMs: 10,
            outputLatencyMs: 40,
            failed: false,
        });
        expect(report.estimatedDelayRelativeToHearingMs).toBeCloseTo(75);
    });

    it('gives no hearing-relative figure for the direct self-check', () => {
        expect(buildReport({ ...base, source: 'direct', deviceLabel: undefined })).toMatchObject({
            estimatedDelayRelativeToHearingMs: null,
            deviceLabel: null,
        });
    });

    it('leaves latencies null when the browser reports none', () => {
        const report = buildReport({ ...base, baseLatency: undefined, outputLatency: undefined });
        expect(report.outputLatencyMs).toBeNull();
        expect(report.estimatedDelayRelativeToHearingMs).toBeCloseTo(115);
    });

    it('fails when fewer than half the clicks are found, but not at exactly half', () => {
        expect(buildReport({ ...base, delaysMs: [10, null, null] }).failed).toBe(true);
        expect(buildReport({ ...base, delaysMs: [10, null] }).failed).toBe(false);
        expect(buildReport({ ...base, delaysMs: [null, null] }).failed).toBe(true);
    });
});

describe('formatReport', () => {
    it('prints the figures and the caveat', () => {
        const text = formatReport(buildReport(base));
        expect(text).toContain('Source: device (Stereo Mix (Realtek))');
        expect(text).toContain('Clicks found: 4 of 5 (1 missed)');
        expect(text).toContain('median 115.0 ms, p5 101.5 ms, p95 128.5 ms');
        expect(text).toContain('Sample rate: 48000 Hz');
        expect(text).toContain('baseLatency: 10.0 ms, outputLatency: 40.0 ms');
        expect(text).toContain('Estimated delay relative to hearing: 75.0 ms');
        expect(text).toContain("browser's own estimate");
    });

    it('prints n/a for missing latencies and no caveat for direct', () => {
        const text = formatReport(
            buildReport({ ...base, source: 'direct', baseLatency: undefined, outputLatency: undefined }),
        );
        expect(text).toContain('outputLatency: n/a');
        expect(text).toContain('Direct self-check');
        expect(text).not.toContain('Caveat');
    });

    it('explains a failed measurement', () => {
        const text = formatReport(buildReport({ ...base, delaysMs: [null, null, null] }));
        expect(text).toContain('The measurement failed');
        expect(text).toContain('tab audio was not shared');
        expect(text).not.toContain('Estimated delay');
    });

    it('fails a suspected over-long delay with no median', () => {
        const report = buildReport({ ...base, delaysMs: [null, 120, 120], lateSuspected: true });
        const text = formatReport(report);
        expect(report.failed).toBe(true);
        expect(text).toContain('--interval');
        expect(text).not.toContain('median');
    });
});
