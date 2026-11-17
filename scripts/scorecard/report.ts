// Renders a scorecard as markdown. The output depends only on the scorecard (cells keep their order), so two runs
// that measure the same thing produce the same text and a diff shows only what changed.

import { unitOf, type MetricUnit } from './targets';
import type { Scorecard, ScorecardCell } from './types';

function formatNumber(value: number | null, unit: MetricUnit): string {
    if (value === null) return '-';
    if (unit === 'seconds') return value.toFixed(2);
    if (unit === 'ms') return value.toFixed(1);
    if (unit === 'count') return String(value);
    return value.toFixed(3);
}

// A group is the part of the metric id before the first dot: tempo, beat, onset, gate, ac9.
function groupOf(metric: string): string {
    const dot = metric.indexOf('.');
    return dot === -1 ? metric : metric.slice(0, dot);
}

function row(cell: ScorecardCell): string {
    const unit = unitOf(cell.metric);
    const status = cell.blocking || cell.status === 'n/a' ? cell.status : `${cell.status} (report-only)`;
    return `| ${cell.metric} | ${cell.track} | ${cell.class} | ${formatNumber(cell.value, unit)} | ${formatNumber(cell.floor, unit)} | ${formatNumber(cell.stretch, unit)} | ${formatNumber(cell.prehub, unit)} | ${status} |`;
}

// `notes` carries caveats the cells cannot, such as an unobservable scenario count.
export function renderMarkdown(scorecard: Scorecard, notes: string[] = []): string {
    const applicable = scorecard.cells.filter((cell) => cell.applicable);
    const count = (status: ScorecardCell['status']): number =>
        applicable.filter((cell) => cell.status === status).length;
    const blockingFailures = applicable.filter((cell) => cell.blocking && !cell.pass).length;

    const lines: string[] = [
        '# Scorecard',
        '',
        `Targets version ${scorecard.header.targetsVersion}, revision ${scorecard.header.revision}, created ${scorecard.header.created}.`,
        '',
        `Applicable cells ${applicable.length}: ${count('pass')} passing, ${count('fail')} failing, ${count('unavailable')} unavailable. Blocking failures: ${blockingFailures}.`,
    ];
    if (notes.length > 0) {
        lines.push('', ...notes.map((note) => `- ${note}`));
    }

    const groups = new Map<string, ScorecardCell[]>();
    for (const cell of scorecard.cells) {
        const group = groupOf(cell.metric);
        groups.set(group, [...(groups.get(group) ?? []), cell]);
    }
    for (const [group, cells] of groups) {
        lines.push(
            '',
            `## ${group}`,
            '',
            '| Metric | Track | Class | Value | Floor | Stretch | Pre-hub | Status |',
            '|---|---|---|---|---|---|---|---|',
            ...cells.map(row),
        );
    }
    return `${lines.join('\n')}\n`;
}
