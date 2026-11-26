export interface CapabilityProbe {
    webgl2: boolean;
    maxTextureSize: number;
    renderer?: string;
    deviceMemory?: number;
    hardwareConcurrency?: number;
}

// The enhanced look uses 2K to 4K textures, soft shadows and a reflector, so these are the least a device should have
// to be told it can "likely handle" it. Optional signals only count against a device when the browser reports them:
// Safari and Firefox hide deviceMemory, and many browsers mask the renderer string.
const MIN_TEXTURE_SIZE = 8192;
const MIN_DEVICE_MEMORY_GB = 8;
const MIN_HARDWARE_CONCURRENCY = 8;
// Software rasterizers are far too slow for the enhanced look.
const SOFTWARE_RENDERER = /swiftshader|llvmpipe/i;

export function detectCapability(probe: CapabilityProbe): boolean {
    if (!probe.webgl2 || probe.maxTextureSize < MIN_TEXTURE_SIZE) {
        return false;
    }
    if (probe.deviceMemory !== undefined && probe.deviceMemory < MIN_DEVICE_MEMORY_GB) {
        return false;
    }
    if (probe.hardwareConcurrency !== undefined && probe.hardwareConcurrency < MIN_HARDWARE_CONCURRENCY) {
        return false;
    }
    if (probe.renderer !== undefined && SOFTWARE_RENDERER.test(probe.renderer)) {
        return false;
    }
    return true;
}

// The probe creates a WebGL context, which is not free, so it waits until the browser is idle instead of competing
// with the first paint.
function whenIdle(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });
}

// Resolves undefined on any failure: no hint is better than a wrong one, and the probe must never break the page.
export async function probeCapability(): Promise<CapabilityProbe | undefined> {
    try {
        await whenIdle();
        // Never attached to the DOM.
        const canvas =
            typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            return undefined;
        }
        try {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const renderer = debugInfo ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as unknown) : undefined;
            const { deviceMemory } = navigator as Navigator & { deviceMemory?: number };
            const { hardwareConcurrency } = navigator;
            return {
                webgl2: true,
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
                ...(typeof renderer === 'string' && { renderer }),
                ...(typeof deviceMemory === 'number' && { deviceMemory }),
                ...(typeof hardwareConcurrency === 'number' && { hardwareConcurrency }),
            };
        } finally {
            // Frees the GPU context right away instead of waiting for garbage collection.
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
    } catch {
        return undefined;
    }
}
