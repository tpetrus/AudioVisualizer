import { ONSET_BANDS, type OnsetBand } from '../../app/features/rhythm/eval/evalTypes';
import { parseOverride, type Override } from './ablate';

// Pure parts of `scripts/onset-sweep.ts`: reading the command line, expanding the grid, checking one grid point's results
// against the acceptance bounds and ranking the points.

export interface GridAxis {
    name: string;
    // Each value as source text, e.g. `[3,3,3]`.
    values: string[];
}

export interface SweepArguments {
    grid: GridAxis[];
    fixed: Override[];
    dir: string | undefined;
    seconds: number;
    noKick: string[];
    // 0 keeps every point.
    top: number;
}

// Splits on '|' and on ',' outside [ ] and ( ), so `[3,3,3],[2,2,2]` is two list values and `[3,3,3]` stays one. The comma
// exists because npm on Windows runs scripts through cmd.exe, which turns '|' into '^'.
export function splitGridValues(text: string): string[] {
    const values: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '[' || char === '(') depth++;
        else if (char === ']' || char === ')') depth--;
        else if (char === '|' || (char === ',' && depth <= 0)) {
            values.push(text.slice(start, i));
            start = i + 1;
        }
    }
    values.push(text.slice(start));
    return values;
}

// True when a grid point applies exactly the fixed overrides, so its run equals the baseline's and can be reused.
export function isBaselinePoint(point: readonly Override[], fixed: readonly Override[]): boolean {
    return (
        point.length === fixed.length &&
        point.every((entry, index) => entry.name === fixed[index].name && entry.value === fixed[index].value)
    );
}

export function parseSweepArguments(argv: readonly string[]): SweepArguments | undefined {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        return undefined;
    }
    const result: SweepArguments = { grid: [], fixed: [], dir: undefined, seconds: 60, noKick: [], top: 0 };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined) {
                throw new Error(`${argument} needs a value`);
            }
            return next;
        };
        switch (argument) {
            case '--grid': {
                const text = value();
                const at = text.indexOf('=');
                const name = at < 0 ? '' : text.slice(0, at).trim();
                const values = at < 0 ? [] : splitGridValues(text.slice(at + 1));
                if (values.length === 0 || values.some((entry) => entry.trim() === '')) {
                    throw new Error(`--grid needs NAME=v1|v2|... or NAME=v1,v2,..., got "${text}"`);
                }
                // parseOverride validates the name and that each value holds only numbers, arithmetic and lists.
                const parsed = values.map((entry) => parseOverride(`${name}=${entry}`).value);
                // A repeated NAME adds values to its axis, so the grid can be built without '|' (cmd.exe mangles it).
                const existing = result.grid.find((axis) => axis.name === name);
                if (existing === undefined) {
                    result.grid.push({ name, values: parsed });
                } else {
                    existing.values.push(...parsed);
                }
                break;
            }
            case '--set':
                result.fixed.push(parseOverride(value()));
                break;
            case '--dir':
                result.dir = value();
                break;
            case '--seconds': {
                const text = value();
                const number = Number(text);
                if (!Number.isFinite(number) || number <= 0) {
                    throw new Error(`--seconds needs a number above 0, got "${text}"`);
                }
                result.seconds = number;
                break;
            }
            case '--no-kick':
                result.noKick.push(value());
                break;
            case '--top': {
                const text = value();
                const number = Number(text);
                if (!Number.isInteger(number) || number < 1) {
                    throw new Error(`--top needs a whole number above 0, got "${text}"`);
                }
                result.top = number;
                break;
            }
            default:
                throw new Error(`Unknown option ${argument}`);
        }
    }
    const seen = new Set<string>();
    for (const name of [...result.grid.map((axis) => axis.name), ...result.fixed.map((entry) => entry.name)]) {
        if (seen.has(name)) {
            throw new Error(`${name} was given twice (--grid and --set count together)`);
        }
        seen.add(name);
    }
    return result;
}

// Cartesian product of the axes, the first axis varying slowest. No axes give one empty point (the baseline).
export function expandGrid(grid: readonly GridAxis[]): Override[][] {
    let points: Override[][] = [[]];
    for (const axis of grid) {
        points = points.flatMap((point) => axis.values.map((value) => [...point, { name: axis.name, value }]));
    }
    return points;
}

export const SYNTHETIC_MIN_F = 0.9;
export const MAX_EVENTS_PER_BEAT: Record<OnsetBand, number> = { kick: 2, bass: 2, snare: 2, highs: 4 };
export const MAX_KICK_ON_NO_KICK = 0.5;
// Good tracks reach a lift of 0.3 to 0.7 and detectors that only fire often enough to hit beats by chance reach about 0.0
// to 0.1, so 0.15 sits just above chance without demanding a perfect track.
export const MIN_LIFT = 0.15;

export interface SyntheticResult {
    track: string;
    // F at 50 ms per labelled band; a band the track has no labels for is absent.
    f: Partial<Record<OnsetBand, number>>;
}

export interface LocalResult {
    track: string;
    noKick: boolean;
    perBeat: Record<OnsetBand, number>;
    // See alignmentLift: the lift over chance, the constant offset (ms) it was found at and the chance level.
    lift: number;
    offsetMs: number;
    chance: number;
}

export interface Violation {
    // Where it happened, e.g. `synthetic kick-120 snare F` or `local-a highs`.
    what: string;
    value: number;
    // Relative distance past the bound is negative; the headroom is positive.
    margin: number;
}

export interface PointScore {
    violations: Violation[];
    // Smallest margin over every check: positive means all pass, with that much relative headroom.
    worstMargin: number;
    worstSynthetic: { track: string; band: OnsetBand; f: number } | undefined;
}

export function scorePoint(synthetic: readonly SyntheticResult[], local: readonly LocalResult[]): PointScore {
    const violations: Violation[] = [];
    let worstMargin = Infinity;
    let worstSynthetic: PointScore['worstSynthetic'];
    const check = (what: string, value: number, margin: number): void => {
        // NaN (no tapped beats) cannot pass.
        const m = Number.isNaN(margin) ? -1 : margin;
        worstMargin = Math.min(worstMargin, m);
        if (m < 0) violations.push({ what, value, margin: m });
    };
    for (const { track, f } of synthetic) {
        for (const band of ONSET_BANDS) {
            const value = f[band];
            if (value === undefined) continue;
            if (worstSynthetic === undefined || value < worstSynthetic.f) worstSynthetic = { track, band, f: value };
            check(`synthetic ${track} ${band} F`, value, (value - SYNTHETIC_MIN_F) / SYNTHETIC_MIN_F);
        }
    }
    for (const { track, noKick, perBeat, lift } of local) {
        for (const band of ONSET_BANDS) {
            const bound = noKick && band === 'kick' ? MAX_KICK_ON_NO_KICK : MAX_EVENTS_PER_BEAT[band];
            check(`local ${track} ${band}`, perBeat[band], (bound - perBeat[band]) / bound);
        }
        check(`local ${track} lift`, lift, (lift - MIN_LIFT) / MIN_LIFT);
    }
    return { violations, worstMargin, worstSynthetic };
}

export interface ScoredPoint {
    overrides: Override[];
    score: PointScore;
}

// Zero-violation points first, then fewer violations, then the larger worst margin. Ties keep their grid order.
export function rankPoints<T extends { score: PointScore }>(points: readonly T[]): T[] {
    return points
        .map((point, index) => ({ point, index }))
        .sort(
            (a, b) =>
                a.point.score.violations.length - b.point.score.violations.length ||
                b.point.score.worstMargin - a.point.score.worstMargin ||
                a.index - b.index,
        )
        .map((entry) => entry.point);
}

const describeOverrides = (overrides: readonly Override[]): string =>
    overrides.length === 0 ? '(none)' : overrides.map((entry) => `${entry.name}=${entry.value}`).join(' ');

export function formatPoint(
    label: string,
    overrides: readonly Override[],
    score: PointScore,
    local: readonly LocalResult[],
): string[] {
    const failing = score.violations.filter((entry) => entry.what.startsWith('synthetic ')).map((entry) => entry.what);
    const worst = score.worstSynthetic;
    const lines = [
        `${label} ${describeOverrides(overrides)}: ${score.violations.length} violation(s), worst synthetic ` +
            `${worst === undefined ? 'n/a' : `${worst.track}/${worst.band} F ${worst.f.toFixed(2)}`}` +
            `${failing.length === 0 ? '' : `, failing ${failing.map((entry) => entry.slice('synthetic '.length)).join('; ')}`}`,
    ];
    const bad = new Set(score.violations.map((entry) => entry.what));
    for (const { track, noKick, perBeat, lift, offsetMs, chance } of local) {
        const bands = ONSET_BANDS.map((band) => {
            const mark = bad.has(`local ${track} ${band}`) ? '!' : '';
            return `${band} ${perBeat[band].toFixed(2)}${mark}`;
        });
        const mark = bad.has(`local ${track} lift`) ? '!' : '';
        const alignment = Number.isNaN(lift)
            ? `n/a${mark}`
            : `${lift.toFixed(2)}${mark} offset ${offsetMs > 0 ? '+' : ''}${offsetMs} ms chance ${chance.toFixed(2)}`;
        lines.push(`    ${track}${noKick ? ' (no kick)' : ''}: ${bands.join(' ')} lift ${alignment}`);
    }
    return lines;
}
