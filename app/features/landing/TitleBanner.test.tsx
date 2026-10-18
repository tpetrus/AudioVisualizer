// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TitleBanner } from './TitleBanner';
import { TITLE_BANNER_HEIGHT, TITLE_BANNER_WIDTH } from './titleBannerImage';

describe('TitleBanner', () => {
    it('keeps the title and tagline available as text for screen readers', () => {
        render(<TitleBanner />);

        expect(screen.getByRole('heading', { level: 1, name: 'AudioVisualizer' })).toBeInTheDocument();
        expect(
            screen.getByText(/Spice up your music-listening experience, add vibrancy and motion to your DJ set/),
        ).toBeInTheDocument();
    });

    it('shows the pre-rendered image in AVIF and WebP with a PNG fallback, without a canvas', () => {
        const { container } = render(<TitleBanner />);

        expect(container.querySelector('canvas')).toBeNull();
        const sources = Array.from(container.querySelectorAll('picture source'));
        expect(sources.map((source) => source.getAttribute('type'))).toEqual(['image/avif', 'image/webp']);
        expect(sources[0]).toHaveAttribute('srcset', '/title-banner.avif 1x, /title-banner-2x.avif 2x');
        expect(sources[1]).toHaveAttribute('srcset', '/title-banner.webp 1x, /title-banner-2x.webp 2x');
        const image = container.querySelector('picture img')!;
        expect(image).toHaveAttribute('src', '/title-banner.png');
        expect(image).toHaveAttribute('srcset', '/title-banner.png 1x, /title-banner-2x.png 2x');
    });

    it('is decorative and reserves its box so the page does not shift', () => {
        const { container } = render(<TitleBanner />);

        const image = container.querySelector('img')!;
        expect(image).toHaveAttribute('alt', '');
        expect(image).toHaveAttribute('width', String(TITLE_BANNER_WIDTH));
        expect(image).toHaveAttribute('height', String(TITLE_BANNER_HEIGHT));
    });

    it('is fetched ahead of other images only when asked', () => {
        const { container, rerender } = render(<TitleBanner />);
        expect(container.querySelector('img')).not.toHaveAttribute('fetchpriority');

        rerender(<TitleBanner priority />);
        expect(container.querySelector('img')).toHaveAttribute('fetchpriority', 'high');
    });
});
