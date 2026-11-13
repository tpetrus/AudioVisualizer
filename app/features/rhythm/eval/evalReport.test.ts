import { describe, expect, it } from 'vitest';
import { buildEvalReport, formatEvalReports, formatTempoLine, tempoFigures } from './evalReport';
import type { BeatSidecar, EvalReport } from './evalTypes';
import type { TempoSample } from './metrics';

const sidecar: BeatSidecar = {
    track: 'drums.wav',
    tempo: 120,
    beats: [1, 1.5, 2, 2.5, 3],
    onsets: { kick: [1, 2, 3], bass: [1.25], snare: [1.5, 2.5], highs: [] },
    source: 'synthetic',
    tapOffsetMs: 0,
};

const lockedTempo: TempoSample[] = [0, 1, 2, 3].map((time) => ({ time, bpm: time === 0 ? 0 : 120 }));

describe('buildEvalReport', () => {
    it('assembles the tempo, beat error and onset figures', () => {
        const report = buildEvalReport(sidecar, {
            beats: [1.01, 1.51, 2.01, 2.51, 3.01],
            tempo: lockedTempo,
            onsets: { kick: [1, 2, 3.03], snare: [1.5, 2.5, 2.9], highs: [] },
        });
        expect(report.track).toBe('drums.wav');
        expect(report.source).toBe('synthetic');
        expect(report.tempoRatio).toBe(1);
        expect(report.lockSeconds).toBe(1);
        expect(report.beatErrorMs?.median).toBeCloseTo(10);
        expect(report.beatErrorMs?.bias).toBeCloseTo(10);
        expect(report.tapNoiseFloorMs).toBeUndefined();
        expect(report.onsets.map((entry) => entry.toleranceMs)).toEqual([20, 50]);
        const [tight, loose] = report.onsets;
        expect(tight.bands.kick?.recall).toBeCloseTo(2 / 3);
        expect(loose.bands.kick?.f).toBe(1);
        expect(loose.bands.snare?.precision).toBeCloseTo(2 / 3);
        // The pipeline gave no bass detections at all, and highs has nothing on either side.
        expect(loose.bands.bass).toBeUndefined();
        expect(loose.bands.highs).toBeUndefined();
    });

    it('scores a band that has detections but no truth', () => {
        const report = buildEvalReport(sidecar, { beats: [], tempo: [], onsets: { highs: [1, 2] } });
        expect(report.onsets[1].bands.highs).toEqual({ precision: 0, recall: 0, f: 0 });
    });

    it('leaves out what a run cannot give', () => {
        const report = buildEvalReport(sidecar, { beats: [], tempo: [] });
        expect(report.tempoRatio).toBeUndefined();
        expect(report.lockSeconds).toBeUndefined();
        expect(report.beatErrorMs).toBeUndefined();
        expect(report.onsets).toEqual([]);
    });

    it('has no onset entries for a tapped sidecar and copies its tap noise floor', () => {
        const tapped: BeatSidecar = {
            track: 'tap.wav',
            tempo: 120,
            beats: [1, 2],
            source: 'tapped',
            tapOffsetMs: -30,
            tapNoiseFloorMs: 14,
        };
        const report = buildEvalReport(tapped, { beats: [1, 2], tempo: lockedTempo, onsets: { kick: [1] } });
        expect(report.onsets).toEqual([]);
        expect(report.tapNoiseFloorMs).toBe(14);
    });

    it('reports a 2:1 and a 4:3 lock as ratios and never as a lock', () => {
        const at = (bpm: number) => [0, 1, 2, 3, 4, 5].map((time) => ({ time, bpm }));
        expect(tempoFigures(120, at(240))).toEqual({ tempoRatio: 2, lockSeconds: undefined });
        expect(tempoFigures(120, at(160)).tempoRatio).toBeCloseTo(4 / 3);
        expect(tempoFigures(120, at(160)).lockSeconds).toBeUndefined();
    });
});

describe('formatEvalReports', () => {
    const full: EvalReport = {
        track: 'drums.wav',
        source: 'synthetic',
        tempoRatio: 1.0004,
        lockSeconds: 3.25,
        beatErrorMs: { median: 4.04, p95: 11.5, bias: -2.26 },
        onsets: [
            {
                toleranceMs: 20,
                bands: { kick: { precision: 1, recall: 0.5, f: 2 / 3 } },
            },
            { toleranceMs: 50, bands: {} },
        ],
        reactionOffsetMs: 12,
    };

    it('prints the figures of a synthetic report, 50 ms before 20 ms', () => {
        expect(formatEvalReports([full])).toEqual([
            'drums.wav (synthetic)',
            '  tempo ratio 1.000, locked at 3.3 s',
            '  beat error median 4.0 ms, p95 11.5 ms, bias -2.3 ms',
            '  onsets at 50 ms: no bands scored',
            '  onsets at 20 ms: kick P 1.00 R 0.50 F 0.67',
            '  reaction offset median +12.0 ms',
        ]);
    });

    it('prints what is missing and the tap noise floor beside the beat error of a tapped track', () => {
        const missing: EvalReport = {
            track: 'a.wav',
            source: 'tapped',
            tempoRatio: undefined,
            lockSeconds: undefined,
            beatErrorMs: undefined,
            onsets: [],
            tapNoiseFloorMs: 9,
        };
        const withError: EvalReport = {
            ...missing,
            track: 'b.wav',
            tempoRatio: 2,
            lockSeconds: 0,
            beatErrorMs: { median: 30, p95: 60, bias: 5 },
        };
        expect(formatEvalReports([missing, withError])).toEqual([
            'a.wav (tapped)',
            '  no tempo found, never locked',
            '  beat error n/a (no lock or no beats) (tap noise floor 9.0 ms)',
            'b.wav (tapped)',
            '  tempo ratio 2.000, locked at 0.0 s',
            '  beat error median 30.0 ms, p95 60.0 ms, bias +5.0 ms (tap noise floor 9.0 ms)',
        ]);
    });

    it('prints nothing for no reports and a tempo line for a tempo-only figure set', () => {
        expect(formatEvalReports([])).toEqual([]);
        expect(formatTempoLine({ tempoRatio: 0.75, lockSeconds: undefined })).toBe('tempo ratio 0.750, never locked');
    });
});
