// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { Mesh, Scene } from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeResizeObserver } from '~/test/fakeResizeObserver';
import { FakeRenderer } from '~/test/fakeThree';
import { TitleBanner } from './TitleBanner';

vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

// Building real text outlines needs real glyph data; a small triangle is enough to position the meshes.
vi.mock('three/examples/jsm/geometries/TextGeometry.js', async () => {
    const { BufferGeometry, BufferAttribute } = await import('three');
    class TextGeometry extends BufferGeometry {
        constructor() {
            super();
            this.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 10, 5, 0, 0, 5, 0]), 3));
        }
    }
    return { TextGeometry };
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// The scene the hook rendered into, found through the fake renderer's render call.
function renderedScene(): Scene {
    const renderer = FakeRenderer.last;
    renderer.renderFrame(0);
    return renderer.render.mock.calls[0][0] as Scene;
}

describe('TitleBanner', () => {
    let loadAsync: ReturnType<typeof vi.spyOn>;
    const font = {} as Font;

    beforeEach(() => {
        installFakeResizeObserver();
        loadAsync = vi.spyOn(FontLoader.prototype, 'loadAsync').mockResolvedValue(font);
        // jsdom lays nothing out, so the container has no size and the hook warns about it.
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the title and tagline available as text for screen readers', () => {
        render(<TitleBanner />);

        expect(screen.getByRole('heading', { level: 1, name: 'AudioVisualizer' })).toBeInTheDocument();
        expect(
            screen.getByText(/Spice up your music-listening experience, add vibrancy and motion to your DJ set/),
        ).toBeInTheDocument();
    });

    it('creates an antialiased renderer with a canvas inside the banner', () => {
        const { container } = render(<TitleBanner />);

        expect(FakeRenderer.last.parameters).toEqual({ antialias: true });
        expect(container.querySelector('header canvas')).toBe(FakeRenderer.last.domElement);
        expect(FakeRenderer.last.physicallyCorrectLights).toBe(true);
    });

    it('loads both fonts and adds the title and two tagline lines to the scene', async () => {
        render(<TitleBanner />);
        await vi.waitFor(() =>
            expect(renderedScene().children.some((child) => child.name === 'AudioVisualizer')).toBe(true),
        );

        expect(loadAsync).toHaveBeenCalledWith('/fonts/paladins_gradient.json');
        expect(loadAsync).toHaveBeenCalledWith('/fonts/helvetiker_bold.typeface.json');
        const meshes = renderedScene().children.filter((child): child is Mesh => 'isMesh' in child);
        expect(meshes.map((mesh) => mesh.name)).toEqual([
            'AudioVisualizer',
            'AudioVisualizerTagline0',
            'AudioVisualizerTagline1',
        ]);
        // Each line is centred horizontally (the stand-in geometry is 10 wide) and the tagline lines stack downward.
        expect(meshes.map((mesh) => mesh.position.x)).toEqual([-5, -5, -5]);
        expect(meshes[1].position.y).toBeGreaterThan(meshes[2].position.y);
    });

    it('adds a light to the scene straight away', () => {
        render(<TitleBanner />);

        expect(renderedScene().children.some((child) => 'isDirectionalLight' in child)).toBe(true);
    });

    it('adds nothing when the banner unmounted before the fonts arrived', async () => {
        const title = deferred<Font>();
        loadAsync.mockReturnValueOnce(title.promise).mockResolvedValueOnce(font);
        const { unmount } = render(<TitleBanner />);
        const scene = renderedScene();

        unmount();
        title.resolve(font);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(scene.children.filter((child) => 'isMesh' in child)).toHaveLength(0);
    });

    it('logs a font that failed to load while the banner is still showing', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const failure = new Error('404');
        loadAsync.mockRejectedValue(failure);
        render(<TitleBanner />);

        await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load the title fonts', failure));
    });

    it('stays quiet about a font that failed after the banner unmounted', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const title = deferred<Font>();
        loadAsync.mockReturnValue(title.promise);
        const { unmount } = render(<TitleBanner />);

        unmount();
        title.reject(new Error('late failure'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(error).not.toHaveBeenCalled();
    });
});
