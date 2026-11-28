// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENHANCED_GRAPHICS_KEY } from './enhancedGraphicsStore';
import {
    ENHANCED_GRAPHICS_PROMPT_SEEN_KEY,
    markEnhancedGraphicsPromptSeen,
    shouldShowEnhancedGraphicsPrompt,
} from './enhancedGraphicsPromptStore';

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('shouldShowEnhancedGraphicsPrompt', () => {
    it('is true on a fresh visit and leaves no probe key behind', () => {
        expect(shouldShowEnhancedGraphicsPrompt()).toBe(true);
        expect(localStorage.length).toBe(0);
    });

    it('is false once the prompt was seen', () => {
        localStorage.setItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY, '1');
        expect(shouldShowEnhancedGraphicsPrompt()).toBe(false);
    });

    it.each(['true', 'false'])('is false for a returning user whose preference is stored as %s', (value) => {
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, value);
        expect(shouldShowEnhancedGraphicsPrompt()).toBe(false);
    });

    it('is false when reading throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(shouldShowEnhancedGraphicsPrompt()).toBe(false);
    });

    it('is false when storage cannot be written', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        expect(shouldShowEnhancedGraphicsPrompt()).toBe(false);
    });
});

describe('markEnhancedGraphicsPromptSeen', () => {
    it('stores the flag', () => {
        markEnhancedGraphicsPromptSeen();
        expect(localStorage.getItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY)).toBe('1');
    });

    it('never throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => markEnhancedGraphicsPromptSeen()).not.toThrow();
    });
});
