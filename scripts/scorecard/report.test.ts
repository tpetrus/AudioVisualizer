import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './report';
import type { Scorecard, ScorecardCell } from './types';

function cell(overrides: Partial<ScorecardCell>): ScorecardCell {
    return {
        metric: 'beat.errorMedianMs',
        track: 'a.wav',
        visualizer: 'rhythm',
        class: 'synthetic',
        applicable: true,
        floor: 20,
        stretch: null,
        prehub: null,
        value: 12.34,
        spread: 0,
        runs: 1,
        source: 'offline',
        blocking: true,
        pass: true,
        status: 'pass',
        ...overrides,
    };
}

const card = (cells: ScorecardCell[]): Scorecard => ({
    header: { targetsVersion: 1, revision: 'abc', created: 'now', sidecarHashes: {} },
    cells,
});

describe('renderMarkdown', () => {
    const cells = [
        cell({}),
        cell({ track: 'b.wav', value: 30, status: 'fail', pass: false }),
        cell({ track: 'c.wav', value: null, status: 'unavailable', pass: false }),
        cell({ track: 'd.wav', applicable: false, status: 'n/a', pass: false, value: null, floor: null }),
        cell({
            metric: 'gate.firstOpenSeconds',
            visualizer: 'dancing-character',
            floor: 4,
            stretch: 2,
            value: 1.234,
            prehub: 3,
        }),
        cell({ metric: 'tempo.maxErrorAfterLock', floor: 0.02, value: 0.0123 }),
        cell({ metric: 'tempo.falseSongChanges', floor: 0, value: 0 }),
        cell({ metric: 'gate.closedOnNoKick', blocking: false, floor: null, value: 1 }),
    ];

    it('opens with the summary line counting applicable cells only', () => {
        const text = renderMarkdown(card(cells));
        expect(text).toContain('Targets version 1, revision abc, created now.');
        expect(text).toContain('Applicable cells 7: 5 passing, 1 failing, 1 unavailable. Blocking failures: 2.');
    });

    it('renders one table per metric group with consistent number formats', () => {
        const text = renderMarkdown(card(cells));
        expect(text.match(/^## /gm)).toHaveLength(3);
        for (const heading of ['## beat', '## gate', '## tempo']) expect(text).toContain(heading);
        expect(text).toContain('| beat.errorMedianMs | a.wav | synthetic | 12.3 | 20.0 | - | - | pass |');
        expect(text).toContain('| gate.firstOpenSeconds | a.wav | synthetic | 1.23 | 4.00 | 2.00 | 3.00 | pass |');
        expect(text).toContain('| tempo.maxErrorAfterLock | a.wav | synthetic | 0.012 | 0.020 | - | - | pass |');
        expect(text).toContain('| tempo.falseSongChanges | a.wav | synthetic | 0 | 0 | - | - | pass |');
        expect(text).toContain('| beat.errorMedianMs | c.wav | synthetic | - | 20.0 | - | - | unavailable |');
        expect(text).toContain('| beat.errorMedianMs | d.wav | synthetic | - | - | - | - | n/a |');
    });

    it('marks report-only cells', () => {
        expect(renderMarkdown(card(cells))).toContain('| 1 | - | - | - | pass (report-only) |');
    });

    it('explains the blank pre-hub column in one line', () => {
        const text = renderMarkdown(card(cells));
        expect(text.match(/^Pre-hub is /gm)).toHaveLength(1);
        expect(text).toContain('rhythm DSP is unchanged since the commit before the hub merge');
    });

    it('prints notes and is stable', () => {
        const text = renderMarkdown(card(cells), ['careful']);
        expect(text).toContain('- careful');
        expect(text.endsWith('\n')).toBe(true);
        expect(renderMarkdown(card(cells), ['careful'])).toBe(text);
    });

    it('renders a metric without a dot as its own group and an empty card', () => {
        expect(renderMarkdown(card([cell({ metric: 'solo' })]))).toContain('## solo');
        expect(renderMarkdown(card([]))).toContain('Applicable cells 0: 0 passing, 0 failing, 0 unavailable.');
    });
});
