import { describe, expect, it } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { createLightCeilingPass, softCeiling } from './lightCeiling';

const config = { knee: 0.8, max: 1.3 };

describe('softCeiling', () => {
    it('leaves light at or below the knee unchanged', () => {
        for (const light of [0, 0.1, 0.5, 0.8]) expect(softCeiling(light, config)).toBe(light);
    });

    it('bends light above the knee toward the ceiling without reaching it, keeping the order', () => {
        let previous = softCeiling(0.8, config);
        for (let light = 0.85; light < 8; light += 0.25) {
            const capped = softCeiling(light, config);
            expect(capped).toBeLessThan(light);
            expect(capped).toBeLessThan(config.max);
            expect(capped).toBeGreaterThan(previous);
            previous = capped;
        }
        expect(softCeiling(1e6, config)).toBeCloseTo(config.max, 9);
    });

    it('meets the straight line with slope 1 at the knee, so there is no visible edge', () => {
        const h = 1e-6;
        const slope = (softCeiling(config.knee + h, config) - softCeiling(config.knee, config)) / h;
        expect(slope).toBeCloseTo(1, 5);
    });

    it('caps the stacks the formations reached at rest to the ceiling', () => {
        // The brightest measured stack (galaxy disc near edge-on, 5.6 times white) lands below the ceiling.
        expect(softCeiling(5.6, bassInkSceneConfig.post.lightCeiling)).toBeLessThan(
            bassInkSceneConfig.post.lightCeiling.max,
        );
        // The sphere's 99th percentile (about 1.1) is changed by under a tenth.
        expect(softCeiling(1.1, bassInkSceneConfig.post.lightCeiling)).toBeGreaterThan(1);
    });

    it('passes a non-finite value through, as the shader would leave it', () => {
        expect(softCeiling(Number.NaN, config)).toBeNaN();
    });
});

describe('createLightCeilingPass', () => {
    it('builds a pass with the configured knee and ceiling and a shader that runs the same curve', () => {
        const pass = createLightCeilingPass();
        const uniforms = pass.uniforms as Record<string, { value: unknown }>;
        expect(uniforms['uKnee'].value).toBe(bassInkSceneConfig.post.lightCeiling.knee);
        expect(uniforms['uMax'].value).toBe(bassInkSceneConfig.post.lightCeiling.max);
        expect(pass.material.fragmentShader).toContain('uKnee + range * (1.0 - exp(-(peak - uKnee) / range))');
        // The curve runs on the brightest channel and scales all three, so a capped pixel keeps its hue.
        expect(pass.material.fragmentShader).toContain('texel.rgb *= capped / peak');
        pass.dispose();
    });

    it('takes another config', () => {
        const pass = createLightCeilingPass({ knee: 0.5, max: 2 });
        const uniforms = pass.uniforms as Record<string, { value: unknown }>;
        expect(uniforms['uKnee'].value).toBe(0.5);
        expect(uniforms['uMax'].value).toBe(2);
        pass.dispose();
    });
});
