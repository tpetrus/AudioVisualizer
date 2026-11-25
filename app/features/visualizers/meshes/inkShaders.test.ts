import { describe, expect, it } from 'vitest';
import { KICK_SLOTS } from '~/features/visualizers/bass-ink/bassInkTypes';
import { bassInkSceneConfig } from '~/features/visualizers/bass-ink/bassInkSceneConfig';
import { INK_KICK_SLOTS, depthFade, inkFragmentShader, inkVertexShader } from './inkShaders';

describe('ink shaders', () => {
    it('sum as many shockwaves as the kick ring holds', () => {
        expect(INK_KICK_SLOTS).toBe(KICK_SLOTS);
        expect(inkVertexShader).toContain(`uKickTimes[${KICK_SLOTS}]`);
    });

    it('keep ripples out of the fragment stage: brightness comes only from uBrightness', () => {
        expect(inkFragmentShader).not.toMatch(/uKick|uWave/);
        expect(inkFragmentShader).toContain('uBrightness');
        // The vertex stage hands nothing but the radial position and the depth fade on to the fragment stage.
        expect(inkVertexShader.match(/^varying .*$/gm)).toEqual(['varying float vRadial;', 'varying float vDepth;']);
    });

    it('scales the radius by the bass swell, as displacement only', () => {
        expect(inkVertexShader).toContain('uSwell');
        expect(inkVertexShader).toContain('(1.0 + uSwellAmp * uSwell)');
        expect(inkFragmentShader).not.toContain('uSwell');
    });

    it('uses the high band for the sparkle size only, never for the color', () => {
        expect(inkVertexShader).toContain('uHigh');
        expect(inkFragmentShader).not.toContain('uHigh');
    });

    describe('depth fade', () => {
        const { fade } = bassInkSceneConfig.depth;

        it('is 1 at the near depth and 1 - fade at the far depth', () => {
            expect(depthFade(8, 8, 16, fade)).toBe(1);
            expect(depthFade(16, 8, 16, fade)).toBeCloseTo(1 - fade, 12);
        });

        it('makes the far point at most half as big and as bright as the near one (alpha and size share the factor)', () => {
            expect(depthFade(16, 8, 16, fade) / depthFade(8, 8, 16, fade)).toBeLessThanOrEqual(0.5);
        });

        it('is clamped outside the range', () => {
            expect(depthFade(0, 8, 16, fade)).toBe(1);
            expect(depthFade(100, 8, 16, fade)).toBeCloseTo(1 - fade, 12);
            expect(depthFade(12, 8, 16, fade)).toBeCloseTo(1 - fade / 2, 12);
        });

        it('does nothing when the range is empty or reversed', () => {
            expect(depthFade(12, 10, 10, fade)).toBe(1);
            expect(depthFade(12, 14, 10, fade)).toBe(1);
        });

        it('measures depth from the cloud center, so zooming the camera never dims the cloud', () => {
            // The GLSL computes `-mv.z - (-center.z)` (the point's view depth minus the center's) and feeds it to the
            // same maths as depthFade, with near below 0 and far above 0.
            expect(inkVertexShader).toContain('float relativeDepth = -mv.z - (-center.z);');
            expect(inkVertexShader).toMatch(/clamp\(\(relativeDepth - uDepthNear\)/);
            expect(inkVertexShader).not.toMatch(/-mv\.z - uDepthNear/);
        });

        it('gives a point at the cloud center the same fade at any camera distance', () => {
            const near = -3;
            const far = 3;
            for (const cameraDistance of [4, 12, 40, 200]) {
                // The center's view depth is the camera distance, so a point there has relative depth 0.
                const relative = cameraDistance - cameraDistance;
                expect(depthFade(relative, near, far, fade)).toBeCloseTo(1 - fade / 2, 12);
            }
        });

        it('is declared and used by the shaders', () => {
            for (const name of ['uDepthNear', 'uDepthFar', 'uDepthFade']) {
                expect(inkVertexShader).toContain(`uniform float ${name};`);
            }
            expect(inkVertexShader).toContain('varying float vDepth;');
            expect(inkFragmentShader).toContain('varying float vDepth;');
            expect(inkFragmentShader).toMatch(/\* vDepth;/);
            expect(inkVertexShader).toMatch(/\* vDepth;/);
        });
    });
});
