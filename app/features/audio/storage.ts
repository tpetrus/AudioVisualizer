import { DEFAULT_NORMALIZE_SETTINGS, type NormalizeSettings, type SavedSource } from "./types";

// Keys are unchanged from the Angular app, so settings saved there still load.
const SOURCE_KEY = 'audioVisualizer.source';
const NORMALIZE_KEY = 'audioVisualizer.normalize';
const NORMALIZE_SETTINGS_KEY = 'audioVisualizer.normalizeSettings';

export function loadSource(): SavedSource | undefined {
    return read<SavedSource | undefined>(SOURCE_KEY, undefined);
}

export function saveSource(source: SavedSource): void {
    write(SOURCE_KEY, source);
}

export function clearSource(): void {
    write(SOURCE_KEY, undefined);
}

export function loadNormalize(): boolean {
    return read(NORMALIZE_KEY, true);
}

export function saveNormalize(enabled: boolean): void {
    write(NORMALIZE_KEY, enabled);
}

// Merged over the defaults, so a setting added later never loads as undefined.
export function loadNormalizeSettings(): NormalizeSettings {
    return { ...DEFAULT_NORMALIZE_SETTINGS, ...read<Partial<NormalizeSettings>>(NORMALIZE_SETTINGS_KEY, {}) };
}

export function saveNormalizeSettings(settings: NormalizeSettings): void {
    write(NORMALIZE_SETTINGS_KEY, settings);
}

export function clearNormalizeSettings(): void {
    write(NORMALIZE_SETTINGS_KEY, undefined);
}

// localStorage can throw (private mode, quota, blocked storage) and can hold corrupt JSON from older versions,
// so every read falls back to `fallback` and every write fails quietly.
function read<T>(key: string, fallback: T): T {
    try {
        const stored = localStorage.getItem(key);
        return stored === null ? fallback : JSON.parse(stored) as T;
    } catch {
        return fallback;
    }
}

// Stores `value` as JSON, or removes the key when `value` is undefined.
function write(key: string, value: unknown): void {
    try {
        if (value === undefined) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    } catch {
        // Storage unavailable: the setting just won't persist.
    }
}
