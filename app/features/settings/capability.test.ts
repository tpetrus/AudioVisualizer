// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CapabilityProbe, detectCapability, probeCapability } from './capability';

const strong: CapabilityProbe = { webgl2: true, maxTextureSize: 16384 };

describe('detectCapability', () => {
    it('passes with only the required fields', () => {
        expect(detectCapability(strong)).toBe(true);
        expect(detectCapability({ webgl2: true, maxTextureSize: 8192 })).toBe(true);
    });

    it('passes a strong device with every optional field present', () => {
        expect(
            detectCapability({
                ...strong,
                renderer: 'ANGLE (NVIDIA GeForce RTX 4070)',
                deviceMemory: 8,
                hardwareConcurrency: 16,
            }),
        ).toBe(true);
    });

    it('fails without WebGL 2 or with a small texture limit', () => {
        expect(detectCapability({ ...strong, webgl2: false })).toBe(false);
        expect(detectCapability({ ...strong, maxTextureSize: 4096 })).toBe(false);
    });

    it('fails a low reported memory or core count, but not an absent one', () => {
        expect(detectCapability({ ...strong, deviceMemory: 4 })).toBe(false);
        expect(detectCapability({ ...strong, hardwareConcurrency: 4 })).toBe(false);
        expect(detectCapability({ ...strong, deviceMemory: undefined, hardwareConcurrency: undefined })).toBe(true);
    });

    it.each(['Google SwiftShader', 'ANGLE (llvmpipe (LLVM 15))', 'SWIFTSHADER'])(
        'fails the software renderer %s',
        (renderer) => {
            expect(detectCapability({ ...strong, renderer })).toBe(false);
        },
    );
});

interface FakeGl {
    getExtension: ReturnType<typeof vi.fn>;
    getParameter: ReturnType<typeof vi.fn>;
    MAX_TEXTURE_SIZE: number;
}

const loseContext = vi.fn();

function fakeGl({ debugInfo = true, lose = true }: { debugInfo?: boolean; lose?: boolean } = {}): FakeGl {
    return {
        MAX_TEXTURE_SIZE: 1,
        getExtension: vi.fn((name: string) => {
            if (name === 'WEBGL_debug_renderer_info') {
                return debugInfo ? { UNMASKED_RENDERER_WEBGL: 2 } : null;
            }
            return lose ? { loseContext } : null;
        }),
        getParameter: vi.fn((parameter: number) => (parameter === 1 ? 16384 : 'NVIDIA')),
    };
}

function stubCanvas(getContext: () => unknown) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext as never);
}

afterEach(() => {
    vi.restoreAllMocks();
    loseContext.mockClear();
});

describe('probeCapability', () => {
    it('reads the fields from a detached canvas after idle time and then loses the context', async () => {
        stubCanvas(() => fakeGl());
        vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
        vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 12 });

        const probe = await probeCapability();

        expect(probe).toEqual({
            webgl2: true,
            maxTextureSize: 16384,
            renderer: 'NVIDIA',
            deviceMemory: 8,
            hardwareConcurrency: 12,
        });
        expect(loseContext).toHaveBeenCalledTimes(1);
    });

    it('omits the fields the browser does not give and still loses the context', async () => {
        stubCanvas(() => fakeGl({ debugInfo: false }));
        vi.stubGlobal('navigator', {});

        expect(await probeCapability()).toEqual({ webgl2: true, maxTextureSize: 16384 });
        expect(loseContext).toHaveBeenCalledTimes(1);
    });

    it('prefers an OffscreenCanvas when there is one', async () => {
        const gl = fakeGl({ lose: false });
        vi.stubGlobal(
            'OffscreenCanvas',
            class {
                getContext() {
                    return gl;
                }
            },
        );

        expect(await probeCapability()).toMatchObject({ webgl2: true, maxTextureSize: 16384 });
        expect(loseContext).not.toHaveBeenCalled();
    });

    it('resolves undefined when WebGL 2 is missing', async () => {
        stubCanvas(() => null);
        expect(await probeCapability()).toBeUndefined();
    });

    it('resolves undefined when getContext throws, and when reading a parameter throws after losing the context', async () => {
        stubCanvas(() => {
            throw new Error('no gl');
        });
        expect(await probeCapability()).toBeUndefined();

        const gl = fakeGl();
        gl.getParameter.mockImplementation(() => {
            throw new Error('lost');
        });
        stubCanvas(() => gl);
        expect(await probeCapability()).toBeUndefined();
        expect(loseContext).toHaveBeenCalledTimes(1);
    });
});
