import { Link } from 'react-router';

interface VisualizationCardProps {
    to: string;
    title: string;
    image: string;
    // True until an audio source is capturing; visualizations need audio to show anything.
    disabled: boolean;
}

export function VisualizationCard({ to, title, image, disabled }: VisualizationCardProps) {
    const thumbnail = <img src={image} alt={title} className="aspect-[4/3] h-full w-full object-cover" />;

    if (disabled) {
        return (
            <div aria-disabled="true" title="Choose an audio source first" className="cursor-not-allowed opacity-60">
                {thumbnail}
            </div>
        );
    }

    return (
        <Link
            to={to}
            className="block hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
            {thumbnail}
        </Link>
    );
}
