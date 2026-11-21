import { describe, expect, it } from 'vitest';
import type { RunFolder } from '../live/ingest';
import { missingPlans, pairSessions, planSessions, selectSessions } from './sessions';

const PAIR: [string, string] = ['cubes', 'bass-ink'];

function folder(viz: string, track: string, second: number, play: 1 | 2, other: string): RunFolder {
    const stamp = `2026-11-20T00-00-${String(second).padStart(2, '0')}-000Z`;
    return {
        path: `${viz}-${track}-${stamp}-play${play}`,
        viz,
        track,
        stamp,
        play,
        ...(play === 1 ? { then: other } : { after: other }),
    };
}

describe('planSessions', () => {
    it('interleaves the four combinations per repetition and track', () => {
        expect(planSessions(PAIR, ['a.wav', 'b.wav'], 2)).toEqual(
            ['a.wav', 'b.wav'].flatMap((track) =>
                [0, 1].flatMap(() => [
                    { track, lead: 'cubes', then: 'bass-ink' },
                    { track, lead: 'bass-ink', then: 'cubes' },
                    { track, lead: 'cubes', then: 'cubes' },
                    { track, lead: 'bass-ink', then: 'bass-ink' },
                ]),
            ),
        );
    });
});

describe('missingPlans', () => {
    it('keeps only the shortfall per track and combination, in planned order', () => {
        const plans = planSessions(PAIR, ['a.wav'], 2);
        const folders = [
            folder('cubes', 'a.wav', 1, 1, 'bass-ink'),
            folder('bass-ink', 'a.wav', 5, 2, 'cubes'),
            folder('cubes', 'a.wav', 10, 1, 'cubes'),
            folder('cubes', 'a.wav', 15, 2, 'cubes'),
            folder('cubes', 'a.wav', 20, 1, 'cubes'),
            folder('cubes', 'a.wav', 25, 2, 'cubes'),
        ];
        const missing = missingPlans(plans, pairSessions(folders, PAIR));
        expect(missing.map((plan) => `${plan.lead}>${plan.then}`)).toEqual([
            'bass-ink>cubes',
            'bass-ink>bass-ink',
            'cubes>bass-ink',
            'bass-ink>cubes',
            'bass-ink>bass-ink',
        ]);
        expect(missingPlans(plans, [])).toEqual(plans);
    });
});

describe('pairSessions', () => {
    it('pairs a lead with the follower stamped after it and drops the rest', () => {
        const folders = [
            folder('cubes', 'a.wav', 1, 1, 'bass-ink'),
            folder('bass-ink', 'a.wav', 9, 2, 'cubes'),
            // Its second play failed, so it has no follower before the next lead.
            folder('bass-ink', 'a.wav', 20, 1, 'cubes'),
            folder('cubes', 'a.wav', 40, 2, 'bass-ink'),
            folder('bass-ink', 'a.wav', 30, 1, 'cubes'),
            // A follower with no lead, another pair and a live-cell run are ignored.
            folder('cubes', 'a.wav', 50, 2, 'bass-ink'),
            folder('cubes', 'a.wav', 3, 1, 'trio-color-wave'),
            { path: 'plain', viz: 'cubes', track: 'a.wav', stamp: '2026-11-20T00-00-05-000Z', play: 1 },
        ];
        const sessions = pairSessions(folders, PAIR);
        expect(sessions.map((s) => [s.lead.stamp.slice(17, 19), s.follow.stamp.slice(17, 19)])).toEqual([
            ['01', '09'],
            ['30', '40'],
        ]);
    });

    it('keeps tracks apart', () => {
        const folders = [
            folder('cubes', 'a.wav', 1, 1, 'bass-ink'),
            folder('cubes', 'b.wav', 2, 1, 'bass-ink'),
            folder('bass-ink', 'b.wav', 10, 2, 'cubes'),
            folder('bass-ink', 'a.wav', 11, 2, 'cubes'),
        ];
        const sessions = pairSessions(folders, PAIR);
        expect(sessions.map((s) => [s.lead.track, s.follow.stamp.slice(17, 19)])).toEqual([
            ['a.wav', '11'],
            ['b.wav', '10'],
        ]);
    });
});

describe('pairSessions control sessions', () => {
    it('pairs a same-visualizer session and marks its kind', () => {
        const folders = [
            folder('cubes', 'a.wav', 1, 1, 'cubes'),
            folder('cubes', 'a.wav', 9, 2, 'cubes'),
            folder('cubes', 'a.wav', 20, 1, 'bass-ink'),
            folder('bass-ink', 'a.wav', 29, 2, 'cubes'),
        ];
        expect(pairSessions(folders, PAIR).map((s) => s.kind)).toEqual(['control', 'cross']);
    });
});

describe('selectSessions', () => {
    it('keeps the newest sessions of each combination per track', () => {
        const folders = [1, 20, 40].flatMap((second) => [
            folder('cubes', 'a.wav', second, 1, 'bass-ink'),
            folder('bass-ink', 'a.wav', second + 5, 2, 'cubes'),
            folder('bass-ink', 'a.wav', second + 8, 1, 'cubes'),
            folder('cubes', 'a.wav', second + 12, 2, 'bass-ink'),
        ]);
        const all = pairSessions(folders, PAIR);
        expect(all).toHaveLength(6);
        const picked = selectSessions(all, PAIR, ['a.wav', 'missing.wav'], 2);
        expect([...picked.keys()]).toEqual(['a.wav']);
        const leads = picked.get('a.wav')!.map((s) => `${s.lead.viz}@${s.lead.stamp.slice(17, 19)}`);
        expect(leads).toEqual(['cubes@40', 'cubes@20', 'bass-ink@48', 'bass-ink@28']);
        const control = [folder('cubes', 'a.wav', 55, 1, 'cubes'), folder('cubes', 'a.wav', 58, 2, 'cubes')];
        const both = selectSessions(pairSessions([...folders, ...control], PAIR), PAIR, ['a.wav'], 1);
        expect(both.get('a.wav')!.map((s) => s.kind)).toEqual(['control', 'cross', 'cross']);
    });
});
