// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Route } from '../+types/root';
import Cubes, { meta } from './cubesPage';

// The page itself has its own spec; the route module only has to mount it.
vi.mock('~/features/visualizers/cubes/CubesPage', () => ({ CubesPage: () => <p>CubesPage stand-in</p> }));

describe('cubesPage route', () => {
    it('sets the document title', () => {
        const tags = meta({} as Route.MetaArgs);

        expect(tags).toContainEqual({ title: 'Audio Visualizer - Cubes' });
        expect(tags).toContainEqual(expect.objectContaining({ name: 'description' }));
    });

    it('renders the feature page', () => {
        render(<Cubes />);

        expect(screen.getByText('CubesPage stand-in')).toBeInTheDocument();
    });
});
