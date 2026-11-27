import type { Page } from '@playwright/test';
import {
    chooseInputDevice,
    expect,
    expectCanvasRendering,
    expectSingleCanvas,
    liveWebGLContexts,
    test,
    trackWebGLContexts,
} from './fixtures';
import { openSettings, openVisualizer, VISUALIZERS_UNDER_TEST } from './visualizers';

const STORAGE_KEY = 'audioVisualizer.enhancedGraphics';
// Software WebGL is slow, and the enhanced look runs a bloom post chain on it, so every wait here is generous.
const ENHANCED_READY_TIMEOUT = 90_000;
// A mean channel value above this, on a 0..255 scale, means the picture is washed out (the cubes scene is mostly dark).
const WASHED_OUT_MEAN = 200;
// The share of near-white pixels above which the frame counts as blown out by glow.
const WASHED_OUT_WHITE_SHARE = 0.5;

const cubes = VISUALIZERS_UNDER_TEST.find(({ path }) => path === '/cubes')!;

const enhancedSwitch = (page: Page) => page.getByRole('switch', { name: /Enhanced graphics/ });
const readyStatus = (page: Page) => page.getByText('Enhanced graphics on', { exact: true });

// Seeds the stored preference before any page script runs, so the visualizer starts in enhanced mode.
async function seedEnhanced(page: Page): Promise<void> {
    await page.addInitScript((key) => localStorage.setItem(key, 'true'), STORAGE_KEY);
}

// Records the URL of every request for the lazy enhanced chunk. Call it before the first navigation.
function trackEnhancedChunk(page: Page): string[] {
    const requested: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes('CubesEnhancedLook')) requested.push(request.url());
    });
    return requested;
}

interface PixelStats {
    mean: number; // average of the red, green and blue values, 0..255
    whiteShare: number; // share of pixels whose three channels are all at least 250
}

// Reads the canvas in the animation frame after the scene's own render, while the finished frame is still in the
// buffer (the same approach as expectCanvasRendering in fixtures.ts, which this extends with brightness statistics).
function canvasPixelStats(page: Page): Promise<PixelStats> {
    return page.evaluate(
        () =>
            new Promise<PixelStats>((resolve) => {
                requestAnimationFrame(() => {
                    const canvas = document.querySelector('canvas')!;
                    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
                    if (!gl) {
                        resolve({ mean: 255, whiteShare: 1 });
                        return;
                    }
                    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                    gl.readPixels(
                        0,
                        0,
                        gl.drawingBufferWidth,
                        gl.drawingBufferHeight,
                        gl.RGBA,
                        gl.UNSIGNED_BYTE,
                        pixels,
                    );
                    let sum = 0;
                    let white = 0;
                    const count = pixels.length / 4;
                    for (let i = 0; i < pixels.length; i += 4) {
                        sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
                        if (pixels[i] >= 250 && pixels[i + 1] >= 250 && pixels[i + 2] >= 250) white++;
                    }
                    resolve({ mean: sum / (count * 3), whiteShare: white / count });
                });
            }),
    );
}

async function expectNotWashedOut(page: Page): Promise<void> {
    await expect
        .poll(
            async () => {
                const { mean, whiteShare } = await canvasPixelStats(page);
                return mean < WASHED_OUT_MEAN && whiteShare < WASHED_OUT_WHITE_SHARE;
            },
            { message: 'the canvas is washed out (near white)', timeout: 20_000 },
        )
        .toBe(true);
}

async function openCubesEnhanced(page: Page): Promise<void> {
    await seedEnhanced(page);
    await page.goto('/');
    await chooseInputDevice(page);
    await openVisualizer(page, cubes);
    await openSettings(page);
    await expect(readyStatus(page)).toBeVisible({ timeout: ENHANCED_READY_TIMEOUT });
}

test.describe('cubes enhanced graphics', () => {
    test.setTimeout(240_000);

    test('standard mode requests no enhanced chunk and shows no Enhanced controls', async ({ page }) => {
        const requested = trackEnhancedChunk(page);

        await page.goto('/');
        await chooseInputDevice(page);
        await openVisualizer(page, cubes);
        await expectCanvasRendering(page);
        await openSettings(page);
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByLabel('Glow', { exact: true })).toHaveCount(0);
        // Give a stray lazy import time to show up.
        await page.waitForTimeout(2000);

        expect(requested).toEqual([]);
    });

    test('the enhanced look renders, is not washed out and loads its chunk', async ({ page }) => {
        const requested = trackEnhancedChunk(page);

        await openCubesEnhanced(page);

        await expectSingleCanvas(page);
        await expectCanvasRendering(page);
        await expectNotWashedOut(page);
        expect(requested.length, 'the lazy enhanced chunk was requested').toBeGreaterThan(0);
        // Only the first panel section starts open, so the control is in the DOM but collapsed.
        await expect(page.getByLabel('Glow', { exact: true })).toBeAttached();
    });

    test('flipping the switch off and on keeps one canvas and one live context', async ({ page }) => {
        await trackWebGLContexts(page);
        await openCubesEnhanced(page);
        const toggle = enhancedSwitch(page);

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'false');
        await expectSingleCanvas(page);
        await expect.poll(() => liveWebGLContexts(page), { message: 'live contexts after off' }).toBe(1);
        await expectCanvasRendering(page);

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        await expect(readyStatus(page)).toBeVisible({ timeout: ENHANCED_READY_TIMEOUT });
        await expectSingleCanvas(page);
        await expect.poll(() => liveWebGLContexts(page), { message: 'live contexts after on again' }).toBe(1);
        await expectCanvasRendering(page);
        await expectNotWashedOut(page);
    });

    test('a viewport resize keeps one canvas, one context and a picture', async ({ page }) => {
        await trackWebGLContexts(page);
        await openCubesEnhanced(page);

        await page.setViewportSize({ width: 900, height: 600 });
        await page.setViewportSize({ width: 1400, height: 700 });

        await expectSingleCanvas(page);
        await expect.poll(() => liveWebGLContexts(page), { message: 'live contexts after resizing' }).toBe(1);
        await expectCanvasRendering(page);
        await expectNotWashedOut(page);
    });

    test('a route round trip releases the context', async ({ page }) => {
        await trackWebGLContexts(page);
        await openCubesEnhanced(page);

        await page.goBack();
        await expect(page).toHaveURL('/');
        await expect(page.locator('canvas')).toHaveCount(0);
        await expect.poll(() => liveWebGLContexts(page), { message: 'live contexts on the landing page' }).toBe(0);

        await openVisualizer(page, cubes);
        await expect.poll(() => liveWebGLContexts(page), { message: 'live contexts on return' }).toBe(1);
        await expectCanvasRendering(page);
    });
});
