import { describe, expect, it } from 'vitest';
import { detectFromPcm } from '../../app/features/rhythm/eval/detect';
import { buildEvalReport } from '../../app/features/rhythm/eval/evalReport';
import { ONSET_BANDS, type BeatSidecar, type EvalReport } from '../../app/features/rhythm/eval/evalTypes';
import { GROUND_TRUTH_SAMPLE_RATE, GROUND_TRUTH_TRACKS, renderGroundTruthTrack } from './render';

// Runs the real pipeline over the synthetic ground-truth tracks and checks the alignment figures. Two kinds of test:
//   - "today" tests assert what the pipeline does now, with room to spare, so a regression shows.
//   - "target" tests assert the plan's targets (tempo within 2 percent, median beat error within 20 ms, onset F of at
//     least 0.9 at 50 ms). Where the pipeline misses one today the test is `it.fails`, the repository's way of recording a
//     known weakness: fixing it turns the test red until `.fails` is removed. Nothing here tunes the pipeline.
//
// Measured on the pipeline as it stands (tempo ratio / lock time / median beat error):
//   click-90 1.000 / 3.0 s / 2.2 ms      click-120 1.000 / 3.0 s / 1.6 ms     click-140 0.997 / 3.0 s / 0.8 ms
//   click-174 0.999 / 3.0 s / 1.3 ms     drums-128 0.997 / 3.0 s / 2.3 ms     drums-150 1.000 / 3.0 s / 1.6 ms
//   no-kick-124 1.001 / 3.0 s / 1.3 ms   trap-2to1-half-140 0.997 / 3.0 s / 2.7 ms
//   trap-4to3-120 1.000 / 8.0 s / 1.6 ms (the tracker first takes the dotted rival, then corrects)
//   drums-100 2.000 / never / n/a        trap-2to1-double-90 2.000 / never / n/a (both lock to double time)
// Onset F at 50 ms, from the per-band detector the worklet runs (BandOnsets): every labelled band scores 1.00 except
// the low end of two tracks, and F at 20 ms is the same to two decimals:
//   no-kick-124 bass: precision 1.00, recall 0.51. The running-mean floor that keeps real music down to one or two events
//     per beat is lifted by the repeated bass notes themselves, so every other one falls under it.
//   bassline-kick-120 kick / bass: precision 0.75 / 0.82, recall 0.76 / 0.84. With a kick on the beat and a pitched
//     bassline between, the kick/bass classifier mixes the two up; its cue does not transfer to real music either, so
//     it is a known weakness to solve with labelled real-music data, not by tuning against these tracks.

// Tracks whose tempo the pipeline holds at the wrong octave or ratio at the end of the run.
const TEMPO_MISSES = new Set(['drums-100', 'trap-2to1-double-90']);
// Tracks where some band with labelled onsets scores below 0.9 at 50 ms.
const ONSET_MISSES = new Set(['no-kick-124', 'bassline-kick-120']);
// The recall each band of those tracks holds today, a little under the measured value, so a regression still shows.
const RECALL_TODAY: Record<string, Partial<Record<(typeof ONSET_BANDS)[number], number>>> = {
    'no-kick-124': { bass: 0.45 },
    'bassline-kick-120': { kick: 0.7, bass: 0.75 },
};

interface Run {
    report: EvalReport;
    onsets: BeatSidecar['onsets'];
}

const runs = new Map<string, Run>();
function runOf(name: string): Run {
    let run = runs.get(name);
    if (run === undefined) {
        const spec = GROUND_TRUTH_TRACKS.find((candidate) => candidate.name === name);
        if (spec === undefined) throw new Error(`Unknown track ${name}`);
        const { pcm, sidecar } = renderGroundTruthTrack(spec);
        run = {
            report: buildEvalReport(sidecar, detectFromPcm(pcm, GROUND_TRUTH_SAMPLE_RATE)),
            onsets: sidecar.onsets,
        };
        runs.set(name, run);
    }
    return run;
}

function reportFor(name: string): EvalReport {
    return runOf(name).report;
}

// `it` for a target the pipeline meets, `it.fails` for one it misses.
const targetTest = (misses: Set<string>, name: string) => (misses.has(name) ? it.fails : it);

describe.each(GROUND_TRUTH_TRACKS.map((spec) => spec.name))('%s', (name) => {
    describe('targets', () => {
        targetTest(TEMPO_MISSES, name)('detects the labelled tempo within 2 percent', () => {
            const ratio = reportFor(name).tempoRatio;
            expect(ratio).toBeDefined();
            expect(Math.abs((ratio ?? 0) - 1)).toBeLessThanOrEqual(0.02);
        });

        targetTest(TEMPO_MISSES, name)('has a median beat error within 20 ms', () => {
            expect(reportFor(name).beatErrorMs?.median).toBeLessThanOrEqual(20);
        });

        targetTest(ONSET_MISSES, name)('scores an onset F of at least 0.9 at 50 ms in every band it can score', () => {
            const sidecarOnsets = runOf(name).onsets;
            const fifty = reportFor(name).onsets.find((entry) => entry.toleranceMs === 50);
            expect(fifty).toBeDefined();
            for (const band of ONSET_BANDS) {
                // Bands with nothing labelled have no recall to judge.
                if (sidecarOnsets?.[band].length === 0) continue;
                expect(fifty?.bands[band]?.f, band).toBeGreaterThanOrEqual(0.9);
            }
        });
    });
});

describe('today, on the tracks whose tempo is found', () => {
    const found = GROUND_TRUTH_TRACKS.filter((spec) => !TEMPO_MISSES.has(spec.name));

    it.each(found.map((spec) => spec.name))('%s locks early and keeps its beats within 10 ms', (name) => {
        const report = reportFor(name);
        expect(report.lockSeconds).toBeLessThanOrEqual(10);
        expect(report.beatErrorMs?.median).toBeLessThanOrEqual(10);
        expect(report.beatErrorMs?.p95).toBeLessThanOrEqual(20);
        expect(Math.abs(report.beatErrorMs?.bias ?? NaN)).toBeLessThanOrEqual(10);
    });

    it.each(found.map((spec) => spec.name))('%s finds the labelled onsets in the bands it hears', (name) => {
        const fifty = reportFor(name).onsets.find((entry) => entry.toleranceMs === 50);
        const sidecarOnsets = runOf(name).onsets;
        for (const band of ONSET_BANDS) {
            if (sidecarOnsets?.[band].length === 0) continue;
            expect(fifty?.bands[band]?.recall, band).toBeGreaterThanOrEqual(RECALL_TODAY[name]?.[band] ?? 0.95);
        }
    });
});

describe('today, on the tracks whose tempo is missed', () => {
    it.each([...TEMPO_MISSES])('%s is held at double time and never counts as locked', (name) => {
        const report = reportFor(name);
        expect(report.tempoRatio).toBeCloseTo(2, 1);
        expect(report.lockSeconds).toBeUndefined();
        expect(report.beatErrorMs).toBeUndefined();
    });
});

describe('the report', () => {
    it('has one onset entry per tolerance and scores bass where it is labelled', () => {
        const report = reportFor('drums-128');
        expect(report.onsets.map((entry) => entry.toleranceMs)).toEqual([20, 50]);
        for (const entry of report.onsets) {
            expect(Object.keys(entry.bands).sort()).toEqual(['bass', 'highs', 'kick', 'snare']);
        }
        expect(report.source).toBe('synthetic');
    });
});
