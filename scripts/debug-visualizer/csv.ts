import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';

// The recorder's CSV writer and reader for the scripts. They replace the ones in app/features/audio/devTelemetrySummary.ts,
// which write every non-finite value as NaN: an Infinity (such as a probe that reports "never") was unreadable as one
// afterwards. Here NaN, Infinity and -Infinity each keep their own spelling and read back the same.

function cellText(value: number): string {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    // Number() drops the trailing zeros toPrecision adds.
    return String(Number(value.toPrecision(5)));
}

export function formatCsv(columns: readonly string[], data: ArrayLike<number>, rowCount: number): string {
    const width = columns.length;
    const lines: string[] = [columns.join(',')];
    for (let r = 0; r < rowCount; r++) {
        const cells: string[] = [];
        for (let c = 0; c < width; c++) cells.push(cellText(data[r * width + c]));
        lines.push(cells.join(','));
    }
    return lines.join('\n') + '\n';
}

export function parseCsv(text: string): TelemetryTable {
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
        // A literal NaN or infinite cell is data written by the recorder; anything else non-numeric is a corrupt file.
        const bad = row.findIndex((value, c) => Number.isNaN(value) && !['', 'NaN'].includes(cells[c].trim()));
        if (bad >= 0) throw new Error(`CSV line ${i + 1}, column "${columns[bad]}" is not a number: "${cells[bad]}"`);
        rows.push(row);
    }
    return { columns, rows };
}
