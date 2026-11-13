import { describe, expect, it } from 'vitest';
import { asWebAudio, FakeAnalyserNode } from '~/test/fakeWebAudio';
import { assignAnalyserSettings, DEFAULT_NORMALIZE_SETTINGS, ENGINE_TAP_SETTINGS } from './types';

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

describe('ENGINE_TAP_SETTINGS', () => {
    it('is frozen', () => {
        expect(Object.isFrozen(ENGINE_TAP_SETTINGS)).toBe(true);
    });
});

describe('assignAnalyserSettings', () => {
    const assign = (settings: Parameters<typeof assignAnalyserSettings>[1]) => {
        const node = new FakeAnalyserNode();
        assignAnalyserSettings(asWebAudio<AnalyserNode>(node), settings);
        return node;
    };

    it('applies a range above the current maximum and one below the current minimum', () => {
        const base = { fftSize: 1024, smoothingTimeConstant: 0.3 };
        expect(assign({ ...base, minDecibels: -20, maxDecibels: 0 })).toMatchObject({
            minDecibels: -20,
            maxDecibels: 0,
        });
        expect(assign({ ...base, minDecibels: -140, maxDecibels: -110 })).toMatchObject({
            minDecibels: -140,
            maxDecibels: -110,
        });
        expect(assign({ ...base, minDecibels: -90, maxDecibels: -40 })).toMatchObject({ fftSize: 1024 });
    });

    it('is checked by a fake that throws like a real node', () => {
        const node = new FakeAnalyserNode();
        expect(() => (node.minDecibels = -10)).toThrow();
        expect(() => (node.maxDecibels = -150)).toThrow();
    });
});
