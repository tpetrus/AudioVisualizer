// The order report (contract C-ORDER-REPORT): the JSON shape, the markdown table and the one-line summary. Pure.

import type { OrderRow } from './compare';

export interface OrderHeader {
    targetsVersion: number;
    revision: string;
    created: string;
    // Seconds the sessions waited after moving to the second visualizer (debug:viz --settle).
    settle: number;
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
        `Targets version ${header.targetsVersion}, revision ${header.revision}, created ${header.created}, settle ${header.settle} s, live cells from ${header.liveRevision ?? 'no live file'}.`,
        '',
        `${rows.length} rows: ${counts.pass} pass, ${counts.fail} fail, ${counts.unjudged} not judged.`,
        '',
        "Per visualizer: lead runs are its first play of a session it led, self runs its second play after itself (the control), other runs its second play after the other visualizer. Hub rows (RMS, 10 ms grid): after itself is the median distance from the lead runs to the self runs, after the other the median distance to the other runs, allowed the larger of the lead runs' own spread and after itself. Reaction rows: after itself and after the other are the medians of the self and other runs; allowed is the larger of the live cell spread and the spread of the lead and self values.",
        '',
        '| Pair | Track | Visualizer | Signal | Kind | After itself | After the other | Allowed | Result | Note |',
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
