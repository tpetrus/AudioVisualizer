import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { chooseInputDevice, expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openSettings, startVisualizer } from './visualizers';

// Baselines are Linux renders from the Playwright container image (see .github/workflows/update-snapshots.yml). Fonts,
// anti-aliasing and software GL differ on other platforms, so a local Windows or macOS run would only report diffs
// that mean nothing, and its missing `-win32`/`-darwin` baselines would fail the whole suite. Skip there unless
// VISUAL_ANY_PLATFORM is set (for example to write throwaway baselines while developing a new test).
test.skip(
    process.platform !== 'linux' && !process.env.VISUAL_ANY_PLATFORM,
    'Visual baselines are Linux-only; run them in the Playwright container or via the update-snapshots workflow.',
);

// A fixed viewport, so the layout (and therefore every screenshot) is the same on every machine.
test.use({ viewport: { width: 1280, height: 800 } });

// Hides the WebGL canvases for screenshots where UI sits on top of them. A `mask` is painted over everything in its
// box, which would also cover the translucent UI that overlaps the canvas, whereas hiding the canvas lets that UI
// render over the plain page background. The canvas is animated output, so it must stay out of the comparison.
const HIDE_CANVAS = resolve(import.meta.dirname, 'hide-canvas.css');

async function imagesLoaded(page: Page): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)),
        )
        .toBe(true);
}

test('landing page', async ({ page }) => {
    await page.goto('/');
    await chooseInputDevice(page);
    await expect(page.getByRole('link', { name: VISUALIZERS_UNDER_TEST[0].name })).toBeVisible();
    await imagesLoaded(page);
    // The only canvas is the 3D title, which is animated; nothing overlaps it, so it can be masked.
    await expect(page).toHaveScreenshot('landing.png', { mask: [page.locator('canvas')] });
});

test('audio source dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Audio source' })).toBeVisible();
    await imagesLoaded(page);
    await expect(page).toHaveScreenshot('audio-source-dialog.png', { stylePath: HIDE_CANVAS });
});

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`${visualizer.name} settings panel`, async ({ page }) => {
        test.setTimeout(120_000);
        // Fake timers (they still run in real time until paused) so the scene can be frozen below.
        await page.clock.install();
        await startVisualizer(page, visualizer);
        await openSettings(page);
        // Pausing the clock stops the scene's animation-frame loop. Without this, the software-rendered scene keeps
        // the browser so busy that a screenshot takes seconds, and the locator's "element is stable" wait times out.
        // The panel is already rendered, so the UI under test is unaffected.
        await page.clock.pauseAt(new Date(Date.now() + 60_000));
        // The panel is the close button's grandparent (button -> bar -> panel). Its classes are hashed CSS-module
        // names, and it has no role of its own.
        const panel = page.getByRole('button', { name: '✕ Close' }).locator('xpath=../..');
        // The panel is translucent over the canvas, so the canvas is hidden rather than masked (see HIDE_CANVAS). The
        // performance and rhythm overlays (time-varying numbers) are off by default and are never opened here.
        // The shot is clipped to the panel's box rather than taken with the locator form of the assertion: that form
        // first waits for the element to be "stable" across animation frames, and with the clock paused that wait is
        // unreliable (it passed on some runs and timed out on others). The page is frozen, so a clip is just as exact.
        // The software-rendered scene can leave a backlog of frames that the first screenshot has to wait out (seconds
        // on a CI runner), longer than the assertion's own timeout. Take that wait here, with a generous limit, so the
        // assertion below sees an idle page.
        await page.screenshot({ timeout: 60_000, type: 'jpeg', quality: 1 });
        const box = await panel.boundingBox();
        expect(box, 'the settings panel is laid out').not.toBeNull();
        await expect(page).toHaveScreenshot(`${visualizer.path.replace(/\W+/g, '')}-settings-panel.png`, {
            stylePath: HIDE_CANVAS,
            clip: box!,
        });
    });
}
