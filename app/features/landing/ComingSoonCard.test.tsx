// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComingSoonCard } from './ComingSoonCard';

describe('ComingSoonCard', () => {
    it('tells the user more visualizations are on the way', () => {
        render(<ComingSoonCard />);

        expect(screen.getByText('More coming soon')).toBeInTheDocument();
    });
});
