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

// The cards share one row of three columns, so each image is shown at a third of the viewport width. Every card is in the
// first row at common sizes, so none is lazy-loaded.
const SIZES = '33vw';

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

    return (
        <Link
            to={to}
            className="block hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
            {thumbnail}
        </Link>
    );
}
