import * as THREE from 'three';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { SceneSize } from '~/hooks/useThreeScene';
import { bassInkSceneConfig } from './bassInkSceneConfig';

// The two Look controls that reach the post-processing, both 0..1. A value of 0 turns its pass off.
export interface PostSettings {
    trails: number;
    glow: number;
}

// The afterimage pass sits right after the render pass in the composer.
const AFTERIMAGE_INDEX = 1;

// The configured damp is the share of the old frame kept per frame at this rate; other rates are scaled to match.
const REFERENCE_FPS = 60;
// The longest frame time used to scale the damp, in seconds. A stalled tab must not wipe the trails in one frame.
const MAX_FRAME_SECONDS = 0.1;
// Below this many device pixels on a side the bloom's mip chain would reach zero-size targets, so it is switched off.
const BLOOM_MIN_SIDE_PX = 32;

// Trails (an afterimage) and a glow (bloom) over the scene. The composer and its render targets are built on the first
// apply() that turns a pass on, so a scene with both controls at 0, or on a software renderer, never allocates them.
// Neither pass follows the music (see `bassInkSceneConfig.post`), so they cannot add flashes of their own.
export class BassInkPost {
    private composer: EffectComposer | undefined;
    private renderPass: RenderPass | undefined;
    private afterimage: AfterimagePass | undefined;
    private bloom: UnrealBloomPass | undefined;
    private output: OutputPass | undefined;
    // The bloom's resolution, created once and updated in place by setSize.
    private readonly bloomResolution = new THREE.Vector2(1, 1);
    private trailsOn = false;
    private disposed = false;
    private activeNow = false;
    private glowWanted = false;
    // Time of the previous apply() in milliseconds, or undefined before the first one.
    private lastApplyMs: number | undefined;
    private width: number;
    private height: number;

    constructor(
        private readonly renderer: THREE.WebGLRenderer,
        private readonly scene: THREE.Scene,
        private readonly camera: THREE.Camera,
        size: SceneSize,
        private readonly software: boolean,
        private readonly now: () => number = () => performance.now(),
    ) {
        this.width = size.width;
        this.height = size.height;
        this.updateBloomResolution();
    }

    // True when the last render() went through the composer.
    get active(): boolean {
        return this.activeNow;
    }

    // Applies the control values and switches each pass on or off. Allocates only when the composer is first built and
    // when trails come back on (see below).
    apply(settings: Readonly<PostSettings>): void {
        if (this.disposed) return;
        const { post } = bassInkSceneConfig;
        const trailsWanted = settings.trails > 0;
        const glowWanted = settings.glow > 0;
        // The frame time is measured here, not in render(): apply() runs once per frame right before render(), and the
        // damp it sets is the one the next render uses.
        const frameSeconds = this.measureFrameSeconds();
        // On a real GPU every frame goes through the composer, even with both passes off. The composer blends the points
        // in linear light and a plain render blends them after the sRGB conversion, so dense areas look different
        // between the two; switching between them as the sliders reach 0 would make the whole frame jump. A software
        // renderer (e2e, CI) is too slow for the passes and always renders plainly.
        if (this.software) {
            return;
        }
        // A pass built just now has no old frame to clear.
        const existed = this.composer !== undefined;
        if (!existed) this.build();
        const composer = this.composer!;

        if (existed && trailsWanted && !this.trailsOn && this.afterimage) {
            // A disabled afterimage pass stops updating its old frame, so on return it would fade in whatever was on
            // screen when trails went off. The pass keeps that frame in private render targets, so the simplest correct
            // way to clear it is to replace the pass with a fresh one (new targets start empty); insertPass sizes it.
            composer.removePass(this.afterimage);
            this.afterimage.dispose();
            this.afterimage = new AfterimagePass();
            composer.insertPass(this.afterimage, AFTERIMAGE_INDEX);
        }
        this.trailsOn = trailsWanted;
        const afterimage = this.afterimage!;
        afterimage.enabled = trailsWanted;
        afterimage.uniforms['damp'].value = frameDamp(settings.trails * post.trailsDampMax, frameSeconds);
        const bloom = this.bloom!;
        this.glowWanted = glowWanted;
        bloom.enabled = glowWanted && !this.tooSmallForBloom();
        bloom.strength = settings.glow * post.bloomStrengthMax;
    }

    // Draws the frame through the composer once it exists (a real GPU after the first apply), else with one plain
    // render.
    render(): void {
        if (this.composer && !this.disposed) {
            this.activeNow = true;
            this.composer.render();
            return;
        }
        this.activeNow = false;
        this.renderer.render(this.scene, this.camera);
    }

    setSize(size: SceneSize): void {
        this.width = size.width;
        this.height = size.height;
        this.updateBloomResolution();
        this.sizeComposer();
        if (this.bloom) this.bloom.enabled = this.glowWanted && !this.tooSmallForBloom();
    }

    // Frees the composer, every pass and their render targets. Safe to call twice.
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.activeNow = false;
        this.renderPass?.dispose();
        this.afterimage?.dispose();
        this.bloom?.dispose();
        this.output?.dispose();
        this.composer?.dispose();
        this.renderPass = undefined;
        this.afterimage = undefined;
        this.bloom = undefined;
        this.output = undefined;
        this.composer = undefined;
    }

    // Seconds since the previous apply(), clamped to 0..MAX_FRAME_SECONDS; the first frame counts as one 60 Hz frame.
    private measureFrameSeconds(): number {
        const nowMs = this.now();
        const previous = this.lastApplyMs;
        this.lastApplyMs = nowMs;
        if (previous === undefined) return 1 / REFERENCE_FPS;
        const seconds = (nowMs - previous) / 1000;
        if (!Number.isFinite(seconds)) return 1 / REFERENCE_FPS;
        return Math.min(MAX_FRAME_SECONDS, Math.max(0, seconds));
    }

    private tooSmallForBloom(): boolean {
        const ratio = this.renderer.getPixelRatio();
        return this.width * ratio < BLOOM_MIN_SIDE_PX || this.height * ratio < BLOOM_MIN_SIDE_PX;
    }

    private build(): void {
        const { post } = bassInkSceneConfig;
        const composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.afterimage = new AfterimagePass();
        this.bloom = new UnrealBloomPass(this.bloomResolution, 0, post.bloomRadius, post.bloomThreshold);
        this.output = new OutputPass();
        composer.addPass(this.renderPass);
        composer.addPass(this.afterimage);
        composer.addPass(this.bloom);
        composer.addPass(this.output);
        this.composer = composer;
        this.sizeComposer();
    }

    // The bloom's resolution is the drawing size in device pixels times the configured share.
    private updateBloomResolution(): void {
        const ratio = this.renderer.getPixelRatio();
        const scale = bassInkSceneConfig.post.bloomResolutionScale;
        this.bloomResolution.set(
            Math.max(1, Math.round(this.width * ratio * scale)),
            Math.max(1, Math.round(this.height * ratio * scale)),
        );
    }

    private sizeComposer(): void {
        if (!this.composer || !this.bloom) return;
        this.composer.setSize(this.width, this.height);
        // The composer hands every pass the full drawing size, and the bloom's first target is half of what it is given.
        // Giving it twice its resolution makes that target the configured share of the drawing size.
        this.bloom.setSize(this.bloomResolution.x * 2, this.bloomResolution.y * 2);
    }
}

// The damp for a frame of `seconds`, given the damp `perFrame` that is right at 60 fps. Retention per second stays the
// same at any frame rate. A damp of 0 stays 0 (0 ** 0 would be 1).
function frameDamp(perFrame: number, seconds: number): number {
    if (!(perFrame > 0)) return 0;
    return perFrame ** (seconds * REFERENCE_FPS);
}
