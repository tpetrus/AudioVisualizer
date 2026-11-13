import { describe, expect, it } from 'vitest';
import { FORMATION_COUNT, KICK_SLOTS } from './bassInkTypes';

describe('Bass Ink shared constants', () => {
    it('match the shader and formation set sizes', () => {
        expect(FORMATION_COUNT).toBe(4);
        expect(KICK_SLOTS).toBe(8);
    });
});
