// Assembles the tapped ground-truth sidecar (contract BeatSidecar, source 'tapped').

import type { BeatSidecar } from '../../app/features/rhythm/eval/evalTypes';
import { applyOffset } from './taps';
import { medianIntervalBpm, type TapCalibration } from './calibration';

export interface SidecarInput {
    track: string;
    // Cleaned taps in seconds, before the offset is removed.
    taps: readonly number[];
    calibration: TapCalibration;
    // Tempo from the track's .bpm sidecar, when it has one.
    bpmSidecar: number | undefined;
}

// A sidecar name: the track without its extension, plus ".beats.json".
export function beatsSidecarName(track: string): string {
    const name = track.replace(/^.*[\\/]/, '');
    const dot = name.lastIndexOf('.');
    return `${dot > 0 ? name.slice(0, dot) : name}.beats.json`;
}

export function buildTappedSidecar(input: SidecarInput): BeatSidecar {
    const beats = applyOffset(input.taps, input.calibration.offsetMs);
    // The labelled tempo wins over the tapped one: taps only estimate it.
    const tempo = input.bpmSidecar ?? medianIntervalBpm(beats);
    if (tempo === undefined) throw new Error('Too few taps to work out a tempo and no .bpm sidecar beside the track.');
    return {
        track: input.track,
        tempo,
        beats,
        source: 'tapped',
        tapOffsetMs: input.calibration.offsetMs,
        tapNoiseFloorMs: input.calibration.noiseFloorMs,
    };
}
