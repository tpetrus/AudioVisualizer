import { describe, expect, it } from 'vitest';
import { AGC_INTERVAL_MS, ATTACK_TIME_CONSTANT, MIN_GAIN, agcStep } from './agc';
import { DEFAULT_NORMALIZE_SETTINGS } from './types';

const settings = DEFAULT_NORMALIZE_SETTINGS;

describe('agcStep', () => {
    it('does nothing below the noise floor and still decays the envelope', () => {
        const quiet = agcStep(0, settings.noiseFloor / 2, 1, settings);
        expect(quiet.wantedGain).toBeUndefined();
        expect(quiet.timeConstant).toBeUndefined();
        expect(quiet.envelope).toBe(settings.noiseFloor / 2);

        const decayed = agcStep(0.003, 0, 1, settings);
        expect(decayed.envelope).toBeLessThan(0.003);
        expect(decayed.wantedGain).toBeUndefined();
    });

    it('wants targetPeak / peak inside [MIN_GAIN, maxGain]', () => {
        expect(agcStep(0, 0.35, 1, settings).wantedGain).toBeCloseTo(settings.targetPeak / 0.35, 12);
        expect(agcStep(0, 0.01, 1, settings).wantedGain).toBe(settings.maxGain);
        expect(agcStep(0, 1, 1, { ...settings, targetPeak: 0.1 }).wantedGain).toBe(MIN_GAIN);
    });

    it('attacks fast when the gain must fall and releases slowly when it must rise', () => {
        expect(agcStep(0, 0.7, 4, settings).timeConstant).toBe(ATTACK_TIME_CONSTANT);
        expect(agcStep(0, 0.07, 1, settings).timeConstant).toBe(settings.releaseTime);
    });

    it('halves the envelope every peakHold seconds', () => {
        let envelope = 0.8;
        const ticks = Math.round((settings.peakHold * 1000) / AGC_INTERVAL_MS);
        for (let i = 0; i < ticks; i++) envelope = agcStep(envelope, 0, 1, settings).envelope;
        expect(envelope).toBeCloseTo(0.4, 6);
    });
});
