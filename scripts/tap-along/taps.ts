// Tap clean-up. Pure, so the rules are testable without a browser. Times are seconds from the start of the track.

// Two taps closer than this are one beat hit twice (a bounce of the key or a double press). 120 ms is faster than
// 500 BPM, so no real beat is lost.
export const MIN_TAP_GAP_SECONDS = 0.12;

// Sorts the taps, drops non-finite and negative times, and keeps only the first of any run of taps closer than
// `minGapSeconds` to the previously kept tap.
export function cleanTaps(taps: readonly number[], minGapSeconds = MIN_TAP_GAP_SECONDS): number[] {
    const sorted = taps.filter((tap) => Number.isFinite(tap) && tap >= 0).sort((a, b) => a - b);
    const kept: number[] = [];
    for (const tap of sorted) {
        if (kept.length === 0 || tap - kept[kept.length - 1] >= minGapSeconds) kept.push(tap);
    }
    return kept;
}

// Subtracts the tapper's constant offset (ms) from every tap, giving the estimated beat times. A tap that lands before
// the start of the track after the shift is dropped rather than stored as a negative time.
export function applyOffset(taps: readonly number[], offsetMs: number): number[] {
    return taps.map((tap) => tap - offsetMs / 1000).filter((time) => time >= 0);
}
