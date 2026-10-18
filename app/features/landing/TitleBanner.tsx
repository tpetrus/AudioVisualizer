import { TITLE_BANNER_HEIGHT, TITLE_BANNER_WIDTH, titleBannerSrcSet } from './titleBannerImage';

const TITLE = 'AudioVisualizer';
const TAGLINE =
    'Spice up your music-listening experience, add vibrancy and motion to your DJ set, or whatever else you think of.';

// The "AudioVisualizer" title and tagline, as a pre-rendered image (see `npm run title-banner`) so the landing page
// needs neither three.js nor a WebGL context. The image is black around the artwork, and the header is black too, so it
// fills the width at any viewport and only scales down when the viewport is narrower than the image.
export function TitleBanner({ priority = false }: { priority?: boolean }) {
    return (
        <header className="bg-black text-white">
            {/* The image can't be read by screen readers or search engines, so the text is also here, visually hidden. */}
            <h1 className="sr-only">{TITLE}</h1>
            <p className="sr-only">{TAGLINE}</p>
            <picture>
                <source type="image/avif" srcSet={titleBannerSrcSet('avif')} />
                <source type="image/webp" srcSet={titleBannerSrcSet('webp')} />
                {/* Empty alt: the text above already says what the image shows. */}
                <img
                    src="/title-banner.png"
                    srcSet={titleBannerSrcSet('png')}
                    alt=""
                    width={TITLE_BANNER_WIDTH}
                    height={TITLE_BANNER_HEIGHT}
                    decoding="async"
                    loading={priority ? 'eager' : undefined}
                    fetchPriority={priority ? 'high' : undefined}
                    className="mx-auto block h-auto w-full max-w-[1100px]"
                />
            </picture>
        </header>
    );
}
