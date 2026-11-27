// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComingSoonCard } from './ComingSoonCard';

describe('ComingSoonCard', () => {
    it('tells the user more visualizations are on the way', () => {
        render(<ComingSoonCard />);

        expect(screen.getByText('More coming soon')).toBeInTheDocument();
    });

    it('is a slim full-width strip with legible muted text', () => {
        const { container } = render(<ComingSoonCard />);

        expect(container.firstElementChild).toHaveClass('w-full', 'py-6');
        expect(screen.getByText('More coming soon')).toHaveClass('text-xl', 'text-text-muted');
    });
});
