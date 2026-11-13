import { describe, expect, it } from 'vitest';
import { renderTrack, runPipeline, TEST_SAMPLE_RATE } from '../testSignals';
import { detectFromPcm, pickPeaks } from './detect';
import { beatError, lockSeconds, scoreOnsets } from './metrics';

describe('pickPeaks', () => {
    // 0.1 of ripple everywhere, strong peaks of 1 at frames 20 and 60 and a weaker real peak of 0.5 at frame 100.
    const series = new Float32Array(120).fill(0.1);
    series[20] = 1;
    series[60] = 1;
    series[100] = 0.5;

    it('finds the peaks that stand out from the local mean', () => {
        expect(pickPeaks(series)).toEqual([20, 60, 100]);
    });

    it('ignores ripples below the delta and a series with nothing in it', () => {
        const ripple = new Float32Array(120).fill(0.1);
        ripple[40] = 0.2;
        ripple[41] = 1;
        expect(pickPeaks(ripple, { radiusFrames: 2, meanRadiusFrames: 25, delta: 0.15 })).toEqual([41]);
        expect(pickPeaks(new Float32Array(50))).toEqual([]);
        expect(pickPeaks([])).toEqual([]);
    });

    it('keeps one peak of a plateau, the first', () => {
        const plateau = new Float32Array(40);
        plateau[10] = 1;
        plateau[11] = 1;
        expect(pickPeaks(plateau)).toEqual([10]);
    });

    it('keeps the larger of two peaks closer than the radius', () => {
        const close = new Float32Array(40);
        close[10] = 0.8;
        close[12] = 1;
        expect(pickPeaks(close)).toEqual([12]);
    });
});

describe('detectFromPcm', () => {
    const track = renderTrack({ seconds: 12, bpm: 120, beatsPerBar: 4 });
    const detected = detectFromPcm(track.pcm, TEST_SAMPLE_RATE);

    it('reports the same tempo as runPipeline at every frame', () => {
        const run = runPipeline(track.pcm, { sampleEvery: 0 });
        expect(detected.tempo.length).toBe(run.samples.length);
        expect(detected.tempo.every((sample, i) => sample.bpm === run.samples[i].bpm)).toBe(true);
        expect(detected.tempo.every((sample, i) => sample.time === run.samples[i].time)).toBe(true);
    });

    it('finds the labelled tempo and beats close to the true ones', () => {
        const lock = lockSeconds(detected.tempo, 120);
        expect(lock).toBeDefined();
        const error = beatError(track.beatTimes, detected.beats, lock);
        expect(error?.median).toBeLessThan(20);
        expect(detected.beats).toEqual([...detected.beats].sort((a, b) => a - b));
    });

    it('picks the onsets of the bands: a click on every beat is a high-band event', () => {
        expect(scoreOnsets(track.beatTimes, detected.onsets.highs, 50).f).toBeGreaterThan(0.9);
        // The kick is only on the downbeats.
        const downbeats = scoreOnsets(track.downbeatTimes, detected.onsets.kick, 50);
        expect(downbeats.recall).toBe(1);
    });
});
