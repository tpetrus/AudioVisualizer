// Summary statistics over the per-click delays. Pure. Not part of the app bundle.

export interface DelayStats {
    found: number;
    missed: number;
    // null when no click was found.
    medianMs: number | null;
    p5Ms: number | null;
    p95Ms: number | null;
}

// Linear interpolation between the two nearest ranks. `sorted` must be ascending and not empty.
export function percentile(sorted: readonly number[], fraction: number): number {
    const position = fraction * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function summarizeDelays(delaysMs: readonly (number | null)[]): DelayStats {
    const found = delaysMs.filter((delay): delay is number => delay !== null).sort((a, b) => a - b);
    const missed = delaysMs.length - found.length;
    if (found.length === 0) return { found: 0, missed, medianMs: null, p5Ms: null, p95Ms: null };
    return {
        found: found.length,
        missed,
        medianMs: percentile(found, 0.5),
        p5Ms: percentile(found, 0.05),
        p95Ms: percentile(found, 0.95),
    };
}
