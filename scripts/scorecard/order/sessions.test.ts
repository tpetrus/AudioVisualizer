import { describe, expect, it } from 'vitest';
import type { RunFolder } from '../live/ingest';
import { pairSessions, planSessions, selectSessions } from './sessions';

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
    it('alternates the orders per track', () => {
        expect(planSessions(PAIR, ['a.wav', 'b.wav'], 2)).toEqual([
            ...['a.wav', 'b.wav'].flatMap((track) => [
                { track, lead: 'cubes', then: 'bass-ink' },
                { track, lead: 'bass-ink', then: 'cubes' },
                { track, lead: 'cubes', then: 'bass-ink' },
                { track, lead: 'bass-ink', then: 'cubes' },
            ]),
        ]);
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

describe('selectSessions', () => {
    it('keeps the newest sessions of each order per track', () => {
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
    });
});
