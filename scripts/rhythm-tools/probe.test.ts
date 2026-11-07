import { describe, expect, it } from 'vitest';
import { renderTrack, runPipeline, TEST_SAMPLE_RATE } from '../../app/features/rhythm/testSignals';
import { correlateWindow, estimateTempo, interpolatedPeak, tempoGeometry, type Correlation } from './autocorrelation';
import { extractOnsetSeries } from './onset';
import { buildProbeReport, findFirstLock, foldToOctave, replayTracker } from './probe';

// A click track with a kick on the downbeat: tempo is clear, and a 3/4 pulse (the bar) competes with it.
const TRACK = renderTrack({ seconds: 24, bpm: 120, beatsPerBar: 4 });
const series = extractOnsetSeries(TRACK.pcm, TEST_SAMPLE_RATE);
const geometry = tempoGeometry(series.frameRate);

describe('probe agreement with the real tempo tracker', () => {
    it('reaches the same winning lag, tempo, confidence and rival as the tracker on every update', () => {
        const steps = replayTracker(series.combined, series.frameRate);
        expect(steps.length).toBeGreaterThan(50);

        for (const step of steps) {
            const window = correlateWindow(series.combined, step.frames, geometry)!;
            const estimate = estimateTempo(window, geometry);

            expect(estimate.bpm).toBeCloseTo(step.raw, 6);
            expect(estimate.confidence).toBeCloseTo(step.confidence, 6);
            expect(estimate.rivalBpm).toBeCloseTo(step.rival, 6);
            if (step.raw > 0) {
                // The tracker refines the integer winner by at most TEMPO_REFINE_RANGE (4%).
                expect(Math.abs((60 * series.frameRate) / estimate.bestLag / step.raw - 1)).toBeLessThanOrEqual(0.041);
            }
        }
        expect(steps.at(-1)!.raw).toBeCloseTo(120, 0);
    });

    it('builds the tracker input from the bands exactly as RhythmAnalyzer does', () => {
        const run = runPipeline(TRACK.pcm);
        const last = replayTracker(series.combined, series.frameRate).at(-1)!;

        expect(run.frameRate).toBe(series.frameRate);
        expect(last.raw).toBe(run.analyzer.rawTempoBpm);
        expect(last.held).toBe(run.analyzer.heldTempoBpm);
        expect(last.rival).toBe(run.analyzer.rivalBpm);
    });
});

describe('autocorrelation helpers', () => {
    it('needs a minimum of history and reports a silent window as having nothing to correlate', () => {
        expect(correlateWindow(new Float32Array(10), 10, geometry)).toBeUndefined();

        const silent = correlateWindow(new Float32Array(1000), 1000, geometry)!;

        expect(silent.silent).toBe(true);
        expect(estimateTempo(silent, geometry).bpm).toBe(0);
    });

    it('measures a peak between whole lags with a parabola, and refuses to look past the trusted lags', () => {
        const correlation = new Float32Array(40);
        // A parabola with its top at lag 20.25, height 0.8.
        for (let lag = 15; lag <= 25; lag++) {
            correlation[lag] = 0.8 - 0.01 * (lag - 20.25) ** 2;
        }
        const window: Correlation = { correlation, lagLimit: 38, n: 80, silent: false };

        const peak = interpolatedPeak(window, 20)!;

        expect(peak.height).toBeCloseTo(0.8, 4);
        expect(peak.lag).toBeCloseTo(20.25, 4);
        expect(interpolatedPeak(window, 38)).toBeUndefined();
    });

    it('returns the plain value at a flat or rising top', () => {
        const correlation = new Float32Array(40).fill(0.3);
        const window: Correlation = { correlation, lagLimit: 38, n: 80, silent: false };

        expect(interpolatedPeak(window, 20)!.height).toBeCloseTo(0.3, 6);
    });

    it('folds a lag to the octave nearest a target', () => {
        expect(foldToOctave(61.2, 30.66)).toBeCloseTo(30.6, 6);
        expect(foldToOctave(20, 41)).toBeCloseTo(40, 6);
        expect(foldToOctave(40, 41)).toBe(40);
    });
});

describe('buildProbeReport', () => {
    const input = { name: 'click', series, referenceBpm: 90 };

    it('prints the evidence tables, with the reference and its dotted rival beside the tracker winner', () => {
        const text = buildProbeReport(input).join('\n');

        expect(text).toContain('## click');
        expect(text).toMatch(/Mirror check: .* on (\d+) of \1 updates/);
        expect(text).toContain('First lock at');
        expect(text).toContain('### Rival evidence at');
        expect(text).toContain('(first lock,');
        expect(text).toContain('(first full window,');
        expect(text).toContain('tracker winner');
        expect(text).toContain('reference');
        expect(text).toContain('### Tempo over time');
        expect(text).toContain('old pulse');
    });

    it('prints the same text twice for the same input', () => {
        expect(buildProbeReport(input)).toEqual(buildProbeReport(input));
    });

    it('respects the analysis span and row spacing', () => {
        const rows = (every: number) =>
            buildProbeReport(input, { everySeconds: every, maxSeconds: 20 }).filter((line) =>
                /^\| \d+\.\d\d \|/.test(line),
            );

        expect(rows(2).length).toBeGreaterThan(rows(10).length);
    });

    it('says so when the tracker never locks', () => {
        const flat = {
            name: 'flat',
            series: {
                ...series,
                combined: new Float32Array(2000),
                bands: series.bands.map(() => new Float32Array(2000)),
            },
        };

        const text = buildProbeReport(flat).join('\n');

        expect(text).toContain('never locked');
        expect(findFirstLock(replayTracker(flat.series.combined, flat.series.frameRate))).toBeUndefined();
    });

    it('works without a reference tempo', () => {
        const text = buildProbeReport({ name: 'click', series }).join('\n');

        expect(text).toContain('reference none');
        expect(text).not.toContain('| reference');
    });
});
