// Per-character adjustments of the dance recipes (manifests.ts), for characters whose proportions differ from the
// MakeHuman figure the recipes were approved on (longer arms, shorter legs, a bulkier chest). A character's
// tuning.json sits next to its model.glb; it can ground-lock a dance that the recipe leaves as captured and add
// amplitude groups on top of the recipe's. It never loosens a validation rule: it changes the motion, not the checks.

import type { AmplitudeGroup } from './amplitude';
import { SHOULDERS_AND_ARMS, SPINE_AND_HEAD } from './manifests';
import type { DanceManifest } from './manifests';

// The bone groups a tuning file may scale, by the names the file uses.
export const TUNING_GROUPS: Readonly<Record<string, readonly string[]>> = {
    arms: SHOULDERS_AND_ARMS,
    spine: SPINE_AND_HEAD,
    feet: ['footL', 'footR'],
    wrists: ['wristL', 'wristR'],
    legs: ['upperleg01L', 'upperleg01R', 'lowerleg01L', 'lowerleg01R', 'footL', 'footR'],
};

export interface DanceTuning {
    // Replaces the recipe's ground lock: the slack in meters, or null for as captured.
    groundLock?: { tolerance: number } | null;
    // Replaces the mirrored arm's elbow cap in meters; the recipe's value suits MakeHuman's 0.23 m upper arm, so a
    // character with longer upper arms needs a proportionally larger one.
    elbowCapMeters?: number;
    // Ease the feet back toward flat wherever a toe or heel would dip more than this many meters below the sole's rest
    // level, so the floor the app puts under the dance is not set by one deep dip.
    soleClearanceMeters?: number;
    // Added after the recipe's own amplitude groups.
    amplitude?: readonly { group: string; scale: number; restBlend?: number }[];
}

export type Tuning = Readonly<Record<string, DanceTuning>>;

// Parses a tuning file's text, failing on anything that is not a known dance or group so a typo cannot pass silently.
export function parseTuning(text: string, danceIds: readonly string[]): Tuning {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('tuning: not an object');
    for (const [id, dance] of Object.entries(parsed)) {
        if (!danceIds.includes(id)) throw new Error(`tuning: unknown dance ${id}`);
        for (const entry of (dance as DanceTuning).amplitude ?? []) {
            if (!(entry.group in TUNING_GROUPS)) throw new Error(`tuning: unknown group ${entry.group} in ${id}`);
            if (!(entry.scale > 0)) throw new Error(`tuning: ${id} ${entry.group} needs a scale above 0`);
        }
    }
    return parsed as Tuning;
}

export function applyTuning(manifest: DanceManifest, tuning: Tuning): DanceManifest {
    const own = tuning[manifest.id];
    if (!own) return manifest;
    const extra: AmplitudeGroup[] = (own.amplitude ?? []).map(({ group, scale, restBlend }) => ({
        bones: [...TUNING_GROUPS[group]],
        scale,
        ...(restBlend === undefined ? {} : { restBlend }),
    }));
    return {
        ...manifest,
        groundLock: own.groundLock === undefined ? manifest.groundLock : own.groundLock,
        amplitude: [...manifest.amplitude, ...extra],
        ...(own.soleClearanceMeters === undefined ? {} : { soleClearanceMeters: own.soleClearanceMeters }),
        ...(manifest.mirror && own.elbowCapMeters !== undefined
            ? { mirror: { ...manifest.mirror, elbowCapMeters: own.elbowCapMeters } }
            : {}),
    };
}
