import { describe, expect, it } from 'vitest';
import { KICK_SLOTS } from '~/features/visualizers/bass-ink/bassInkTypes';
import { INK_KICK_SLOTS, inkFragmentShader, inkVertexShader } from './inkShaders';

describe('ink shaders', () => {
    it('sum as many shockwaves as the kick ring holds', () => {
        expect(INK_KICK_SLOTS).toBe(KICK_SLOTS);
        expect(inkVertexShader).toContain(`uKickTimes[${KICK_SLOTS}]`);
    });

    it('keep ripples out of the fragment stage: brightness comes only from uBrightness', () => {
        expect(inkFragmentShader).not.toMatch(/uKick|uWave/);
        expect(inkFragmentShader).toContain('uBrightness');
        // The vertex stage hands nothing but the radial position on to the fragment stage.
        expect(inkVertexShader.match(/^varying .*$/gm)).toEqual(['varying float vRadial;']);
    });

    it('uses the high band for the sparkle size only, never for the color', () => {
        expect(inkVertexShader).toContain('uHigh');
        expect(inkFragmentShader).not.toContain('uHigh');
    });
});
