// @vitest-environment jsdom
import * as THREE from 'three';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BassInkPost } from '../bassInkPost';
import { bassInkSceneConfig } from '../bassInkSceneConfig';
import { DustField } from '../dustField';
import { InkCloud } from '../inkCloud';
import { SprayPool } from '../sprayPool';
import { buildBassInkEnhanced, type BassInkEnhancedHandle } from './bassInkEnhanced';
import { ENHANCED_BLOOM_RESOLUTION_SHARE, ENHANCED_RENDER_SCALES } from './bassInkEnhancedConfig';

// The other post specs replace the passes with recorders. This one uses the real three.js passes, which build their
// materials and render targets without a GL context, to check what those recorders cannot: the real composer's pass
// order and the real bloom's render-target sizes. Nothing is rendered.

const WIDTH = 800;
const HEIGHT = 600;
const RATIO = 2;

function fakeRenderer(): THREE.WebGLRenderer {
    return {
        getPixelRatio: () => RATIO,
        getSize: (target: THREE.Vector2) => target.set(WIDTH, HEIGHT),
    } as unknown as THREE.WebGLRenderer;
}

// The composer is private to BassInkPost; a spec reads it to inspect the real passes.
const composerOf = (post: BassInkPost) => (post as unknown as { composer: EffectComposer }).composer;
// UnrealBloomPass halves what it is given for its first (largest) mip target.
const firstMip = (bloom: UnrealBloomPass) => {
    const target = (bloom as unknown as { renderTargetsHorizontal: THREE.WebGLRenderTarget[] })
        .renderTargetsHorizontal[0];
    return [target.width, target.height];
};

describe('BassInkPost with the real passes', () => {
    const owned: { dispose(): void }[] = [];
    afterEach(() => {
        for (const item of owned.splice(0).reverse()) item.dispose();
    });

    function build() {
        const post = new BassInkPost(
            fakeRenderer(),
            new THREE.Scene(),
            new THREE.PerspectiveCamera(),
            {
                width: WIDTH,
                height: HEIGHT,
            },
            false,
        );
        owned.push(post);
        return post;
    }

    it('orders render, light ceiling, trails, bloom and output, and sizes the bloom to its share', () => {
        const post = build();
        post.apply({ trails: 0.5, glow: 0.5 });
        const passes = composerOf(post).passes;

        expect(passes).toHaveLength(5);
        expect(passes[0]).toBeInstanceOf(RenderPass);
        expect(passes[1]).toBeInstanceOf(ShaderPass);
        expect((passes[1] as ShaderPass).uniforms['uKnee'].value).toBe(bassInkSceneConfig.post.lightCeiling.knee);
        expect(passes[2]).toBeInstanceOf(AfterimagePass);
        expect(passes[3]).toBeInstanceOf(UnrealBloomPass);
        expect(passes[4]).toBeInstanceOf(OutputPass);

        const share = bassInkSceneConfig.post.bloomResolutionScale;
        expect(firstMip(passes[3] as UnrealBloomPass)).toEqual([
            Math.round(WIDTH * RATIO * share),
            Math.round(HEIGHT * RATIO * share),
        ]);
    });

    it('puts the enhanced bloom and grade before the output and keeps the bloom at its share after a resize', () => {
        const post = build();
        const cloud = new InkCloud(16, 1, 64);
        const core = new InkCloud(16, 2, 64);
        const dust = new DustField(8, 3, 64);
        const spray = new SprayPool(8, 4, 64);
        owned.push(cloud, core, dust, spray);
        const handle: BassInkEnhancedHandle = buildBassInkEnhanced(
            { renderer: fakeRenderer(), post, size: { width: WIDTH, height: HEIGHT } },
            { shell: cloud.material, core: core.material, dust: dust.material, spray: spray.material },
        );
        owned.push(handle);
        // The composer is built after the look handed over its passes, so it sizes them itself.
        post.apply({ trails: 0.5, glow: 0.5 });
        const passes = composerOf(post).passes;

        expect(passes).toHaveLength(7);
        expect(passes[3]).toBeInstanceOf(UnrealBloomPass);
        const enhancedBloom = passes[4] as UnrealBloomPass;
        expect(enhancedBloom).toBeInstanceOf(UnrealBloomPass);
        expect(enhancedBloom).not.toBe(passes[3]);
        expect(passes[5]).toBeInstanceOf(ShaderPass);
        expect(passes[6]).toBeInstanceOf(OutputPass);

        const expected = (width: number, height: number) => [
            Math.round(width * RATIO * ENHANCED_BLOOM_RESOLUTION_SHARE * ENHANCED_RENDER_SCALES[0]),
            Math.round(height * RATIO * ENHANCED_BLOOM_RESOLUTION_SHARE * ENHANCED_RENDER_SCALES[0]),
        ];
        expect(firstMip(enhancedBloom)).toEqual(expected(WIDTH, HEIGHT));

        post.setSize({ width: 400, height: 300 });
        handle.setSize({ width: 400, height: 300 });
        expect(firstMip(enhancedBloom)).toEqual(expected(400, 300));
    });
});
