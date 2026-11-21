// Planning order sessions and pairing recorded run folders back into them. Pure: no files and no processes.
//
// A session is one `debug:viz --viz LEAD --then FOLLOW` job: the lead's folder (play 1, options.json has `then`) and the
// follower's folder (play 2, options.json has `after`). The two plays stamp their folders separately, a few seconds
// apart, so the follower is the first matching folder stamped at or after the lead and before the next session of that
// track.

import type { RunFolder } from '../live/ingest';

export interface OrderSession {
    lead: RunFolder;
    follow: RunFolder;
}

export interface SessionPlan {
    track: string;
    lead: string;
    then: string;
}

// Per track, `perOrder` sessions of each order, alternating A-then-B and B-then-A so a drift over time (a warming
// machine) lands on both orders alike.
export function planSessions(
    pair: readonly [string, string],
    tracks: readonly string[],
    perOrder: number,
): SessionPlan[] {
    const plans: SessionPlan[] = [];
    for (const track of tracks) {
        for (let i = 0; i < perOrder * 2; i++) {
            const [lead, then] = i % 2 === 0 ? pair : [pair[1], pair[0]];
            plans.push({ track, lead, then });
        }
    }
    return plans;
}

const isPairOf = (a: string, b: string, pair: readonly [string, string]): boolean =>
    (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]);

// The sessions among `folders` that belong to `pair`, oldest first. A lead with no follower (its second play failed) and
// a follower with no lead are dropped.
export function pairSessions(folders: readonly RunFolder[], pair: readonly [string, string]): OrderSession[] {
    const leads = folders
        .filter((folder) => folder.play === 1 && folder.then !== undefined && isPairOf(folder.viz, folder.then, pair))
        .sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
    const follows = folders.filter(
        (folder) => folder.play === 2 && folder.after !== undefined && isPairOf(folder.viz, folder.after, pair),
    );
    const used = new Set<RunFolder>();
    const sessions: OrderSession[] = [];
    leads.forEach((lead, index) => {
        const next = leads.slice(index + 1).find((other) => other.track === lead.track);
        const follow = follows
            .filter(
                (candidate) =>
                    !used.has(candidate) &&
                    candidate.track === lead.track &&
                    candidate.viz === lead.then &&
                    candidate.after === lead.viz &&
                    candidate.stamp >= lead.stamp &&
                    (next === undefined || candidate.stamp < next.stamp),
            )
            .sort((a, b) => (a.stamp < b.stamp ? -1 : 1))[0];
        if (follow === undefined) return;
        used.add(follow);
        sessions.push({ lead, follow });
    });
    return sessions;
}

// The newest `count` sessions of each order of each listed track, grouped by track, oldest first within a track.
export function selectSessions(
    sessions: readonly OrderSession[],
    pair: readonly [string, string],
    tracks: readonly string[],
    count: number,
): Map<string, OrderSession[]> {
    const byTrack = new Map<string, OrderSession[]>();
    for (const track of tracks) {
        const picked: OrderSession[] = [];
        for (const lead of pair) {
            picked.push(
                ...sessions
                    .filter((session) => session.lead.track === track && session.lead.viz === lead)
                    .sort((a, b) => (a.lead.stamp < b.lead.stamp ? 1 : a.lead.stamp > b.lead.stamp ? -1 : 0))
                    .slice(0, count),
            );
        }
        if (picked.length > 0) byTrack.set(track, picked);
    }
    return byTrack;
}
