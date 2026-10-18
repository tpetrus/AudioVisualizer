// The responsive variants of a card image. `npm run images` (scripts/optimize-images.ts) generates them next to each
// source PNG, so adding a visualizer only needs the PNG dropped in and that script run.

// Widths of the generated variants, and the shared 4:3 shape they are cropped to.
export const CARD_IMAGE_WIDTHS = [640, 1280] as const;
export const CARD_IMAGE_ASPECT = 4 / 3;

// Intrinsic size of the fallback <img>: the largest variant, so the browser reserves the right box before it loads.
export const CARD_IMAGE_WIDTH = CARD_IMAGE_WIDTHS[CARD_IMAGE_WIDTHS.length - 1];
export const CARD_IMAGE_HEIGHT = Math.round(CARD_IMAGE_WIDTH / CARD_IMAGE_ASPECT);

export type CardImageFormat = 'avif' | 'webp';

// "/dir/name.png" -> "/dir/name-640.avif 640w, /dir/name-1280.avif 1280w"
export function cardImageSrcSet(image: string, format: CardImageFormat): string {
    const base = image.replace(/\.[^./]+$/, '');
    return CARD_IMAGE_WIDTHS.map((width) => `${base}-${width}.${format} ${width}w`).join(', ');
}
