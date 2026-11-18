// Compares a fresh scorecard with the committed baseline. The ratchet only ever tightens: a blocking cell that passed
// must keep passing and a live median must not worsen beyond its recorded spread. Improvements and new cells are fine.

import { directionOf } from './targets';
import type { Scorecard, ScorecardCell } from './types';

const keyOf = (cell: ScorecardCell): string => `${cell.metric}|${cell.track}|${cell.visualizer}`;
const nameOf = (cell: ScorecardCell): string => `${cell.metric} on ${cell.track} (${cell.visualizer})`;

export function compareToBaseline(baseline: Scorecard, current: Scorecard): { ok: boolean; problems: string[] } {
    if (baseline.header.targetsVersion !== current.header.targetsVersion) {
        // Floors or definitions changed, so cell-by-cell comparison would be meaningless.
        return {
            ok: false,
            problems: [
                `targets version ${current.header.targetsVersion} differs from the baseline's ${baseline.header.targetsVersion}: regenerate the baseline`,
            ],
        };
    }

    const problems: string[] = [];
    for (const [track, hash] of Object.entries(baseline.header.sidecarHashes)) {
        const now = current.header.sidecarHashes[track];
        if (now === hash) continue;
        const what = now === undefined ? 'is missing' : 'changed';
        problems.push(`sidecar for ${track} ${what}: regenerate the baseline after re-tapping`);
    }

    const currentByKey = new Map(current.cells.map((cell) => [keyOf(cell), cell]));
    for (const before of baseline.cells) {
        const now = currentByKey.get(keyOf(before));
        if (before.blocking && before.status === 'pass') {
            if (!now) problems.push(`${nameOf(before)}: blocking cell is missing, it passed in the baseline`);
            else if (now.status !== 'pass') {
                problems.push(`${nameOf(before)}: blocking cell is ${now.status}, it passed in the baseline`);
            }
        }
        if (before.source !== 'live' || !now || before.value === null || now.value === null) continue;
        // A metric this table does not know has no direction to judge, so it is skipped.
        const direction = directionOf(before.metric);
        if (direction === null) continue;
        const worse = direction === 'lower' ? now.value - before.value : before.value - now.value;
        if (worse > before.spread) {
            problems.push(
                `${nameOf(before)}: live value ${now.value} is worse than the baseline's ${before.value} by more than its spread ${before.spread}`,
            );
        }
    }
    return { ok: problems.length === 0, problems };
}
