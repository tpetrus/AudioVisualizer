import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GROUND_TRUTH_TRACKS, renderGroundTruthTrack } from '../ground-truth/render';
import { buildScorecard } from './cells';
import { measureScenarios } from './engine';
import { measureSources, type TrackSource } from './inputs';
import { resolveTrack } from './tracks';

// The CI ratchet: a small set of synthetic tracks is rendered in memory, measured and scored, and every cell listed in
// synthetic-baseline.json (a cell that passed when the file was written) must still pass. It needs no .debug-in folder,
// so it runs everywhere and catches a regression in the hub, the tracker or the gate on CI.
//
// To regenerate the fixture after a deliberate change (a better number, a new passing cell, a changed target):
//   UPDATE_SCORECARD_BASELINE=1 npx vitest run scripts/scorecard/synthetic.test.ts
// and review the diff: the list must only gain cells unless a target or metric definition changed on purpose.

const BASELINE_FILE = fileURLToPath(new URL('./synthetic-baseline.json', import.meta.url));

// Trimmed so the whole test stays well under 30 s. The cells are deterministic for these lengths.
const TRACKS = [
    'click-120',
    'drums-100',
    'drums-128',
    'no-kick-124',
    'trap-2to1-half-140',
    'trap-4to3-120',
    'bassline-kick-120',
    'pad-lead-groove-110',
];
const MAX_SECONDS = 40;

interface BaselineCell {
    metric: string;
    track: string;
    visualizer: string;
}

function sources(): TrackSource[] {
    return TRACKS.map((name) => {
        const spec = GROUND_TRUTH_TRACKS.find((candidate) => candidate.name === name);
        if (spec === undefined) throw new Error(`Unknown ground-truth track ${name}`);
        const { pcm, sidecar } = renderGroundTruthTrack({ ...spec, seconds: Math.min(spec.seconds, MAX_SECONDS) });
        const file = `${name}.wav`;
        return { name: file, class: resolveTrack(file, sidecar.source).class, pcm, sampleRate: 44100, sidecar };
    });
}

describe('synthetic scorecard ratchet', () => {
    it('keeps every cell that passed in the baseline passing', () => {
        const scorecard = buildScorecard({
            revision: 'test',
            created: 'test',
            scenarios: measureScenarios(),
            ...measureSources(sources()),
        });
        const passing: BaselineCell[] = scorecard.cells
            .filter((cell) => cell.blocking && cell.status === 'pass')
            .map(({ metric, track, visualizer }) => ({ metric, track, visualizer }));

        if (process.env.UPDATE_SCORECARD_BASELINE === '1') {
            writeFileSync(BASELINE_FILE, `${JSON.stringify(passing, null, 2)}\n`);
        }
        const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as BaselineCell[];
        expect(baseline.length).toBeGreaterThan(0);

        const regressions = baseline.filter(
            (entry) =>
                !scorecard.cells.some(
                    (cell) =>
                        cell.metric === entry.metric &&
                        cell.track === entry.track &&
                        cell.visualizer === entry.visualizer &&
                        cell.status === 'pass',
                ),
        );
        expect(regressions).toEqual([]);
    }, 60_000);
});
