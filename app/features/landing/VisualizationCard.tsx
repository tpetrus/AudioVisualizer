import { Link } from 'react-router';
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, cardImageSrcSet } from './cardImage';

interface VisualizationCardProps {
    to: string;
    title: string;
    // The source PNG; the AVIF/WebP variants are derived from its path (see cardImage.ts).
    image: string;
    // Fetch the image ahead of the others. Only for the image that is the largest contentful paint (today the title).
    priority?: boolean;
}

// The cards sit in two columns from the sm breakpoint (640px) up, so each image is shown at half the viewport width, and
// in one column below it. The first row is in view at common sizes, so no card is lazy-loaded.
const SIZES = '(min-width: 640px) 50vw, 100vw';

export function VisualizationCard({ to, title, image, priority = false }: VisualizationCardProps) {
    const thumbnail = (
        <picture>
            <source type="image/avif" srcSet={cardImageSrcSet(image, 'avif')} sizes={SIZES} />
            <source type="image/webp" srcSet={cardImageSrcSet(image, 'webp')} sizes={SIZES} />
            <img
                src={image}
                alt={title}
                width={CARD_IMAGE_WIDTH}
                height={CARD_IMAGE_HEIGHT}
                decoding="async"
                loading={priority ? 'eager' : undefined}
                fetchPriority={priority ? 'high' : undefined}
                className="aspect-[4/3] h-full w-full object-cover"
            />
        </picture>
    );

    // The caption repeats the title the image's alt already gives, so it is hidden from assistive technology: the
    // link's and the image's accessible names stay exactly the title.
    const caption = (
        <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-lg font-semibold text-white"
        >
            {title}
        </span>
    );

    return (
        <Link
            to={to}
            className="relative block hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
            {thumbnail}
            {caption}
        </Link>
    );
}
