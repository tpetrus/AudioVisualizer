import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dustFragmentShader, dustVertexShader } from '../../meshes/dustShaders';
import { inkFragmentShader, inkVertexShader } from '../../meshes/inkShaders';
import { sprayFragmentShader, sprayVertexShader } from '../../meshes/sprayShaders';
import type { BassInkPost } from '../bassInkPost';
import { DustField } from '../dustField';
import { InkCloud } from '../inkCloud';
import { SprayPool } from '../sprayPool';
import { buildBassInkEnhanced, type BassInkEnhancedHandle, type BassInkMaterials } from './bassInkEnhanced';
import * as config from './bassInkEnhancedConfig';
import * as shaders from './bassInkEnhancedShaders';

// The passes run shaders, so they are replaced by recorders. vi.mock is hoisted, hence the hoisted record.
const rec = vi.hoisted(() => {
    class Pass {
        enabled = true;
        dispose = vi.fn();
    }
    // failGrade makes the next grade pass throw in its constructor.
    return { Pass, blooms: [] as unknown[], grades: [] as unknown[], failGrade: false };
});

vi.mock('three/addons/postprocessing/ShaderPass.js', () => ({
    ShaderPass: class extends rec.Pass {
        uniforms: Record<string, { value: unknown }>;
        constructor(public shader: { uniforms: Record<string, { value: unknown }> }) {
            super();
            if (rec.failGrade) throw new Error('grade failed');
            this.uniforms = shader.uniforms;
            rec.grades.push(this);
        }
    },
}));
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({
    UnrealBloomPass: class extends rec.Pass {
        sizes: [number, number][] = [];
        constructor(
            public resolution: { x: number; y: number },
            public strength: number,
            public radius: number,
            public threshold: number,
        ) {
            super();
            rec.blooms.push(this);
        }
        setSize(width: number, height: number) {
            this.sizes.push([width, height]);
        }
    },
}));

type Recorded = InstanceType<typeof rec.Pass>;
type Bloom = Recorded & {
    sizes: [number, number][];
    strength: number;
    radius: number;
    threshold: number;
    setSize(width: number, height: number): void;
};
type Grade = Recorded & { uniforms: Record<string, { value: unknown }> };

function setup(size = { width: 800, height: 600 }, pixelRatio = 2) {
    const renderer = { getPixelRatio: () => pixelRatio } as unknown as THREE.WebGLRenderer;
    const setExtraPasses = vi.fn();
    const post = { setExtraPasses } as unknown as BassInkPost;
    const cloud = new InkCloud(64, 1, 64);
    const core = new InkCloud(64, 2, 64);
    const dust = new DustField(16, 3, 64);
    const spray = new SprayPool(16, 4, 64);
    const materials: BassInkMaterials = {
        shell: cloud.material,
        core: core.material,
        dust: dust.material,
        spray: spray.material,
    };
    const handle = buildBassInkEnhanced({ renderer, post, size }, materials);
    const bloom = rec.blooms[rec.blooms.length - 1] as Bloom;
    const grade = rec.grades[rec.grades.length - 1] as Grade;
    return { handle, materials, setExtraPasses, bloom, grade, renderer, post };
}

const SLOW = 1 / 30;
const FAST = 1 / 120;

function feed(handle: BassInkEnhancedHandle, seconds: number, frames: number) {
    for (let i = 0; i < frames; i++) handle.step(seconds);
}

beforeEach(() => {
    rec.blooms.length = 0;
    rec.grades.length = 0;
});

describe('build', () => {
    it('hands two disabled passes to the post and starts in the standard look', () => {
        const { handle, setExtraPasses, bloom, grade, materials } = setup();
        expect(setExtraPasses).toHaveBeenCalledTimes(1);
        expect(setExtraPasses.mock.calls[0][0]).toEqual([bloom, grade]);
        expect(bloom.enabled).toBe(false);
        expect(grade.enabled).toBe(false);
        expect(handle.enabled).toBe(false);
        expect(handle.renderScale).toBe(1);
        expect(materials.shell.vertexShader).toBe(inkVertexShader);
        expect(materials.shell.defines.BASS_INK_ENHANCED).toBeUndefined();
    });

    it('sizes the bloom to the configured share of the device pixels (it halves what it is given)', () => {
        const { bloom } = setup({ width: 800, height: 600 }, 2);
        const [w, h] = bloom.sizes[bloom.sizes.length - 1];
        expect(w).toBe(Math.round(1600 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 2));
        expect(h).toBe(Math.round(1200 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 2));
    });

    it('also sizes the bloom to the share when the composer hands it the full size', () => {
        const { bloom } = setup({ width: 800, height: 600 }, 1);
        bloom.setSize(1000, 500);
        const [w, h] = bloom.sizes[bloom.sizes.length - 1];
        expect(w).toBe(Math.round(1000 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 2));
        expect(h).toBe(Math.round(500 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 2));
    });

    it('configures the passes from the config constants', () => {
        const { bloom, grade } = setup();
        expect(bloom.strength).toBe(config.ENHANCED_BLOOM_STRENGTH);
        expect(bloom.radius).toBe(config.ENHANCED_BLOOM_RADIUS);
        expect(bloom.threshold).toBe(config.ENHANCED_BLOOM_THRESHOLD);
        expect(grade.uniforms.uEnhContrast.value).toBe(config.ENHANCED_GRADE_CONTRAST);
        expect(grade.uniforms.uEnhSaturation.value).toBe(config.ENHANCED_GRADE_SATURATION);
        expect(grade.uniforms.uEnhVignetteStrength.value).toBe(config.ENHANCED_VIGNETTE_STRENGTH);
    });
});

describe('setEnabled', () => {
    it('swaps in the variants, sets the define and enables the passes', () => {
        const { handle, materials, bloom, grade } = setup();
        handle.setEnabled(true);
        expect(handle.enabled).toBe(true);
        expect(bloom.enabled).toBe(true);
        expect(grade.enabled).toBe(true);
        for (const m of [materials.shell, materials.core]) {
            expect(m.vertexShader).toBe(shaders.enhancedInkVertexShader);
            expect(m.fragmentShader).toBe(shaders.enhancedInkFragmentShader);
        }
        expect(materials.dust.vertexShader).toBe(shaders.enhancedDustVertexShader);
        expect(materials.dust.fragmentShader).toBe(shaders.enhancedDustFragmentShader);
        expect(materials.spray.vertexShader).toBe(shaders.enhancedSprayVertexShader);
        expect(materials.spray.fragmentShader).toBe(shaders.enhancedSprayFragmentShader);
        for (const m of Object.values(materials)) expect(m.defines.BASS_INK_ENHANCED).toBeDefined();
    });

    it('puts back the exact standard strings and removes the define (AC12)', () => {
        const { handle, materials, bloom, grade } = setup();
        handle.setEnabled(true);
        handle.setEnabled(false);
        expect(materials.shell.vertexShader).toBe(inkVertexShader);
        expect(materials.shell.fragmentShader).toBe(inkFragmentShader);
        expect(materials.core.vertexShader).toBe(inkVertexShader);
        expect(materials.core.fragmentShader).toBe(inkFragmentShader);
        expect(materials.dust.vertexShader).toBe(dustVertexShader);
        expect(materials.dust.fragmentShader).toBe(dustFragmentShader);
        expect(materials.spray.vertexShader).toBe(sprayVertexShader);
        expect(materials.spray.fragmentShader).toBe(sprayFragmentShader);
        for (const m of Object.values(materials)) expect(m.defines.BASS_INK_ENHANCED).toBeUndefined();
        expect(bloom.enabled).toBe(false);
        expect(grade.enabled).toBe(false);
    });

    it('restores the strings the material had when it was attached, not the standard ones', () => {
        const renderer = { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
        const post = { setExtraPasses: vi.fn() } as unknown as BassInkPost;
        const make = (tag: string) =>
            new THREE.ShaderMaterial({ vertexShader: `v-${tag}`, fragmentShader: `f-${tag}`, uniforms: {} });
        const materials = { shell: make('a'), core: make('b'), dust: make('c'), spray: make('d') };
        const handle = buildBassInkEnhanced({ renderer, post, size: { width: 100, height: 100 } }, materials);
        handle.setEnabled(true);
        handle.setEnabled(false);
        expect(materials.shell.vertexShader).toBe('v-a');
        expect(materials.spray.fragmentShader).toBe('f-d');
    });

    it('is idempotent and does not touch the materials when nothing changes', () => {
        const { handle, materials } = setup();
        handle.setEnabled(true);
        const versions = Object.values(materials).map((m) => m.version);
        handle.setEnabled(true);
        handle.setEnabled(true);
        expect(Object.values(materials).map((m) => m.version)).toEqual(versions);
        handle.setEnabled(false);
        const off = Object.values(materials).map((m) => m.version);
        handle.setEnabled(false);
        expect(Object.values(materials).map((m) => m.version)).toEqual(off);
        handle.setEnabled(true);
        expect(materials.shell.vertexShader).toBe(shaders.enhancedInkVertexShader);
    });

    it('creates nothing and hands the post nothing when unchanged', () => {
        const { handle, materials, setExtraPasses } = setup();
        handle.setEnabled(true);
        const uniformCounts = Object.values(materials).map((m) => Object.keys(m.uniforms).length);
        const defines = Object.values(materials).map((m) => m.defines);
        for (let i = 0; i < 1000; i++) {
            handle.setEnabled(true);
            handle.setGlow(1);
            handle.step(1 / 120);
        }
        // No new passes, no new uniforms, the same defines objects, and the post asked once (at the build).
        expect(rec.blooms).toHaveLength(1);
        expect(rec.grades).toHaveLength(1);
        expect(setExtraPasses).toHaveBeenCalledTimes(1);
        expect(Object.values(materials).map((m) => Object.keys(m.uniforms).length)).toEqual(uniformCounts);
        Object.values(materials).forEach((m, i) => expect(m.defines).toBe(defines[i]));
    });

    it('leaves standard uniform values alone and adds the uEnh uniforms', () => {
        const renderer = { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
        const post = { setExtraPasses: vi.fn() } as unknown as BassInkPost;
        const cloud = new InkCloud(8, 1, 64);
        const dust = new DustField(8, 1, 64);
        const spray = new SprayPool(8, 1, 64);
        const standard = (m: THREE.ShaderMaterial) =>
            Object.fromEntries(Object.entries(m.uniforms).map(([k, u]) => [k, u.value]));
        const before = [cloud.material, dust.material, spray.material].map(standard);
        const handle = buildBassInkEnhanced(
            { renderer, post, size: { width: 100, height: 100 } },
            { shell: cloud.material, core: cloud.material, dust: dust.material, spray: spray.material },
        );
        handle.setEnabled(true);
        handle.setEnabled(false);
        [cloud.material, dust.material, spray.material].forEach((m, i) => {
            const after = standard(m);
            for (const [key, v] of Object.entries(before[i])) expect(after[key]).toBe(v);
            expect(Object.keys(after).some((k) => k.startsWith('uEnh'))).toBe(true);
        });
    });

    it('is ignored after dispose', () => {
        const { handle, materials } = setup();
        handle.dispose();
        handle.setEnabled(true);
        expect(handle.enabled).toBe(false);
        expect(materials.shell.vertexShader).toBe(inkVertexShader);
    });
});

describe('setGlow', () => {
    it('scales the second bloom by the Glow control, never by anything else', () => {
        const { handle, bloom } = setup();
        handle.setEnabled(true);
        handle.setGlow(0.4);
        expect(bloom.strength).toBeCloseTo(config.ENHANCED_BLOOM_STRENGTH * 0.4, 12);
        expect(bloom.enabled).toBe(true);
        handle.setGlow(1);
        expect(bloom.strength).toBe(config.ENHANCED_BLOOM_STRENGTH);
        expect(bloom.radius).toBe(config.ENHANCED_BLOOM_RADIUS);
        expect(bloom.threshold).toBe(config.ENHANCED_BLOOM_THRESHOLD);
    });

    it('turns the second bloom off at Glow 0, and back on when Glow returns', () => {
        const { handle, bloom, grade } = setup();
        handle.setEnabled(true);
        handle.setGlow(0);
        expect(bloom.enabled).toBe(false);
        expect(grade.enabled).toBe(true);
        handle.setGlow(0.5);
        expect(bloom.enabled).toBe(true);
    });

    it('keeps the bloom off while the look is off, whatever the Glow', () => {
        const { handle, bloom } = setup();
        handle.setGlow(1);
        expect(bloom.enabled).toBe(false);
        handle.setEnabled(true);
        handle.setGlow(0);
        handle.setEnabled(false);
        handle.setGlow(0.7);
        expect(bloom.enabled).toBe(false);
    });

    it('clamps to 0..1, treats a non-finite value as 0 and ignores calls after dispose', () => {
        const { handle, bloom } = setup();
        handle.setEnabled(true);
        handle.setGlow(3);
        expect(bloom.strength).toBe(config.ENHANCED_BLOOM_STRENGTH);
        handle.setGlow(Number.NaN);
        expect(bloom.strength).toBe(0);
        expect(bloom.enabled).toBe(false);
        handle.setGlow(-1);
        expect(bloom.strength).toBe(0);
        handle.dispose();
        handle.setGlow(1);
        expect(bloom.strength).toBe(0);
    });
});

describe('render scale', () => {
    it('steps down one level per slow window and stops at the lowest', () => {
        const { handle, bloom } = setup();
        handle.setEnabled(true);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW);
        expect(handle.renderScale).toBe(0.75);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW);
        expect(handle.renderScale).toBe(0.5);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW * 3);
        expect(handle.renderScale).toBe(0.5);
        const [w] = bloom.sizes[bloom.sizes.length - 1];
        expect(w).toBe(Math.round(1600 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 0.5 * 2));
    });

    it('waits for a full window, never steps on fast frames and never steps back up', () => {
        const { handle } = setup();
        handle.setEnabled(true);
        feed(handle, FAST, config.ENHANCED_FRAME_WINDOW * 5);
        expect(handle.renderScale).toBe(1);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW - 1);
        expect(handle.renderScale).toBe(1);
        feed(handle, SLOW, 1);
        expect(handle.renderScale).toBe(0.75);
        feed(handle, FAST, config.ENHANCED_FRAME_WINDOW * 5);
        expect(handle.renderScale).toBe(0.75);
    });

    it('uses the median, so one slow frame does not step', () => {
        const { handle } = setup();
        handle.setEnabled(true);
        feed(handle, FAST, config.ENHANCED_FRAME_WINDOW - 1);
        handle.step(1);
        expect(handle.renderScale).toBe(1);
    });

    it('does nothing while disabled', () => {
        const { handle } = setup();
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW * 2);
        expect(handle.renderScale).toBe(1);
        handle.setEnabled(true);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW - 1);
        handle.setEnabled(false);
        handle.setEnabled(true);
        feed(handle, SLOW, 1);
        expect(handle.renderScale).toBe(1);
    });

    it('ignores non-finite and non-positive frame times', () => {
        const { handle } = setup();
        handle.setEnabled(true);
        for (const bad of [Number.NaN, Infinity, -1, 0]) feed(handle, bad, config.ENHANCED_FRAME_WINDOW * 2);
        expect(handle.renderScale).toBe(1);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW - 1);
        feed(handle, Number.NaN, 5);
        expect(handle.renderScale).toBe(1);
    });

    it('keeps the pass objects when the scale changes and never reads the config from audio', () => {
        const { handle, setExtraPasses, bloom, grade } = setup();
        handle.setEnabled(true);
        feed(handle, SLOW, config.ENHANCED_FRAME_WINDOW * 3);
        expect(setExtraPasses).toHaveBeenCalledTimes(1);
        expect(rec.blooms).toHaveLength(1);
        expect(bloom.strength).toBe(config.ENHANCED_BLOOM_STRENGTH);
        expect(bloom.radius).toBe(config.ENHANCED_BLOOM_RADIUS);
        expect(bloom.threshold).toBe(config.ENHANCED_BLOOM_THRESHOLD);
        expect(grade.uniforms.uEnhKnee.value).toBe(config.ENHANCED_GRADE_KNEE);
        expect(grade.uniforms.uEnhVignetteRadius.value).toBe(config.ENHANCED_VIGNETTE_RADIUS);
        expect(grade.uniforms.uEnhRange.value).toBe(config.ENHANCED_GRADE_RANGE);
    });
});

describe('setSize', () => {
    it('resizes the bloom in place and skips it when tiny', () => {
        const { handle, bloom } = setup({ width: 800, height: 600 }, 1);
        handle.setEnabled(true);
        handle.setSize({ width: 400, height: 300 });
        const [w, h] = bloom.sizes[bloom.sizes.length - 1];
        expect(w).toBe(Math.round(400 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 2));
        expect(h).toBe(Math.round(300 * config.ENHANCED_BLOOM_RESOLUTION_SHARE * 2));
        expect(bloom.enabled).toBe(true);
        handle.setSize({ width: 20, height: 300 });
        expect(bloom.enabled).toBe(false);
        handle.setSize({ width: 800, height: 600 });
        expect(bloom.enabled).toBe(true);
    });

    it('is a no-op after dispose', () => {
        const { handle, bloom } = setup();
        handle.dispose();
        const count = bloom.sizes.length;
        handle.setSize({ width: 10, height: 10 });
        expect(bloom.sizes).toHaveLength(count);
    });
});

describe('setMaterials', () => {
    function fresh() {
        return {
            shell: new InkCloud(8, 5, 64).material,
            core: new InkCloud(8, 6, 64).material,
            dust: new DustField(8, 7, 64).material,
            spray: new SprayPool(8, 8, 64).material,
        };
    }

    it('moves the state to the new materials and restores the old ones', () => {
        const { handle, materials } = setup();
        handle.setEnabled(true);
        const next = fresh();
        handle.setMaterials(next);
        expect(materials.shell.vertexShader).toBe(inkVertexShader);
        expect(materials.dust.defines.BASS_INK_ENHANCED).toBeUndefined();
        expect(next.shell.vertexShader).toBe(shaders.enhancedInkVertexShader);
        expect(next.spray.fragmentShader).toBe(shaders.enhancedSprayFragmentShader);
        expect(next.core.defines.BASS_INK_ENHANCED).toBeDefined();
        expect(Object.keys(next.dust.uniforms).some((k) => k.startsWith('uEnh'))).toBe(true);
    });

    it('leaves new materials standard while off, and keeps a retained material attached', () => {
        const { handle, materials } = setup();
        const next = { ...fresh(), dust: materials.dust };
        handle.setMaterials(next);
        expect(next.shell.vertexShader).toBe(inkVertexShader);
        handle.setEnabled(true);
        expect(materials.dust.vertexShader).toBe(shaders.enhancedDustVertexShader);
        handle.setMaterials({ ...fresh(), dust: materials.dust });
        expect(materials.dust.vertexShader).toBe(shaders.enhancedDustVertexShader);
        handle.setEnabled(false);
        expect(materials.dust.vertexShader).toBe(dustVertexShader);
    });

    it('tolerates one material in two slots and is ignored after dispose', () => {
        const { handle } = setup();
        const m = fresh();
        handle.setMaterials({ ...m, core: m.shell });
        handle.setEnabled(true);
        expect(m.shell.vertexShader).toBe(shaders.enhancedInkVertexShader);
        handle.dispose();
        const next = fresh();
        handle.setMaterials(next);
        expect(next.shell.defines.BASS_INK_ENHANCED).toBeUndefined();
    });
});

describe('a build that throws', () => {
    // A material whose uniforms cannot take the uEnh additions, so attaching it throws after the passes went to the post.
    function brokenMaterial(): THREE.ShaderMaterial {
        const material = new THREE.ShaderMaterial({ vertexShader: 'void main() {}', fragmentShader: 'void main() {}' });
        material.uniforms = Object.freeze({}) as Record<string, THREE.IUniform>;
        return material;
    }
    const renderer = { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
    const size = { width: 100, height: 100 };

    it('takes its passes out of the post, frees them, restores attached materials and rethrows', () => {
        const setExtraPasses = vi.fn();
        const post = { setExtraPasses } as unknown as BassInkPost;
        const cloud = new InkCloud(8, 1, 64);
        const dust = new DustField(8, 1, 64);
        expect(() =>
            buildBassInkEnhanced(
                { renderer, post, size },
                { shell: cloud.material, core: cloud.material, dust: dust.material, spray: brokenMaterial() },
            ),
        ).toThrow(TypeError);
        const bloom = rec.blooms[0] as Bloom;
        const grade = rec.grades[0] as Grade;
        expect(setExtraPasses.mock.calls.map((call) => call[0] as unknown)).toEqual([[bloom, grade], []]);
        expect(bloom.dispose).toHaveBeenCalledTimes(1);
        expect(grade.dispose).toHaveBeenCalledTimes(1);
        expect(cloud.material.vertexShader).toBe(inkVertexShader);
        expect(cloud.material.defines.BASS_INK_ENHANCED).toBeUndefined();
    });

    it('rethrows the original error even when undoing fails too', () => {
        const setExtraPasses = vi.fn((passes: unknown[]) => {
            if (passes.length === 0) throw new Error('post gone');
        });
        const post = { setExtraPasses } as unknown as BassInkPost;
        const cloud = new InkCloud(8, 1, 64);
        expect(() =>
            buildBassInkEnhanced(
                { renderer, post, size },
                { shell: cloud.material, core: cloud.material, dust: brokenMaterial(), spray: brokenMaterial() },
            ),
        ).toThrow(TypeError);
        expect((rec.blooms[0] as Bloom).dispose).toHaveBeenCalledTimes(1);
    });

    it('frees the bloom when the grade pass cannot be built, and hands the post no pass', () => {
        const setExtraPasses = vi.fn();
        const post = { setExtraPasses } as unknown as BassInkPost;
        rec.failGrade = true;
        try {
            expect(() =>
                buildBassInkEnhanced(
                    { renderer, post, size },
                    {
                        shell: new InkCloud(8, 1, 64).material,
                        core: new InkCloud(8, 2, 64).material,
                        dust: new DustField(8, 1, 64).material,
                        spray: new SprayPool(8, 1, 64).material,
                    },
                ),
            ).toThrow('grade failed');
        } finally {
            rec.failGrade = false;
        }
        expect((rec.blooms[0] as Bloom).dispose).toHaveBeenCalledTimes(1);
        expect(setExtraPasses.mock.calls.map((call) => call[0] as unknown)).toEqual([[]]);
    });
});

describe('dispose', () => {
    it('restores the standard look, clears the extra passes and frees each pass once, idempotently', () => {
        const { handle, materials, setExtraPasses, bloom, grade } = setup();
        handle.setEnabled(true);
        handle.dispose();
        handle.dispose();
        expect(materials.shell.vertexShader).toBe(inkVertexShader);
        expect(materials.dust.defines.BASS_INK_ENHANCED).toBeUndefined();
        expect(setExtraPasses).toHaveBeenCalledTimes(2);
        expect(setExtraPasses).toHaveBeenLastCalledWith([]);
        expect(bloom.dispose).toHaveBeenCalledTimes(1);
        expect(grade.dispose).toHaveBeenCalledTimes(1);
        expect(handle.enabled).toBe(false);
        handle.step(SLOW);
        handle.setEnabled(true);
        expect(handle.enabled).toBe(false);
    });
});

describe('shaders', () => {
    const pairs: [string, string, string][] = [
        ['ink', shaders.enhancedInkVertexShader, shaders.enhancedInkFragmentShader],
        ['dust', shaders.enhancedDustVertexShader, shaders.enhancedDustFragmentShader],
        ['spray', shaders.enhancedSprayVertexShader, shaders.enhancedSprayFragmentShader],
        ['grade', shaders.gradeVertexShader, shaders.gradeFragmentShader],
    ];
    const varyings = (source: string) => [...source.matchAll(/^\s*varying\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]);

    it.each(pairs)('%s: every fragment varying is declared by the vertex shader', (_name, vertex, fragment) => {
        const declared = varyings(vertex);
        for (const name of varyings(fragment)) expect(declared).toContain(name);
    });

    it.each(pairs)('%s: the fragment stage has no time or music input', (_name, _vertex, fragment) => {
        expect(fragment).not.toMatch(/uTime|uKick|uSpectrum|uHigh\b|uMid\b|uSwell\b|uPunch|uBreath/);
    });

    // Every input the music or time can reach is a standard uniform, so a variant may only add constant `uEnh*` ones.
    // Checked per stage against the standard shaders of the same kind: a new music input in either stage fails here.
    const uniforms = (source: string) => [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
    const standardPairs: [string, string, string, string, string][] = [
        ['ink', inkVertexShader, inkFragmentShader, shaders.enhancedInkVertexShader, shaders.enhancedInkFragmentShader],
        [
            'dust',
            dustVertexShader,
            dustFragmentShader,
            shaders.enhancedDustVertexShader,
            shaders.enhancedDustFragmentShader,
        ],
        [
            'spray',
            sprayVertexShader,
            sprayFragmentShader,
            shaders.enhancedSprayVertexShader,
            shaders.enhancedSprayFragmentShader,
        ],
    ];
    it.each(standardPairs)(
        '%s: both stages add only uEnh uniforms over the standard shaders',
        (_name, vertex, fragment, enhancedVertex, enhancedFragment) => {
            // A stage may read a uniform either standard stage already had: the value is the same one.
            const standard = new Set([...uniforms(vertex), ...uniforms(fragment)]);
            for (const name of [...uniforms(enhancedVertex), ...uniforms(enhancedFragment)]) {
                if (standard.has(name)) continue;
                expect(name).toMatch(/^uEnh/);
            }
        },
    );

    it('the grade pass reads only its input image and uEnh constants', () => {
        for (const name of uniforms(shaders.gradeFragmentShader)) expect(name).toMatch(/^(tDiffuse|uEnh\w+)$/);
    });

    it('the ink variant keeps every varying and uniform the standard vertex shader declares', () => {
        const names = (source: string) =>
            [...source.matchAll(/^\s*(?:uniform|attribute)\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
        for (const name of names(inkVertexShader)) expect(names(shaders.enhancedInkVertexShader)).toContain(name);
        for (const name of varyings(inkVertexShader)) expect(varyings(shaders.enhancedInkVertexShader)).toContain(name);
        for (const name of names(dustVertexShader)) expect(names(shaders.enhancedDustVertexShader)).toContain(name);
        for (const name of names(sprayVertexShader)) expect(names(shaders.enhancedSprayVertexShader)).toContain(name);
    });

    it('keeps uBrightness as the ink variant brightness input and ends every fragment in the colorspace include', () => {
        expect(shaders.enhancedInkFragmentShader).toContain('(1.0 + uBrightness)');
        for (const [name, , fragment] of pairs) {
            if (name === 'grade') continue;
            expect(fragment).toContain('#include <colorspace_fragment>');
        }
    });

    it('declares every uEnh uniform a stage reads', () => {
        for (const [, vertex, fragment] of pairs) {
            for (const source of [vertex, fragment]) {
                const used = new Set(source.match(/\buEnh\w+/g) ?? []);
                const declared = new Set([...source.matchAll(/uniform\s+\w+\s+(uEnh\w+)/g)].map((m) => m[1]));
                for (const name of used) expect(declared).toContain(name);
            }
        }
    });

    it('every uEnh uniform a shader declares is supplied by the look', () => {
        const { materials, grade } = setup();
        const supplied = (m: THREE.ShaderMaterial) => Object.keys(m.uniforms);
        const declared = (source: string) => [...source.matchAll(/uniform\s+\w+\s+(uEnh\w+)/g)].map((x) => x[1]);
        for (const [m, v, f] of [
            [materials.shell, shaders.enhancedInkVertexShader, shaders.enhancedInkFragmentShader],
            [materials.dust, shaders.enhancedDustVertexShader, shaders.enhancedDustFragmentShader],
            [materials.spray, shaders.enhancedSprayVertexShader, shaders.enhancedSprayFragmentShader],
        ] as [THREE.ShaderMaterial, string, string][]) {
            for (const name of [...declared(v), ...declared(f)]) expect(supplied(m)).toContain(name);
        }
        for (const name of declared(shaders.gradeFragmentShader)) expect(Object.keys(grade.uniforms)).toContain(name);
    });
});
