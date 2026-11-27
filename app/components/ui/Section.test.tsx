// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Section } from './Section';

describe('Section', () => {
    it('renders an h3 title and its children', () => {
        render(
            <Section title="Display" className="mt-4">
                <p>content</p>
            </Section>,
        );
        expect(screen.getByRole('heading', { level: 3, name: 'Display' })).toBeInTheDocument();
        expect(screen.getByText('content')).toBeInTheDocument();
        expect(screen.getByText('content').parentElement).toHaveClass('mt-4');
    });
});
