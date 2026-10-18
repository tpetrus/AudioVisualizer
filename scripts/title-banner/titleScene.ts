import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';

export const TITLE = 'AudioVisualizer';
export const TAGLINE_LINES = [
    'Spice up your music-listening experience, add vibrancy and motion',
    'to your DJ set, or whatever else you think of.',
];

export interface TitleFonts {
    title: Font;
    tagline: Font;
}

// Builds the 3D "AudioVisualizer" title with a two-line tagline underneath and returns the camera that frames it.
// This used to run in the landing page on every visit; it now runs once in a headless browser (see render.ts) and the
// page shows the resulting image.
export function setupTitleScene(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    size: { width: number; height: number },
    fonts: TitleFonts,
): THREE.PerspectiveCamera {
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const camera = new THREE.PerspectiveCamera(30, size.width / size.height, 1, 1500);
    camera.position.set(0, 0, 150);

    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0xffffff, 0, 1100);

    const light = new THREE.DirectionalLight(0x0003ff, 3);
    light.position.set(0, 0, 1).normalize();
    scene.add(light);

    scene.add(createTitleMesh(fonts.title), ...createTaglineMeshes(fonts.tagline));
    return camera;
}

function createTitleMesh(font: Font): THREE.Mesh {
    const geometry = new TextGeometry(TITLE, { font, size: 10 });
    const mesh = new THREE.Mesh(geometry, [
        new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true }), // front
        new THREE.MeshPhongMaterial({ color: 0xffffff }), // side
    ]);
    mesh.position.x = centeredX(geometry);
    mesh.name = TITLE;
    return mesh;
}

function createTaglineMeshes(font: Font): THREE.Mesh[] {
    const size = 2;
    const lineHeight = size * 1.8;
    const material = new THREE.MeshBasicMaterial({ color: 0xb8b8b8, fog: false, toneMapped: false });

    return TAGLINE_LINES.map((line, index) => {
        const geometry = new TextGeometry(line, { font, size, height: 0.3, curveSegments: 8 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(centeredX(geometry), -13 - index * lineHeight, 0);
        mesh.name = `${TITLE}Tagline${index}`;
        return mesh;
    });
}

// The x position that centers a text geometry horizontally on the origin.
function centeredX(geometry: TextGeometry): number {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox!;
    return -0.5 * (max.x - min.x);
}
