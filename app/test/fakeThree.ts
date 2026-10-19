import { afterEach, vi } from 'vitest';
import type { Texture } from 'three';

// Replaces the two three.js classes that need a GPU: WebGLRenderer and PMREMGenerator. Everything else in three
// (Scene, cameras, meshes, geometries, materials, math) stays real and runs fine without WebGL.
//
// HOW TO USE (copy this into a spec). `vi.mock` is hoisted above the imports, so the factory must load this file with a
// dynamic import instead of referencing a top-level import:
//
//   vi.mock('three', async (importOriginal) => {
//       const { threeFakes } = await import('~/test/fakeThree');
//       return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
//   });
//
// Then, in the test, import `FakeRenderer` normally:
//
//   import { FakeRenderer } from '~/test/fakeThree';
//   render(<Page />);
//   const renderer = FakeRenderer.last;        // the renderer the hook created
//   renderer.renderFrame(16);                  // run one animation-loop tick at t = 16 ms
//   expect(renderer.dispose).toHaveBeenCalledTimes(1);
//
// This file must not import 'three' at runtime (type imports are fine): it is loaded from inside the mock of 'three'.
// DOM needed: the renderer creates a real <canvas>, so specs that use it run with `// @vitest-environment jsdom`.

export class FakeRenderer {
    // Every renderer constructed since the last reset; `last` is the most recent.
    static instances: FakeRenderer[] = [];
    static get last(): FakeRenderer {
        const renderer = FakeRenderer.instances[FakeRenderer.instances.length - 1];
        if (!renderer) throw new Error('No WebGLRenderer has been created yet');
        return renderer;
    }

    // A real canvas, so useThreeScene can append it to the container and tests can query it with the DOM.
    readonly domElement: HTMLCanvasElement = document.createElement('canvas');

    // Settings the visualizers assign directly.
    outputColorSpace = 'srgb';
    toneMapping = 0;

    // Spies for the calls a spec inspects: sizing, pixel ratio, rendering and the two teardown calls.
    readonly setSize = vi.fn((_width: number, _height: number, _updateStyle?: boolean) => {});
    readonly setPixelRatio = vi.fn((_ratio: number) => {});
    readonly render = vi.fn((_scene: unknown, _camera: unknown) => {});
    readonly dispose = vi.fn(() => {});
    readonly forceContextLoss = vi.fn(() => {});

    // The callback the code under test registered; null once it unregistered (three's `setAnimationLoop(null)`).
    animationLoop: ((time: number) => void) | null = null;
    readonly setAnimationLoop = vi.fn((callback: ((time: number) => void) | null) => {
        this.animationLoop = callback;
    });

    constructor(readonly parameters?: { antialias?: boolean }) {
        FakeRenderer.instances.push(this);
    }

    // Runs one tick of the captured loop, like requestAnimationFrame firing at `time` ms. Throws when there is no loop,
    // so a test that forgets the scene was torn down fails loudly instead of silently doing nothing.
    renderFrame(time: number): void {
        if (!this.animationLoop) throw new Error('renderFrame: no animation loop is running');
        this.animationLoop(time);
    }
}

// `new PMREMGenerator(renderer).fromScene(room, 0.04).texture` is the only use. The real one compiles shaders.
export class FakePmrem {
    static instances: FakePmrem[] = [];
    // Has a `dispose` spy because disposeScene disposes the scene's environment texture.
    readonly texture = { isTexture: true, dispose: vi.fn() } as unknown as Texture;
    readonly fromScene = vi.fn((_scene: unknown, _sigma?: number) => ({ texture: this.texture }));
    readonly dispose = vi.fn(() => {});

    constructor(readonly renderer?: unknown) {
        FakePmrem.instances.push(this);
    }
}

// Spread over the real module in the `vi.mock('three', ...)` factory (see the top of the file).
export const threeFakes = {
    WebGLRenderer: FakeRenderer,
    PMREMGenerator: FakePmrem,
};

export function resetFakeThree(): void {
    FakeRenderer.instances = [];
    FakePmrem.instances = [];
}

// Registered here rather than in setup.ts, which must not load this file for specs that never mock three.
afterEach(resetFakeThree);
