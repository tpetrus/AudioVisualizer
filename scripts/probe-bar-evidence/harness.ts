// The probe's analysis pass: the scorecard's replay of the tracker (same AGC, same extractor, same per-batch delivery of
// kick events then frames through `pushBatchToAnalyzer`), with the analyzer read from outside. It records, without
// changing anything the analyzer does: every analyzed frame's features, the held tempo, the derived beat times, what
// `MeterEstimator.addBeat` receives at each declared beat, and the tempo tracker's comb scores at each tempo update.
// The hub, the gates and the dancer are not replayed: the tracker does not read them.

import { BandOnsets } from '../../app/features/rhythm/bandOnsets';
import { OnsetExtractor, packFrame, type FrameSink } from '../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../app/features/rhythm/rhythmAnalyzer';
import {
    BATCH_FRAMES,
    BAND_COUNT,
    CHROMA_BINS,
    FEATURE_ONSET_BAND_COUNT,
    FFT_SIZE,
    FRAME_CHROMA_OFFSET,
    FRAME_FLUX_OFFSET,
    FRAME_STRIDE,
    HUB_BAND_COUNT,
    ONSET_BAND_WEIGHTS,
} from '../../app/features/rhythm/rhythmConfig';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch } from '../../app/features/rhythm/types';
import { applyAgc } from '../scorecard/engine/agc';
import { pushBatchToAnalyzer } from '../scorecard/engine/replay';

export interface TempoPoint {
    time: number;
    bpm: number;
}

// What MeterEstimator.addBeat received for one declared beat, and the accent it made of it.
export interface BeatRecord {
    index: number;
    time: number;
    period: number;
    kick: number;
    total: number;
    chroma: number;
    // The accent as the meter stored it (read from its ring, float32).
    accent: number;
    // The accent recomputed in double precision from the same inputs, to show the stored one is that value.
    accentRecomputed: number;
}

// The tempo tracker's state right after one estimate.
export interface UpdateRecord {
    time: number;
    // The unfiltered estimate in bpm (0 when there was none).
    rawBpm: number;
    // Comb score at the peak nearest the estimate's lag, and at the peak nearest 2/3 of that lag (0 when there is none).
    scoreAtEstimate: number;
    scoreAtFaster: number;
    // The lag of the estimate's own peak and how far it is from the estimate's lag, in lags.
    estimatePeakLag: number;
    estimatePeakOffset: number;
}

export interface Analysis {
    seconds: number;
    frameRate: number;
    // Center time of the first analyzed frame; frames are one 1 / frameRate apart.
    t0: number;
    frameCount: number;
    // Per-frame channels: flux of bands 1 and 2 (NK), the weighted flux of all bands (T) and the 12 chroma bins.
    nk: Float32Array;
    total: Float32Array;
    chroma: Float32Array;
    tempo: TempoPoint[];
    beats: number[];
    beatRecords: BeatRecord[];
    updates: UpdateRecord[];
    // First analyzed frame where the shared snapshot's lock test held (a tempo above 0 and a beat phase), or null.
    lockTime: number | null;
}

interface PrivateMeter {
    addBeat: (index: number, kick: number, total: number, chroma: number, period: number) => void;
    accents: Float32Array;
    ringHead: number;
    accentMean: number;
    meanWeight: number;
    kickMean: number;
    totalMean: number;
    chromaMean: number;
}

interface PrivateTempo {
    update: () => boolean;
    scores: Float32Array;
    count: number;
    correlation: Float32Array;
    maxLag: number;
    peakNear: (target: number, lastLag: number) => number;
}

const SAMPLE_BLOCK = 128;

// Weights the meter uses for its accent; read from the module so the recomputation is the app's own formula.
import {
    ACCENT_CHROMA_FLOOR,
    ACCENT_CHROMA_WEIGHT,
    ACCENT_KICK_WEIGHT,
    ACCENT_TOTAL_WEIGHT,
} from '../../app/features/rhythm/rhythmConfig';

export function analyze(rawPcm: Float32Array, sampleRate: number): Analysis {
    const pcm = applyAgc(rawPcm, sampleRate);
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const frameRate = extractor.frameRate;
    const state = analyzer.state;
    const bandOnsets = new BandOnsets(sampleRate, frameRate);
    const meter = (analyzer as unknown as { meter: PrivateMeter }).meter;
    const tempoTracker = analyzer.tempo as unknown as PrivateTempo;

    const capacity = Math.ceil((pcm.length / sampleRate + 1) * frameRate) + 16;
    const nk = new Float32Array(capacity);
    const total = new Float32Array(capacity);
    const chroma = new Float32Array(capacity * CHROMA_BINS);
    let frameCount = 0;
    let t0 = 0;
    let currentTime = 0;
    const tempo: TempoPoint[] = [];
    const beats: number[] = [];
    const beatRecords: BeatRecord[] = [];
    const updates: UpdateRecord[] = [];
    let lockTime: number | null = null;
    let lastBeatCount = 0;

    const originalPushFrame = analyzer.pushFrame.bind(analyzer);
    analyzer.pushFrame = (time: number, frames: Float32Array, offset: number): void => {
        currentTime = time;
        if (frameCount === 0) t0 = time;
        let weighted = 0;
        for (let b = 0; b < BAND_COUNT; b++) weighted += ONSET_BAND_WEIGHTS[b] * frames[offset + FRAME_FLUX_OFFSET + b];
        nk[frameCount] = frames[offset + FRAME_FLUX_OFFSET + 1] + frames[offset + FRAME_FLUX_OFFSET + 2];
        total[frameCount] = weighted;
        for (let i = 0; i < CHROMA_BINS; i++) {
            chroma[frameCount * CHROMA_BINS + i] = frames[offset + FRAME_CHROMA_OFFSET + i];
        }
        frameCount++;
        originalPushFrame(time, frames, offset);
    };

    const originalUpdate = tempoTracker.update.bind(analyzer.tempo);
    tempoTracker.update = (): boolean => {
        const result = originalUpdate();
        if (result) {
            const rawBpm = analyzer.tempo.rawBpm;
            const record: UpdateRecord = {
                time: currentTime,
                rawBpm,
                scoreAtEstimate: 0,
                scoreAtFaster: 0,
                estimatePeakLag: -1,
                estimatePeakOffset: Number.NaN,
            };
            if (rawBpm > 0) {
                const n = tempoTracker.count;
                const lagLimit = Math.min(Math.floor(n / 2), tempoTracker.correlation.length - 2);
                const lastLag = Math.min(tempoTracker.maxLag, lagLimit - 1);
                const estimateLag = (60 * frameRate) / rawBpm;
                const own = tempoTracker.peakNear(estimateLag, lastLag);
                const faster = tempoTracker.peakNear((estimateLag * 2) / 3, lastLag);
                record.estimatePeakLag = own;
                record.estimatePeakOffset = own > 0 ? own - estimateLag : Number.NaN;
                record.scoreAtEstimate = own > 0 ? tempoTracker.scores[own] : 0;
                record.scoreAtFaster = faster > 0 ? tempoTracker.scores[faster] : 0;
            }
            updates.push(record);
        }
        return result;
    };

    const originalAddBeat = meter.addBeat.bind(meter);
    meter.addBeat = (index, kick, totalFlux, chromaChange, period): void => {
        originalAddBeat(index, kick, totalFlux, chromaChange, period);
        const slot = (meter.ringHead - 1 + meter.accents.length) % meter.accents.length;
        const accent = meter.accents[slot] + meter.accentMean / meter.meanWeight;
        const epsilon = 1e-9;
        const recomputed =
            ACCENT_KICK_WEIGHT * (kick / (meter.kickMean / meter.meanWeight + epsilon)) +
            ACCENT_TOTAL_WEIGHT * (totalFlux / (meter.totalMean / meter.meanWeight + epsilon)) +
            ACCENT_CHROMA_WEIGHT * (chromaChange / Math.max(meter.chromaMean / meter.meanWeight, ACCENT_CHROMA_FLOOR));
        beatRecords.push({
            index,
            time: analyzer.beat.lastBeatTime,
            period,
            kick,
            total: totalFlux,
            chroma: chromaChange,
            accent,
            accentRecomputed: recomputed,
        });
    };

    const onsetCapacity = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;
    const batch: FeatureBatch = {
        version: FEATURE_MESSAGE_VERSION,
        time0: 0,
        count: 0,
        frames: new Float32Array(BATCH_FRAMES * FRAME_STRIDE),
        frameTimes: new Float64Array(BATCH_FRAMES),
        bandEnergy: new Float32Array(BATCH_FRAMES * HUB_BAND_COUNT),
        onsetCount: 0,
        onsetBand: new Uint8Array(onsetCapacity),
        onsetTime: new Float64Array(onsetCapacity),
        onsetStrength: new Float32Array(onsetCapacity),
    };

    const deliver = (): void => {
        pushBatchToAnalyzer(analyzer, batch, (time) => {
            analyzer.updatePhase(time);
            tempo.push({ time, bpm: state.bpm });
            if (lockTime === null && state.bpm > 0 && state.beatPhase !== undefined) lockTime = time;
            if (state.beatCount > lastBeatCount) {
                lastBeatCount = state.beatCount;
                const phase = state.beatPhase ?? 0;
                const period = (state.nextBeatTime - time) / (1 - phase);
                beats.push(time - phase * period);
            }
        });
        batch.count = 0;
        batch.onsetCount = 0;
    };
    const onOnset = (band: number, eventTime: number, strength: number): void => {
        if (batch.onsetCount >= onsetCapacity) return;
        batch.onsetBand[batch.onsetCount] = band;
        batch.onsetTime[batch.onsetCount] = eventTime;
        batch.onsetStrength[batch.onsetCount] = strength;
        batch.onsetCount++;
    };
    const onFrame: FrameSink = (frame) => {
        const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
        if (batch.count === 0) batch.time0 = time;
        packFrame(frame, batch.frames, batch.count * FRAME_STRIDE);
        batch.frameTimes[batch.count] = time;
        bandOnsets.push(frame, time, onOnset);
        batch.bandEnergy.set(bandOnsets.energy, batch.count * HUB_BAND_COUNT);
        if (++batch.count === BATCH_FRAMES) deliver();
    };
    for (let offset = 0; offset < pcm.length; offset += SAMPLE_BLOCK) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + SAMPLE_BLOCK)), onFrame);
    }
    // A trailing partial batch is dropped, as the replay and the worklet drop it.
    return {
        seconds: pcm.length / sampleRate,
        frameRate,
        t0,
        frameCount,
        nk,
        total,
        chroma,
        tempo,
        beats,
        beatRecords,
        updates,
        lockTime,
    };
}

// ---- Start variations (audio alignment plan S2, and the untouched offsets of the probe plan) ----

export interface Variation {
    id: string;
    // Seconds of silence added before the track.
    leadSeconds?: number;
    // Level multiplier, clamped to [-1, 1].
    gain?: number;
    // Seconds removed from the start.
    skipSeconds?: number;
}

export const VARIATIONS: readonly Variation[] = [
    { id: 'lead37', leadSeconds: 0.037 },
    { id: 'lead100', leadSeconds: 0.1 },
    { id: 'lead215', leadSeconds: 0.215 },
    { id: 'lead500', leadSeconds: 0.5 },
    { id: 'gain0.25', gain: 0.25 },
    { id: 'gain0.5', gain: 0.5 },
    { id: 'gain2', gain: 2 },
    { id: 'skip100', skipSeconds: 0.1 },
    { id: 'skip500', skipSeconds: 0.5 },
    { id: 'skip1000', skipSeconds: 1 },
];

export const UNTOUCHED: readonly Variation[] = [
    { id: 'lead300', leadSeconds: 0.3 },
    { id: 'skip250', skipSeconds: 0.25 },
];

export function applyVariation(pcm: Float32Array, sampleRate: number, variation: Variation): Float32Array {
    if (variation.leadSeconds !== undefined) {
        const out = new Float32Array(Math.round(variation.leadSeconds * sampleRate) + pcm.length);
        out.set(pcm, out.length - pcm.length);
        return out;
    }
    if (variation.gain !== undefined) {
        const gain = variation.gain;
        return Float32Array.from(pcm, (v) => Math.max(-1, Math.min(1, v * gain)));
    }
    return pcm.slice(Math.round((variation.skipSeconds ?? 0) * sampleRate));
}
