import { describe, expect, it } from 'vitest';
import { outlineButton, primaryButton, smallOutlineButton } from './buttonStyles';

describe('buttonStyles', () => {
    it('gives each kind of button its own look', () => {
        expect(new Set([primaryButton, outlineButton, smallOutlineButton]).size).toBe(3);
        expect(primaryButton).toContain('bg-blue-600');
        expect(outlineButton).toContain('border');
        expect(smallOutlineButton).toContain('text-sm');
    });

    it('dims the full-size buttons while they are disabled', () => {
        expect(primaryButton).toContain('disabled:opacity-50');
        expect(outlineButton).toContain('disabled:opacity-50');
    });
});
