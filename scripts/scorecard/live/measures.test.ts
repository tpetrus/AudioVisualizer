import { describe, expect, it } from 'vitest';
import type { TelemetryTable } from '../../../app/features/audio/devTelemetrySummary';
import { liveFireHitsBeat } from '../targets';
import {
    circularDistance,
    circularMedian,
    CLIP_MIN_SAMPLED_SECONDS,
    CLIP_SETTLE_SECONDS,
    clipMaxDeviations,
    falseFireShare,
    gateFirstOpenSeconds,
    gateSecondsAfterLock,
    hitShare,
    lockRange,
    lockSeconds,
    reactionLatencyMs,
    smallestLockRange,
} from './measures';

const table = (columns: string[], rows: number[][]): TelemetryTable => ({ columns, rows });

// One row per 10 ms of track time.
const times = (seconds: number): number[] => Array.from({ length: Math.round(seconds * 100) + 1 }, (_, i) => i / 100);

describe('gateFirstOpenSeconds and lockSeconds', () => {
    const columns = ['t', 'dancing-character.gateOpen', 'dancing-character.tempoLocked'];
    it('reads the first row that is set', () => {
        const t = table(columns, [
            [0, 0, 0],
            [1, 0, 1],
            [2, 1, 1],
            [3, 1, 1],
        ]);
        expect(gateFirstOpenSeconds(t)).toBe(2);
        expect(lockSeconds(t)).toBe(1);
        // AC6 as restated at the S3 review is timed from the lock.
        expect(gateSecondsAfterLock(t)).toBe(1);
    });

    it('has no time from the lock when the gate never opens or the dancer never locks', () => {
        expect(gateSecondsAfterLock(table(columns, [[0, 0, 1]]))).toBeNull();
        expect(gateSecondsAfterLock(table(columns, [[0, 1, 0]]))).toBeNull();
    });

    it('is null when it never opens or the column is missing', () => {
        expect(gateFirstOpenSeconds(table(columns, [[0, 0, 0]]))).toBeNull();
        expect(lockSeconds(table(['t'], [[0]]))).toBeNull();
        expect(gateFirstOpenSeconds(table(['x'], [[0]]))).toBeNull();
    });
});

describe('lock ranges', () => {
    it('takes the smallest range over any 3 locked runs', () => {
        expect(smallestLockRange([5, 9, 5.5, 5.8])).toBeCloseTo(0.8);
        expect(smallestLockRange([5, null, 6, 7])).toBe(2);
    });

    it('needs 3 locked runs', () => {
        expect(smallestLockRange([5, null, 6])).toBeNull();
        expect(smallestLockRange([])).toBeNull();
    });

    it('takes the range over every locked run for the spread', () => {
        expect(lockRange([5, null, 9, 6])).toBe(4);
        expect(lockRange([null])).toBeNull();
    });
});

describe('circular median', () => {
    it('measures distance around the loop', () => {
        expect(circularDistance(0.95, 0.05)).toBeCloseTo(0.1);
        expect(circularDistance(0.25, 0.75)).toBeCloseTo(0.5);
        expect(circularDistance(-0.1, 0.1)).toBeCloseTo(0.2);
    });

    it('finds the middle of a cluster across the wrap', () => {
        expect(circularMedian([0.98, 0.0, 0.02])).toBeCloseTo(0);
        expect(circularMedian([0.3])).toBeCloseTo(0.3);
    });

    it('is well defined for two runs and does not depend on their order', () => {
        expect(circularMedian([0.2, 0.3])).toBe(circularMedian([0.3, 0.2]));
        expect(circularMedian([0.2, 0.3])).toBeCloseTo(0.25);
        // Across the wrap the midpoint is on the short side.
        expect(circularMedian([0.9, 0.1])).toBeCloseTo(0);
        expect(circularMedian([0.1, 0.9])).toBeCloseTo(0);
    });

    it('is NaN for no values', () => {
        expect(circularMedian([])).toBeNaN();
    });
});

describe('clipMaxDeviations', () => {
    const columns = [
        't',
        'dancing-character.tempoLocked',
        'dancing-character.meterLocked',
        'dancing-character.clipPhase',
        'dancing-character.beatsPerLoop',
    ];
    // A run that locks at `lock` and then loops once per second over a clip of `beats`, shifted by `offset` loops.
    const run = (lock: number, offset: number, meter = true, beats = 8): TelemetryTable =>
        table(
            columns,
            times(16).map((t) => [
                t,
                t >= lock ? 1 : 0,
                meter && t >= lock ? 1 : 0,
                (((t + offset) % 1) + 1) % 1,
                beats,
            ]),
        );
    const allZero = (values: (number | null)[]) => values.every((value) => value !== null && value < 1e-6);

    it('is 0 for runs on the same loop and reads the largest distance of a shifted one, in beats', () => {
        const values = clipMaxDeviations([run(2, 0), run(3, 0), run(2, 0), run(2, 0.01)]);
        expect(values[0]).toBeCloseTo(0);
        expect(values[3]).toBeCloseTo(0.08);
    });

    it('compares the place within the bar once every run is meter-locked, so another bar of the loop is no error', () => {
        // Half a loop of an 8-beat clip is one bar: the dance is on the same place in its bar.
        expect(allZero(clipMaxDeviations([run(2, 0), run(2, 0.5), run(2, 0)]))).toBe(true);
        // A quarter loop is two beats, half a bar, the largest distance within a bar.
        expect(clipMaxDeviations([run(2, 0), run(2, 0.25), run(2, 0)])[1]).toBeCloseTo(2);
    });

    it('compares the place within the beat while a run is not meter-locked', () => {
        // A whole beat off (an eighth of the loop) is no error before the meter locks; three eighths of a beat more is.
        expect(allZero(clipMaxDeviations([run(2, 0, false), run(2, 0.125, false), run(2, 0, false)]))).toBe(true);
        const off = clipMaxDeviations([run(2, 0, false), run(2, 0.125 + 0.375 / 8, false), run(2, 0, false)]);
        expect(off[1]).toBeCloseTo(0.375);
        // One run unlocked at a sample puts every run on the beat there.
        expect(allZero(clipMaxDeviations([run(2, 0), run(2, 0.125, false), run(2, 0)]))).toBe(true);
    });

    it("scales by each run's own beats per loop", () => {
        // A 4-beat clip a quarter loop on is one beat on: the same place in the beat as an 8-beat clip on time.
        expect(allZero(clipMaxDeviations([run(2, 0, false), run(2, 0.25, false, 4), run(2, 0, false)]))).toBe(true);
    });

    it('samples from the latest meter lock, so an unlocked early stretch is not counted', () => {
        // The odd run is wildly off before 4 s, but they agree from the latest meter lock on.
        const wild = table(
            columns,
            times(16).map((t) => [t, 1, t >= 4 ? 1 : 0, t >= 4 ? t % 1 : (t * 7.3) % 1, 8]),
        );
        expect(allZero(clipMaxDeviations([run(2, 0), wild, run(2, 0)]))).toBe(true);
    });

    it('leaves the dancer CLIP_SETTLE_SECONDS after each meter lock to slide into the bar', () => {
        // The odd run is a beat off for the first 3 s after its lock at 2 s, then on the others' place.
        const sliding = table(
            columns,
            times(16).map((t) => [t, 1, t >= 2 ? 1 : 0, (((t + (t < 5 ? 0.125 : 0)) % 1) + 1) % 1, 8]),
        );
        expect(CLIP_SETTLE_SECONDS).toBe(4);
        expect(allZero(clipMaxDeviations([run(2, 0), sliding, run(2, 0)]))).toBe(true);
        // Still a beat off 5 s after the lock: that counts.
        const late = table(
            columns,
            times(16).map((t) => [t, 1, t >= 2 ? 1 : 0, (((t + (t < 7 ? 0.125 : 0)) % 1) + 1) % 1, 8]),
        );
        expect(clipMaxDeviations([run(2, 0), late, run(2, 0)])[1]).toBeCloseTo(1);
    });

    it('starts the settle window again when a run locks its meter again', () => {
        // The meter drops at 6 s and locks again at 6.5 s; the run is a beat off until 9 s, inside the new window.
        const relock = table(
            columns,
            times(16).map((t) => [
                t,
                1,
                t >= 2 && (t < 6 || t >= 6.5) ? 1 : 0,
                (((t + (t >= 6 && t < 9 ? 0.125 : 0)) % 1) + 1) % 1,
                8,
            ]),
        );
        const steady = (lock: number) =>
            table(
                columns,
                times(16).map((t) => [t, 1, t >= lock ? 1 : 0, t % 1, 8]),
            );
        expect(allZero(clipMaxDeviations([steady(2), relock, steady(2)]))).toBe(true);
    });

    it('is null when the samples left cover less than CLIP_MIN_SAMPLED_SECONDS', () => {
        expect(CLIP_MIN_SAMPLED_SECONDS).toBe(4);
        // Locked at 2 s and settled at 6 s: 9.5 s of recording leaves 3.5 s, 10 s leaves 4 s.
        const until = (end: number) =>
            table(
                columns,
                times(end).map((t) => [t, 1, t >= 2 ? 1 : 0, t % 1, 8]),
            );
        expect(clipMaxDeviations([until(9.5), until(9.5)])).toEqual([null, null]);
        expect(clipMaxDeviations([until(10), until(10)])).toEqual([0, 0]);
    });

    it('is null when every sample falls inside a settle window', () => {
        const short = (lock: number) =>
            table(
                columns,
                times(4).map((t) => [t, 1, t >= lock ? 1 : 0, t % 1, 8]),
            );
        expect(clipMaxDeviations([short(1), short(1)])).toEqual([null, null]);
    });

    it('falls back to the tempo lock when no run meter-locks', () => {
        const values = clipMaxDeviations([run(2, 0, false), run(2, 0.025, false)]);
        // Two runs have the midpoint of their arc as median, so each is half the gap (0.2 beat) away.
        expect(values[0]).toBeCloseTo(0.1);
        expect(values[1]).toBeCloseTo(0.1);
    });

    it('is null for every run with no lock, no column or no rows', () => {
        expect(clipMaxDeviations([run(20, 0), run(20, 0)])).toEqual([null, null]);
        expect(clipMaxDeviations([table(['t'], [[0]]), run(2, 0)])).toEqual([null, null]);
        // A recording from before targets version 8 has no beatsPerLoop column.
        const old = table(
            columns.slice(0, 4),
            times(16).map((t) => [t, 1, 1, t % 1]),
        );
        expect(clipMaxDeviations([run(2, 0), old])).toEqual([null, null]);
        expect(clipMaxDeviations([run(2, 0), table(columns, [])])).toEqual([null, null]);
    });

    it('skips a sample where a phase or the loop length is not usable', () => {
        const broken = table(
            columns,
            times(16).map((t) => [t, 1, 1, NaN, 8]),
        );
        const values = clipMaxDeviations([run(2, 0), broken]);
        expect(values[0]).toBe(0);
        expect(values[1]).toBe(0);
        expect(clipMaxDeviations([broken, broken])).toEqual([null, null]);
        const noLength = table(
            columns,
            times(16).map((t) => [t, 1, 1, t % 1, 0]),
        );
        expect(clipMaxDeviations([noLength, noLength])).toEqual([null, null]);
    });
});

describe('reaction metrics', () => {
    const columns = ['t', 'cubes.out'];
    // The column jumps to 1 at `delay` after each beat and falls back 0.1 s later; `extra` adds rises of its own.
    const reacting = (beats: number[], delay: number, extra: number[] = []): TelemetryTable => {
        const rises = [...beats.map((beat) => beat + delay), ...extra];
        return table(
            columns,
            times(6).map((t) => [t, rises.some((rise) => t >= rise - 1e-9 && t < rise + 0.1) ? 1 : 0]),
        );
    };
    const beats = [1, 2, 3, 4];

    it('counts a rise within 50 ms as a hit', () => {
        expect(hitShare(reacting(beats, 0.02), 'cubes', beats)).toBe(1);
        expect(hitShare(reacting(beats, 0.1), 'cubes', beats)).toBe(0);
        expect(hitShare(reacting([1, 2], 0.02), 'cubes', beats)).toBe(0.5);
    });

    it('measures the delay with the default search window', () => {
        expect(reactionLatencyMs(reacting(beats, 0.1), 'cubes', beats)).toBeCloseTo(100);
        expect(reactionLatencyMs(reacting(beats, 0.5), 'cubes', beats)).toBeNull();
    });

    it('is null when the column is missing or flat', () => {
        const flat = table(
            columns,
            times(6).map((t) => [t, 0]),
        );
        expect(hitShare(flat, 'cubes', beats)).toBeNull();
        expect(reactionLatencyMs(flat, 'cubes', beats)).toBeNull();
        expect(hitShare(table(['t'], [[0], [1]]), 'cubes', beats)).toBeNull();
    });

    it('is null when the beats are outside the recording', () => {
        expect(hitShare(reacting(beats, 0.02), 'cubes', [50])).toBeNull();
    });

    it('counts fires that are no beat hit', () => {
        expect(falseFireShare(reacting(beats, 0.02), 'cubes', beats)).toBe(0);
        // Two of the six fires land between beats.
        expect(falseFireShare(reacting(beats, 0.02, [1.5, 2.5]), 'cubes', beats)).toBeCloseTo(1 / 3, 5);
    });

    it('counts a fire that comes later than the window as false and ignores fires outside the beats span', () => {
        expect(falseFireShare(reacting(beats, 0.2), 'cubes', beats)).toBe(1);
        // A fire at 0.5 s is before the first beat, and one at 5 s after the last beat's window.
        expect(falseFireShare(reacting(beats, 0.02, [0.5, 5]), 'cubes', beats)).toBe(0);
    });

    it('judges hit share and false fires by one fire-to-beat rule, from 20 ms before the beat to 50 ms after', () => {
        expect(liveFireHitsBeat(0.98, 1)).toBe(true);
        expect(liveFireHitsBeat(1.05, 1)).toBe(true);
        expect(liveFireHitsBeat(0.97, 1)).toBe(false);
        expect(liveFireHitsBeat(1.06, 1)).toBe(false);
    });

    it('counts a rise starting 10 ms before a tapped beat as a hit in both metrics', () => {
        const early = reacting(beats, -0.01);
        expect(hitShare(early, 'cubes', beats)).toBe(1);
        expect(falseFireShare(early, 'cubes', beats)).toBe(0);
    });

    it('counts a rise more than the tap tolerance before the beat as a miss and a false fire in both metrics', () => {
        const tooEarly = reacting(beats, -0.03);
        expect(hitShare(tooEarly, 'cubes', beats)).toBe(0);
        expect(falseFireShare(tooEarly, 'cubes', beats)).toBe(1);
    });

    it('is 0 with no fires and null with nothing to judge', () => {
        const quiet = table(
            columns,
            times(6).map((t) => [t, t === 5 ? 1 : 0]),
        );
        expect(falseFireShare(quiet, 'cubes', [1, 2])).toBe(0);
        const flat = table(
            columns,
            times(6).map((t) => [t, 0]),
        );
        expect(falseFireShare(flat, 'cubes', beats)).toBeNull();
        expect(falseFireShare(reacting(beats, 0.02), 'cubes', [])).toBeNull();
        expect(falseFireShare(table(['t'], [[0], [1]]), 'cubes', beats)).toBeNull();
        expect(falseFireShare(table(columns, [[0, 1]]), 'cubes', beats)).toBeNull();
    });
});
