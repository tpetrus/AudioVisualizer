// The order report (contract C-ORDER-REPORT): the JSON shape, the markdown table and the one-line summary. Pure.

import type { OrderRow } from './compare';

export interface OrderHeader {
    targetsVersion: number;
    revision: string;
    created: string;
    // header.revision of hub-scorecard.live.json, the build the reaction cells were measured on; null without that file.
    liveRevision: string | null;
}

export interface OrderReport {
    header: OrderHeader;
    rows: OrderRow[];
}

export interface OrderCounts {
    pass: number;
    fail: number;
    unjudged: number;
}

export function countRows(rows: readonly OrderRow[]): OrderCounts {
    return {
        pass: rows.filter((row) => row.pass === true).length,
        fail: rows.filter((row) => row.pass === false).length,
        unjudged: rows.filter((row) => row.pass === null).length,
    };
}

const cell = (value: number | null): string => (value === null ? '-' : String(Math.round(value * 10000) / 10000));
const verdict = (pass: boolean | null): string => (pass === null ? 'n/a' : pass ? 'pass' : 'FAIL');

export function renderMarkdown(report: OrderReport): string {
    const { header, rows } = report;
    const counts = countRows(rows);
    const lines = [
        '# Order scorecard (AC11)',
        '',
        `Targets version ${header.targetsVersion}, revision ${header.revision}, created ${header.created}, live cells from ${header.liveRevision ?? 'no live file'}.`,
        '',
        `${rows.length} rows: ${counts.pass} pass, ${counts.fail} fail, ${counts.unjudged} not judged.`,
        '',
        'Hub rows: first is the run-to-run distance within one condition, second the distance between conditions (RMS, 10 ms grid). Reaction rows: first and second are the medians when the visualizer led and followed; allowed is the live cell spread.',
        '',
        '| Pair | Track | Visualizer | Signal | Kind | First | Second | Allowed | Result | Note |',
        '|---|---|---|---|---|---|---|---|---|---|',
        ...rows.map(
            (row) =>
                `| ${row.pair} | ${row.track} | ${row.visualizer} | ${row.signal} | ${row.kind} | ${cell(row.first)} | ${cell(row.second)} | ${cell(row.allowed)} | ${verdict(row.pass)} | ${row.note ?? ''} |`,
        ),
        '',
    ];
    return lines.join('\n');
}

export function summaryLine(rows: readonly OrderRow[]): string {
    const counts = countRows(rows);
    return `${rows.length} order rows: ${counts.pass} pass, ${counts.fail} fail, ${counts.unjudged} not judged (a report, not a gate).`;
}
