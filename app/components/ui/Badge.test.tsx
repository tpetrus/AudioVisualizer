// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
    it('defaults to the neutral tone', () => {
        render(<Badge>2 changed</Badge>);
        expect(screen.getByText('2 changed')).toHaveClass('border-border', 'text-text-muted');
    });

    it('styles the accent and warning tones and appends className', () => {
        render(
            <>
                <Badge tone="accent" className="ml-1">
                    Recommended
                </Badge>
                <Badge tone="warning">Careful</Badge>
            </>,
        );
        expect(screen.getByText('Recommended')).toHaveClass('text-accent-text', 'ml-1');
        expect(screen.getByText('Careful')).toHaveClass('text-warning');
    });
});
