import { describe, expect, it } from 'vitest';
import { smoothNeeds } from './soles';

describe('smoothNeeds', () => {
    it('never gives back clearance a key needs', () => {
        const need = [0, 0, 0.8, 0, 0, 0, 0, 0, 0.3, 0.1];
        const smooth = smoothNeeds(need, 3, 2);
        need.forEach((value, k) => expect(smooth[k]).toBeGreaterThanOrEqual(value - 1e-12));
    });
    it('wraps around the loop', () => {
        const smooth = smoothNeeds([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2, 1);
        expect(smooth[9]).toBeGreaterThan(0);
        expect(smooth[5]).toBe(0);
    });
});
