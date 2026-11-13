import { bassInkSceneConfig } from './bassInkSceneConfig';

// WebGL enum value, written out because the renderer may be a test fake and the constants live on the context.
const ALIASED_POINT_SIZE_RANGE = 0x846d;
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software/i;

// The little of a renderer these helpers need; a fake renderer without getContext (or one returning null) is allowed.
interface ContextLike {
    getExtension(name: string): unknown;
    getParameter(parameter: number): unknown;
}
interface ContextHost {
    getContext?: () => ContextLike | null | undefined;
}

function contextOf(renderer: ContextHost): ContextLike | undefined {
    try {
        return renderer.getContext?.() ?? undefined;
    } catch {
        return undefined;
    }
}

// True when the page is drawn by a CPU rasterizer (SwiftShader, llvmpipe), which is how e2e and some CI machines run.
export function isSoftwareRenderer(renderer: ContextHost): boolean {
    const gl = contextOf(renderer);
    if (!gl) {
        return false;
    }
    try {
        const info = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
        if (!info) {
            return false;
        }
        return SOFTWARE_RENDERER.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
    } catch {
        return false;
    }
}

// Largest point size in pixels the GPU draws; drivers clamp bigger requests differently, so the shader clamps to this
// itself.
export function maxPointSize(renderer: ContextHost): number {
    const fallback = bassInkSceneConfig.points.fallbackMaxPointSize;
    const gl = contextOf(renderer);
    if (!gl) {
        return fallback;
    }
    try {
        const range = gl.getParameter(ALIASED_POINT_SIZE_RANGE) as ArrayLike<number> | null;
        const largest = range?.[1];
        return typeof largest === 'number' && largest >= 1 ? largest : fallback;
    } catch {
        return fallback;
    }
}

// Number of points for a density setting (1 is the base count), capped hard on a software renderer.
export function pointCountFor(density: number, software: boolean): number {
    const { basePointCount, softwarePointCap } = bassInkSceneConfig.points;
    const wanted = Math.max(1, Math.round(basePointCount * density));
    return software ? Math.min(wanted, softwarePointCap) : wanted;
}
