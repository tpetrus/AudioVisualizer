import { describe, expect, it, vi } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { isSoftwareRenderer, maxPointSize, pointCountFor } from './renderBudget';
import { isSoftwareRenderer as sharedIsSoftwareRenderer } from '~/lib/three/renderBudget';

const { basePointCount, softwarePointCap, fallbackMaxPointSize } = bassInkSceneConfig.points;

// A renderer whose context reports `rendererName` and a point size range.
function rendererWith(rendererName: string | undefined, range: ArrayLike<number> | null = [1, 255]) {
    const getParameter = vi.fn((parameter: number) => (parameter === 0x846d ? range : rendererName));
    const getExtension = vi.fn((name: string) =>
        name === 'WEBGL_debug_renderer_info' && rendererName !== undefined ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
    );
    return { getContext: () => ({ getExtension, getParameter }) };
}

describe('isSoftwareRenderer', () => {
    // The check itself is specified in app/lib/three/renderBudget.test.ts; bass-ink only re-exports it.
    it('is the shared check', () => {
        expect(isSoftwareRenderer).toBe(sharedIsSoftwareRenderer);
    });
});

describe('maxPointSize', () => {
    it('reads the upper end of the aliased point size range', () => {
        expect(maxPointSize(rendererWith('GPU', [1, 511]))).toBe(511);
    });

    it('falls back without a context, on a bad range or when the query throws', () => {
        expect(maxPointSize({})).toBe(fallbackMaxPointSize);
        expect(maxPointSize({ getContext: () => null })).toBe(fallbackMaxPointSize);
        expect(maxPointSize(rendererWith('GPU', null))).toBe(fallbackMaxPointSize);
        expect(maxPointSize(rendererWith('GPU', [1, 0]))).toBe(fallbackMaxPointSize);
        expect(
            maxPointSize({
                getContext: () => ({
                    getExtension: () => null,
                    getParameter: () => {
                        throw new Error('lost');
                    },
                }),
            }),
        ).toBe(fallbackMaxPointSize);
    });
});

describe('pointCountFor', () => {
    it('scales the base count by the density', () => {
        expect(pointCountFor(1, false)).toBe(basePointCount);
        expect(pointCountFor(0.8, false)).toBe(Math.round(basePointCount * 0.8));
        expect(pointCountFor(1.5, false)).toBe(Math.round(basePointCount * 1.5));
    });

    it('caps a software renderer at its low count whatever the density', () => {
        expect(pointCountFor(1.5, true)).toBe(softwarePointCap);
        expect(pointCountFor(0.01, true)).toBe(Math.round(basePointCount * 0.01));
    });

    it('never returns less than one point', () => {
        expect(pointCountFor(0, false)).toBe(1);
    });
});
