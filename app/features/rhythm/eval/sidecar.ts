import { ONSET_BANDS, type BeatSidecar, type OnsetBand } from './evalTypes';

// Reads a `<track>.beats.json` file (contract C1). Every error names the field that is wrong, so a hand-made or tapped
// sidecar can be fixed from the message alone.

function describe(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number') return String(value);
    return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A list of finite seconds in ascending order.
function readTimes(value: unknown, name: string): number[] {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array of times in seconds, got ${describe(value)}.`);
    value.forEach((time, index) => {
        if (typeof time !== 'number' || !Number.isFinite(time)) {
            throw new Error(`${name}[${index}] must be a finite number, got ${describe(time)}.`);
        }
        if (index > 0 && time < (value[index - 1] as number)) {
            throw new Error(
                `${name} must be ascending, but ${name}[${index}] (${time}) is before ${name}[${index - 1}].`,
            );
        }
    });
    return value as number[];
}

function readNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number, got ${describe(value)}.`);
    }
    return value;
}

// Checks an already parsed value.
export function validateBeatSidecar(value: unknown): BeatSidecar {
    if (!isRecord(value)) throw new Error(`A beat sidecar must be a JSON object, got ${describe(value)}.`);
    if (typeof value.track !== 'string' || value.track === '') {
        throw new Error(`track must be the audio file name, got ${describe(value.track)}.`);
    }
    const tempo = readNumber(value.tempo, 'tempo');
    if (tempo <= 0) throw new Error(`tempo must be above 0, got ${tempo}.`);
    const beats = readTimes(value.beats, 'beats');
    if (value.source !== 'synthetic' && value.source !== 'tapped') {
        throw new Error(`source must be "synthetic" or "tapped", got ${describe(value.source)}.`);
    }
    const sidecar: BeatSidecar = {
        track: value.track,
        tempo,
        beats,
        source: value.source,
        tapOffsetMs: readNumber(value.tapOffsetMs, 'tapOffsetMs'),
    };

    if (value.onsets !== undefined) {
        if (!isRecord(value.onsets)) throw new Error(`onsets must be an object, got ${describe(value.onsets)}.`);
        const onsets = {} as Record<OnsetBand, number[]>;
        for (const band of ONSET_BANDS) {
            onsets[band] = readTimes(value.onsets[band], `onsets.${band}`);
        }
        sidecar.onsets = onsets;
    }
    if (value.tapNoiseFloorMs !== undefined) {
        const floor = readNumber(value.tapNoiseFloorMs, 'tapNoiseFloorMs');
        if (floor < 0) throw new Error(`tapNoiseFloorMs must not be negative, got ${floor}.`);
        sidecar.tapNoiseFloorMs = floor;
    }
    return sidecar;
}

// Parses the text of a sidecar file.
export function parseBeatSidecar(text: string): BeatSidecar {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return validateBeatSidecar(value);
}
