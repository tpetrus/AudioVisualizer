// Derived rhythm fixtures: the onset envelope of a track, small enough to commit, from which the tempo tracker can be
// replayed without the audio. The envelope is the combined onset value per frame that RhythmAnalyzer feeds the tracker, a
// single number per frame, so no audio (and nothing that could rebuild it) is kept.

export interface RhythmFixture {
    version: 1;
    name: string;
    frameRate: number;
    // The track's reference tempo from its `.bpm` sidecar, or null when it has none.
    referenceBpm: number | null;
    // Seconds of the track the envelope covers.
    seconds: number;
    // Value 1.0 of the quantized scale, in onset units, and the number of steps below it (4095 = three hex digits).
    max: number;
    levels: number;
    // One three-digit lowercase hex number per frame: round(value / max * levels).
    onset: string;
}

export const FIXTURE_SECONDS = 40;
// Combined onset is a sum of three peak-normalized bands, each 0..1, so 3 is the ceiling.
export const FIXTURE_MAX = 3;
export const FIXTURE_LEVELS = 4095;
const DIGITS = 3;

export function encodeFixture(
    name: string,
    combined: ArrayLike<number>,
    frameRate: number,
    referenceBpm: number | undefined,
    seconds: number = FIXTURE_SECONDS,
): RhythmFixture {
    const frames = Math.min(combined.length, Math.floor(seconds * frameRate));
    let onset = '';
    for (let i = 0; i < frames; i++) {
        const level = Math.round(Math.min(1, Math.max(0, combined[i] / FIXTURE_MAX)) * FIXTURE_LEVELS);
        onset += level.toString(16).padStart(DIGITS, '0');
    }
    return {
        version: 1,
        name,
        frameRate,
        referenceBpm: referenceBpm ?? null,
        seconds: frames / frameRate,
        max: FIXTURE_MAX,
        levels: FIXTURE_LEVELS,
        onset,
    };
}

// The envelope back as floats, one per frame.
export function decodeOnset(fixture: RhythmFixture): Float32Array {
    const frames = Math.floor(fixture.onset.length / DIGITS);
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
        const level = parseInt(fixture.onset.slice(i * DIGITS, (i + 1) * DIGITS), 16);
        out[i] = (level / fixture.levels) * fixture.max;
    }
    return out;
}

// Pretty-printed with two spaces, which is what Prettier writes for JSON, so the committed file passes format:check.
export function serializeFixture(fixture: RhythmFixture): string {
    return `${JSON.stringify(fixture, null, 2)}\n`;
}

export function parseFixture(text: string): RhythmFixture {
    const value = JSON.parse(text) as Partial<RhythmFixture>;
    if (
        value.version !== 1 ||
        typeof value.name !== 'string' ||
        typeof value.frameRate !== 'number' ||
        typeof value.onset !== 'string' ||
        typeof value.max !== 'number' ||
        typeof value.levels !== 'number' ||
        value.onset.length % DIGITS !== 0 ||
        !/^[0-9a-f]*$/.test(value.onset)
    ) {
        throw new Error('Not a rhythm fixture (version 1)');
    }
    return value as RhythmFixture;
}
