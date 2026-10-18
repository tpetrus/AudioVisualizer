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

    it('offers AVIF then WebP sources at two widths, with the PNG as the fallback', () => {
        const { container } = renderWithProviders(
            <VisualizationCard to="/cubes" title="Cubes" image="/cubes.png" disabled={false} />,
        );

        const sources = [...container.querySelectorAll('picture > source')];
        expect(sources.map((source) => source.getAttribute('type'))).toEqual(['image/avif', 'image/webp']);
        expect(sources.map((source) => source.getAttribute('srcset'))).toEqual([
            '/cubes-640.avif 640w, /cubes-1280.avif 1280w',
            '/cubes-640.webp 640w, /cubes-1280.webp 1280w',
        ]);
        expect(sources.map((source) => source.getAttribute('sizes'))).toEqual(['33vw', '33vw']);
        expect(container.querySelector('picture > img')).toBe(screen.getByRole('img', { name: 'Cubes' }));
    });

    it('gives the image its intrinsic size and decodes it off the main thread', () => {
        renderWithProviders(<VisualizationCard to="/cubes" title="Cubes" image="/cubes.png" disabled={false} />);

        const img = screen.getByRole('img', { name: 'Cubes' });
        expect(img).toHaveAttribute('width', '1280');
        expect(img).toHaveAttribute('height', '960');
        expect(img).toHaveAttribute('decoding', 'async');
    });

    it('fetches a priority image eagerly and at high priority', () => {
        renderWithProviders(
            <VisualizationCard to="/cubes" title="Cubes" image="/cubes.png" disabled={false} priority />,
        );

        const img = screen.getByRole('img', { name: 'Cubes' });
        expect(img).toHaveAttribute('fetchpriority', 'high');
        expect(img).toHaveAttribute('loading', 'eager');
    });

    it('leaves the default loading behaviour for a non-priority image', () => {
        renderWithProviders(<VisualizationCard to="/cubes" title="Cubes" image="/cubes.png" disabled={false} />);

        const img = screen.getByRole('img', { name: 'Cubes' });
        expect(img).not.toHaveAttribute('fetchpriority');
        expect(img).not.toHaveAttribute('loading');
    });
});
