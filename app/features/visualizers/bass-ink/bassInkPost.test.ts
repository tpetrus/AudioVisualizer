import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BassInkPost } from './bassInkPost';
import { bassInkSceneConfig } from './bassInkSceneConfig';

// The passes run shaders, so they are replaced by recorders of what the post does to them. vi.mock is hoisted, hence
// the hoisted record the factories write to.
const rec = vi.hoisted(() => {
    class Pass {
        enabled = true;
        dispose = vi.fn();
        sizes: [number, number][] = [];
        setSize(width: number, height: number) {
            this.sizes.push([width, height]);
        }
    }
    return { Pass, composers: [] as unknown[], afterimages: [] as unknown[], blooms: [] as unknown[] };
});

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
    EffectComposer: class {
        passes: InstanceType<typeof rec.Pass>[] = [];
        size: [number, number] | undefined;
        render = vi.fn();
        dispose = vi.fn();
        setSize = vi.fn((width: number, height: number) => {
            this.size = [width, height];
        });
        addPass = vi.fn((pass: InstanceType<typeof rec.Pass>) => {
            this.passes.push(pass);
        });
        insertPass = vi.fn((pass: InstanceType<typeof rec.Pass>, index: number) => {
            this.passes.splice(index, 0, pass);
        });
        removePass = vi.fn((pass: InstanceType<typeof rec.Pass>) => {
            this.passes.splice(this.passes.indexOf(pass), 1);
        });
        constructor(public renderer: unknown) {
            rec.composers.push(this);
        }
    },
}));
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
    RenderPass: class extends rec.Pass {
        constructor(
            public scene: unknown,
            public camera: unknown,
        ) {
            super();
        }
    },
}));
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({ OutputPass: class extends rec.Pass {} }));
vi.mock('three/addons/postprocessing/AfterimagePass.js', () => ({
    AfterimagePass: class extends rec.Pass {
        uniforms = { damp: { value: 0.96 } };
        constructor() {
            super();
            rec.afterimages.push(this);
        }
    },
}));
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({
    UnrealBloomPass: class extends rec.Pass {
        constructor(
            public resolution: { x: number; y: number },
            public strength: number,
            public radius: number,
            public threshold: number,
        ) {
            super();
            rec.blooms.push(this);
        }
    },
}));

type Composer = {
    passes: InstanceType<typeof rec.Pass>[];
    size: [number, number] | undefined;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    insertPass: ReturnType<typeof vi.fn>;
};
type Afterimage = InstanceType<typeof rec.Pass> & { uniforms: { damp: { value: number } } };
type Bloom = InstanceType<typeof rec.Pass> & {
    resolution: { x: number; y: number };
    strength: number;
    radius: number;
    threshold: number;
    sizes: [number, number][];
};

const composers = () => rec.composers as Composer[];
const afterimages = () => rec.afterimages as Afterimage[];
const blooms = () => rec.blooms as Bloom[];
const { post: config } = bassInkSceneConfig;

// By default each reading is one 60 fps frame after the last, so a spec that does not care about timing sees the
// configured damp as it is.
function sixtyFpsClock() {
    let t = 0;
    return () => (t += 1000 / 60);
}

function setup(software = false, pixelRatio = 2, now?: () => number) {
    const renderer = { render: vi.fn(), getPixelRatio: () => pixelRatio } as unknown as THREE.WebGLRenderer & {
        render: ReturnType<typeof vi.fn>;
    };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const post = new BassInkPost(
        renderer,
        scene,
        camera,
        { width: 800, height: 600 },
        software,
        now ?? sixtyFpsClock(),
    );
    return { renderer, scene, camera, post };
}

describe('BassInkPost', () => {
    beforeEach(() => {
        rec.composers.length = 0;
        rec.afterimages.length = 0;
        rec.blooms.length = 0;
    });

    it('never builds a composer on a software renderer, and renders plainly', () => {
        const { post, renderer, scene, camera } = setup(true);

        post.apply({ trails: 1, glow: 1 });
        post.render();

        expect(composers()).toHaveLength(0);
        expect(renderer.render).toHaveBeenCalledWith(scene, camera);
        expect(post.active).toBe(false);
    });

    it('renders plainly before the first apply', () => {
        const { post, renderer, scene, camera } = setup();

        post.render();

        expect(composers()).toHaveLength(0);
        expect(renderer.render).toHaveBeenCalledWith(scene, camera);
        expect(post.active).toBe(false);
    });

    // A plain render blends the points after the sRGB conversion and the composer in linear light, so switching
    // between them would make the frame jump; on a real GPU the composer is the only path.
    it('draws through the composer with both passes off, so the look never switches paths', () => {
        const { post, renderer } = setup();

        post.apply({ trails: 0, glow: 0 });
        post.render();

        expect(composers()).toHaveLength(1);
        expect(afterimages()[0].enabled).toBe(false);
        expect(composers()[0].render).toHaveBeenCalledTimes(1);
        expect(renderer.render).not.toHaveBeenCalled();
        expect(post.active).toBe(true);
    });

    it('builds the composer on the first pass turned on, with the four passes in order', () => {
        const { post, renderer, scene, camera } = setup();

        post.apply({ trails: 0.5, glow: 0 });

        expect(composers()).toHaveLength(1);
        const composer = composers()[0];
        expect(composer.passes).toHaveLength(4);
        expect(composer.passes[0]).toMatchObject({ scene, camera });
        expect(composer.passes[1]).toBe(afterimages()[0]);
        expect(composer.passes[2]).toBe(blooms()[0]);

        post.render();
        expect(composer.render).toHaveBeenCalledTimes(1);
        expect(renderer.render).not.toHaveBeenCalled();
        expect(post.active).toBe(true);
    });

    it('sets the damp to the trails value times the configured maximum', () => {
        const { post } = setup();

        post.apply({ trails: 0.5, glow: 0 });

        expect(afterimages()[0].uniforms.damp.value).toBeCloseTo(0.5 * config.trailsDampMax, 12);
        expect(afterimages()[0].enabled).toBe(true);
    });

    it('sets the bloom strength from the glow, with the radius and threshold from the config', () => {
        const { post } = setup();

        post.apply({ trails: 0, glow: 0.5 });

        const bloom = blooms()[0];
        expect(bloom.strength).toBeCloseTo(0.5 * config.bloomStrengthMax, 12);
        expect(bloom.radius).toBe(config.bloomRadius);
        expect(bloom.threshold).toBe(config.bloomThreshold);
        expect(bloom.enabled).toBe(true);
    });

    it('disables a pass whose control is 0 and keeps the other on', () => {
        const { post } = setup();

        post.apply({ trails: 0.4, glow: 0 });
        expect(afterimages()[0].enabled).toBe(true);
        expect(blooms()[0].enabled).toBe(false);

        post.apply({ trails: 0, glow: 0.4 });
        expect(afterimages()[0].enabled).toBe(false);
        expect(blooms()[0].enabled).toBe(true);
    });

    it('stays on the composer when both go back to 0, with both passes off', () => {
        const { post, renderer } = setup();
        post.apply({ trails: 0.4, glow: 0.4 });
        post.render();

        post.apply({ trails: 0, glow: 0 });
        post.render();

        expect(composers()[0].render).toHaveBeenCalledTimes(2);
        expect(renderer.render).not.toHaveBeenCalled();
        expect(afterimages().at(-1)!.enabled).toBe(false);
        expect(post.active).toBe(true);
    });

    it('clears the old frame when trails turn back on, by replacing the afterimage pass in place', () => {
        const { post } = setup();
        post.apply({ trails: 0.4, glow: 0.4 });
        const first = afterimages()[0];

        // Turning trails off with the glow still on keeps the same pass (disabled) ...
        post.apply({ trails: 0, glow: 0.4 });
        expect(afterimages()).toHaveLength(1);
        expect(first.dispose).not.toHaveBeenCalled();

        // ... and turning them back on swaps in an empty one at the same place, and frees the stale one.
        post.apply({ trails: 0.6, glow: 0.4 });
        expect(afterimages()).toHaveLength(2);
        const fresh = afterimages()[1];
        expect(first.dispose).toHaveBeenCalledTimes(1);
        expect(composers()[0].passes[1]).toBe(fresh);
        expect(composers()[0].passes).toHaveLength(4);
        expect(fresh.enabled).toBe(true);
        expect(fresh.uniforms.damp.value).toBeCloseTo(0.6 * config.trailsDampMax, 12);

        // Moving the slider while trails stay on does not replace it again.
        post.apply({ trails: 0.8, glow: 0.4 });
        expect(afterimages()).toHaveLength(2);
    });

    it('also clears the old frame when trails return after a stretch of plain rendering', () => {
        const { post } = setup();
        post.apply({ trails: 0.4, glow: 0 });

        post.apply({ trails: 0, glow: 0 });
        post.apply({ trails: 0.4, glow: 0 });

        expect(afterimages()).toHaveLength(2);
    });

    it('sizes the composer, and the bloom at the configured share of the drawing size in device pixels', () => {
        const { post } = setup(false, 2);
        post.apply({ trails: 0.4, glow: 0.4 });
        const composer = composers()[0];
        const bloom = blooms()[0];

        const share = config.bloomResolutionScale;
        expect(composer.size).toEqual([800, 600]);
        expect(bloom.resolution.x).toBe(Math.round(800 * 2 * share));
        expect(bloom.resolution.y).toBe(Math.round(600 * 2 * share));

        post.setSize({ width: 1000, height: 500 });

        expect(composer.size).toEqual([1000, 500]);
        expect(bloom.resolution.x).toBe(Math.round(1000 * 2 * share));
        expect(bloom.resolution.y).toBe(Math.round(500 * 2 * share));
        // The bloom's own first target is half of what it is given, so it gets double the resolution.
        expect(bloom.sizes.at(-1)).toEqual([bloom.resolution.x * 2, bloom.resolution.y * 2]);
    });

    it('remembers a size set before the composer exists, and builds at it', () => {
        const { post } = setup();

        post.setSize({ width: 320, height: 200 });
        expect(composers()).toHaveLength(0);
        post.apply({ trails: 0.4, glow: 0 });

        expect(composers()[0].size).toEqual([320, 200]);
    });

    it('frees the composer and every pass once, however often it is disposed', () => {
        const { post } = setup();
        post.apply({ trails: 0.4, glow: 0.4 });
        const composer = composers()[0];
        const passes = [...composer.passes];

        post.dispose();
        post.dispose();

        expect(composer.dispose).toHaveBeenCalledTimes(1);
        for (const pass of passes) expect(pass.dispose).toHaveBeenCalledTimes(1);
        expect(post.active).toBe(false);
    });

    it('frees a replaced afterimage and the current one, each once', () => {
        const { post } = setup();
        post.apply({ trails: 0.4, glow: 0 });
        post.apply({ trails: 0, glow: 0 });
        post.apply({ trails: 0.4, glow: 0 });

        post.dispose();

        expect(afterimages()[0].dispose).toHaveBeenCalledTimes(1);
        expect(afterimages()[1].dispose).toHaveBeenCalledTimes(1);
    });

    it('does nothing after disposal, and a dispose before any build is harmless', () => {
        const { post, renderer, scene, camera } = setup();
        post.dispose();

        post.apply({ trails: 1, glow: 1 });
        post.render();

        expect(composers()).toHaveLength(0);
        expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    });

    it('allocates no new objects across repeated apply and render calls', () => {
        const { post } = setup();
        post.apply({ trails: 0.4, glow: 0.4 });
        post.render();

        for (let i = 0; i < 20; i++) {
            post.apply({ trails: 0.3 + i * 0.01, glow: 0.2 + i * 0.01 });
            post.render();
        }

        expect(composers()).toHaveLength(1);
        expect(afterimages()).toHaveLength(1);
        expect(blooms()).toHaveLength(1);
        expect(composers()[0].passes).toHaveLength(4);
        expect(composers()[0].render).toHaveBeenCalledTimes(21);
    });
});

// A clock the tests step by hand, in milliseconds.
function makeClock() {
    let t = 1000;
    return {
        clock: () => t,
        advance(ms: number) {
            t += ms;
        },
    };
}

// The damp applied on the second frame, `ms` after the first.
function dampAfter(ms: number, trails = 0.5): number {
    const t = makeClock();
    const { post } = setup(false, 2, t.clock);
    post.apply({ trails, glow: 0 });
    t.advance(ms);
    post.apply({ trails, glow: 0 });
    return afterimages().at(-1)!.uniforms.damp.value;
}

describe('BassInkPost frame-rate independence', () => {
    beforeEach(() => {
        rec.composers.length = 0;
        rec.afterimages.length = 0;
        rec.blooms.length = 0;
    });

    it('keeps the same retention per second at 30, 60 and 144 fps', () => {
        const perSecond = (fps: number) => dampAfter(1000 / fps) ** fps;
        expect(perSecond(30)).toBeCloseTo(perSecond(60), 9);
        expect(perSecond(144)).toBeCloseTo(perSecond(60), 9);
    });

    it('equals trails times the configured maximum at 60 fps', () => {
        expect(dampAfter(1000 / 60)).toBeCloseTo(0.5 * config.trailsDampMax, 9);
    });

    it('treats the first frame as a 60 fps frame', () => {
        const { post } = setup(false, 2, makeClock().clock);
        post.apply({ trails: 0.5, glow: 0 });
        expect(afterimages()[0].uniforms.damp.value).toBeCloseTo(0.5 * config.trailsDampMax, 9);
    });

    it('clamps a huge frame time to 0.1 s', () => {
        expect(dampAfter(60000)).toBeCloseTo(dampAfter(100), 12);
    });

    it('treats a clock that goes backwards as no time passing', () => {
        expect(dampAfter(-500)).toBeCloseTo(1, 12);
    });

    it('uses a 60 fps frame when the time is not finite', () => {
        expect(dampAfter(NaN)).toBeCloseTo(0.5 * config.trailsDampMax, 9);
    });

    it('keeps a damp of 0 at 0', () => {
        expect(dampAfter(1000 / 144, 0)).toBe(0);
        expect(dampAfter(0, 0)).toBe(0);
    });
});

describe('BassInkPost tiny view', () => {
    beforeEach(() => {
        rec.composers.length = 0;
        rec.afterimages.length = 0;
        rec.blooms.length = 0;
    });

    it('turns the bloom off under 32 device pixels on either side, and back on when it grows', () => {
        const { post } = setup(false, 2);
        post.apply({ trails: 0, glow: 0.5 });
        const bloom = blooms()[0];
        expect(bloom.enabled).toBe(true);

        // Width-limited: 15 * 2 = 30 px.
        post.setSize({ width: 15, height: 600 });
        expect(bloom.enabled).toBe(false);
        post.apply({ trails: 0, glow: 0.5 });
        expect(bloom.enabled).toBe(false);

        // Height-limited.
        post.setSize({ width: 800, height: 15 });
        post.apply({ trails: 0, glow: 0.5 });
        expect(bloom.enabled).toBe(false);

        // 16 * 2 = 32 is big enough.
        post.setSize({ width: 16, height: 16 });
        expect(bloom.enabled).toBe(true);

        post.setSize({ width: 800, height: 600 });
        post.apply({ trails: 0, glow: 0.5 });
        expect(bloom.enabled).toBe(true);
    });

    it('counts the pixel ratio: 20 css pixels is too small at ratio 1 and enough at ratio 2', () => {
        const small = setup(false, 1);
        small.post.apply({ trails: 0, glow: 0.5 });
        small.post.setSize({ width: 20, height: 20 });
        expect(blooms().at(-1)!.enabled).toBe(false);

        const big = setup(false, 2);
        big.post.apply({ trails: 0, glow: 0.5 });
        big.post.setSize({ width: 20, height: 20 });
        expect(blooms().at(-1)!.enabled).toBe(true);
    });

    it('keeps the bloom off when glow is 0, through shrinking and growing', () => {
        const { post } = setup(false, 2);
        post.apply({ trails: 0, glow: 0 });
        post.setSize({ width: 10, height: 10 });
        post.setSize({ width: 800, height: 600 });
        expect(blooms()[0].enabled).toBe(false);
    });
});
