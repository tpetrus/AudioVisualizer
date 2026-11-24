// The phase-step measure of the published-phase glide (contract OD5): how far the published beat phase moves in one
// 60 fps render call beyond the steady advance of the grid, over a track replayed through the analyzer as the scorecard
// replays it. A jump of the phase after a grid re-align shows up as a large excess step; the glide spreads it over
// several calls. Dev only: nothing under app/ imports this file. `phaseStepMain.ts` is the command line.

import { BandOnsets } from '../../app/features/rhythm/bandOnsets';
import { OnsetExtractor, packFrame, type OnsetFrame } from '../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../app/features/rhythm/rhythmAnalyzer';
import { BATCH_FRAMES, FEATURE_ONSET_BAND_COUNT, FFT_SIZE, FRAME_STRIDE } from '../../app/features/rhythm/rhythmConfig';
import { applyAgc } from '../scorecard/engine/agc';

// The render clock of the scorecard's replay (RENDER_HZ in scripts/scorecard/engine/replay.ts).
const RENDER_DT = 1 / 60;

// The largest the pass allows, in beats (OD5).
export const PHASE_STEP_LIMIT = 0.1;

// Maps a phase difference into [-0.5, 0.5).
export function wrapHalf(difference: number): number {
    return difference - Math.floor(difference + 0.5);
}

// How far a step of the phase, in beats, is from the steady advance of one render period at the grid's period.
export function excessStep(phase: number, previousPhase: number, periodSeconds: number): number {
    return Math.abs(wrapHalf(phase - previousPhase) - RENDER_DT / periodSeconds);
}

export interface PhaseStepResult {
    // The largest excess step over the whole track, in beats, and the track time it happened at.
    maxExcess: number;
    atSeconds: number;
    // BeatTracker.phaseShiftCount at the end, the number of grid moves.
    gridMoves: number;
    // Render calls that published a phase and were compared with a previous one.
    steps: number;
}

// Replays one track the way `replayPcm` feeds the tracker: AGC, the extractor over 128-sample blocks, batches of
// BATCH_FRAMES, kick events first, updatePhase after every analyzed frame at the frame's time, and a render tick every
// 1/60 s that runs before the batch that arrives after it. Only the render ticks are measured, as the scene reads them.
export function measurePhaseSteps(pcm: Float32Array, sampleRate: number): PhaseStepResult {
    const audio = applyAgc(pcm, sampleRate);
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const bandOnsets = new BandOnsets(sampleRate, extractor.frameRate);
    const batch = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
    const onsetCapacity = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;
    const onsetBand = new Uint8Array(onsetCapacity);
    const onsetTime = new Float64Array(onsetCapacity);
    const onsetStrength = new Float32Array(onsetCapacity);
    let onsetCount = 0;
    let count = 0;
    let time0 = 0;
    let tick = 0;
    let previous: number | undefined;
    const result: PhaseStepResult = { maxExcess: 0, atSeconds: 0, gridMoves: 0, steps: 0 };

    const renderTick = (): void => {
        const time = tick++ * RENDER_DT;
        analyzer.updatePhase(time);
        const phase = analyzer.state.beatPhase;
        if (phase === undefined) {
            previous = undefined;
            return;
        }
        // The anchor period of the call. The next beat lies (1 - phase) anchor periods after the time asked for (no
        // clamp applies in a replay), which holds also when the tracker's period changed since the anchor was set.
        const period = (analyzer.state.nextBeatTime - time) / (1 - phase);
        if (previous !== undefined && period > 0) {
            const excess = excessStep(phase, previous, period);
            result.steps++;
            if (excess > result.maxExcess) {
                result.maxExcess = excess;
                result.atSeconds = time;
            }
        }
        previous = phase;
    };
    const deliver = (arrival: number): void => {
        while (tick * RENDER_DT < arrival) renderTick();
        analyzer.pushKicks(onsetBand, onsetTime, onsetStrength, onsetCount);
        onsetCount = 0;
        for (let i = 0; i < count; i++) {
            const time = time0 + i / analyzer.frameRate;
            analyzer.pushFrame(time, batch, i * FRAME_STRIDE);
            analyzer.updatePhase(time);
        }
        count = 0;
    };
    const onOnset = (band: number, eventTime: number, strength: number): void => {
        if (onsetCount >= onsetCapacity) return;
        onsetBand[onsetCount] = band;
        onsetTime[onsetCount] = eventTime;
        onsetStrength[onsetCount] = strength;
        onsetCount++;
    };
    const onFrame = (frame: OnsetFrame): void => {
        const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
        if (count === 0) time0 = time;
        packFrame(frame, batch, count * FRAME_STRIDE);
        bandOnsets.push(frame, time, onOnset);
        if (++count === BATCH_FRAMES) deliver(time);
    };
    for (let offset = 0; offset < audio.length; offset += 128) {
        extractor.push(audio.subarray(offset, Math.min(audio.length, offset + 128)), onFrame);
    }
    result.gridMoves = analyzer.beat.phaseShiftCount;
    return result;
}

// The measure over a set of tracks: the largest excess step over those that had at least one grid move.
export function worstOverMovedTracks(results: ReadonlyMap<string, PhaseStepResult>): number {
    let worst = 0;
    for (const result of results.values()) {
        if (result.gridMoves > 0) worst = Math.max(worst, result.maxExcess);
    }
    return worst;
}
