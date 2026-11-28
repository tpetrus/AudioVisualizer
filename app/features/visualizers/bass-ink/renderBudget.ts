import { bassInkSceneConfig } from './bassInkSceneConfig';
import { type ContextHost, isSoftwareRenderer, rendererContext } from '~/lib/three/renderBudget';

// WebGL enum value, written out because the renderer may be a test fake and the constants live on the context.
const ALIASED_POINT_SIZE_RANGE = 0x846d;

// Shared with other visualizers now; re-exported so bass-ink's own imports keep working.
export { isSoftwareRenderer };

// Largest point size in pixels the GPU draws; drivers clamp bigger requests differently, so the shader clamps to this
// itself.
export function maxPointSize(renderer: ContextHost): number {
    const fallback = bassInkSceneConfig.points.fallbackMaxPointSize;
    const gl = rendererContext(renderer);
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
