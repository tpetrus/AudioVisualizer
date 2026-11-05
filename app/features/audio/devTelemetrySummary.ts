// Pure helpers for the DEV telemetry recorder: write a recording as CSV, read it back, and condense it into a short
// text summary that shows whether a visualizer's bass response fades over a long track. No DOM and no node APIs, so
// the browser recorder, the node CLI and the specs can all share it.

export interface TelemetryTable {
    columns: string[];
    rows: number[][];
}

export interface SummaryOptions {
    /** Preferred window length in seconds of track time. Widened when the output would exceed maxLines. */
    windowSeconds?: number;
    /** A window is flagged FALLOFF when its out/in ratio is below (1 - dropThreshold) times the baseline ratio. */
    dropThreshold?: number;
    /** Windows whose mean fps is below this are marked unreliable and never flagged. */
    minFps?: number;
    /** Upper bound for the number of output lines. */
    maxLines?: number;
}

const DEFAULTS = { windowSeconds: 5, dropThreshold: 0.5, minFps: 50, maxLines: 60 };
// Below this mean input the out/in ratio is noise, so it is left blank.
const MIN_MEAN_INPUT = 1e-4;
// Three header lines, the column header and the verdict.
const FIXED_LINES = 5;
const REQUIRED_COLUMNS = ['t', 'fps', 'bassRaw', 'gain'];

function significant(value: number, digits: number): string {
    // Non-finite values stay visible so a broken probe is not hidden as a quiet one.
    if (!Number.isFinite(value)) return 'NaN';
    // Number() drops the trailing zeros toPrecision adds.
    return String(Number(value.toPrecision(digits)));
}

export function formatTelemetryCsv(columns: readonly string[], data: ArrayLike<number>, rowCount: number): string {
    const width = columns.length;
    const lines: string[] = [columns.join(',')];
    for (let r = 0; r < rowCount; r++) {
        const cells: string[] = [];
        for (let c = 0; c < width; c++) cells.push(significant(data[r * width + c], 5));
        lines.push(cells.join(','));
    }
    return lines.join('\n') + '\n';
}

export function parseTelemetryCsv(text: string): TelemetryTable {
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) throw new Error('CSV is empty');
    const columns = lines[0].split(',').map((name) => name.trim());
    if (columns.some((name) => name === '')) throw new Error('CSV header has an empty column name');
    const rows: number[][] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',');
        if (cells.length !== columns.length) {
            throw new Error(`CSV line ${i + 1} has ${cells.length} values, expected ${columns.length}`);
        }
        const row = cells.map((cell) => (cell.trim() === '' ? NaN : Number(cell)));
        // A literal NaN cell is data written by the recorder; anything else non-numeric is a corrupt file.
        const bad = row.findIndex((value, c) => !Number.isFinite(value) && cells[c].trim() !== 'NaN');
        if (bad >= 0) throw new Error(`CSV line ${i + 1}, column "${columns[bad]}" is not a number: "${cells[bad]}"`);
        rows.push(row);
    }
    return { columns, rows };
}

interface Window {
    start: number;
    end: number;
    count: number;
    // Per-field counts of finite values, so NaN samples are left out of the means.
    n: Record<'bassRaw' | 'input' | 'output' | 'gain' | 'fps', number>;
    bassRaw: number;
    input: number;
    output: number;
    gain: number;
    fps: number;
}

const pad = (text: string, width: number) => text.padStart(width);

export function summarizeTelemetry(table: TelemetryTable, options: SummaryOptions = {}): string[] {
    const windowSeconds = options.windowSeconds ?? DEFAULTS.windowSeconds;
    const dropThreshold = options.dropThreshold ?? DEFAULTS.dropThreshold;
    const minFps = options.minFps ?? DEFAULTS.minFps;
    const maxLines = options.maxLines ?? DEFAULTS.maxLines;

    const missing = REQUIRED_COLUMNS.filter((name) => !table.columns.includes(name));
    if (missing.length > 0) throw new Error(`Telemetry is missing the column(s): ${missing.join(', ')}`);
    if (table.rows.length === 0) return ['Telemetry is empty (0 rows).'];

    const col = (name: string) => table.columns.indexOf(name);
    const tCol = col('t');
    const fpsCol = col('fps');
    const rawCol = col('bassRaw');
    const gainCol = col('gain');
    const inName = table.columns.find(
        (name) => name.endsWith('.in') && table.columns.includes(`${name.slice(0, -3)}.out`),
    );
    const prefix = inName === undefined ? undefined : inName.slice(0, -3);
    const inCol = prefix === undefined ? -1 : col(`${prefix}.in`);
    const outCol = prefix === undefined ? -1 : col(`${prefix}.out`);

    let tMin = Infinity;
    let tMax = -Infinity;
    for (const row of table.rows) {
        tMin = Math.min(tMin, row[tCol]);
        tMax = Math.max(tMax, row[tCol]);
    }
    const duration = tMax - tMin;

    // Widen the window so the table plus the fixed lines fit in maxLines.
    const maxWindows = Math.max(1, maxLines - FIXED_LINES);
    const width = Math.max(windowSeconds, duration / maxWindows);
    const count = Math.max(1, Math.min(maxWindows, Math.ceil(duration / width)));

    const sparse: (Window | undefined)[] = [];
    for (const row of table.rows) {
        const index = Math.min(count - 1, Math.floor((row[tCol] - tMin) / width));
        let w = sparse[index];
        if (w === undefined) {
            const start = tMin + index * width;
            w = {
                start,
                end: start + width,
                count: 0,
                n: { bassRaw: 0, input: 0, output: 0, gain: 0, fps: 0 },
                bassRaw: 0,
                input: 0,
                output: 0,
                gain: 0,
                fps: 0,
            };
            sparse[index] = w;
        }
        w.count++;
        const add = (key: keyof Window['n'], value: number) => {
            if (Number.isNaN(value)) return;
            w![key] += value;
            w!.n[key]++;
        };
        add('bassRaw', row[rawCol]);
        add('gain', row[gainCol]);
        add('fps', row[fpsCol]);
        if (inCol >= 0) {
            add('input', row[inCol]);
            add('output', row[outCol]);
        }
    }
    const used = sparse.filter((w): w is Window => w !== undefined);
    for (const w of used) {
        for (const key of ['bassRaw', 'gain', 'fps', 'input', 'output'] as const) {
            w[key] = w.n[key] === 0 ? NaN : w[key] / w.n[key];
        }
    }

    const ratioOf = (w: Window): number | undefined => (w.input < MIN_MEAN_INPUT ? undefined : w.output / w.input);
    const reliable = (w: Window) => w.fps >= minFps;
    const baselineWindow = inCol < 0 ? undefined : used.find((w) => reliable(w) && ratioOf(w) !== undefined);
    const baseline = baselineWindow === undefined ? undefined : ratioOf(baselineWindow);

    const lines: string[] = [];
    lines.push(
        `rows ${table.rows.length}, duration ${significant(duration, 3)} s (t ${significant(tMin, 3)} to ${significant(tMax, 3)})`,
    );
    if (prefix === undefined) {
        lines.push('no <name>.in / <name>.out columns: only bassRaw and gain are summarized, no falloff check');
    } else {
        lines.push(
            `probe ${prefix}: ${prefix}.in -> ${prefix}.out, window ${significant(width, 3)} s, fps floor ${minFps}`,
        );
    }
    lines.push(
        baseline === undefined
            ? 'baseline ratio: none (no reliable window with a usable input)'
            : `baseline ratio ${significant(baseline, 3)}, FALLOFF below ${significant((1 - dropThreshold) * baseline, 3)}`,
    );

    const head = [pad('window (s)', 15), pad('bassRaw', 8)];
    if (inCol >= 0) head.push(pad('in', 8), pad('out', 8), pad('ratio', 8));
    head.push(pad('gain', 8), pad('fps', 7), '  status');
    lines.push(head.join(' '));

    let flagged = 0;
    let unreliable = 0;
    for (const w of used) {
        const ratio = ratioOf(w);
        let status = '';
        if (!reliable(w)) {
            status = 'unreliable';
            unreliable++;
        } else if (baseline !== undefined && ratio !== undefined && ratio < (1 - dropThreshold) * baseline) {
            status = 'FALLOFF';
            flagged++;
        }
        const cells = [
            pad(`${significant(w.start, 3)}-${significant(Math.min(w.end, tMax), 3)}`, 15),
            pad(significant(w.bassRaw, 3), 8),
        ];
        if (inCol >= 0) {
            cells.push(
                pad(significant(w.input, 3), 8),
                pad(significant(w.output, 3), 8),
                pad(ratio === undefined ? '' : significant(ratio, 3), 8),
            );
        }
        cells.push(pad(significant(w.gain, 3), 8), pad(significant(w.fps, 3), 7), `  ${status}`);
        lines.push(cells.join(' ').trimEnd());
    }

    const unreliableNote = unreliable > 0 ? `, ${unreliable} unreliable (fps below ${minFps})` : '';
    if (inCol < 0) {
        lines.push(`${used.length} windows${unreliableNote}`);
    } else if (flagged > 0) {
        lines.push(`VERDICT: ${flagged} of ${used.length} windows flagged FALLOFF${unreliableNote}`);
    } else {
        lines.push(`VERDICT: no FALLOFF in ${used.length} windows${unreliableNote}`);
    }
    return lines;
}
