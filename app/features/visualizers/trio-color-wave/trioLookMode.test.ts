// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { FORCE_HARDWARE_FLAG, isHardwareForced, resolveTrioLookMode } from './trioLookMode';

const flags = window as unknown as Record<string, unknown>;

afterEach(() => {
    delete flags[FORCE_HARDWARE_FLAG];
});

describe('resolveTrioLookMode', () => {
    it.each([
        [false, false, 'standard'],
        [false, true, 'standard'],
        [true, true, 'standard'],
        [true, false, 'enhanced'],
    ] as const)('enhanced %s, software %s gives %s', (enhanced, software, mode) => {
        expect(resolveTrioLookMode(enhanced, software)).toBe(mode);
    });
});

describe('isHardwareForced', () => {
    it('is false unless an e2e script set the flag to exactly true', () => {
        expect(isHardwareForced()).toBe(false);
        flags[FORCE_HARDWARE_FLAG] = 'true';
        expect(isHardwareForced()).toBe(false);
        flags[FORCE_HARDWARE_FLAG] = true;
        expect(isHardwareForced()).toBe(true);
    });
});
