import { describe, expect, it, vi } from 'vitest';
import { isSoftwareRenderer, rendererContext } from './renderBudget';

// A renderer whose context reports `rendererName` and a point size range.
function rendererWith(rendererName: string | undefined, range: ArrayLike<number> | null = [1, 255]) {
    const getParameter = vi.fn((parameter: number) => (parameter === 0x846d ? range : rendererName));
    const getExtension = vi.fn((name: string) =>
        name === 'WEBGL_debug_renderer_info' && rendererName !== undefined ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    );
    return { getContext: () => ({ getExtension, getParameter }) };
}

describe('isSoftwareRenderer', () => {
    it.each([
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
        'llvmpipe (LLVM 15)',
        'Software',
    ])('recognizes %s', (name) => {
        expect(isSoftwareRenderer(rendererWith(name))).toBe(true);
    });

    it('does not flag a real GPU', () => {
        expect(isSoftwareRenderer(rendererWith('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)'))).toBe(false);
    });

    it('is false when the debug extension is missing', () => {
        expect(isSoftwareRenderer(rendererWith(undefined))).toBe(false);
    });

    it('is false for a renderer without getContext or with a null context', () => {
        expect(isSoftwareRenderer({})).toBe(false);
        expect(isSoftwareRenderer({ getContext: () => null })).toBe(false);
    });

    it('is false when the context throws', () => {
        expect(
            isSoftwareRenderer({
                getContext: () => {
                    throw new Error('lost');
                },
            }),
        ).toBe(false);
        expect(
            isSoftwareRenderer({
                getContext: () => ({
                    getExtension: () => {
                        throw new Error('lost');
                    },
                    getParameter: () => 0,
                }),
            }),
        ).toBe(false);
    });
});

describe('rendererContext', () => {
    it('returns the context, or undefined when there is none or asking throws', () => {
        const gl = { getExtension: () => null, getParameter: () => 0 };
        expect(rendererContext({ getContext: () => gl })).toBe(gl);
        expect(rendererContext({})).toBeUndefined();
        expect(rendererContext({ getContext: () => null })).toBeUndefined();
        expect(
            rendererContext({
                getContext: () => {
                    throw new Error('lost');
                },
            }),
        ).toBeUndefined();
    });
});
