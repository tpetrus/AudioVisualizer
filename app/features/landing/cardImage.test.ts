import { describe, expect, it } from 'vitest';
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, cardImageSrcSet } from './cardImage';

describe('cardImageSrcSet', () => {
    it('derives one entry per generated width from the source image path', () => {
        expect(cardImageSrcSet('/visualization-images/cubes.png', 'avif')).toBe(
            '/visualization-images/cubes-640.avif 640w, /visualization-images/cubes-1280.avif 1280w',
        );
        expect(cardImageSrcSet('/visualization-images/trio-color-wave.png', 'webp')).toBe(
            '/visualization-images/trio-color-wave-640.webp 640w, /visualization-images/trio-color-wave-1280.webp 1280w',
        );
    });

    it('only replaces the final extension, not dots elsewhere in the path', () => {
        expect(cardImageSrcSet('/a.b/c.d.png', 'webp')).toBe('/a.b/c.d-640.webp 640w, /a.b/c.d-1280.webp 1280w');
    });

    it('describes the largest variant as a 4:3 box', () => {
        expect([CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT]).toEqual([1280, 960]);
    });
});
