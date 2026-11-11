import { describe, expect, it } from 'vitest';
import { tempoStability } from './tempoStability';

const bpms = (...values: number[]) => values.map((bpm) => ({ bpm }));

describe('tempoStability', () => {
    it('is undefined without a lock or a final tempo', () => {
        expect(tempoStability([])).toBeUndefined();
        expect(tempoStability(bpms(0, 0, 0))).toBeUndefined();
        expect(tempoStability(bpms(0, 120, 0))).toBeUndefined();
    });

    it('counts only time after the first lock', () => {
        expect(tempoStability(bpms(0, 0, 120, 120, 120))).toEqual({ nearFinalShare: 1, jumps: 0 });
    });

    it('measures the share within 1% of the final tempo', () => {
        // Final 100: 100.9 is inside 1%, 101.5 and 90 are outside.
        const result = tempoStability(bpms(90, 101.5, 100.9, 100, 100));
        expect(result?.nearFinalShare).toBeCloseTo(3 / 5);
    });

    it('counts jumps bigger than 4% and ignores smaller moves', () => {
        // 100 -> 103 is 3%, 103 -> 200 is a jump, 200 -> 100 is a jump.
        expect(tempoStability(bpms(100, 103, 200, 100))?.jumps).toBe(2);
    });

    it('does not count the drop to no tempo and back as a jump', () => {
        expect(tempoStability(bpms(100, 0, 200, 200))?.jumps).toBe(0);
    });
});
