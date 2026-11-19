import { ONSET_BANDS, type BeatSidecar, type OnsetBand } from '../../../app/features/rhythm/eval/evalTypes';
import { scoreOnsets, type TempoSample } from '../../../app/features/rhythm/eval/metrics';
import { hitShare, reactionLatencyMs } from '../live/measures';
import { LIVE_REACTION_COLUMN } from '../targets';
import type { TrackMeasures, TrackClass } from '../types';
import { scorecardBeatErrorMs, trackerOctave } from './beatError';
import { RENDER_HZ, replayPcm } from './replay';
import { countUnexplainedChanges, findSilences, recordSongChanges } from './songChanges';
import { SCORECARD_TEMPO_TOLERANCE, constantTruth, driftingTruth, foldedError, type TempoTruth } from './tempoTruth';

export interface MeasureTrackInput {
    // Audio file name with its extension.
    track: string;
    class: TrackClass;
    // Mono samples in -1..1.
    pcm: Float32Array;
    sampleRate: number;
    // Ground truth. The tempo truth is `sidecar.tempo`, or `bpm` without a sidecar; a drifting track's truth is the local
    // tempo of the sidecar's beats instead.
    sidecar?: BeatSidecar;
    bpm?: number;
}

// The tolerance of the onset F the scorecard reports.
const ONSET_TOLERANCE_MS = 50;

// What the tempo readings say against a truth, after the octave fold.
interface TempoFigures {
    everLocked: boolean;
    lockSeconds: number | null;
    tempoWithinShareAfterLock: number | null;
    maxTempoErrorAfterLock: number | null;
}

// A reading that passes through the right tempo for less than this long is not a lock (contract revision 2).
export const LOCK_HOLD_SECONDS = 2;

export function tempoFigures(series: readonly TempoSample[], truth: TempoTruth): TempoFigures {
    const within = (sample: TempoSample): boolean =>
        sample.bpm > 0 && foldedError(sample.bpm, truth(sample.time)) <= SCORECARD_TEMPO_TOLERANCE;
    let everLocked = false;
    // The first sample of the first unbroken run of readings within tolerance that lasts LOCK_HOLD_SECONDS.
    let lockIndex = -1;
    let runStart = -1;
    for (let i = 0; i < series.length; i++) {
        if (within(series[i])) {
            everLocked = true;
            if (runStart < 0) runStart = i;
            if (lockIndex < 0 && series[i].time - series[runStart].time >= LOCK_HOLD_SECONDS) lockIndex = runStart;
        } else {
            runStart = -1;
        }
    }
    if (lockIndex < 0) {
        return { everLocked, lockSeconds: null, tempoWithinShareAfterLock: null, maxTempoErrorAfterLock: null };
    }
    let inside = 0;
    let largest = 0;
    for (let i = lockIndex; i < series.length; i++) {
        if (within(series[i])) inside++;
        // A reading of 0 (no tempo) after the lock counts as fully wrong rather than being skipped as NaN.
        const error = series[i].bpm > 0 ? foldedError(series[i].bpm, truth(series[i].time)) : 1;
        largest = Math.max(largest, error);
    }
    return {
        everLocked,
        lockSeconds: series[lockIndex].time,
        tempoWithinShareAfterLock: inside / (series.length - lockIndex),
        maxTempoErrorAfterLock: largest,
    };
}

function onsetF50(sidecar: BeatSidecar, detected: Record<OnsetBand, number[]>): TrackMeasures['onsetF50'] {
    if (!sidecar.onsets) return null;
    const scores: Partial<Record<OnsetBand, number>> = {};
    for (const band of ONSET_BANDS) {
        // A band with no labels has no recall to judge (a click track has no kick), so it is left out, as the
        // evaluation report leaves it out.
        if (sidecar.onsets[band].length === 0) continue;
        scores[band] = scoreOnsets(sidecar.onsets[band], detected[band], ONSET_TOLERANCE_MS).f;
    }
    return scores;
}

// Runs the app's own pipeline over the track (see replay.ts) and reads off the scorecard's per-track numbers
// (TrackMeasures in ../types.ts). Deterministic: the same input always gives the same output.
//
// On a beatless track the tracker must never lock. `everLocked` is then whether the shared snapshot's lock test ever held
// at a render tick (a tempo above 0 and a beat phase, the hub's `beat.locked` that every visualizer reads), and the
// tempo figures are null.
//
// Tempo figures: readings are the held tempo after each analyzed frame. A reading of 0 (no tempo) is never within
// tolerance. `lockSeconds` is where the first run of readings within tolerance that lasts LOCK_HOLD_SECONDS starts; the
// share and the largest error are taken over every reading from there to the end, so a later drift shows up. They are
// null when there is no such run. Song changes are counted without those raised in or just after digital silence (see
// songChanges.ts).
// The cubes' reaction to the labeled beats (AC8), offline: the replayed pulse at every render tick, scored with the live
// cells' own fire-to-beat rule and latency search, so an offline and a live cube cell mean the same thing.
function cubesReaction(pulse: Float32Array, beats: readonly number[] | undefined) {
    if (beats === undefined || beats.length === 0) return { hitShare: null, latencyMs: null };
    const rows = Array.from(pulse, (value, tick) => [tick / RENDER_HZ, value]);
    const table = { columns: ['t', LIVE_REACTION_COLUMN.cubes], rows };
    return { hitShare: hitShare(table, 'cubes', beats), latencyMs: reactionLatencyMs(table, 'cubes', beats) };
}

export function measureTrack(input: MeasureTrackInput): TrackMeasures {
    const { result: replay, events } = recordSongChanges(() => replayPcm(input.pcm, input.sampleRate));
    const { sidecar } = input;
    const base = {
        track: input.track,
        class: input.class,
        seconds: replay.seconds,
        falseSongChanges: countUnexplainedChanges(events, findSilences(input.pcm, input.sampleRate)),
        gateFirstOpenSeconds: replay.gate.firstOpenSeconds,
        gateOpenShare: replay.gate.openShare,
        dancerLockSeconds: replay.dancerLockSeconds,
        prehubGateFirstOpenSeconds: replay.prehubGate.firstOpenSeconds,
        prehubGateOpenShare: replay.prehubGate.openShare,
    };
    const cubes = cubesReaction(replay.cubes.pulse, sidecar?.beats);
    const prehubCubes = cubesReaction(replay.cubes.prehubPulse, sidecar?.beats);
    const reactions = {
        cubesHitShare: cubes.hitShare,
        cubesLatencyMs: cubes.latencyMs,
        prehubCubesHitShare: prehubCubes.hitShare,
        prehubCubesLatencyMs: prehubCubes.latencyMs,
    };

    if (input.class === 'beatless') {
        return {
            ...base,
            ...reactions,
            everLocked: replay.everReportedLock,
            lockSeconds: null,
            tempoWithinShareAfterLock: null,
            maxTempoErrorAfterLock: null,
            beatErrorMedianMs: null,
            onsetF50: sidecar ? onsetF50(sidecar, replay.onsets) : null,
        };
    }

    const bpm = sidecar?.tempo ?? input.bpm;
    if (bpm === undefined || !(bpm > 0)) {
        throw new Error(`${input.track}: a ${input.class} track needs a tempo (a sidecar or bpm)`);
    }
    const truth =
        input.class === 'drifting' && sidecar && sidecar.beats.length > 0
            ? driftingTruth(sidecar.beats, bpm)
            : constantTruth(bpm);
    const figures = tempoFigures(replay.tempo, truth);

    // Beat error from the scorecard's own lock rather than `eval:rhythm`'s unfolded one, which has no figure for an
    // octave lock or a drifting track (see beatError.ts). A track that never locks has none, and its cell fails.
    let beatErrorMedianMs: number | null = null;
    if (sidecar && sidecar.beats.length > 0 && figures.lockSeconds !== null) {
        const octave = trackerOctave(replay.tempo, truth, figures.lockSeconds);
        if (octave !== undefined) {
            beatErrorMedianMs = scorecardBeatErrorMs(sidecar.beats, replay.beats, figures.lockSeconds, octave);
        }
    }

    return {
        ...base,
        ...reactions,
        ...figures,
        beatErrorMedianMs,
        onsetF50: sidecar ? onsetF50(sidecar, replay.onsets) : null,
    };
}
