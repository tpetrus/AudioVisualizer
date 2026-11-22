// Planning order sessions and pairing recorded run folders back into them. Pure: no files and no processes.
//
// A session is one `debug:viz --viz LEAD --then FOLLOW` job: the lead's folder (play 1, options.json has `then`) and the
// follower's folder (play 2, options.json has `after`). The two plays stamp their folders separately, a few seconds
// apart, so the follower is the first matching folder stamped at or after the lead and before the next session of that
// track.

import type { RunFolder } from '../live/ingest';

// 'cross': the follower is the other visualizer. 'control': the same visualizer played twice, which isolates what the
// navigate and re-select path does from what the order does.
export type SessionKind = 'cross' | 'control';

export interface OrderSession {
    lead: RunFolder;
    follow: RunFolder;
    kind: SessionKind;
}

export interface SessionPlan {
    track: string;
    lead: string;
    then: string;
}

// Per track, `perCombination` sessions of each of the four combinations (A then B, B then A, A then A, B then B),
// interleaved so a drift over time (a warming machine) lands on every combination alike.
export function planSessions(
    pair: readonly [string, string],
    tracks: readonly string[],
    perCombination: number,
): SessionPlan[] {
    const [a, b] = pair;
    const plans: SessionPlan[] = [];
    for (const track of tracks) {
        for (let i = 0; i < perCombination; i++) {
            plans.push(
                { track, lead: a, then: b },
                { track, lead: b, then: a },
                { track, lead: a, then: a },
                { track, lead: b, then: b },
            );
        }
    }
    return plans;
}

const comboKey = (track: string, lead: string, follow: string): string => `${track}|${lead}|${follow}`;

// The planned sessions that `existing` does not already cover: per track and combination, the shortfall up to the
// planned count, in the planned order.
export function missingPlans(plans: readonly SessionPlan[], existing: readonly OrderSession[]): SessionPlan[] {
    const have = new Map<string, number>();
    for (const session of existing) {
        const key = comboKey(session.lead.track, session.lead.viz, session.follow.viz);
        have.set(key, (have.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return plans.filter((plan) => {
        const key = comboKey(plan.track, plan.lead, plan.then);
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);
        return index >= (have.get(key) ?? 0);
    });
}

// The sessions whose follow play waited `settle` seconds, per `settleOf` (0 for a folder that recorded none).
export function sessionsWithSettle(
    sessions: readonly OrderSession[],
    settle: number,
    settleOf: (folder: RunFolder) => number,
): OrderSession[] {
    return sessions.filter((session) => settleOf(session.follow) === settle);
}

const inPair = (name: string, pair: readonly [string, string]): boolean => name === pair[0] || name === pair[1];

// The sessions among `folders` that belong to `pair` (cross and control), oldest first. A lead with no follower (its second play failed) and
// a follower with no lead are dropped.
export function pairSessions(folders: readonly RunFolder[], pair: readonly [string, string]): OrderSession[] {
    const leads = folders
        .filter(
            (folder) =>
                folder.play === 1 && folder.then !== undefined && inPair(folder.viz, pair) && inPair(folder.then, pair),
        )
        .sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
    const follows = folders.filter(
        (folder) =>
            folder.play === 2 && folder.after !== undefined && inPair(folder.viz, pair) && inPair(folder.after, pair),
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
        sessions.push({ lead, follow, kind: lead.viz === lead.then ? 'control' : 'cross' });
    });
    return sessions;
}

// The newest `count` sessions of each (lead, follow) combination of each listed track, grouped by track, oldest first
// within a track.
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
            for (const follow of pair) {
                picked.push(
                    ...sessions
                        .filter(
                            (session) =>
                                session.lead.track === track &&
                                session.lead.viz === lead &&
                                session.follow.viz === follow,
                        )
                        .sort((a, b) => (a.lead.stamp < b.lead.stamp ? 1 : a.lead.stamp > b.lead.stamp ? -1 : 0))
                        .slice(0, count),
                );
            }
        }
        if (picked.length > 0) byTrack.set(track, picked);
    }
    return byTrack;
}
