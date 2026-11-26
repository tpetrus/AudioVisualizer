import { describe, expect, it } from 'vitest';
import { KICK_SLOTS } from '~/features/visualizers/bass-ink/bassInkTypes';
import { bassInkSceneConfig } from '~/features/visualizers/bass-ink/bassInkSceneConfig';
import { INK_KICK_SLOTS, bandColor, depthFade, inkFragmentShader, inkVertexShader } from './inkShaders';

describe('ink shaders', () => {
    it('sum as many shockwaves as the kick ring holds', () => {
        expect(INK_KICK_SLOTS).toBe(KICK_SLOTS);
        expect(inkVertexShader).toContain(`uKickTimes[${KICK_SLOTS}]`);
    });

    it('keep ripples out of the fragment stage: brightness comes only from uBrightness', () => {
        expect(inkFragmentShader).not.toMatch(/uKick|uWave/);
        expect(inkFragmentShader).toContain('uBrightness');
        // The vertex stage hands nothing but the radial position, the depth fade and the two band tints on.
        expect(inkVertexShader.match(/^varying .*$/gm)).toEqual([
            'varying float vRadial;',
            'varying float vDepth;',
            'varying float vBass;',
            'varying float vHigh;',
        ]);
    });

    it('scales the radius by the bass swell, as displacement only', () => {
        expect(inkVertexShader).toContain('uSwell');
        expect(inkVertexShader).toContain('(1.0 + uSwellAmp * uSwell)');
        expect(inkFragmentShader).not.toContain('uSwell');
    });

    it('reads the high band in the vertex stage only: the fragment stage gets it as the vHigh tint', () => {
        expect(inkVertexShader).toContain('uHigh');
        expect(inkFragmentShader).not.toMatch(/\buHigh\b/);
    });

    it('declares the band tint uniforms and varyings, and the luminance weights in the fragment', () => {
        for (const name of ['uBassTint', 'uSwellTint', 'uHighTint']) {
            expect(inkVertexShader).toContain(`uniform float ${name};`);
        }
        expect(inkFragmentShader).toContain('uniform float uHighWhite;');
        for (const name of ['vBass', 'vHigh']) {
            expect(inkVertexShader).toContain(`varying float ${name};`);
            expect(inkFragmentShader).toContain(`varying float ${name};`);
        }
        expect(inkFragmentShader).toContain('vec3(0.2126, 0.7152, 0.0722)');
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

        it('ships the fade line and the center-relative depth line', () => {
            expect(inkVertexShader).toContain('vDepth = 1.0 - uDepthFade * depthK;');
            expect(inkVertexShader).toContain('float relativeDepth = -mv.z - (-center.z);');
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

describe('bandColor', () => {
    const luma = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const base = [0.3, 0.5, 0.2];
    const core = [0.9, 0.1, 0.1];
    const edge = [0.1, 0.3, 0.9];

    // A small seeded generator (mulberry32), so the random inputs are the same every run.
    function seeded(seed: number): () => number {
        let a = seed;
        return () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    it('preserves the luminance of the base within 1e-6 for random inputs', () => {
        const random = seeded(7);
        const out = [0, 0, 0];
        for (let i = 0; i < 500; i++) {
            const b = [0.05 + random(), 0.05 + random(), 0.05 + random()];
            const c = [random(), random(), random()];
            const e = [random(), random(), random()];
            bandColor(b, c, e, random(), random(), random(), out);
            expect(Math.abs(luma(out) - luma(b))).toBeLessThan(1e-6);
        }
    });

    it('returns the base at bass 0 and high 0', () => {
        const out = [0, 0, 0];
        bandColor(base, core, edge, 0, 0, 0.5, out);
        for (let k = 0; k < 3; k++) {
            expect(out[k]).toBeCloseTo(base[k], 9);
        }
    });

    it('moves toward the core as bass rises', () => {
        const low = [0, 0, 0];
        const high = [0, 0, 0];
        bandColor(base, core, edge, 0.2, 0, 0, low);
        bandColor(base, core, edge, 0.8, 0, 0, high);
        const dist = (c: number[]) => Math.hypot(c[0] - core[0], c[1] - core[1], c[2] - core[2]);
        expect(dist(high)).toBeLessThan(dist(low));
    });

    it('moves toward the whitened edge as high rises', () => {
        const target = [0.1 + 0.9 * 0.5, 0.3 + 0.7 * 0.5, 0.9 + 0.1 * 0.5];
        const scaled = target.map((v) => (v * luma(base)) / luma(target));
        const low = [0, 0, 0];
        const high = [0, 0, 0];
        bandColor(base, core, edge, 0, 0.2, 0.5, low);
        bandColor(base, core, edge, 0, 1, 0.5, high);
        const dist = (c: number[]) => Math.hypot(c[0] - scaled[0], c[1] - scaled[1], c[2] - scaled[2]);
        expect(dist(high)).toBeLessThan(dist(low));
        expect(dist(high)).toBeLessThan(1e-9);
    });

    it('leaves a near-black base alone: the rescale is skipped', () => {
        const dark = [0.0001, 0.0001, 0.0001];
        const out = [0, 0, 0];
        bandColor(dark, core, edge, 1, 0, 0, out);
        expect(out).toEqual(core);
    });

    it('writes into the given array', () => {
        const out = new Float32Array(3);
        bandColor(base, core, edge, 0.5, 0.5, 0.5, out);
        expect(out[0]).toBeGreaterThan(0);
    });
});
