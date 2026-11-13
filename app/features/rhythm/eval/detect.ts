import { OnsetExtractor, packFrame, type OnsetFrame } from '../onsetExtractor';
import { RhythmAnalyzer } from '../rhythmAnalyzer';
import { BAND_COUNT, FFT_SIZE, FRAME_STRIDE } from '../rhythmConfig';
import type { DetectedRun } from './evalReport';
import type { OnsetBand } from './evalTypes';
import type { TempoSample } from './metrics';

// Runs the real pipeline (OnsetExtractor then RhythmAnalyzer, driven exactly as `runPipeline` in testSignals.ts drives
// them) over PCM and reads off what the alignment metrics need: beat times, the tempo over time, and onsets per band. It
// lives here and not in the app modules because only the evaluation needs it; it changes nothing the app runs.

// Until the pipeline has its own onset events the only per-band signal is the three-band spectral flux. Kick maps to
// kick, mid to snare and high to highs; bass has no band of its own and stays out of the report.
export const FLUX_BAND_TO_ONSET = ['kick', 'snare', 'highs'] as const satisfies readonly OnsetBand[];

export interface PeakOptions {
    // A peak must be the largest value within this many frames on either side.
    radiusFrames: number;
    // And exceed the local mean (over `meanRadiusFrames` on either side) by this fraction of the series maximum.
    meanRadiusFrames: number;
    delta: number;
}

// Frames are 10 ms apart: a 2-frame radius keeps two peaks at least 20 ms apart, and a 0.25 s mean window follows
// the level of a drum pattern without chasing single hits. A delta of 15 percent of the loudest flux ignores the
// ripple a sustained tone leaves behind.
export const DEFAULT_PEAK_OPTIONS: PeakOptions = { radiusFrames: 2, meanRadiusFrames: 25, delta: 0.15 };

// Indexes of the peaks in a series: local maxima that stand out from the local mean. Of equal neighbors the first wins.
export function pickPeaks(values: ArrayLike<number>, options: PeakOptions = DEFAULT_PEAK_OPTIONS): number[] {
    let maximum = 0;
    for (let i = 0; i < values.length; i++) maximum = Math.max(maximum, values[i]);
    if (!(maximum > 0)) return [];
    const peaks: number[] = [];
    for (let i = 0; i < values.length; i++) {
        let isMaximum = true;
        for (
            let j = Math.max(0, i - options.radiusFrames);
            j <= Math.min(values.length - 1, i + options.radiusFrames);
            j++
        ) {
            if (j < i ? values[j] >= values[i] : j > i && values[j] > values[i]) {
                isMaximum = false;
                break;
            }
        }
        if (!isMaximum) continue;
        const from = Math.max(0, i - options.meanRadiusFrames);
        const to = Math.min(values.length - 1, i + options.meanRadiusFrames);
        let sum = 0;
        for (let j = from; j <= to; j++) sum += values[j];
        if (values[i] > sum / (to - from + 1) + options.delta * maximum) peaks.push(i);
    }
    return peaks;
}

export interface PipelineDetection extends DetectedRun {
    onsets: Record<(typeof FLUX_BAND_TO_ONSET)[number], number[]>;
}

export function detectFromPcm(pcm: Float32Array, sampleRate: number): PipelineDetection {
    const blockSize = 128;
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const packed = new Float32Array(FRAME_STRIDE);
    const beats: number[] = [];
    const tempo: TempoSample[] = [];
    const times: number[] = [];
    const flux: number[][] = Array.from({ length: BAND_COUNT }, () => []);
    let lastBeatCount = 0;

    const onFrame = (frame: OnsetFrame): void => {
        const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
        packFrame(frame, packed, 0);
        analyzer.pushFrame(time, packed, 0);
        analyzer.updatePhase(time);
        times.push(time);
        for (let b = 0; b < BAND_COUNT; b++) flux[b].push(frame.flux[b]);
        tempo.push({ time, bpm: state.bpm });
        if (state.beatCount > lastBeatCount) {
            lastBeatCount = state.beatCount;
            // The counter rises on the first frame past a beat, up to one frame late. The beat itself is the grid beat
            // behind `time`: phase beats of the grid's own period (read from the distance to the next beat) before it.
            const phase = state.beatPhase ?? 0;
            const period = (state.nextBeatTime - time) / (1 - phase);
            beats.push(time - phase * period);
        }
    };

    for (let offset = 0; offset < pcm.length; offset += blockSize) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + blockSize)), onFrame);
    }

    const onsets: PipelineDetection['onsets'] = { kick: [], snare: [], highs: [] };
    FLUX_BAND_TO_ONSET.forEach((band, b) => {
        onsets[band] = pickPeaks(flux[b]).map((index) => times[index]);
    });
    return { beats, tempo, onsets };
}
