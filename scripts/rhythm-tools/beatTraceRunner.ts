import type { BeatSidecar } from '../../app/features/rhythm/eval/evalTypes';
import { OnsetExtractor, packFrame, type OnsetFrame } from '../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../app/features/rhythm/rhythmAnalyzer';
import { BATCH_FRAMES, BEAT_PHASE_GAIN, FFT_SIZE, FRAME_STRIDE } from '../../app/features/rhythm/rhythmConfig';
import { applyAgc } from '../scorecard/engine/agc';
import { scorecardBeatErrorMs, trackerOctave } from '../scorecard/engine/beatError';
import { tempoFigures } from '../scorecard/engine/measureTrack';
import { replayPcm } from '../scorecard/engine/replay';
import { constantTruth, driftingTruth } from '../scorecard/engine/tempoTruth';
import type { TrackClass } from '../scorecard/types';
import { nearestTapErrorMs, countDiffering, windowRatio, type TraceRow, type TraceSummary } from './beatTrace';

// What BeatTracker keeps private and this tool reads. The tracker is the app's and must not change for a dev tool, and
// the declared beat's pending time, the correction's outcome and the phase check's bins are not exposed, so they are read
// through a cast. The names are the tracker's own; a rename shows up as `undefined` and fails the spec on a synthetic
// signal rather than printing wrong numbers.
interface BeatInternals {
    pendingBeat: number;
    period: number;
    missedBeats: number;
    aligned: boolean;
    phaseBins: Float32Array;
    phaseWins: number;
    phaseBeats: number;
    push: (time: number, onset: number) => boolean;
}

export interface TraceInput {
    track: string;
    class: TrackClass;
    pcm: Float32Array;
    sampleRate: number;
    sidecar?: BeatSidecar;
    bpm?: number;
}

export interface TraceResult {
    rows: TraceRow[];
    summary: TraceSummary;
    // The replay's own beat list, which the summary's error is taken from.
    replayBeats: number[];
}

// Runs the pipeline exactly as replayPcm does for the tracker: the same AGC on the same schedule, the same extractor over
// 128-sample blocks, frames delivered in whole batches of BATCH_FRAMES (the trailing partial batch dropped) each spaced
// by the frame rate from the first frame's time, and updatePhase after every frame. The hub and the gates take no part in
// the tracker's decisions, so they are left to replayPcm, whose gate and lock figures head the output.
export function traceBeats(input: TraceInput): TraceRow[] {
    const audio = applyAgc(input.pcm, input.sampleRate);
    const extractor = new OnsetExtractor(input.sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const internals = analyzer.beat as unknown as BeatInternals;
    const taps = input.sidecar?.beats ?? [];
    const rows: TraceRow[] = [];

    // The tracker's push is wrapped on this instance so the state just before the declaring push is seen: the analyzer
    // calls setTempo first, which can move the pending beat, and only the wrapper sits after that.
    const original = internals.push.bind(internals);
    internals.push = (time: number, onset: number): boolean => {
        const pendingBefore = internals.pendingBeat;
        const shiftsBefore = analyzer.beat.phaseShiftCount;
        const declared = original(time, onset);
        if (declared) rows.push(describeBeat(analyzer, internals, pendingBefore, shiftsBefore, taps));
        return declared;
    };

    const batch = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
    let count = 0;
    let time0 = 0;
    const deliver = (): void => {
        for (let i = 0; i < count; i++) {
            const time = time0 + i / analyzer.frameRate;
            analyzer.pushFrame(time, batch, i * FRAME_STRIDE);
            analyzer.updatePhase(time);
        }
        count = 0;
    };
    const onFrame = (frame: OnsetFrame): void => {
        // The window is centered half its length before its end, as the worklet and the replay compute the time.
        const time = (frame.endSample - FFT_SIZE / 2) / input.sampleRate;
        if (count === 0) time0 = time;
        packFrame(frame, batch, count * FRAME_STRIDE);
        if (++count === BATCH_FRAMES) deliver();
    };
    for (let offset = 0; offset < audio.length; offset += 128) {
        extractor.push(audio.subarray(offset, Math.min(audio.length, offset + 128)), onFrame);
    }
    return rows;
}

function describeBeat(
    analyzer: RhythmAnalyzer,
    internals: BeatInternals,
    pendingBefore: number,
    shiftsBefore: number,
    taps: readonly number[],
): TraceRow {
    const beat = analyzer.beat;
    const time = beat.lastBeatTime;
    // A hit zeroes missedBeats and leaves the grid aligned; a miss raises it, and the miss that exhausts BEAT_LOST_BEATS
    // zeroes it but drops the grid, which is how the two are told apart.
    const hit = internals.missedBeats === 0 && internals.aligned;
    const peakOffsetMs = hit && BEAT_PHASE_GAIN > 0 ? ((time - pendingBefore) / BEAT_PHASE_GAIN) * 1000 : null;

    const period = internals.period;
    const moved = beat.phaseShiftCount > shiftsBefore;
    // A move shifts pendingBeat by offset * period after the beat is placed one period after itself.
    const moveOffset = moved ? (internals.pendingBeat - (time + period)) / period : null;
    const bins = internals.phaseBins;
    const size = bins.length;
    // checkPhase decays all bins by the same factor after reading, which leaves the best place and the ratio unchanged. A
    // move also rotated the bins by `best` places; rotating back recovers the bins the decision was made on.
    const turned = moved && moveOffset !== null ? ((Math.round(moveOffset * size) % size) + size) % size : 0;
    const at = (index: number): number => bins[(index + size - turned) % size];
    let best = 0;
    let bestSum = -1;
    for (let i = 0; i < size; i++) {
        const sum = at(i + size - 1) + at(i) + at(i + 1);
        if (sum > bestSum) {
            bestSum = sum;
            best = i;
        }
    }
    const onGrid = at(size - 1) + at(0) + at(1);
    const offset = (best > size / 2 ? best - size : best) / size;

    return {
        time,
        errorMs: taps.length === 0 ? null : nearestTapErrorMs(taps, time),
        bin: best,
        offset,
        ratio: windowRatio(bestSum, onGrid),
        phaseWins: internals.phaseWins,
        phaseBeats: internals.phaseBeats,
        phaseBeatsReset: internals.phaseBeats === 0,
        peakOffsetMs,
        period: beat.lastBeatPeriod,
        phaseShiftCount: beat.phaseShiftCount,
        gridEpoch: beat.gridEpoch,
        moveOffset,
        scorecardTime: null,
        scorecardErrorMs: null,
    };
}

// The whole trace of one track: the rows, and the scorecard's own figures for it computed as measureTrack computes them
// (tempoFigures' lock, trackerOctave, scorecardBeatErrorMs over the replay's tempo and beats).
export function traceTrack(input: TraceInput): TraceResult {
    const replay = replayPcm(input.pcm, input.sampleRate);
    const rows = traceBeats(input);
    // Pair each declared beat with the scorecard's beat of the same index, when the lists line up.
    const differing = countDiffering(
        rows.map((row) => row.time),
        replay.beats,
    );
    if (differing !== null) {
        rows.forEach((row, index) => {
            row.scorecardTime = replay.beats[index];
            row.scorecardErrorMs = input.sidecar ? nearestTapErrorMs(input.sidecar.beats, replay.beats[index]) : null;
        });
    }

    let lockSeconds: number | null = null;
    let beatErrorMedianMs: number | null = null;
    const bpm = input.sidecar?.tempo ?? input.bpm;
    if (input.class !== 'beatless' && bpm !== undefined && bpm > 0) {
        const truth =
            input.class === 'drifting' && input.sidecar && input.sidecar.beats.length > 0
                ? driftingTruth(input.sidecar.beats, bpm)
                : constantTruth(bpm);
        const figures = tempoFigures(replay.tempo, truth);
        lockSeconds = figures.lockSeconds;
        if (input.sidecar && input.sidecar.beats.length > 0 && lockSeconds !== null) {
            const octave = trackerOctave(replay.tempo, truth, lockSeconds);
            if (octave !== undefined) {
                beatErrorMedianMs = scorecardBeatErrorMs(input.sidecar.beats, replay.beats, lockSeconds, octave);
            }
        }
    }
    return {
        rows,
        replayBeats: replay.beats,
        summary: {
            lockSeconds,
            beatErrorMedianMs,
            gateFirstOpenSeconds: replay.gate.firstOpenSeconds,
            dancerLockSeconds: replay.dancerLockSeconds,
            beatsDiffering: differing,
        },
    };
}
