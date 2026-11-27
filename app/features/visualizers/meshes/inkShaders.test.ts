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

// smoothstep as GLSL defines it, for the red guard.
function smoothstep(e0: number, e1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

describe('bandColor', () => {
    const luma = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const base = [0.3, 0.5, 0.2];
    // Not mostly red (share 0.58), so the red guard leaves the kick tint alone in the tests below.
    const core = [0.7, 0.3, 0.2];
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

    // The formula before the red guard and the channel cap, kept here as the reference for "unchanged where no cap applies".
    function oldBandColor(b: number[], c: number[], e: number[], bass: number, high: number, white: number): number[] {
        const out = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
            const toward = e[k] + (1 - e[k]) * white;
            const withBass = b[k] + (c[k] - b[k]) * bass;
            out[k] = withBass + (toward - withBass) * high;
        }
        const tinted = luma(out);
        if (luma(b) > 1e-4 && tinted > 1e-4) {
            const ratio = luma(b) / tinted;
            for (let k = 0; k < 3; k++) {
                out[k] *= ratio;
            }
        }
        return out;
    }

    const redShare = (c: number[]) => c[0] / Math.max(c[0] + c[1] + c[2], 1e-4);

    it('never exceeds 1 and keeps the base luminance over extreme palettes', () => {
        const random = seeded(42);
        const extremes = [0, 1];
        const palettes: number[][][] = [];
        for (const r of extremes) {
            for (const g of extremes) {
                for (const bl of extremes) {
                    palettes.push([
                        [0.05 + 0.1 * r, 0.05 + 0.1 * g, 0.05 + 0.1 * bl],
                        [r, g, bl],
                        [1 - r, 1 - g, 1 - bl],
                    ]);
                }
            }
        }
        palettes.push([
            [0.1, 0.1, 0.1],
            [1, 1, 1],
            [1, 1, 1],
        ]);
        for (let i = 0; i < 600; i++) {
            const pick = () => (random() < 0.4 ? (random() < 0.5 ? 0 : 1) : random());
            palettes.push([
                [random(), random(), random()],
                [pick(), pick(), pick()],
                [pick(), pick(), pick()],
            ]);
        }
        const out = [0, 0, 0];
        for (const [b, c, e] of palettes) {
            for (const [bass, high, white] of [
                [random(), random(), random()],
                [1, 1, 1],
                [1, 0, 0],
                [0, 1, 1],
            ]) {
                bandColor(b, c, e, bass, high, white, out);
                expect(Math.max(...out)).toBeLessThanOrEqual(1 + 1e-6);
                const kickScale = 1 - smoothstep(0.7, 0.8, redShare(c));
                const raw = [0, 0, 0];
                for (let k = 0; k < 3; k++) {
                    const withBass = b[k] + (c[k] - b[k]) * bass * kickScale;
                    raw[k] = withBass + (e[k] + (1 - e[k]) * white - withBass) * high;
                }
                if (luma(b) > 1e-4 && luma(raw) > 1e-4) {
                    expect(Math.abs(luma(out) - luma(b))).toBeLessThan(1e-6);
                }
            }
        }
    });

    it('matches the old formula where nothing exceeds 1 and the core is not mostly red', () => {
        const random = seeded(99);
        const out = [0, 0, 0];
        let compared = 0;
        for (let i = 0; i < 800; i++) {
            const b = [random(), random(), random()];
            const c = [random(), random(), random()];
            const e = [random(), random(), random()];
            const bass = random();
            const high = random();
            const white = random();
            const old = oldBandColor(b, c, e, bass, high, white);
            if (Math.max(...old) > 1 || redShare(c) > 0.7) {
                continue;
            }
            bandColor(b, c, e, bass, high, white, out);
            compared++;
            for (let k = 0; k < 3; k++) {
                expect(out[k]).toBeCloseTo(old[k], 12);
            }
        }
        expect(compared).toBeGreaterThan(100);
    });

    it('gives no kick tint for a core with red share of 0.8 or more', () => {
        const red = [1, 0.05, 0.05];
        expect(redShare(red)).toBeGreaterThanOrEqual(0.8);
        const none = [0, 0, 0];
        const full = [0, 0, 0];
        bandColor(base, red, edge, 0, 0, 0, none);
        bandColor(base, red, edge, 1, 0, 0, full);
        expect(full).toEqual(none);
    });

    it('fades the kick tint in monotonically as the red share falls from 0.8 to 0.7', () => {
        const dist: number[] = [];
        const out = [0, 0, 0];
        for (const share of [0.8, 0.77, 0.74, 0.71, 0.69]) {
            const rest = (1 - share) / 2;
            bandColor(base, [share, rest, rest], edge, 1, 0, 0, out);
            dist.push(Math.hypot(out[0] - base[0], out[1] - base[1], out[2] - base[2]));
        }
        expect(dist[0]).toBeCloseTo(0, 12);
        for (let i = 1; i < dist.length; i++) {
            expect(dist[i]).toBeGreaterThan(dist[i - 1]);
        }
    });

    it('still tints with the glint for a red core', () => {
        const red = [1, 0.05, 0.05];
        const none = [0, 0, 0];
        const lit = [0, 0, 0];
        bandColor(base, red, edge, 0, 0, 0.5, none);
        bandColor(base, red, edge, 0, 1, 0.5, lit);
        expect(Math.hypot(lit[0] - none[0], lit[1] - none[1], lit[2] - none[2])).toBeGreaterThan(0.01);
    });

    it('keeps the GLSL guard and cap paired with the TypeScript', () => {
        expect(inkFragmentShader).toContain('smoothstep(0.7, 0.8');
        expect(inkFragmentShader).toContain('vBass * kickScale');
        expect(inkFragmentShader).toContain('vec3 base = color;');
        expect(inkFragmentShader).toContain('step(vec3(1.0), color)');
    });
});
