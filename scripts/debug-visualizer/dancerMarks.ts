import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';

// The dancer's placement, phase onset and load-time columns (hub-followups S3), as one summary line. A CSV recorded
// before those columns existed, or of another visualizer, has none of them: that is not an error, it just prints nothing.
// The two marks are on the recording's `t` clock (see "Dancer marks" in docs/agents/debug-harness.md), so a negative one
// was made before the track started.
export function dancerMarksLines(table: TelemetryTable): string[] {
    const placed = table.columns.findIndex((name) => name.endsWith('.placedKicks'));
    if (placed < 0 || table.rows.length === 0) return [];
    const prefix = table.columns[placed].slice(0, -'placedKicks'.length);
    const last = table.rows[table.rows.length - 1];
    const parts = [`placed kicks ${last[placed]}`];
    const at = (name: string) => table.columns.indexOf(`${prefix}${name}`);
    const phase = at('phaseOnsets');
    if (phase >= 0) parts.push(`phase onsets ${last[phase]}`);
    for (const [name, label] of [
        ['sceneBuiltAt', 'scene built at'],
        ['modelParsedAt', 'model parsed at'],
    ] as const) {
        const index = at(name);
        if (index < 0) continue;
        const value = last[index];
        parts.push(Number.isNaN(value) ? `${label} never` : `${label} ${Number(value.toFixed(2))} s`);
    }
    return [`Dancer marks: ${parts.join(', ')}.`];
}
