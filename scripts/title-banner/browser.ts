// Runs inside headless Chromium (bundled for the browser by `npm run title-banner`): draws the title scene once, with
// the font data compiled in so nothing is fetched, and leaves the frame in the canvas for render.ts to screenshot.
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import taglineFontData from './helvetiker_bold.typeface.json';
import titleFontData from './paladins_gradient.json';
import { setupTitleScene } from './titleScene';

declare global {
    interface Window {
        drawTitleBanner: (width: number, height: number) => void;
    }
}

window.drawTitleBanner = (width, height) => {
    const loader = new FontLoader();
    const fonts = { title: loader.parse(titleFontData), tagline: loader.parse(taglineFontData) };

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    // The page's device scale factor (1 or 2) decides how many pixels the screenshot has.
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    document.body.replaceChildren(canvas);

    const scene = new THREE.Scene();
    const camera = setupTitleScene(scene, renderer, { width, height }, fonts);
    renderer.render(scene, camera);
};
