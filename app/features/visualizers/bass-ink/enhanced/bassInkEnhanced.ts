import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { SceneSize } from '~/hooks/useThreeScene';
import type { BassInkPost } from '../bassInkPost';
import {
    ENHANCED_BLOOM_MIN_SIDE_PX,
    ENHANCED_BLOOM_RADIUS,
    ENHANCED_BLOOM_RESOLUTION_SHARE,
    ENHANCED_BLOOM_STRENGTH,
    ENHANCED_BLOOM_THRESHOLD,
    ENHANCED_DUST,
    ENHANCED_FRAME_BUDGET_SECONDS,
    ENHANCED_FRAME_WINDOW,
    ENHANCED_GRADE_CONTRAST,
    ENHANCED_GRADE_KNEE,
    ENHANCED_GRADE_PIVOT,
    ENHANCED_GRADE_RANGE,
    ENHANCED_GRADE_SATURATION,
    ENHANCED_INK,
    ENHANCED_RENDER_SCALES,
    ENHANCED_SPRAY,
    ENHANCED_VIGNETTE_RADIUS,
    ENHANCED_VIGNETTE_SOFTNESS,
    ENHANCED_VIGNETTE_STRENGTH,
} from './bassInkEnhancedConfig';
import {
    enhancedDustFragmentShader,
    enhancedDustVertexShader,
    enhancedInkFragmentShader,
    enhancedInkVertexShader,
    enhancedSprayFragmentShader,
    enhancedSprayVertexShader,
    gradeFragmentShader,
    gradeVertexShader,
} from './bassInkEnhancedShaders';

// The four materials the look is applied to: the cloud's shell and core (one shader, two instances), the dust and the
// spray.
export interface BassInkMaterials {
    shell: THREE.ShaderMaterial;
    core: THREE.ShaderMaterial;
    dust: THREE.ShaderMaterial;
    spray: THREE.ShaderMaterial;
}

export interface BassInkEnhancedContext {
    renderer: THREE.WebGLRenderer;
    post: BassInkPost;
    size: SceneSize;
}

export interface BassInkEnhancedHandle {
    readonly enabled: boolean;
    // 1, or the step-down level in use.
    readonly renderScale: number;
    // Idempotent and cheap when unchanged (the scene calls it every frame).
    setEnabled(on: boolean): void;
    // The Glow control (0..1, the scene calls it every frame). The second bloom's strength is its constant times this,
    // and 0 turns it off, so Glow at 0 means no bloom at all in either mode. Cheap when unchanged.
    setGlow(glow: number): void;
    // After a density rebuild: applies the current state to the new materials and puts the standard look back on the old.
    setMaterials(materials: BassInkMaterials): void;
    setSize(size: SceneSize): void;
    // Frame-time-only render-scale step-down; acts only while enabled.
    step(frameSeconds: number): void;
    dispose(): void;
}

type Kind = 'ink' | 'dust' | 'spray';

// The shader variant and the extra uniforms of each kind. The uniform values are constants from the config.
interface Variant {
    vertexShader: string;
    fragmentShader: string;
    uniforms: () => Record<string, THREE.IUniform>;
}

function value<T>(v: T): THREE.IUniform<T> {
    return { value: v };
}

const VARIANTS: Record<Kind, Variant> = {
    ink: {
        vertexShader: enhancedInkVertexShader,
        fragmentShader: enhancedInkFragmentShader,
        uniforms: () => ({
            uEnhFadeBoost: value(ENHANCED_INK.fadeBoost),
            uEnhFadeMax: value(ENHANCED_INK.fadeMax),
            uEnhNearSize: value(ENHANCED_INK.nearSize),
            uEnhFarSize: value(ENHANCED_INK.farSize),
            uEnhNearGain: value(ENHANCED_INK.nearGain),
            uEnhSpriteScale: value(ENHANCED_INK.spriteScale),
            uEnhBody: value(ENHANCED_INK.body),
            uEnhHalo: value(ENHANCED_INK.halo),
            uEnhCoreGain: value(ENHANCED_INK.core),
            uEnhCoreWhite: value(ENHANCED_INK.coreWhite),
        }),
    },
    dust: {
        vertexShader: enhancedDustVertexShader,
        fragmentShader: enhancedDustFragmentShader,
        uniforms: () => depthSpriteUniforms(ENHANCED_DUST),
    },
    spray: {
        vertexShader: enhancedSprayVertexShader,
        fragmentShader: enhancedSprayFragmentShader,
        uniforms: () => depthSpriteUniforms(ENHANCED_SPRAY),
    },
};

function depthSpriteUniforms(c: typeof ENHANCED_DUST | typeof ENHANCED_SPRAY): Record<string, THREE.IUniform> {
    return {
        uEnhNear: value(c.near),
        uEnhFar: value(c.far),
        uEnhNearSize: value(c.nearSize),
        uEnhFarSize: value(c.farSize),
        uEnhNearAlpha: value(c.nearAlpha),
        uEnhFarAlpha: value(c.farAlpha),
        uEnhSpriteScale: value(c.spriteScale),
        uEnhBody: value(c.body),
        uEnhHalo: value(c.halo),
        uEnhCoreGain: value(c.core),
    };
}

// A material the look holds, with the exact shader strings it had when the look attached, so switching off puts back
// those and not a copy.
interface Held {
    material: THREE.ShaderMaterial;
    kind: Kind;
    vertexShader: string;
    fragmentShader: string;
    applied: boolean;
}

// The define that marks a material as running the enhanced variant.
const DEFINE = 'BASS_INK_ENHANCED';

// Builds the enhanced look once: the second bloom and the grade pass (handed to the post, disabled until switched on) and
// the holders of the materials' standard shaders. Switching on swaps the shaders in place; nothing is rebuilt.
export function buildBassInkEnhanced(ctx: BassInkEnhancedContext, materials: BassInkMaterials): BassInkEnhancedHandle {
    return new BassInkEnhancedLook(ctx, materials);
}

class BassInkEnhancedLook implements BassInkEnhancedHandle {
    private on = false;
    private disposed = false;
    // The Glow control's last value. 1 until the scene first sets it, which is the bloom's full configured strength.
    private glow = 1;
    private held: Held[] = [];
    private readonly bloom: UnrealBloomPass;
    private readonly grade: ShaderPass;
    // The drawing size in device pixels, as the composer last handed it to the bloom or as setSize computed it.
    private deviceWidth: number;
    private deviceHeight: number;
    private level = 0;
    // The bloom's own size method, which the bloom instance's setSize is replaced by a wrapper around.
    private readonly sizeBloomBase: (width: number, height: number) => void;
    // Frame times of the current window, and a scratch copy to take the median from. Both are allocated once.
    private readonly frames = new Float32Array(ENHANCED_FRAME_WINDOW);
    private readonly sorted = new Float32Array(ENHANCED_FRAME_WINDOW);
    private frameCount = 0;

    constructor(
        private readonly ctx: BassInkEnhancedContext,
        materials: BassInkMaterials,
    ) {
        const ratio = ctx.renderer.getPixelRatio();
        this.deviceWidth = ctx.size.width * ratio;
        this.deviceHeight = ctx.size.height * ratio;

        // The composer sizes every pass it holds to the full drawing size, also when it is built after this look. The bloom
        // is wanted at a share of that, so its size is taken over here: whoever sizes it, it ends up at the right size.
        this.bloom = new UnrealBloomPass(
            new THREE.Vector2(1, 1),
            ENHANCED_BLOOM_STRENGTH,
            ENHANCED_BLOOM_RADIUS,
            ENHANCED_BLOOM_THRESHOLD,
        );
        const sizeBloom = this.bloom.setSize.bind(this.bloom);
        this.bloom.setSize = (width: number, height: number) => {
            this.deviceWidth = width;
            this.deviceHeight = height;
            this.sizeBloom(sizeBloom);
            this.applyPassState();
        };
        this.sizeBloomBase = sizeBloom;

        // From here on a throw would leave the bloom allocated, and later the passes in the composer and the materials on
        // the enhanced strings, with no handle for the scene to dispose, so the partial state is undone before rethrowing.
        let grade: ShaderPass | undefined;
        try {
            grade = new ShaderPass({
                uniforms: {
                    tDiffuse: value(null),
                    uEnhPivot: value(ENHANCED_GRADE_PIVOT),
                    uEnhContrast: value(ENHANCED_GRADE_CONTRAST),
                    uEnhSaturation: value(ENHANCED_GRADE_SATURATION),
                    uEnhKnee: value(ENHANCED_GRADE_KNEE),
                    uEnhRange: value(ENHANCED_GRADE_RANGE),
                    uEnhVignetteStrength: value(ENHANCED_VIGNETTE_STRENGTH),
                    uEnhVignetteRadius: value(ENHANCED_VIGNETTE_RADIUS),
                    uEnhVignetteSoftness: value(ENHANCED_VIGNETTE_SOFTNESS),
                },
                vertexShader: gradeVertexShader,
                fragmentShader: gradeFragmentShader,
            });
            this.grade = grade;
            this.bloom.enabled = false;
            this.grade.enabled = false;
            this.sizeBloom(sizeBloom);
            ctx.post.setExtraPasses([this.bloom, this.grade]);
            this.setMaterials(materials);
        } catch (error) {
            this.undoPartialBuild(grade);
            throw error;
        }
    }

    get enabled(): boolean {
        return this.on && !this.disposed;
    }

    get renderScale(): number {
        return ENHANCED_RENDER_SCALES[this.level];
    }

    setEnabled(on: boolean): void {
        if (this.disposed || on === this.on) return;
        this.on = on;
        this.frameCount = 0;
        for (const held of this.held) this.apply(held);
        this.applyPassState();
    }

    setGlow(glow: number): void {
        const next = Number.isFinite(glow) ? Math.min(1, Math.max(0, glow)) : 0;
        if (this.disposed || next === this.glow) return;
        this.glow = next;
        this.bloom.strength = ENHANCED_BLOOM_STRENGTH * next;
        this.applyPassState();
    }

    setMaterials(materials: BassInkMaterials): void {
        if (this.disposed) return;
        const next: Held[] = [];
        const wanted: [THREE.ShaderMaterial, Kind][] = [
            [materials.shell, 'ink'],
            [materials.core, 'ink'],
            [materials.dust, 'dust'],
            [materials.spray, 'spray'],
        ];
        for (const [material, kind] of wanted) {
            if (next.some((h) => h.material === material)) continue;
            // A material that is already held keeps the strings it was attached with.
            const existing = this.held.find((h) => h.material === material);
            next.push(existing ?? this.attach(material, kind));
        }
        for (const old of this.held) {
            if (!next.includes(old)) this.restore(old);
        }
        this.held = next;
        for (const held of this.held) this.apply(held);
    }

    setSize(size: SceneSize): void {
        if (this.disposed) return;
        const ratio = this.ctx.renderer.getPixelRatio();
        this.deviceWidth = size.width * ratio;
        this.deviceHeight = size.height * ratio;
        this.sizeBloom(this.sizeBloomBase);
        this.applyPassState();
    }

    step(frameSeconds: number): void {
        if (this.disposed || !this.on) return;
        if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return;
        this.frames[this.frameCount++] = frameSeconds;
        if (this.frameCount < ENHANCED_FRAME_WINDOW) return;
        // One full window is judged, then a fresh one starts either way. The median ignores a single slow frame, such as
        // the shader compile right after switching on.
        this.frameCount = 0;
        this.sorted.set(this.frames);
        this.sorted.sort();
        const median = this.sorted[ENHANCED_FRAME_WINDOW >> 1];
        if (median > ENHANCED_FRAME_BUDGET_SECONDS && this.level < ENHANCED_RENDER_SCALES.length - 1) {
            this.level++;
            this.sizeBloom(this.sizeBloomBase);
        }
    }

    dispose(): void {
        if (this.disposed) return;
        for (const held of this.held) this.restore(held);
        this.held = [];
        this.disposed = true;
        this.on = false;
        this.ctx.post.setExtraPasses([]);
        this.bloom.dispose();
        this.grade.dispose();
    }

    // Undoes a constructor that threw: takes the passes out of the composer, puts the standard shaders back and frees the
    // passes that were made. Each step is guarded, so a failing one never hides the original error.
    private undoPartialBuild(grade: ShaderPass | undefined): void {
        this.disposed = true;
        this.on = false;
        const steps = [
            () => this.ctx.post.setExtraPasses([]),
            () => {
                for (const held of this.held) this.restore(held);
                this.held = [];
            },
            () => this.bloom.dispose(),
            () => grade?.dispose(),
        ];
        for (const step of steps) {
            try {
                step();
            } catch {
                // The original error is what the caller needs; this one is a consequence of the same broken state.
            }
        }
    }

    // Records the standard strings and adds the `uEnh*` uniforms. Standard uniforms are never touched.
    private attach(material: THREE.ShaderMaterial, kind: Kind): Held {
        Object.assign(material.uniforms, VARIANTS[kind].uniforms());
        return {
            material,
            kind,
            vertexShader: material.vertexShader,
            fragmentShader: material.fragmentShader,
            applied: false,
        };
    }

    // Brings a material to the current state. three.js caches programs by source and defines, so going back and forth
    // compiles nothing after the first time.
    private apply(held: Held): void {
        if (held.applied === this.on) return;
        if (this.on) {
            const variant = VARIANTS[held.kind];
            held.material.vertexShader = variant.vertexShader;
            held.material.fragmentShader = variant.fragmentShader;
            held.material.defines[DEFINE] = 1;
            held.material.needsUpdate = true;
            held.applied = true;
        } else {
            this.restore(held);
        }
    }

    private restore(held: Held): void {
        if (!held.applied) return;
        held.material.vertexShader = held.vertexShader;
        held.material.fragmentShader = held.fragmentShader;
        delete held.material.defines[DEFINE];
        held.material.needsUpdate = true;
        held.applied = false;
    }

    // The bloom's size is the drawing size times the configured share times the render scale. UnrealBloomPass halves what
    // it is given for its first target, as BassInkPost explains, so it is given twice that.
    private sizeBloom(setSize: (width: number, height: number) => void): void {
        const share = ENHANCED_BLOOM_RESOLUTION_SHARE * ENHANCED_RENDER_SCALES[this.level] * 2;
        setSize(Math.max(1, Math.round(this.deviceWidth * share)), Math.max(1, Math.round(this.deviceHeight * share)));
    }

    // The bloom is skipped when the drawing is tiny, as BassInkPost skips its own.
    private applyPassState(): void {
        const tiny = this.deviceWidth < ENHANCED_BLOOM_MIN_SIDE_PX || this.deviceHeight < ENHANCED_BLOOM_MIN_SIDE_PX;
        this.bloom.enabled = this.on && !tiny && this.glow > 0;
        this.grade.enabled = this.on;
    }
}
