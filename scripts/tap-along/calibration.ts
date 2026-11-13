// Calibration maths: how early or late and how scattered someone taps against a click track with known beats.

import { median, tapNoiseFloor } from '../../app/features/rhythm/eval/metrics';

export interface TapCalibration {
    offsetMs: number;
    noiseFloorMs: number;
    taps: number;
    track: string;
}

// Minimum taps for the two numbers to mean anything.
export const MIN_CALIBRATION_TAPS = 8;

// Delegates the maths to the shared metric so the tool and the evaluation can never disagree on what the noise floor is.
export function calibrate(taps: readonly number[], trueBeats: readonly number[], track: string): TapCalibration {
    if (taps.length < MIN_CALIBRATION_TAPS) {
        throw new Error(`Only ${taps.length} taps were recorded; at least ${MIN_CALIBRATION_TAPS} are needed.`);
    }
    const floor = tapNoiseFloor(taps, trueBeats);
    if (floor === undefined) throw new Error('The click track has no beats to compare the taps with.');
    return { offsetMs: floor.offsetMs, noiseFloorMs: floor.spreadMs, taps: taps.length, track };
}

// Reads a stored calibration, or throws a message that names the problem.
export function parseCalibration(text: string): TapCalibration {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error('tap-calibration.json is not valid JSON; run --calibrate again.');
    }
    const record = value as Partial<TapCalibration> | null;
    if (
        typeof record !== 'object' ||
        record === null ||
        typeof record.offsetMs !== 'number' ||
        typeof record.noiseFloorMs !== 'number' ||
        !Number.isFinite(record.offsetMs) ||
        !Number.isFinite(record.noiseFloorMs)
    ) {
        throw new Error('tap-calibration.json lacks offsetMs and noiseFloorMs; run --calibrate again.');
    }
    return {
        offsetMs: record.offsetMs,
        noiseFloorMs: record.noiseFloorMs,
        taps: typeof record.taps === 'number' ? record.taps : 0,
        track: typeof record.track === 'string' ? record.track : '',
    };
}

// The tempo implied by the median gap between consecutive beats, or undefined with fewer than two.
export function medianIntervalBpm(beats: readonly number[]): number | undefined {
    if (beats.length < 2) return undefined;
    const gaps = beats.slice(1).map((beat, i) => beat - beats[i]);
    const gap = median(gaps);
    return gap > 0 ? 60 / gap : undefined;
}
