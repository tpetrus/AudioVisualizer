// The six score functions of the bar and level evidence probe, fixed in
// docs/plans/alignment-tracker-leftovers/probe-plan.md ("Score functions", "Margin"). Pure maths over one tatum series;
// nothing here reads the app.

// The candidate periods in tatums (six tatums per declared beat), and the pre-registered threshold.
export const CANDIDATE_PERIODS: readonly number[] = [2, 3, 4, 6, 8, 9, 12, 18];
export const TAU = 0.05;
export const TATUMS_PER_BEAT = 6;

export const CHANNELS = ['NK', 'T', 'C'] as const;
export type Channel = (typeof CHANNELS)[number];
export const FUNCTIONS = ['half.NK', 'half.T', 'half.C', 'fold.NK', 'fold.T', 'fold.C'] as const;
export type ScoreFunction = (typeof FUNCTIONS)[number];

// Normalized autocorrelation at a whole lag: sum of (x[t] - mean)(x[t + lag] - mean) over the t where both exist, over
// the sum of squares of every deviation. 0 for a constant series.
export function autocorrelationAt(x: ArrayLike<number>, lag: number): number {
    const n = x.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[i];
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) energy += (x[i] - mean) ** 2;
    if (!(energy > 0) || lag >= n) return 0;
    let sum = 0;
    for (let t = 0; t + lag < n; t++) sum += (x[t] - mean) * (x[t + lag] - mean);
    return sum / energy;
}

// A(L), with the mean of the two neighboring whole lags where L is not a whole number.
export function autocorrelation(x: ArrayLike<number>, lag: number): number {
    if (Number.isInteger(lag)) return autocorrelationAt(x, lag);
    return 0.5 * (autocorrelationAt(x, Math.floor(lag)) + autocorrelationAt(x, Math.ceil(lag)));
}

// The fold profile at period P: p[k] is the mean of x[t] over t = k (mod P), with t = 0 at the first tatum.
export function foldProfile(x: ArrayLike<number>, period: number): number[] {
    const sum = new Array<number>(period).fill(0);
    const count = new Array<number>(period).fill(0);
    for (let t = 0; t < x.length; t++) {
        sum[t % period] += x[t];
        count[t % period]++;
    }
    return sum.map((value, k) => (count[k] > 0 ? value / count[k] : 0));
}

// How much stronger the beat is than the point halfway to the next one: (p[k*] - p[(k* + floor(P / 2)) mod P]) /
// (p[k*] + 1e-9), where k* is the first k with the largest p.
export function foldContrast(x: ArrayLike<number>, period: number): number {
    const p = foldProfile(x, period);
    let best = 0;
    for (let k = 1; k < period; k++) if (p[k] > p[best]) best = k;
    const half = p[(best + Math.floor(period / 2)) % period];
    return (p[best] - half) / (p[best] + 1e-9);
}

// A(P) - A(P / 2): the level repeats more strongly than its own half.
export function halfScore(x: ArrayLike<number>, period: number): number {
    return autocorrelation(x, period) - autocorrelation(x, period / 2);
}

export function scoreOf(fn: ScoreFunction, series: Record<Channel, ArrayLike<number>>, period: number): number {
    const [kind, channel] = fn.split('.') as ['half' | 'fold', Channel];
    return kind === 'half' ? halfScore(series[channel], period) : foldContrast(series[channel], period);
}

// m = s(truth) - max over the other candidates of s. NaN when the truth is not a candidate or has no rival, which the
// callers read as "not scorable".
export function margin(scores: ReadonlyMap<number, number>, truthPeriod: number | undefined): number {
    if (truthPeriod === undefined || !scores.has(truthPeriod)) return Number.NaN;
    let rival = Number.NEGATIVE_INFINITY;
    for (const [period, score] of scores) if (period !== truthPeriod) rival = Math.max(rival, score);
    return rival === Number.NEGATIVE_INFINITY ? Number.NaN : (scores.get(truthPeriod) as number) - rival;
}

// The candidate periods whose tempo H * 6 / P lies in [min, max], and the one within 4% of the truth (the closest, if
// two are).
export function candidatesFor(
    heldBpm: number,
    truthBpm: number,
    minBpm: number,
    maxBpm: number,
): { periods: number[]; truthPeriod: number | undefined } {
    const periods = CANDIDATE_PERIODS.filter((p) => {
        const bpm = (heldBpm * TATUMS_PER_BEAT) / p;
        return bpm >= minBpm && bpm <= maxBpm;
    });
    let truthPeriod: number | undefined;
    let nearest = Infinity;
    for (const p of periods) {
        const error = Math.abs((heldBpm * TATUMS_PER_BEAT) / p / truthBpm - 1);
        if (error <= 0.04 && error < nearest) {
            nearest = error;
            truthPeriod = p;
        }
    }
    return { periods, truthPeriod };
}
