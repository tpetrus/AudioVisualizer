// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '~/test/renderWithProviders';
import { VisualizationCard } from './VisualizationCard';

describe('VisualizationCard', () => {
    it('links to the visualizer when audio is available', () => {
        renderWithProviders(<VisualizationCard to="/cubes" title="Cubes" image="/cubes.png" disabled={false} />);

        const link = screen.getByRole('link', { name: 'Cubes' });
        expect(link).toHaveAttribute('href', '/cubes');
        expect(screen.getByRole('img', { name: 'Cubes' })).toHaveAttribute('src', '/cubes.png');
    });

    it('is not a link until an audio source is capturing, and explains why', () => {
        renderWithProviders(<VisualizationCard to="/cubes" title="Cubes" image="/cubes.png" disabled />);

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Cubes' })).toBeInTheDocument();
        expect(screen.getByTitle('Choose an audio source first')).toHaveAttribute('aria-disabled', 'true');
    });
});
