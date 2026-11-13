import { describe, expect, it } from 'vitest';
import { BandOnsets } from '../bandOnsets';
import { OnsetExtractor } from '../onsetExtractor';
import { FEATURE_ONSET_BANDS, FFT_SIZE } from '../rhythmConfig';
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

    it('finds the onsets of the bands: a 3 kHz click on every beat is a snare-range event', () => {
        expect(scoreOnsets(track.beatTimes, detected.onsets.snare, 50).f).toBeGreaterThan(0.9);
        // The kick is only on the downbeats.
        const downbeats = scoreOnsets(track.downbeatTimes, detected.onsets.kick, 50);
        expect(downbeats.recall).toBe(1);
    });

    it('takes the onsets of all four bands from BandOnsets, the detector the worklet runs', () => {
        const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
        const bandOnsets = new BandOnsets(TEST_SAMPLE_RATE, extractor.frameRate);
        const direct: Record<(typeof FEATURE_ONSET_BANDS)[number], number[]> = {
            kick: [],
            bass: [],
            snare: [],
            highs: [],
        };
        for (let offset = 0; offset < track.pcm.length; offset += 4096) {
            extractor.push(track.pcm.subarray(offset, Math.min(track.pcm.length, offset + 4096)), (frame) => {
                const time = (frame.endSample - FFT_SIZE / 2) / TEST_SAMPLE_RATE;
                bandOnsets.push(frame.logMagnitude, time, (band, eventTime) => {
                    direct[FEATURE_ONSET_BANDS[band]].push(eventTime);
                });
            });
        }
        expect(Object.keys(detected.onsets).sort()).toEqual([...FEATURE_ONSET_BANDS].sort());
        expect(detected.onsets).toEqual(direct);
    });
});
