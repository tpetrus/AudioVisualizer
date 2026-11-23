import { describe, expect, it } from 'vitest';
import { runPipeline, type RunResult } from '../../app/features/rhythm/testSignals';
import { GROUND_TRUTH_SAMPLE_RATE, renderGroundTruthTrack, type Hit, type TrackSpec } from './render';

// AC6 (tracker plan D11) / FU-polyrhythm-grid-spec: a regression pin of what the whole pipeline does on a 3:2
// polyrhythm today. It is not an aspiration: it records the level the tracker settles on so that a later 3/2 or
// bar-evidence change cannot move it unnoticed.
//
// The signal, in a 2-beat bar at 100 BPM (1.2 s): a kick on both beats (the 100 BPM layer) and a click of the same
// level on three evenly spaced points of the bar, at 0, 2/3 and 4/3 beats (the 150 BPM layer, three hits in the time
// of two beats). The layers share the downbeat. Levels are equal, so neither wins by strength; the kick is low band and
// the click mid band, which is how the real pipeline separates them. Measured on the pipeline as it stands (60 s, the
// same for kick and click levels of 1 / 1, 1 / 0.6 and 0.6 / 1): the tempo locks at 150 BPM by 5 s and stays, the beat
// counter then rises 2.5 times a second (a beat per click, 1.5 beats per 100 BPM grid beat), and no song change fires.

const SECONDS = 60;
const SETTLED_FROM = 20;

function renderPolyrhythm(): Float32Array {
    const pattern: Hit[] = [
        { voice: 'kick', beat: 0, level: 1 },
        { voice: 'kick', beat: 1, level: 1 },
        { voice: 'click', beat: 0, level: 1 },
        { voice: 'click', beat: 2 / 3, level: 1 },
        { voice: 'click', beat: 4 / 3, level: 1 },
    ];
    const spec: TrackSpec = { name: 'polyrhythm-3to2-100', bpm: 100, seconds: SECONDS, beatsPerBar: 2, pattern };
    return renderGroundTruthTrack(spec).pcm;
}

describe('3:2 polyrhythm ground truth', () => {
    let run: RunResult | undefined;
    const result = (): RunResult => (run ??= runPipeline(renderPolyrhythm(), { sampleRate: GROUND_TRUTH_SAMPLE_RATE }));

    it('holds the 150 BPM layer, not the 100 BPM grid', () => {
        const settled = result().samples.filter((sample) => sample.time >= SETTLED_FROM);
        expect(settled.length).toBeGreaterThan(50);
        for (const sample of settled) {
            expect(sample.bpm).toBeGreaterThan(147);
            expect(sample.bpm).toBeLessThan(153);
        }
    });

    it('counts beats at the 150 BPM level, 1.5 per beat of the 100 BPM grid', () => {
        const settled = result().samples.filter((sample) => sample.time >= SETTLED_FROM);
        const first = settled[0];
        const last = settled[settled.length - 1];
        const beatsPerSecond = (last.beatCount - first.beatCount) / (last.time - first.time);
        expect(beatsPerSecond).toBeGreaterThan(2.4);
        expect(beatsPerSecond).toBeLessThan(2.6);
        // Against the 100 BPM grid (1 / 0.6 s per beat), that is 1.5 declared beats per grid beat.
        expect(beatsPerSecond / (100 / 60)).toBeGreaterThan(1.44);
        expect(beatsPerSecond / (100 / 60)).toBeLessThan(1.56);
    });

    it('fires no song change', () => {
        expect(result().songChangeEvents).toEqual([]);
        expect(result().analyzer.state.songChangeCount).toBe(0);
    });
});
