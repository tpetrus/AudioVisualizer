import { describe, expect, it } from 'vitest';
import {
    CAPTURE_DELAY_MS,
    clampSyncOffsetMs,
    DEFAULT_SYNC_OFFSET_MS,
    DISPLAY_DELAY_MS,
    featureDelaySeconds,
    renderTime,
    SYNC_OFFSET_MAX_MS,
    SYNC_OFFSET_MIN_MS,
} from './timingModel';

describe('renderTime', () => {
    it('is the audio time when nothing is delayed', () => {
        expect(renderTime(12.5, { displayDelayMs: 0, userSyncOffsetMs: 0 })).toBe(12.5);
    });

    it('reads earlier for a positive total and later for a negative one', () => {
        expect(renderTime(10, { displayDelayMs: 0, userSyncOffsetMs: 100 })).toBeCloseTo(9.9, 12);
        expect(renderTime(10, { displayDelayMs: 50, userSyncOffsetMs: 50 })).toBeCloseTo(9.9, 12);
        expect(renderTime(10, { displayDelayMs: 0, userSyncOffsetMs: -40 })).toBeCloseTo(10.04, 12);
    });

    it('has no display delay by default', () => {
        expect(DISPLAY_DELAY_MS).toBe(0);
    });
});

describe('clampSyncOffsetMs', () => {
    it('keeps valid values', () => {
        expect(clampSyncOffsetMs(40)).toBe(40);
        expect(clampSyncOffsetMs(-200)).toBe(-200);
        expect(clampSyncOffsetMs(200)).toBe(200);
    });

    it('gives the default for anything that is not a finite number', () => {
        for (const value of ['5', null, undefined, {}, NaN, Infinity, -Infinity]) {
            expect(clampSyncOffsetMs(value)).toBe(DEFAULT_SYNC_OFFSET_MS);
        }
    });

    it('clamps to the range', () => {
        expect(clampSyncOffsetMs(1000)).toBe(SYNC_OFFSET_MAX_MS);
        expect(clampSyncOffsetMs(-1000)).toBe(SYNC_OFFSET_MIN_MS);
    });

    it('rounds to the step and never returns negative zero', () => {
        expect(clampSyncOffsetMs(42)).toBe(40);
        expect(clampSyncOffsetMs(43)).toBe(45);
        expect(Object.is(clampSyncOffsetMs(-2), 0)).toBe(true);
    });
});

describe('featureDelaySeconds', () => {
    const base = { sampleRate: 48000, fftSize: 2048, hopSeconds: 0.01, batchFrames: 8 };

    it('adds half a window, a hop and a batch', () => {
        const expected = 2048 / 48000 / 2 + 0.01 + 0.08;
        expect(featureDelaySeconds({ ...base, captureKind: 'file' })).toBeCloseTo(expected, 12);
    });

    it('adds the capture delay of the source kind: 5 ms measured for tab audio, none for a device or a file', () => {
        expect(CAPTURE_DELAY_MS).toEqual({ screen: 5, device: 0, file: 0 });
        expect(Object.isFrozen(CAPTURE_DELAY_MS)).toBe(true);
        expect(featureDelaySeconds({ ...base, captureKind: 'device' })).toBe(
            featureDelaySeconds({ ...base, captureKind: 'file' }),
        );
        expect(featureDelaySeconds({ ...base, captureKind: 'screen' })).toBeCloseTo(
            featureDelaySeconds({ ...base, captureKind: 'file' }) + 0.005,
            12,
        );
    });
});
