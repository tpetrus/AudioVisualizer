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
    ENHANCED_POINT_SCALES,
    ENHANCED_RENDER_SCALES,
    ENHANCED_SPRAY,
    ENHANCED_STEP_MIN_GAIN,
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
    // True once one of the look's shader programs failed to compile or link. The look has then switched itself off for
    // good (the same sources would fail again), and setEnabled(true) does nothing.
    readonly failed: boolean;
    // 1, or the step-down level's bloom share (ENHANCED_RENDER_SCALES); the sprites shrink with it.
    readonly renderScale: number;
    // Idempotent and cheap when unchanged (the scene calls it every frame).
    setEnabled(on: boolean): void;
    // The Glow control (0..1, the scene calls it every frame). The second bloom's strength is its constant times this,
    // and 0 turns it off, so Glow at 0 means no bloom at all in either mode. Cheap when unchanged.
    setGlow(glow: number): void;
    // After a density rebuild: applies the current state to the new materials and puts the standard look back on the old.
    setMaterials(materials: BassInkMaterials): void;
    setSize(size: SceneSize): void;
    // Frame-time-only step-down (bloom resolution and sprite size); acts only while enabled. A step that does not make
    // the frames faster is undone and stepping stops (ENHANCED_STEP_MIN_GAIN).
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

// Each kind's full-size sprite scale and profile gains, which the step-down level scales (see applyLevel).
const SPRITES: Record<Kind, { spriteScale: number; body: number; halo: number; core: number }> = {
    ink: ENHANCED_INK,
    dust: ENHANCED_DUST,
    spray: ENHANCED_SPRAY,
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

type ShaderErrorHandler = (
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
) => void;

// True when a program is one of the look's: a point variant carries the define, and every variant and the grade pass
// read `uEnh*` uniforms, which no standard shader declares (a spec checks it).
function isEnhancedProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): boolean {
    for (const shader of [vertexShader, fragmentShader]) {
        const source = gl.getShaderSource(shader) ?? '';
        if (source.includes(DEFINE) || source.includes('uEnh')) return true;
    }
    return false;
}

// Builds the enhanced look once: the second bloom and the grade pass (handed to the post, disabled until switched on) and
// the holders of the materials' standard shaders. Switching on swaps the shaders in place; nothing is rebuilt.
export function buildBassInkEnhanced(ctx: BassInkEnhancedContext, materials: BassInkMaterials): BassInkEnhancedHandle {
    return new BassInkEnhancedLook(ctx, materials);
}

class BassInkEnhancedLook implements BassInkEnhancedHandle {
    private on = false;
    private disposed = false;
    private failedNow = false;
    // The renderer's shader-error handler before this look installed its own, put back on dispose.
    private readonly previousShaderError: ShaderErrorHandler | null;
    // The Glow control's last value. 1 until the scene first sets it, which is the bloom's full configured strength.
    private glow = 1;
    private held: Held[] = [];
    private readonly bloom: UnrealBloomPass;
    private readonly grade: ShaderPass;
    // The drawing size in device pixels, as the composer last handed it to the bloom or as setSize computed it.
    private deviceWidth: number;
    private deviceHeight: number;
    private level = 0;
    // The median of the window that caused the last step down, until the next window shows whether it helped.
    private medianBeforeStep: number | undefined;
    // Set when a step did not help: the frames are held by the display, so the level stays where it is.
    private settled = false;
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
        this.previousShaderError = ctx.renderer.debug.onShaderError as ShaderErrorHandler | null;

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
            // Last, so a build that throws never leaves the handler installed.
            ctx.renderer.debug.onShaderError = this.onShaderError;
        } catch (error) {
            this.undoPartialBuild(grade);
            throw error;
        }
    }

    get enabled(): boolean {
        return this.on && !this.disposed;
    }

    get failed(): boolean {
        return this.failedNow;
    }

    get renderScale(): number {
        return ENHANCED_RENDER_SCALES[this.level];
    }

    setEnabled(on: boolean): void {
        if (this.disposed || on === this.on || (on && this.failedNow)) return;
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
        for (const held of this.held) {
            this.applyLevel(held);
            this.apply(held);
        }
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
        const before = this.medianBeforeStep;
        this.medianBeforeStep = undefined;
        if (before !== undefined && median > before * (1 - ENHANCED_STEP_MIN_GAIN)) {
            this.settled = true;
            this.setLevel(this.level - 1);
            return;
        }
        if (!this.settled && median > ENHANCED_FRAME_BUDGET_SECONDS && this.level < ENHANCED_RENDER_SCALES.length - 1) {
            this.medianBeforeStep = median;
            this.setLevel(this.level + 1);
        }
    }

    dispose(): void {
        if (this.disposed) return;
        for (const held of this.held) this.restore(held);
        this.held = [];
        this.disposed = true;
        this.on = false;
        this.restoreShaderErrorHandler();
        this.ctx.post.setExtraPasses([]);
        this.bloom.dispose();
        this.grade.dispose();
    }

    // three.js calls this instead of logging when a program fails to link, while it renders. A failure of the look's own
    // programs would leave those materials drawing nothing with the status still ready, so the look puts the standard
    // shaders back and marks itself failed; the scene reads `failed` on the next frame and reports the error. Any other
    // program's failure goes to the handler that was there before, or is logged as three.js would.
    private readonly onShaderError: ShaderErrorHandler = (gl, program, vertexShader, fragmentShader) => {
        if (!this.disposed && isEnhancedProgram(gl, vertexShader, fragmentShader)) {
            if (this.failedNow) return;
            this.setEnabled(false);
            this.failedNow = true;
            console.warn(
                'Bass ink: an enhanced shader failed to compile; using the standard look.',
                gl.getProgramInfoLog(program),
            );
            return;
        }
        if (this.previousShaderError) {
            this.previousShaderError(gl, program, vertexShader, fragmentShader);
            return;
        }
        console.error(
            'THREE.WebGLProgram: Shader Error',
            gl.getProgramInfoLog(program),
            gl.getShaderInfoLog(vertexShader),
            gl.getShaderInfoLog(fragmentShader),
        );
    };

    // Only when it is still this look's: something installed later keeps its own.
    private restoreShaderErrorHandler(): void {
        const debug = this.ctx.renderer.debug;
        if (debug.onShaderError === (this.onShaderError as unknown)) debug.onShaderError = this.previousShaderError;
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

    private setLevel(level: number): void {
        this.level = level;
        this.sizeBloom(this.sizeBloomBase);
        for (const held of this.held) this.applyLevel(held);
    }

    // The sprite at this level: smaller by the point scale, with gains raised by its inverse square so the light per
    // point (gains times sprite area) stays the same.
    private applyLevel(held: Held): void {
        const sprite = SPRITES[held.kind];
        const scale = ENHANCED_POINT_SCALES[this.level];
        const gain = 1 / (scale * scale);
        const uniforms = held.material.uniforms;
        uniforms.uEnhSpriteScale.value = sprite.spriteScale * scale;
        uniforms.uEnhBody.value = sprite.body * gain;
        uniforms.uEnhHalo.value = sprite.halo * gain;
        uniforms.uEnhCoreGain.value = sprite.core * gain;
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
