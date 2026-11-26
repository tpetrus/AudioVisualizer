import { describe, expect, it } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';

// CPU mirrors of the shader's brightness terms (inkShaders.ts), from the same constants: the shader cannot run in a
// spec, so these check that the tuning keeps the brightness the BrightnessMix does not govern within bounds.
describe('bassInkSceneConfig brightness bounds', () => {
    const { cloud, sprite, sparkle } = bassInkSceneConfig;

    // Light per screen area relative to rest: point alpha x point area / projected cloud area.
    function lightPerArea(tension: number): number {
        const alpha = 1 - tension * sprite.tensionAlphaNormalization;
        const pointArea = (1 - tension * sprite.tensionSizeShrink) ** 2;
        const cloudArea = (1 - tension * cloud.tensionSqueeze) ** 2;
        return (alpha * pointArea) / cloudArea;
    }

    it('keeps the light per screen area within 10% at any tension, so a build and its release do not flash', () => {
        for (let tension = 0; tension <= 1.0001; tension += 0.05) {
            expect(lightPerArea(tension)).toBeGreaterThan(0.9);
            expect(lightPerArea(tension)).toBeLessThan(1.1);
        }
    });

    it('lets a full hat add under 10% to the light of the whole cloud', () => {
        const gain = sparkle.fraction * ((1 + sparkle.amplitude) ** 2 - 1);
        expect(gain).toBeLessThan(0.1);
    });
});

describe('bassInkSceneConfig depth fade', () => {
    const { depth, camera, cloud } = bassInkSceneConfig;

    it('fades the far point to at most half of the near point', () => {
        expect(depth.fade).toBeGreaterThanOrEqual(0.5);
        expect(depth.fade).toBeLessThanOrEqual(1);
    });

    it('keeps the whole faded range in front of the camera at the default fit', () => {
        // The range is offsets from the cloud center's depth, so the nearest point is at the distance minus the range.
        const nearest = camera.distance - cloud.radius * depth.halfRange;
        expect(nearest).toBeGreaterThan(camera.near);
        expect(depth.halfRange).toBeGreaterThan(0);
    });

    // WCAG 2.3.1: the swell follows every bass bump with no rate limit and would tint the whole cloud at once, and a
    // picked core can be saturated red, so a nonzero swell tint could become a red flash.
    it('keeps the bass swell from tinting the whole cloud', () => {
        expect(bassInkSceneConfig.bands.swellTint).toBe(0);
    });

    it('turns the view no faster than about 0.7 rad a second at the peak of a swing', () => {
        const peakRate = (1.5 * 2 * bassInkSceneConfig.view.yawSwing) / 2;
        expect(peakRate).toBeLessThanOrEqual(0.7);
    });
});
