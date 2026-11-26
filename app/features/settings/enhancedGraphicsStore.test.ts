// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ENHANCED_GRAPHICS_KEY,
    getEnhancedGraphics,
    setEnhancedGraphics,
    subscribeEnhancedGraphics,
} from './enhancedGraphicsStore';

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('enhancedGraphicsStore', () => {
    it('reads off when nothing is stored', () => {
        expect(getEnhancedGraphics()).toBe(false);
    });

    it.each(['1', 'TRUE', 'True', '{"a":', 'false', ''])('reads %j as off', (stored) => {
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, stored);
        expect(getEnhancedGraphics()).toBe(false);
    });

    it('reads the exact string true as on', () => {
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, 'true');
        expect(getEnhancedGraphics()).toBe(true);
    });

    it('reads off and writes quietly when storage throws, still notifying listeners', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        const listener = vi.fn();
        const unsubscribe = subscribeEnhancedGraphics(listener);

        expect(getEnhancedGraphics()).toBe(false);
        expect(() => setEnhancedGraphics(true)).not.toThrow();
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('persists true and false under the key and notifies on every set', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeEnhancedGraphics(listener);

        setEnhancedGraphics(true);
        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBe('true');
        expect(getEnhancedGraphics()).toBe(true);
        setEnhancedGraphics(false);
        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBe('false');
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    it('notifies on a storage event for its key or a clear, and ignores other keys', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeEnhancedGraphics(listener);

        window.dispatchEvent(new StorageEvent('storage', { key: ENHANCED_GRAPHICS_KEY }));
        window.dispatchEvent(new StorageEvent('storage', { key: null }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'audioVisualizer.other' }));
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    it('removes the window listener only when the last subscriber leaves', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        const first = vi.fn();
        const second = vi.fn();
        const unsubscribeFirst = subscribeEnhancedGraphics(first);
        const unsubscribeSecond = subscribeEnhancedGraphics(second);
        expect(add.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1);

        unsubscribeFirst();
        expect(remove.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(0);
        window.dispatchEvent(new StorageEvent('storage', { key: null }));
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);

        unsubscribeSecond();
        expect(remove.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1);
        window.dispatchEvent(new StorageEvent('storage', { key: null }));
        expect(second).toHaveBeenCalledTimes(1);
    });
});
