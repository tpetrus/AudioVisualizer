// The decision of `npm run scorecard:check`, apart from its file reading so the exit codes are plain unit tests.

import { compareToBaseline } from './ratchet';
import type { Scorecard } from './types';

export interface CheckOutcome {
    exitCode: 0 | 1;
    lines: string[];
}

export const MISSING_BASELINE_MESSAGE =
    'No baseline scorecard found. Run `npm run scorecard -- --write-baseline` to create one.';

// A missing baseline fails: the check has nothing to hold the current numbers to, and passing silently would hide it.
export function evaluateCheck(baseline: Scorecard | null, current: Scorecard): CheckOutcome {
    if (baseline === null) return { exitCode: 1, lines: [MISSING_BASELINE_MESSAGE] };
    const { ok, problems } = compareToBaseline(baseline, current);
    if (ok) return { exitCode: 0, lines: ['Scorecard check passed: nothing that passed in the baseline got worse.'] };
    return {
        exitCode: 1,
        lines: [`Scorecard check failed with ${problems.length} problem(s):`, ...problems.map((p) => `  - ${p}`)],
    };
}
