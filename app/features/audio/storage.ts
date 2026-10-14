import { DEFAULT_NORMALIZE_SETTINGS, type NormalizeSettings, type SavedSource } from "./types";

const STORAGE_KEY = 'audioVisualizer.source';
const NORMALIZE_KEY = 'audioVisualizer.normalize';
const NORMALIZE_SETTINGS_KEY = 'audioVisualizer.normalizeSettings';

export function loadNormalize() {
    try { return localStorage.getItem(NORMALIZE_KEY) !== 'false' }
    catch {
        return true;
    }
}

export function setNormalize(enabled: boolean) {
    try {
        localStorage.setItem(NORMALIZE_KEY, String(enabled));
    } catch { }
}

export function saveNormalizeSettings(s: NormalizeSettings) {
    try {
        localStorage.setItem(NORMALIZE_SETTINGS_KEY, JSON.stringify(s));
    } catch { }
}

export function clearNormalizeSettings() {
    try {
        localStorage.removeItem(NORMALIZE_SETTINGS_KEY);
    } catch { }
}

export function loadNormalizeSettings() {
    try {
        return { ...DEFAULT_NORMALIZE_SETTINGS, ...JSON.parse(localStorage.getItem(NORMALIZE_SETTINGS_KEY) ?? '{}') };
    } catch {
        return { ...DEFAULT_NORMALIZE_SETTINGS };
    }
}

export function loadSource() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? undefined;
    } catch {
        return undefined;
    }
}

export function saveSource(source: SavedSource) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
    } catch { }
}

export function clearSource() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { }
}


// TODO: Implement
function read<T>(name: string, fallback: T): T {
    try {
        return localStorage.getItem(name) as T
    }
    catch {
        return fallback;
    }
}

// TODO: Implement
function write<T>(name: string, value: T | undefined): void {
    if (value === undefined) {
        try {
            localStorage.removeItem(name);
            return;
        }
        catch {
            return;
        }
    }
    try {
        localStorage.setItem(name, String(value));
        return;
    }
    catch {

    }
}