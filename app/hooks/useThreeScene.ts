import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { disposeScene } from '~/lib/three/disposeScene';

// Higher ratios are more computation for little value (ex 3x screens = 9x pixels)
const MAX_PIXEL_RATIO = 2;

export interface SceneSize {
    width: number;
    height: number;
}

// What a visualizer's setup receives
export interface SceneContext {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    size: SceneSize;
    signal: AbortSignal; // aborted when scene is torn down
}

// What a visualizer's setup returns
export interface SceneHandle {
    camera: THREE.PerspectiveCamera; // hook renders with it and fixes its aspect ratio
    update?: (time: number, delta: number) => void; // called every frame before render
    resize?: (size: SceneSize) => void; // extra resize work
    dispose?: () => void; // anything traversing the scene won't reach
}

export type SceneSetup = (context: SceneContext) => SceneHandle;

export interface ThreeSceneOptions {
    antialias?: boolean; // Constructor-only renderer setting, so it can't be set inside setup.
}

// Owns a three.js renderer inside `containerRef`: creates it, sizes it to the container, runs the render loop,
// follows resizes, and frees every GPU resource on unmount. `setup` builds the scene's content once.
export function useThreeScene(
    containerRef: RefObject<HTMLElement | null>,
    setup: SceneSetup,
    { antialias = false }: ThreeSceneOptions = {},
) {
    // Read through a ref so an inline setup function (new every render) doesn't rebuild the scene.
    const setupRef = useRef(setup);
    useLayoutEffect(() => {
        setupRef.current = setup;
    });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let size: SceneSize = { width: container.clientWidth, height: container.clientHeight };
        const isDevEnvironment = import.meta.env.DEV;
        if (isDevEnvironment && (size.width === 0 || size.height === 0)) {
            console.warn('useThreeScene: the container has no size.  Give it an explicit width and height.');
        }

        const controller = new AbortController();
        const renderer = new THREE.WebGLRenderer({ antialias });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
        // `false` means don't write inline width/height styles; CSS sizes the canvas so the container can still shrink.
        renderer.setSize(size.width, size.height, false);

        const canvas = renderer.domElement;
        // A canvas is inline by default, which leaves a few pixels of page showing under it.
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        const scene = new THREE.Scene();
        let handle: SceneHandle;
        try {
            handle = setupRef.current({ scene, renderer, size, signal: controller.signal });
        } catch (error) {
            disposeScene(scene);
            renderer.dispose();
            throw error;
        }

        const { camera } = handle;
        updateCamera(camera, size);
        container.appendChild(canvas);

        const observer = new ResizeObserver(([entry]) => {
            const width = Math.round(entry.contentRect.width);
            const height = Math.round(entry.contentRect.height);

            const noResizeNeeded = width === 0 || height === 0 || (width === size.width && height === size.height);
            if (noResizeNeeded) return;

            size = { width, height };
            renderer.setSize(width, height, false);
            updateCamera(camera, size);
            handle.resize?.(size);
        });
        observer.observe(container);

        let lastTime: number | undefined;
        renderer.setAnimationLoop((time) => {
            const delta = lastTime === undefined ? 0 : time - lastTime;
            lastTime = time;
            handle.update?.(time, delta);
            renderer.render(scene, camera);
        });

        const teardown = () => {
            renderer.setAnimationLoop(null);
            observer.disconnect();
            controller.abort();
            handle.dispose?.();
            disposeScene(scene);
            renderer.dispose();
            canvas.remove();
        };

        return teardown;
    }, [containerRef, antialias]);
}

function updateCamera(camera: THREE.PerspectiveCamera, { width, height }: SceneSize): void {
    if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
}
