// The pre-rendered title banner. `npm run title-banner` (scripts/title-banner/render.ts) draws the 3D title once and
// writes it to public/ at 1x and 2x, so the landing page ships an image instead of three.js and a WebGL context.

// CSS-pixel size of the banner image. The header is 300 px tall and the artwork is centred in it; the width leaves a
// black margin around the widest tagline line.
export const TITLE_BANNER_WIDTH = 1100;
export const TITLE_BANNER_HEIGHT = 300;

export type TitleBannerFormat = 'avif' | 'webp' | 'png';

// "/title-banner.avif 1x, /title-banner-2x.avif 2x"
export function titleBannerSrcSet(format: TitleBannerFormat): string {
    return `/title-banner.${format} 1x, /title-banner-2x.${format} 2x`;
}
