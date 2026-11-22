// Tempo comparison the scorecard uses: a detected tempo is folded by powers of two before it is compared with the truth,
// because the tracker may hold the half or the double of the beat a person taps (the app's dance follows the same
// normalization), and the truth of a drifting track is the tempo of a smooth fit of the tapped beats.

// Within this fraction of the truth after folding counts as the right tempo. The same 2% as TEMPO_TOLERANCE in the
// evaluation code, which is not imported because the fold makes the comparison a different one.
export const SCORECARD_TEMPO_TOLERANCE = 0.02;

// The ratio of detected to true tempo moved by powers of two into [0.75, 1.5). The interval is one octave wide, so every
// ratio has exactly one representative.
export function foldRatio(ratio: number): number {
    if (!(ratio > 0) || !Number.isFinite(ratio)) return NaN;
    let folded = ratio;
    while (folded >= 1.5) folded /= 2;
    while (folded < 0.75) folded *= 2;
    return folded;
}

// How far the folded tempo is from the truth, as a fraction of the truth. NaN for no tempo (bpm 0).
export function foldedError(bpm: number, truthBpm: number): number {
    return Math.abs(foldRatio(bpm / truthBpm) - 1);
}

// The true tempo at one moment.
export type TempoTruth = (time: number) => number;

export function constantTruth(bpm: number): TempoTruth {
    return () => bpm;
}

// A drifting truth is the tempo of a quadratic least-squares fit of the tapped beat times: time = a + b k + c k^2 for beat
// number k, so the tempo at beat k is 60 / (b + 2 c k) and at a moment the beat number is found by inverting the fit.
// An 8-beat window of taps strays up to 2% from such a fit (tap jitter over a short span), which is as large as the
// tolerance, so the window measured the taps and not the music. The fit is centered on the middle beat to keep the normal
// equations well conditioned. Moments outside the tapped span read the tempo at its nearest end. With fewer than 4 beats,
// or a fit that does not run forward, it falls back to the constant tempo.
export function driftingTruth(beats: readonly number[], fallbackBpm: number): TempoTruth {
    const n = beats.length;
    if (n < 4) return constantTruth(fallbackBpm);
    const mid = (n - 1) / 2;
    // Power sums of x = k - mid for the normal equations of a + b x + c x^2.
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let s4 = 0;
    let t0 = 0;
    let t1 = 0;
    let t2 = 0;
    for (let k = 0; k < n; k++) {
        const x = k - mid;
        const x2 = x * x;
        s1 += x;
        s2 += x2;
        s3 += x2 * x;
        s4 += x2 * x2;
        t0 += beats[k];
        t1 += beats[k] * x;
        t2 += beats[k] * x2;
    }
    const det3 = (m: number[][]): number =>
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const normal = [
        [n, s1, s2],
        [s1, s2, s3],
        [s2, s3, s4],
    ];
    const det = det3(normal);
    const column = (index: number): number[][] =>
        normal.map((row, r) => row.map((value, c) => (c === index ? [t0, t1, t2][r] : value)));
    const a = det3(column(0)) / det;
    const b = det3(column(1)) / det;
    const c = det3(column(2)) / det;
    // Seconds per beat at beat offset x; it must stay positive over the whole span for the fit to be a tempo.
    const period = (x: number): number => b + 2 * c * x;
    if (!(period(-mid) > 0) || !(period(mid) > 0) || !Number.isFinite(a)) return constantTruth(fallbackBpm);
    return (time) => {
        // Invert time = a + b x + c x^2 for x with the numerically stable root (b > 0 at the middle of a forward fit).
        const rest = time - a;
        const root = Math.sqrt(Math.max(0, b * b + 4 * c * rest));
        const x = Math.abs(c) < 1e-12 ? rest / b : (2 * rest) / (b + root);
        return 60 / period(Math.min(mid, Math.max(-mid, x)));
    };
}
