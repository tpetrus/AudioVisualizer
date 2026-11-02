// The cards' grid has this many columns; the landing page lays out the visualization cards in it.
export const CARD_COLUMNS = 3;

// The tile fills the rest of the last row, so it keeps the cards' 4:3 height at any width it spans. Tailwind only sees
// whole class names, hence one literal per span.
const SPAN_CLASSES = {
    1: 'col-span-1 aspect-[4/3]',
    2: 'col-span-2 aspect-[8/3]',
    3: 'col-span-3 aspect-[4/1]',
} as const;

// The number of columns the tile spans after `cardCount` cards: whatever is left of the last row, or a full row of its
// own when the cards fill their rows exactly.
export function comingSoonSpan(cardCount: number): keyof typeof SPAN_CLASSES {
    return (CARD_COLUMNS - (cardCount % CARD_COLUMNS)) as keyof typeof SPAN_CLASSES;
}

interface ComingSoonCardProps {
    cardCount: number;
}

export function ComingSoonCard({ cardCount }: ComingSoonCardProps) {
    return (
        <div
            className={`${SPAN_CLASSES[comingSoonSpan(cardCount)]} flex w-full items-center justify-center bg-neutral-800`}
        >
            <span className="text-3xl font-bold uppercase italic tracking-wide text-neutral-500">More coming soon</span>
        </div>
    );
}
