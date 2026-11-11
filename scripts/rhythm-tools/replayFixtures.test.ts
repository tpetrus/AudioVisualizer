import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_LEVELS, decodeOnset, parseFixture, type RhythmFixture } from './fixture';
import { findFirstLock, replayTracker } from './probe';

// The committed fixtures: the onset envelope of six real tracks (no audio), replayed through the real TempoTracker. TODAY
// records what the tracker did before the first-lock tie-break, including the cases it got wrong against the reference
// tempo; AFTER records what it does now.

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

// What the tracker alone did with each envelope before the tie-break: when and where it first locked, and what it held at
// the end. The reference tempo is the comb-checked value from the track's sidecar.
const TODAY: Record<
    string,
    { referenceBpm: number; lockSeconds: number; lockBpm: number; endBpm: number; switchedAt?: number }
> = {
    imyourgirl: { referenceBpm: 135, lockSeconds: 3, lockBpm: 134.82, endBpm: 134.88 },
    // Locked on the dotted pulse (4/3 of 140), then moved to the beat once its 8 s dotted hold passed.
    lonley: { referenceBpm: 140, lockSeconds: 3, lockBpm: 187.5, endBpm: 139.54, switchedAt: 13 },
    summer2000: { referenceBpm: 127.5, lockSeconds: 3, lockBpm: 126.77, endBpm: 127.66 },
    // Held the dotted pulse (4/3 of 135) for the whole recording.
    'syncopation-no-kick': { referenceBpm: 135, lockSeconds: 3, lockBpm: 179.84, endBpm: 180.02 },
    // Locked on twice the reference, then moved to the reference octave.
    syncopationbass: { referenceBpm: 98, lockSeconds: 3, lockBpm: 195.7, endBpm: 97.98, switchedAt: 27.5 },
    syncopationbass2: { referenceBpm: 128, lockSeconds: 3, lockBpm: 127.66, endBpm: 127.66 },
};

// With the tie-break: the first publish (a tie holds it back until the 8 s window is full) and where the tempo ends. A
// dotted rival ties with the winner on lonley, summer2000 and syncopation-no-kick only.
const AFTER: Record<
    string,
    { lockSeconds: number; lockBpm: number; endBpm: number; switchedAt?: number; deferred: boolean }
> = {
    imyourgirl: { lockSeconds: 3, lockBpm: 134.82, endBpm: 134.88, deferred: false },
    // The bar-repeat comparison picks the beat (140) instead of the dotted 187.5, so there is nothing to correct later.
    lonley: { lockSeconds: 8, lockBpm: 139.53, endBpm: 139.53, deferred: true },
    // A draw keeps the winner, which is the right tempo here.
    summer2000: { lockSeconds: 8, lockBpm: 127.66, endBpm: 127.66, deferred: true },
    // WEAKNESS (routed to the dotted-hold switch counting in finishEstimate, not fixed here): the tie-break first publishes
    // the reference (135), but the dotted pulse takes over again at about 16 s and the track ends at 180.02.
    'syncopation-no-kick': { lockSeconds: 8, lockBpm: 134.86, endBpm: 180.02, switchedAt: 16, deferred: true },
    // 196 is the octave of the reference 98, and its tie ratio at the first lock (0.35) is under the threshold.
    syncopationbass: { lockSeconds: 3, lockBpm: 195.7, endBpm: 97.98, switchedAt: 27.5, deferred: false },
    syncopationbass2: { lockSeconds: 3, lockBpm: 127.66, endBpm: 127.66, deferred: false },
};

// True when `bpm` is within 1% of `reference` or of one of its octaves.
function nearReferenceOctave(bpm: number, reference: number): boolean {
    const octaves = Math.log2(bpm / reference);
    return Math.abs(2 ** (octaves - Math.round(octaves)) - 1) <= 0.01;
}

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

    it.each(Object.keys(AFTER))('%s replays to the same tempo every time, with the tie-break', (name) => {
        const fixture = fixtures.get(name)!;
        const onset = decodeOnset(fixture);

        const first = replayTracker(onset, fixture.frameRate);
        const second = replayTracker(onset, fixture.frameRate);
        const after = AFTER[name];
        const lock = findFirstLock(first)!;
        const last = first[first.length - 1];

        expect(second).toEqual(first);
        expect(lock.time).toBeCloseTo(after.lockSeconds, 2);
        expect(lock.held).toBeCloseTo(after.lockBpm, 1);
        expect(last.held).toBeCloseTo(after.endBpm, 1);
        // Held back means the estimate was confident enough to lock earlier, but no tempo was published until the decision.
        expect(first.some((step) => step.time < lock.time && step.raw > 0 && step.confidence >= 0.2)).toBe(
            after.deferred,
        );
        // The held tempo moves to another octave or dotted pulse at most once in these 30 to 40 s. The first publish (held
        // going from 0 to a tempo) is not a switch, so steps whose previous held is 0 are left out.
        const switches = first.filter(
            (step, i) =>
                i > 0 && first[i - 1].held > 0 && step.held > 0 && Math.abs(step.held / first[i - 1].held - 1) > 0.04,
        );
        if (after.switchedAt === undefined) {
            expect(switches).toEqual([]);
        } else {
            expect(switches).toHaveLength(1);
            expect(switches[0].time).toBeCloseTo(after.switchedAt, 2);
        }
    });

    it.each(Object.keys(AFTER).filter((name) => name !== 'syncopation-no-kick'))(
        '%s publishes only its reference tempo or an octave of it, from the first publish on',
        (name) => {
            const fixture = fixtures.get(name)!;
            const steps = replayTracker(decodeOnset(fixture), fixture.frameRate).filter((step) => step.held > 0);

            expect(steps.length).toBeGreaterThan(0);
            for (const step of steps) {
                expect(nearReferenceOctave(step.held, fixture.referenceBpm)).toBe(true);
            }
        },
    );

    it('keeps summer2000 on its live comb value, between 126.8 and 127.7', () => {
        const fixture = fixtures.get('summer2000')!;
        const steps = replayTracker(decodeOnset(fixture), fixture.frameRate).filter((step) => step.held > 0);

        for (const step of steps) {
            expect(step.held).toBeGreaterThanOrEqual(126.8);
            expect(step.held).toBeLessThanOrEqual(127.7);
        }
    });

    it('publishes no later than before plus half a second on tracks without a tie, and within 10 s on all', () => {
        for (const name of ['imyourgirl', 'syncopationbass2']) {
            expect(AFTER[name].lockSeconds).toBeLessThanOrEqual(TODAY[name].lockSeconds + 0.5);
        }
        for (const after of Object.values(AFTER)) {
            expect(after.lockSeconds).toBeLessThanOrEqual(10);
        }
    });
});

// The tie threshold sits in the gap between the tracks that must lock at once (tie ratio 0.35 and below, measured at the
// first lock) and the ones that must wait (0.52 and above). Moving it to either edge of the gap changes nothing; one step
// past an edge does, which shows how thin the margin is: about 0.05 on the low side and 0.12 on the high side.
describe('the tie threshold sits in the measured gap', () => {
    async function firstPublishes(threshold: number): Promise<Record<string, number>> {
        vi.resetModules();
        vi.doMock('../../app/features/rhythm/rhythmConfig', async (importOriginal) => ({
            ...(await importOriginal<typeof import('../../app/features/rhythm/rhythmConfig')>()),
            TEMPO_TIE_MIN_RATIO: threshold,
        }));
        const probe = await import('./probe');
        const result: Record<string, number> = {};
        for (const [name, fixture] of fixtures) {
            result[name] = probe.findFirstLock(probe.replayTracker(decodeOnset(fixture), fixture.frameRate))!.time;
        }
        vi.doUnmock('../../app/features/rhythm/rhythmConfig');
        return result;
    }

    it('holds from 0.36 to 0.51 and breaks just outside', async () => {
        const expected = Object.fromEntries(Object.entries(AFTER).map(([name, after]) => [name, after.lockSeconds]));

        expect(await firstPublishes(0.36)).toEqual(expected);
        expect(await firstPublishes(0.51)).toEqual(expected);
        expect(await firstPublishes(0.34)).not.toEqual(expected);
        expect(await firstPublishes(0.53)).not.toEqual(expected);
    });
});
