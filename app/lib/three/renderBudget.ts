// Facts about the GPU a renderer draws with, shared by every visualizer that scales its work to the device.

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software/i;

// The little of a renderer these helpers need; a fake renderer without getContext (or one returning null) is allowed.
export interface ContextLike {
    getExtension(name: string): unknown;
    getParameter(parameter: number): unknown;
}
export interface ContextHost {
    getContext?: () => ContextLike | null | undefined;
}

// The renderer's WebGL context, or undefined when it has none or asking for it throws (a lost or fake context).
export function rendererContext(renderer: ContextHost): ContextLike | undefined {
    try {
        return renderer.getContext?.() ?? undefined;
    } catch {
        return undefined;
    }
}

// True when the page is drawn by a CPU rasterizer (SwiftShader, llvmpipe), which is how e2e and some CI machines run.
export function isSoftwareRenderer(renderer: ContextHost): boolean {
    const gl = rendererContext(renderer);
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
