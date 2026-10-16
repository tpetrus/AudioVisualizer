import { describe, expect, it } from 'vitest';
import { DEFAULT_NORMALIZE_SETTINGS } from './types';

describe('DEFAULT_NORMALIZE_SETTINGS', () => {
    it('holds sane values for every setting', () => {
        const { targetPeak, maxGain, peakHold, releaseTime, noiseFloor } = DEFAULT_NORMALIZE_SETTINGS;
        expect(targetPeak).toBeGreaterThan(0);
        expect(targetPeak).toBeLessThanOrEqual(1);
        expect(maxGain).toBeGreaterThan(1);
        expect(peakHold).toBeGreaterThan(0);
        expect(releaseTime).toBeGreaterThan(0);
        expect(noiseFloor).toBeGreaterThanOrEqual(0);
        expect(noiseFloor).toBeLessThan(targetPeak);
    });
});
