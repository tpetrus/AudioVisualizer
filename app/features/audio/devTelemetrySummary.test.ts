import { describe, expect, it } from 'vitest';
import { formatTelemetryCsv, parseTelemetryCsv, summarizeTelemetry } from './devTelemetrySummary';
import type { TelemetryTable } from './devTelemetrySummary';

const COLUMNS = ['t', 'dt', 'fps', 'bassRaw', 'bassPost', 'gain', 'cubes.in', 'cubes.out'];

// Builds a table of `seconds` of rows at `fps`. `ratioAt` gives the out/in ratio at progress 0..1.
function synth(seconds: number, fps: number, ratioAt: (progress: number) => number, input = 0.5): TelemetryTable {
    const rows: number[][] = [];
    const count = Math.round(seconds * fps);
    for (let i = 0; i < count; i++) {
        const t = i / fps;
        rows.push([t, 1 / fps, fps, 0.3, 0.3, 1, input, input * ratioAt(t / seconds)]);
    }
    return { columns: COLUMNS, rows };
}

const flagged = (lines: string[]) => lines.filter((line) => !line.startsWith('VERDICT') && line.endsWith('FALLOFF'));
const unreliable = (lines: string[]) => lines.filter((line) => line.endsWith('unreliable'));

describe('CSV', () => {
    it('round trips with five significant digits', () => {
        const data = new Float32Array([0.123456789, 1234567.8, 0, 1, 2, 3]);
        const csv = formatTelemetryCsv(['a', 'b', 'c'], data, 2);
        expect(csv).toBe('a,b,c\n0.12346,1234600,0\n1,2,3\n');
        expect(parseTelemetryCsv(csv)).toEqual({
            columns: ['a', 'b', 'c'],
            rows: [
                [0.12346, 1234600, 0],
                [1, 2, 3],
            ],
        });
    });

    it('writes non-finite values as NaN and respects rowCount', () => {
        const csv = formatTelemetryCsv(['a'], [NaN, Infinity, 7], 2);
        expect(csv).toBe('a\nNaN\nNaN\n');
    });

    it('parses CRLF and ignores trailing blank lines; a header alone has no rows', () => {
        expect(parseTelemetryCsv('a,b\r\n1,2\r\n\r\n')).toEqual({ columns: ['a', 'b'], rows: [[1, 2]] });
        expect(parseTelemetryCsv('a,b\n')).toEqual({ columns: ['a', 'b'], rows: [] });
    });

    it('rejects malformed files with a one-line error', () => {
        expect(() => parseTelemetryCsv('')).toThrow('CSV is empty');
        expect(() => parseTelemetryCsv(' \n\n')).toThrow('CSV is empty');
        expect(() => parseTelemetryCsv('a,,c\n1,2,3')).toThrow('empty column name');
        expect(() => parseTelemetryCsv('a,b\n1,2\n3')).toThrow('line 3 has 1 values, expected 2');
        expect(() => parseTelemetryCsv('a,b\n1,x')).toThrow('line 2, column "b" is not a number: "x"');
        expect(() => parseTelemetryCsv('a,b\n1,')).toThrow('not a number');
        for (const bad of ['', 'a,b\n1,2\n3', 'a\nx']) {
            try {
                parseTelemetryCsv(bad);
            } catch (error) {
                expect((error as Error).message).not.toContain('\n');
            }
        }
    });
});

describe('summarizeTelemetry', () => {
    it('reports no falloff for a steady response at 60 fps', () => {
        const lines = summarizeTelemetry(synth(60, 60, () => 0.8));
        expect(flagged(lines)).toHaveLength(0);
        expect(unreliable(lines)).toHaveLength(0);
        expect(lines[0]).toContain('rows 3600');
        expect(lines[1]).toContain('cubes.in -> cubes.out');
        expect(lines[2]).toContain('baseline ratio 0.8');
        expect(lines.at(-1)).toBe('VERDICT: no FALLOFF in 12 windows');
        // header lines, column header, 12 windows, verdict
        expect(lines).toHaveLength(17);
    });

    it('flags the late windows when the response decays relative to the input', () => {
        const lines = summarizeTelemetry(synth(60, 60, (p) => 1 - 0.8 * p));
        const hits = flagged(lines);
        expect(hits.length).toBeGreaterThan(0);
        expect(lines.slice(5, 7).some((line) => line.endsWith('FALLOFF'))).toBe(false);
        expect(lines.at(-2)).toContain('FALLOFF');
        expect(lines.at(-1)).toBe(`VERDICT: ${hits.length} of 12 windows flagged FALLOFF`);
    });

    it('marks low-fps windows unreliable and never flags them', () => {
        const lines = summarizeTelemetry(synth(60, 30, (p) => 1 - 0.8 * p));
        expect(flagged(lines)).toHaveLength(0);
        expect(unreliable(lines)).toHaveLength(12);
        expect(lines[2]).toContain('baseline ratio: none');
        expect(lines.at(-1)).toBe('VERDICT: no FALLOFF in 12 windows, 12 unreliable (fps below 50)');
    });

    it('keeps one output at most maxLines for a two hour table', () => {
        const rows: number[][] = [];
        for (let t = 0; t < 7200; t += 0.5) rows.push([t, 0.0167, 60, 0.3, 0.3, 1, 0.5, 0.4]);
        const lines = summarizeTelemetry({ columns: COLUMNS, rows });
        expect(lines.length).toBeLessThanOrEqual(60);
        expect(lines.length).toBeGreaterThan(30);
        expect(lines[1]).toMatch(/window \d+(\.\d+)? s/);
        expect(summarizeTelemetry({ columns: COLUMNS, rows }, { maxLines: 10 }).length).toBeLessThanOrEqual(10);
        expect(summarizeTelemetry({ columns: COLUMNS, rows }, { maxLines: 1 }).length).toBeLessThanOrEqual(6);
    });

    it('honors custom options', () => {
        const table = synth(60, 60, (p) => 1 - 0.3 * p);
        // A 30 percent decay is not a falloff at the default threshold but is at 0.1.
        expect(flagged(summarizeTelemetry(table))).toHaveLength(0);
        expect(flagged(summarizeTelemetry(table, { dropThreshold: 0.1 })).length).toBeGreaterThan(0);
        expect(summarizeTelemetry(table, { windowSeconds: 10 })).toHaveLength(11);
        expect(unreliable(summarizeTelemetry(table, { minFps: 100 }))).toHaveLength(12);
        expect(summarizeTelemetry(table, { maxLines: 8 }).length).toBeLessThanOrEqual(8);
    });

    it('leaves the ratio blank when the input is near zero', () => {
        const lines = summarizeTelemetry(synth(10, 60, () => 1, 1e-6));
        expect(lines[2]).toContain('baseline ratio: none');
        const row = lines[4].split(/\s+/).filter(Boolean);
        // window, bassRaw, in, out, gain, fps: no ratio value between out and gain
        expect(row).toHaveLength(6);
    });

    it('uses a later window as baseline when the first has no usable input', () => {
        const table = synth(20, 60, () => 0.5);
        for (const row of table.rows) if (row[0] < 5) row[6] = 0;
        const lines = summarizeTelemetry(table);
        expect(lines[2]).toContain('baseline ratio 0.5');
    });

    it('summarizes bassRaw and gain when there are no in/out columns', () => {
        const table: TelemetryTable = {
            columns: ['t', 'dt', 'fps', 'bassRaw', 'bassPost', 'gain'],
            rows: [
                [0, 0.016, 60, 0.2, 0.2, 1],
                [1, 0.016, 30, 0.4, 0.4, 2],
            ],
        };
        const lines = summarizeTelemetry(table);
        expect(lines[1]).toContain('no <name>.in / <name>.out columns');
        expect(lines[3]).not.toContain('ratio');
        expect(lines.at(-1)).toBe('1 windows, 1 unreliable (fps below 50)');
    });

    it('ignores an .in column that has no matching .out', () => {
        const table: TelemetryTable = { columns: ['t', 'fps', 'bassRaw', 'gain', 'x.in'], rows: [[0, 60, 1, 1, 1]] };
        expect(summarizeTelemetry(table)[1]).toContain('no <name>.in');
    });

    it('handles an empty table and a single row', () => {
        expect(summarizeTelemetry({ columns: COLUMNS, rows: [] })).toEqual(['Telemetry is empty (0 rows).']);
        const lines = summarizeTelemetry({ columns: COLUMNS, rows: [[3, 0.016, 60, 0.3, 0.3, 1, 0.5, 0.4]] });
        expect(lines[0]).toContain('duration 0 s');
        expect(lines.at(-1)).toBe('VERDICT: no FALLOFF in 1 windows');
    });

    it('skips windows that hold no rows', () => {
        const table: TelemetryTable = {
            columns: COLUMNS,
            rows: [
                [0, 0.016, 60, 0.3, 0.3, 1, 0.5, 0.4],
                [30, 0.016, 60, 0.3, 0.3, 1, 0.5, 0.4],
            ],
        };
        expect(summarizeTelemetry(table).at(-1)).toBe('VERDICT: no FALLOFF in 2 windows');
    });

    it('throws a one-line error when a base column is missing', () => {
        const table: TelemetryTable = { columns: ['t', 'bassRaw'], rows: [[0, 1]] };
        expect(() => summarizeTelemetry(table)).toThrow('Telemetry is missing the column(s): fps, gain');
    });

    it('ends a partial final window at the last sample instead of the nominal end', () => {
        const table: TelemetryTable = {
            columns: COLUMNS,
            rows: [0, 2, 5.01, 7.98].map((t) => [t, 0.016, 60, 0.3, 0.3, 1, 0.5, 0.4]),
        };
        const labels = summarizeTelemetry(table, { windowSeconds: 5 }).filter((line) => /^\s*\d/.test(line));
        expect(labels[0].trim()).toMatch(/^0-5\s/);
        expect(labels[1].trim()).toMatch(/^5\.01-7\.98\s/);
    });

    it('writes non-finite values as NaN and reads them back', () => {
        const csv = formatTelemetryCsv(['a', 'b', 'c'], [NaN, Infinity, 1.5], 1);
        expect(csv).toBe('a,b,c\nNaN,NaN,1.5\n');
        const table = parseTelemetryCsv(csv);
        expect(table.rows[0][0]).toBeNaN();
        expect(table.rows[0][2]).toBe(1.5);
        expect(() => parseTelemetryCsv('a\nabc\n')).toThrow('not a number');
    });

    it('leaves NaN values out of the window means', () => {
        const table: TelemetryTable = {
            columns: COLUMNS,
            rows: [
                [0, 0.016, 60, 0.4, 0.3, 1, 0.5, 0.4],
                [1, 0.016, 60, NaN, 0.3, 1, 0.5, 0.4],
            ],
        };
        const row = summarizeTelemetry(table).find((line) => /^\s*0-1\s/.test(line));
        expect(row).toMatch(/0-1\s+0\.4\s/);
    });
});
