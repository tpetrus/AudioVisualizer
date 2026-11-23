// Pure helpers of `npm run trace:beats`: reading the command line, the error of a declared beat against the nearest tap,
// the median error per window of the track, and the text and JSON the tool prints. The pipeline run that produces the rows
// is beatTraceRunner.ts; the entry that bundles it with overrides is scripts/trace-beats.ts.

import { parseOverride, type Override } from './ablate';

// One declared beat, with what the tracker's phase check and correction saw at it.
export interface TraceRow {
    // Time of the beat in seconds (the tracker's lastBeatTime).
    time: number;
    // Beat minus the nearest tap in ms; null without a sidecar.
    errorMs: number | null;
    // Place of the best 3-bin window of the phase check (bin 0 is the grid's own place) and the same as a signed fraction
    // of a beat from the grid.
    bin: number;
    offset: number;
    // Best 3-bin window sum over the grid's own 3-bin window sum; null when the grid's window holds no energy at all.
    ratio: number | null;
    phaseWins: number;
    phaseBeats: number;
    // True when phaseBeats was reset to 0 by this beat.
    phaseBeatsReset: boolean;
    // The onset the correction chose, as its offset from the predicted beat in ms; null when the beat was a miss.
    peakOffsetMs: number | null;
    period: number;
    phaseShiftCount: number;
    gridEpoch: number;
    // The move of the grid this beat made, as a fraction of a beat; null when the grid did not move.
    moveOffset: number | null;
    // The scorecard's own beat for this row and its error against the nearest tap in ms (replay beat minus tap). The
    // scorecard derives its beats from the rise of the beat counter and the phase, which is not always the declared beat
    // (see TraceSummary.beatsDiffering), so its median error is the one over these. null when the two lists do not line
    // up one to one (different counts) or there is no sidecar.
    scorecardTime: number | null;
    scorecardErrorMs: number | null;
}

export interface WindowMedian {
    // Start of the window in seconds.
    start: number;
    // Median absolute error in ms of the beats inside it; null when it has none with an error.
    medianAbsErrorMs: number | null;
    beats: number;
}

export interface TraceSummary {
    // The scorecard's lock time and its beat.errorMedianMs for the track; null where the scorecard has none.
    lockSeconds: number | null;
    beatErrorMedianMs: number | null;
    // The dancer's gate and tempo lock, from the same replay the scorecard uses.
    gateFirstOpenSeconds: number | null;
    dancerLockSeconds: number | null;
    // How many declared beats differ (by more than 1 microsecond) from the beat the replay derives for the same index;
    // null when the two lists have different lengths and cannot be paired.
    beatsDiffering: number | null;
}

export interface TraceArguments {
    wav: string;
    overrides: Override[];
    from: number;
    to: number;
    windowSeconds: number;
    json: string | undefined;
}

export const TRACE_USAGE = `Usage: npm run trace:beats -- <wav> [--set NAME=VALUE]... [--from S] [--to S] [--window S] [--json <file>]

Runs the app's rhythm pipeline over one WAV exactly as the offline scorecard does (AGC first, batches of frames) and prints
one row per declared beat:
  time    seconds of the beat
  err     beat minus the nearest tap of the sibling <name>.beats.json in ms (blank without one)
  bin/off the phase check's best place: bin index (0 is the grid) and its fraction of a beat from the grid
  ratio   best 3-bin window sum / the grid's 3-bin window sum
  wins    phaseWins (consecutive beats the best place beat the grid)
  beats   phaseBeats, marked with * on the rows where this beat reset it to 0
  peak    the offset in ms of the onset the correction chose; blank when the beat was a miss
  period  seconds; shifts = phaseShiftCount; epoch = gridEpoch
  mv      the fraction of a beat the grid moved at this beat (the bin/off/ratio are then those that caused the move)
The header gives the tracker's lock time, the dancer's gate first opening and dancer lock, and the scorecard's
beat.errorMedianMs for the track, which equals the one \`npm run scorecard\` writes at default constants. The median
error per window shows when the grid settles.

Options:
  --set NAME=VALUE   Override a constant of app/features/rhythm/rhythmConfig.ts, as ablate:rhythm does. Repeatable.
  --from S, --to S   Only print the rows of beats from S to S seconds (the summary always covers the whole track).
  --window S         Seconds per window of the median-error list (default 5).
  --json <file>      Also write the header, windows and every row as JSON for scripted analysis.
  --help             Show this text.`;

export function parseTraceArguments(argv: readonly string[]): TraceArguments | undefined {
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return undefined;
    const result: TraceArguments = {
        wav: '',
        overrides: [],
        from: 0,
        to: Infinity,
        windowSeconds: 5,
        json: undefined,
    };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined) throw new Error(`${argument} needs a value`);
            return next;
        };
        const seconds = (text: string): number => {
            const number = Number(text);
            if (text.trim() === '' || !Number.isFinite(number) || number < 0) {
                throw new Error(`${argument} needs a number of seconds, got "${text}"`);
            }
            return number;
        };
        switch (argument) {
            case '--set':
                result.overrides.push(parseOverride(value()));
                break;
            case '--from':
                result.from = seconds(value());
                break;
            case '--to':
                result.to = seconds(value());
                break;
            case '--window':
                result.windowSeconds = seconds(value());
                if (result.windowSeconds === 0) throw new Error('--window must be above 0');
                break;
            case '--json':
                result.json = value();
                break;
            default:
                if (argument.startsWith('--')) throw new Error(`Unknown option ${argument}`);
                if (result.wav !== '')
                    throw new Error(`Only one WAV file at a time, got "${result.wav}" and "${argument}"`);
                result.wav = argument;
        }
    }
    if (result.wav === '') throw new Error('Missing <wav>');
    if (result.to < result.from) throw new Error('--to must not be below --from');
    const seen = new Set<string>();
    for (const { name } of result.overrides) {
        if (seen.has(name)) throw new Error(`--set ${name} was given twice`);
        seen.add(name);
    }
    return result;
}

// The tap nearest to `time` (ascending list), or undefined without taps. A tie goes to the earlier tap.
function nearestTap(taps: readonly number[], time: number): number | undefined {
    if (taps.length === 0) return undefined;
    let low = 0;
    let high = taps.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (taps[middle] < time) low = middle + 1;
        else high = middle;
    }
    const after = taps[low];
    const before = low > 0 ? taps[low - 1] : after;
    return Math.abs(before - time) <= Math.abs(after - time) ? before : after;
}

// Signed error in ms of a beat against the nearest tap: beat minus tap. null without taps.
export function nearestTapErrorMs(taps: readonly number[], time: number): number | null {
    const tap = nearestTap(taps, time);
    return tap === undefined ? null : (time - tap) * 1000;
}

function medianOf(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// The median absolute error per window of `windowSeconds` from time 0 to the last beat. Windows with no beat are kept (null)
// so a gap in the beats is visible.
export function medianByWindow(
    rows: readonly Pick<TraceRow, 'time' | 'errorMs'>[],
    windowSeconds: number,
): WindowMedian[] {
    if (rows.length === 0) return [];
    const count = Math.floor(rows[rows.length - 1].time / windowSeconds) + 1;
    const groups: number[][] = Array.from({ length: count }, () => []);
    const beats = new Array<number>(count).fill(0);
    for (const row of rows) {
        const index = Math.floor(row.time / windowSeconds);
        beats[index]++;
        if (row.errorMs !== null) groups[index].push(Math.abs(row.errorMs));
    }
    return groups.map((errors, index) => ({
        start: index * windowSeconds,
        medianAbsErrorMs: errors.length === 0 ? null : medianOf(errors),
        beats: beats[index],
    }));
}

// Best 3-bin window sum over the grid's: null when the grid's own window is empty (the ratio would be infinite or 0/0).
export function windowRatio(bestSum: number, onGridSum: number): number | null {
    return onGridSum > 0 ? bestSum / onGridSum : null;
}

const fixed = (value: number | null, digits: number): string => (value === null ? '' : value.toFixed(digits));

const COLUMNS = [
    'time',
    'err',
    'bin',
    'off',
    'ratio',
    'wins',
    'beats',
    'peak',
    'period',
    'shifts',
    'epoch',
    'mv',
    'sc_dt',
    'sc_err',
];

// Declared beat to the scorecard's beat for the row, in ms (scorecard minus declared); null without one.
export function scorecardDeltaMs(row: Pick<TraceRow, 'time' | 'scorecardTime'>): number | null {
    return row.scorecardTime === null ? null : (row.scorecardTime - row.time) * 1000;
}

export function formatRow(row: TraceRow): string[] {
    return [
        row.time.toFixed(3),
        fixed(row.errorMs, 1),
        String(row.bin),
        row.offset.toFixed(3),
        fixed(row.ratio, 2),
        String(row.phaseWins),
        `${row.phaseBeats}${row.phaseBeatsReset ? '*' : ''}`,
        fixed(row.peakOffsetMs, 1),
        row.period.toFixed(4),
        String(row.phaseShiftCount),
        String(row.gridEpoch),
        fixed(row.moveOffset, 3),
        fixed(scorecardDeltaMs(row), 1),
        fixed(row.scorecardErrorMs, 1),
    ];
}

// The rows as an aligned table, right-justified, with the column names first.
export function formatRows(rows: readonly TraceRow[]): string[] {
    const cells = [COLUMNS, ...rows.map(formatRow)];
    const widths = COLUMNS.map((_name, column) => Math.max(...cells.map((line) => line[column].length)));
    return cells.map((line) =>
        line
            .map((cell, column) => cell.padStart(widths[column]))
            .join('  ')
            .trimEnd(),
    );
}

const seconds = (value: number | null): string => (value === null ? 'never' : `${value.toFixed(2)} s`);

export function formatHeader(name: string, overrides: readonly Override[], summary: TraceSummary): string[] {
    const lines = [`${name}${overrides.map((o) => ` ${o.name}=${o.value}`).join('')}`];
    lines.push(`tracker lock (scorecard): ${seconds(summary.lockSeconds)}`);
    lines.push(`dancer gate first open: ${seconds(summary.gateFirstOpenSeconds)}`);
    lines.push(`dancerLockSeconds: ${seconds(summary.dancerLockSeconds)}`);
    lines.push(
        `beat.errorMedianMs (scorecard): ${summary.beatErrorMedianMs === null ? 'none' : summary.beatErrorMedianMs.toFixed(1)}`,
    );
    if (summary.beatsDiffering === null) {
        lines.push("note: the declared beats and the scorecard's beats differ in count; sc_dt and sc_err are blank");
    } else if (summary.beatsDiffering > 0) {
        lines.push(
            `note: ${summary.beatsDiffering} declared beats differ from the scorecard's beat for the same index (sc_dt); the scorecard median is over the scorecard's beats`,
        );
    }
    return lines;
}

// The windows of the declared beats' error and of the scorecard beats' error side by side.
export function formatWindows(
    declared: readonly WindowMedian[],
    scorecard: readonly WindowMedian[],
    windowSeconds: number,
): string[] {
    const cell = (value: number | null): string => (value === null ? '-' : value.toFixed(1)).padStart(7);
    return [
        `median |error| in ms per ${windowSeconds} s window (start s, declared beats, scorecard beats, beat count):`,
        ...declared.map(
            (window, index) =>
                `  ${window.start.toFixed(0).padStart(5)} ${cell(window.medianAbsErrorMs)} ${cell(scorecard[index]?.medianAbsErrorMs ?? null)}  (${window.beats})`,
        ),
    ];
}

// Beats whose time is inside [from, to].
export function selectRows(rows: readonly TraceRow[], from: number, to: number): TraceRow[] {
    return rows.filter((row) => row.time >= from && row.time <= to);
}

// How many of two beat lists' entries, paired by index, are further apart than `tolerance` seconds; null when the lists
// have different lengths and cannot be paired.
export function countDiffering(a: readonly number[], b: readonly number[], tolerance = 1e-6): number | null {
    if (a.length !== b.length) return null;
    return a.filter((time, index) => Math.abs(time - b[index]) > tolerance).length;
}
