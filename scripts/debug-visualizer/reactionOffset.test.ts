import { describe, expect, it } from 'vitest';
import { formatReactionOffset, measureReactionOffset } from './reactionOffset';

// 100 Hz rows; the column jumps to 1 `lagRows` rows after each click and falls back 5 rows later.
function table(lagRows: number, clicks: number[], counter = false) {
    const rows: number[][] = [];
    let count = 0;
    for (let i = 0; i <= 400; i++) {
        const t = i / 100;
        const active = clicks.some((c) => i >= Math.round(c * 100) + lagRows && i < Math.round(c * 100) + lagRows + 5);
        if (counter && clicks.some((c) => i === Math.round(c * 100) + lagRows)) count++;
        rows.push([t, counter ? count : active ? 1 : 0]);
    }
    return { columns: ['t', 'x'], rows };
}
const CLICKS = [0.5, 1, 1.5, 2];

describe('measureReactionOffset', () => {
    it('measures the delay of a rise after each click', () => {
        const result = measureReactionOffset(table(3, CLICKS), 'x', CLICKS);
        if ('unavailable' in result) throw new Error(result.unavailable);
        expect(result.medianMs).toBeCloseTo(30, 3);
        expect(result.p95Ms).toBeCloseTo(30, 3);
        expect(result.hits).toBe(4);
        expect(result.misses).toBe(0);
        expect(result.frameAllowanceMs).toBeCloseTo(10, 3);
        expect(result.counter).toBe(false);
    });

    it('uses the first increment of a counter', () => {
        const result = measureReactionOffset(table(2, CLICKS, true), 'x', CLICKS);
        if ('unavailable' in result) throw new Error(result.unavailable);
        expect(result.counter).toBe(true);
        expect(result.medianMs).toBeCloseTo(20, 3);
    });

    it('counts clicks without a reaction in the window as misses and skips clicks the recording does not cover', () => {
        const result = measureReactionOffset(table(3, [0.5]), 'x', [0.5, 3, -1, 3.95], { windowSeconds: 0.1 });
        if ('unavailable' in result) throw new Error(result.unavailable);
        expect(result.hits).toBe(1);
        expect(result.misses).toBe(1);
        const none = measureReactionOffset(table(3, [0.5]), 'x', [3]);
        if ('unavailable' in none) throw new Error(none.unavailable);
        expect(none.medianMs).toBeUndefined();
        expect(formatReactionOffset('x', none)).toContain('no reaction found');
    });

    it('takes the median and p95 over uneven delays', () => {
        const rows = [
            [0, 0],
            [0.1, 0],
            [0.12, 1],
            [0.5, 0],
            [0.6, 0],
            [0.64, 1],
            [1, 0],
            [1.1, 0],
            [1.18, 1],
            [2, 0],
        ];
        const result = measureReactionOffset({ columns: ['t', 'x'], rows }, 'x', [0.1, 0.6, 1.1], {});
        if ('unavailable' in result) throw new Error(result.unavailable);
        expect(result.medianMs).toBeCloseTo(40, 3);
        expect(result.p95Ms).toBeCloseTo(76, 3);
    });

    it('says why nothing can be measured', () => {
        expect(measureReactionOffset({ columns: ['x'], rows: [] }, 'x', [1])).toEqual({
            unavailable: 'the recording has no "t" column',
        });
        expect(measureReactionOffset({ columns: ['t'], rows: [] }, 'x', [1])).toEqual({
            unavailable: 'the recording has no "x" column',
        });
        expect(measureReactionOffset({ columns: ['t', 'x'], rows: [[0, 1]] }, 'x', [1])).toMatchObject({
            unavailable: expect.stringContaining('fewer than two'),
        });
        const flat = {
            columns: ['t', 'x'],
            rows: [
                [0, 1],
                [1, 1],
            ],
        };
        expect(measureReactionOffset(flat, 'x', [1])).toMatchObject({
            unavailable: expect.stringContaining('never changes'),
        });
    });

    it('formats a figure with its allowance', () => {
        const result = measureReactionOffset(table(3, CLICKS), 'x', CLICKS);
        if ('unavailable' in result) throw new Error(result.unavailable);
        expect(formatReactionOffset('x', result)).toBe(
            '  reactionOffsetMs (x): median +30.0 ms, p95 +30.0 ms, 4 hit, 0 missed; frame allowance +/-10.0 ms',
        );
    });
});
