// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARD_COLUMNS, ComingSoonCard, comingSoonSpan } from './ComingSoonCard';

describe('ComingSoonCard', () => {
    it('tells the user more visualizations are on the way', () => {
        render(<ComingSoonCard cardCount={3} />);

        expect(screen.getByText('More coming soon')).toBeInTheDocument();
    });

    it('fills the rest of the last row, or a whole row when the cards fill theirs', () => {
        expect(CARD_COLUMNS).toBe(3);
        expect(comingSoonSpan(3)).toBe(3);
        expect(comingSoonSpan(4)).toBe(2);
        expect(comingSoonSpan(5)).toBe(1);
        expect(comingSoonSpan(6)).toBe(3);
    });

    it('keeps the height of one card at the width it spans', () => {
        const { container, rerender } = render(<ComingSoonCard cardCount={3} />);
        expect(container.firstElementChild).toHaveClass('col-span-3', 'aspect-[4/1]');

        rerender(<ComingSoonCard cardCount={4} />);
        expect(container.firstElementChild).toHaveClass('col-span-2', 'aspect-[8/3]');

        rerender(<ComingSoonCard cardCount={5} />);
        expect(container.firstElementChild).toHaveClass('col-span-1', 'aspect-[4/3]');
    });
});
