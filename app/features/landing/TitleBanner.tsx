import { useRef } from 'react';
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { type Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import useThreeScene, { type SceneSetup } from '~/hooks/useThreeScene';

const TITLE = 'AudioVisualizer';
const TAGLINE_LINES = [
    'Spice up your music-listening experience, add vibrancy and motion',
    'to your DJ set, or whatever else you think of.',
];
const TITLE_FONT_URL = '/fonts/paladins_gradient.json';
const TAGLINE_FONT_URL = '/fonts/helvetiker_bold.typeface.json';

// 3D "AudioVisualizer" title with a two-line tagline underneath.
export function TitleBanner() {
    const containerRef = useRef<HTMLDivElement>(null);
    useThreeScene(containerRef, setupTitleScene, { antialias: true });

    return (
        <header className="text-white">
            {/* The canvas can't be read by screen readers or search engines, so the text is also here, visually hidden. */}
            <h1 className="sr-only">{TITLE}</h1>
            <p className="sr-only">{TAGLINE_LINES.join(' ')}</p>
            <div ref={containerRef} className="h-[300px] w-full bg-black" />
        </header>
    );
}

const setupTitleScene: SceneSetup = ({ scene, renderer, size, signal }) => {
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const camera = new THREE.PerspectiveCamera(30, size.width / size.height, 1, 1500);
    camera.position.set(0, 0, 150);

    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0xffffff, 0, 1100);

    const light = new THREE.DirectionalLight(0x0003ff, 3);
    light.position.set(0, 0, 1).normalize();
    scene.add(light);

    const loader = new FontLoader();
    Promise.all([loader.loadAsync(TITLE_FONT_URL), loader.loadAsync(TAGLINE_FONT_URL)])
        .then(([titleFont, taglineFont]) => {
            // The banner may have unmounted while the fonts were loading.
            if (signal.aborted) {
                return;
            }
            scene.add(createTitleMesh(titleFont), ...createTaglineMeshes(taglineFont));
        })
        .catch(error => {
            if (!signal.aborted) {
                console.error('Failed to load the title fonts', error);
            }
        });

    return { camera };
};

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