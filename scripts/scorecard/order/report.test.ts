import { describe, expect, it } from 'vitest';
import type { OrderRow } from './compare';
import { countRows, renderMarkdown, summaryLine } from './report';

const row = (pass: boolean | null, extra: Partial<OrderRow> = {}): OrderRow => ({
    pair: 'a,b',
    track: 't.wav',
    visualizer: 'a',
    signal: 'gain',
    kind: 'hub',
    first: 0.123456,
    second: null,
    allowed: 1,
    pass,
    ...extra,
});

describe('report', () => {
    const rows = [row(true), row(false), row(null, { note: 'needs at least 2 runs in each condition' })];

    it('counts rows by outcome', () => {
        expect(countRows(rows)).toEqual({ pass: 1, fail: 1, unjudged: 1 });
        expect(summaryLine(rows)).toBe('3 order rows: 1 pass, 1 fail, 1 not judged (a report, not a gate).');
    });

    it('renders a table with the counts', () => {
        const markdown = renderMarkdown({
            header: {
                targetsVersion: 8,
                revision: 'abc',
                created: '2026-11-21T00:00:00.000Z',
                settle: 0,
                liveRevision: null,
            },
            rows,
        });
        expect(markdown).toContain('3 rows: 1 pass, 1 fail, 1 not judged.');
        expect(markdown).toContain('no live file');
        expect(markdown).toContain('| a,b | t.wav | a | gain | hub | 0.1235 | - | 1 | pass |  |');
        expect(markdown).toContain('| FAIL |');
        expect(markdown).toContain('| n/a | needs at least 2 runs in each condition |');
    });
});
