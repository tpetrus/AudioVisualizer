import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LEVELS, decodeOnset, parseFixture, type RhythmFixture } from './fixture';
import { findFirstLock, replayTracker } from './probe';

// The committed fixtures: the onset envelope of six real tracks (no audio), replayed through the real TempoTracker. The
// outcomes below record what the tracker does TODAY, including the cases it gets wrong against the reference tempo; they
// are the base that tie-break changes are measured against, not a statement that the tracker is right.

const DIRECTORY = fileURLToPath(new URL('../fixtures/rhythm', import.meta.url));
const MAX_BYTES = 200 * 1024;

const fixtures = new Map<string, RhythmFixture>(
    readdirSync(DIRECTORY)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => {
            const fixture = parseFixture(readFileSync(join(DIRECTORY, file), 'utf8'));
            return [fixture.name, fixture] as const;
        }),
);

// What the tracker alone does with each envelope: when and where it first locks, and what it holds at the end. The
// reference tempo is the comb-checked value from the track's sidecar.
const TODAY: Record<
    string,
    { referenceBpm: number; lockSeconds: number; lockBpm: number; endBpm: number; switchedAt?: number }
> = {
    imyourgirl: { referenceBpm: 135, lockSeconds: 3, lockBpm: 134.82, endBpm: 134.88 },
    // Locks on the dotted pulse (4/3 of 140), then moves to the beat once its 8 s dotted hold passes.
    lonley: { referenceBpm: 140, lockSeconds: 3, lockBpm: 187.5, endBpm: 139.54, switchedAt: 13 },
    summer2000: { referenceBpm: 127.5, lockSeconds: 3, lockBpm: 126.77, endBpm: 127.66 },
    // Holds the dotted pulse (4/3 of 135) for the whole recording.
    'syncopation-no-kick': { referenceBpm: 135, lockSeconds: 3, lockBpm: 179.84, endBpm: 180.02 },
    // Locks on twice the reference, then moves to the reference octave.
    syncopationbass: { referenceBpm: 98, lockSeconds: 3, lockBpm: 195.7, endBpm: 97.98, switchedAt: 27.5 },
    syncopationbass2: { referenceBpm: 128, lockSeconds: 3, lockBpm: 127.66, endBpm: 127.66 },
};

describe('committed rhythm fixtures', () => {
    it('has one fixture for each reference track', () => {
        expect([...fixtures.keys()]).toEqual(Object.keys(TODAY).sort());
    });

    it.each([...fixtures.keys()])('%s is small, carries no audio, and states its reference tempo', (name) => {
        const fixture = fixtures.get(name)!;

        expect(statSync(join(DIRECTORY, `${name}.json`)).size).toBeLessThanOrEqual(MAX_BYTES);
        // One envelope value per frame and nothing else: no samples, no spectrum.
        expect(Object.keys(fixture).sort()).toEqual(
            ['frameRate', 'levels', 'max', 'name', 'onset', 'referenceBpm', 'seconds', 'version'].sort(),
        );
        expect(fixture.levels).toBe(FIXTURE_LEVELS);
        expect(decodeOnset(fixture)).toHaveLength(Math.round(fixture.seconds * fixture.frameRate));
        expect(fixture.referenceBpm).toBe(TODAY[name].referenceBpm);
    });

    it.each(Object.keys(TODAY))('%s replays to the same tempo every time, as recorded today', (name) => {
        const fixture = fixtures.get(name)!;
        const onset = decodeOnset(fixture);

        const first = replayTracker(onset, fixture.frameRate);
        const second = replayTracker(onset, fixture.frameRate);
        const today = TODAY[name];
        const lock = findFirstLock(first)!;
        const last = first[first.length - 1];

        expect(second).toEqual(first);
        expect(lock.time).toBeCloseTo(today.lockSeconds, 2);
        expect(lock.held).toBeCloseTo(today.lockBpm, 1);
        expect(last.held).toBeCloseTo(today.endBpm, 1);
        // The held tempo moves to another octave or dotted pulse at most once in these 30 to 40 s.
        const switches = first.filter(
            (step, i) => i > 0 && step.held > 0 && Math.abs(step.held / first[i - 1].held - 1) > 0.04,
        );
        if (today.switchedAt === undefined) {
            expect(switches).toEqual([]);
        } else {
            expect(switches).toHaveLength(1);
            expect(switches[0].time).toBeCloseTo(today.switchedAt, 2);
        }
    });
});
