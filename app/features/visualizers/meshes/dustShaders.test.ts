import { describe, expect, it } from 'vitest';
import { dustFragmentShader, dustTwinkle, dustVertexShader } from './dustShaders';

describe('dustTwinkle', () => {
    it('averages 1 over random phase offsets at several phases and depths', () => {
        // A fixed LCG keeps the spec deterministic.
        let state = 12345;
        const next = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
        const rands = Array.from({ length: 10000 }, next);
        for (const phase of [0, 0.37, 5.9, 123.456]) {
            for (const depth of [0.2, 0.5, 1]) {
                const mean = rands.reduce((sum, r) => sum + dustTwinkle(r, phase, depth), 0) / rands.length;
                expect(Math.abs(mean - 1)).toBeLessThan(0.02);
            }
        }
    });

    it('puts the same twinkle expression in the vertex shader as the mirror', () => {
        // The CPU mirror and the GLSL must agree, or the checked mean is not the mean the screen shows.
        expect(dustVertexShader).toContain('vTwinkle = 1.0 + uDepth * sin(6.2831853 * (uPhase + aRand));');
    });

    it('swings by exactly the depth around 1 and never goes negative at depth 1', () => {
        for (let i = 0; i <= 100; i++) {
            const v = dustTwinkle(i / 100, 0.2, 0.5);
            expect(v).toBeGreaterThanOrEqual(0.5 - 1e-9);
            expect(v).toBeLessThanOrEqual(1.5 + 1e-9);
        }
        expect(dustTwinkle(0.5, 0, 1)).toBeGreaterThanOrEqual(-1e-6);
    });

    it('declares the uniforms the field sets and the same sine as the mirror', () => {
        for (const name of ['uPhase', 'uDepth', 'uSize', 'uPointScale', 'uMaxPointSize', 'aRand']) {
            expect(dustVertexShader).toContain(name);
        }
        expect(dustVertexShader).toContain('sin(6.2831853 * (uPhase + aRand))');
        expect(dustFragmentShader).toContain('uColor');
        expect(dustFragmentShader).toContain('uAlpha');
    });
});
