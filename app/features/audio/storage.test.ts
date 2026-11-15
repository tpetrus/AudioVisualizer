// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearNormalizeSettings,
    clearSource,
    loadNormalize,
    loadNormalizeSettings,
    loadSyncOffsetMs,
    loadSource,
    saveNormalize,
    saveNormalizeSettings,
    saveSyncOffsetMs,
    saveSource,
} from './storage';
import { DEFAULT_NORMALIZE_SETTINGS } from './types';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('source', () => {
    it('is undefined until one is saved', () => {
        expect(loadSource()).toBeUndefined();
    });

    it('round-trips a saved source and clears it', () => {
        saveSource({ mode: 'device', deviceId: 'abc' });
        expect(loadSource()).toEqual({ mode: 'device', deviceId: 'abc' });
        clearSource();
        expect(loadSource()).toBeUndefined();
        expect(localStorage.getItem('audioVisualizer.source')).toBeNull();
    });

    it('keeps the key used by the Angular app', () => {
        saveSource({ mode: 'screen' });
        expect(JSON.parse(localStorage.getItem('audioVisualizer.source') ?? '')).toEqual({ mode: 'screen' });
    });

    it('falls back to undefined on corrupt JSON', () => {
        localStorage.setItem('audioVisualizer.source', '{not json');
        expect(loadSource()).toBeUndefined();
    });
});

describe('normalize flag', () => {
    it('defaults to on', () => {
        expect(loadNormalize()).toBe(true);
    });

    it('round-trips both values', () => {
        saveNormalize(false);
        expect(loadNormalize()).toBe(false);
        saveNormalize(true);
        expect(loadNormalize()).toBe(true);
    });
});

describe('sync offset', () => {
    it('defaults to 0', () => {
        expect(loadSyncOffsetMs()).toBe(0);
    });

    it('round-trips a value under its own key', () => {
        saveSyncOffsetMs(-40);
        expect(localStorage.getItem('audioVisualizer.syncOffsetMs')).toBe('-40');
        expect(loadSyncOffsetMs()).toBe(-40);
    });

    it('loads 0 for corrupt values and clamps out-of-range ones', () => {
        localStorage.setItem('audioVisualizer.syncOffsetMs', 'oops');
        expect(loadSyncOffsetMs()).toBe(0);
        localStorage.setItem('audioVisualizer.syncOffsetMs', '"12"');
        expect(loadSyncOffsetMs()).toBe(0);
        localStorage.setItem('audioVisualizer.syncOffsetMs', '9999');
        expect(loadSyncOffsetMs()).toBe(200);
        localStorage.setItem('audioVisualizer.syncOffsetMs', '-9999');
        expect(loadSyncOffsetMs()).toBe(-200);
    });
});

describe('normalize settings', () => {
    it('defaults when nothing is stored', () => {
        expect(loadNormalizeSettings()).toEqual(DEFAULT_NORMALIZE_SETTINGS);
    });

    it('round-trips saved settings', () => {
        const settings = { targetPeak: 0.5, maxGain: 4, peakHold: 1, releaseTime: 0.2, noiseFloor: 0.01 };
        saveNormalizeSettings(settings);
        expect(loadNormalizeSettings()).toEqual(settings);
    });

    it('merges stored values over the defaults so new settings never load as undefined', () => {
        localStorage.setItem('audioVisualizer.normalizeSettings', JSON.stringify({ maxGain: 2 }));
        expect(loadNormalizeSettings()).toEqual({ ...DEFAULT_NORMALIZE_SETTINGS, maxGain: 2 });
    });

    it('falls back to the defaults on corrupt JSON', () => {
        localStorage.setItem('audioVisualizer.normalizeSettings', 'oops');
        expect(loadNormalizeSettings()).toEqual(DEFAULT_NORMALIZE_SETTINGS);
    });

    it('clears back to the defaults', () => {
        saveNormalizeSettings({ ...DEFAULT_NORMALIZE_SETTINGS, maxGain: 1 });
        clearNormalizeSettings();
        expect(loadNormalizeSettings()).toEqual(DEFAULT_NORMALIZE_SETTINGS);
    });
});

describe('unavailable storage', () => {
    it('reads fall back to their defaults when localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(loadSource()).toBeUndefined();
        expect(loadNormalize()).toBe(true);
        expect(loadSyncOffsetMs()).toBe(0);
        expect(loadNormalizeSettings()).toEqual(DEFAULT_NORMALIZE_SETTINGS);
    });

    it('writes and removals are swallowed when localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => saveSource({ mode: 'screen' })).not.toThrow();
        expect(() => saveNormalize(false)).not.toThrow();
        expect(() => saveSyncOffsetMs(10)).not.toThrow();
        expect(() => saveNormalizeSettings(DEFAULT_NORMALIZE_SETTINGS)).not.toThrow();
        expect(() => clearSource()).not.toThrow();
        expect(() => clearNormalizeSettings()).not.toThrow();
    });
});
