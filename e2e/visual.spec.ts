import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { chooseInputDevice, connectAudio, expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openAllSections, openSettings, startVisualizer } from './visualizers';

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
    // The version changes with every release, so it is masked instead of making each release fail the baseline.
    await expect(page).toHaveScreenshot('landing.png', { mask: [page.getByTestId('app-version')] });
});

test('audio source dialog', async ({ page }) => {
    await page.goto('/');
    await connectAudio(page);
    await imagesLoaded(page);
    await expect(page).toHaveScreenshot('audio-source-dialog.png', { stylePath: HIDE_CANVAS });
});

// Freezes the scene and takes the open settings panel's screenshot under `name`.
async function expectSettingsPanelScreenshot(page: Page, name: string): Promise<void> {
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
    await expect(page).toHaveScreenshot(name, { stylePath: HIDE_CANVAS, clip: box! });
}

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`${visualizer.name} settings panel`, async ({ page }) => {
        test.setTimeout(120_000);
        // Fake timers (they still run in real time until paused) so the scene can be frozen below.
        await page.clock.install();
        await startVisualizer(page, visualizer);
        await openSettings(page);
        await expectSettingsPanelScreenshot(page, `${visualizer.path.replace(/\W+/g, '')}-settings-panel.png`);
    });
}

// The one enhanced baseline: the cubes panel with its Enhanced section. The canvas itself is animated, so it stays
// hidden, as in the cases above.
test('Cubes settings panel with enhanced graphics on', async ({ page }) => {
    test.setTimeout(180_000);
    const cubes = VISUALIZERS_UNDER_TEST.find(({ path }) => path === '/cubes')!;
    await page.addInitScript(() => localStorage.setItem('audioVisualizer.enhancedGraphics', 'true'));
    await page.clock.install();
    await startVisualizer(page, cubes);
    // A software-rendered enhanced frame (glass, bloom and particles at 1280x800) can take so long that the screenshot
    // below never gets a frame in time. The canvas is hidden in the picture anyway, so shrink its host: the scene follows
    // the host's size, the bloom switches off below its minimum size, and frames become cheap. The panel is positioned
    // on its own, so its picture does not change. It is done before the enhanced look is up, because the resize is only
    // seen between frames, and a full-size enhanced frame can hold it back past any reasonable wait.
    await page.evaluate(() => {
        const host = document.querySelector('canvas')?.parentElement;
        if (host) {
            host.style.width = '2px';
            host.style.height = '2px';
        }
    });
    await expect
        .poll(() => page.evaluate(() => document.querySelector('canvas')?.width ?? 0), { timeout: 30_000 })
        .toBeLessThanOrEqual(8);
    await openSettings(page);
    // Fake time runs in real time until it is paused, so the look can finish loading first; the status line is part of
    // the panel's picture.
    await expect(page.getByText('Enhanced graphics on', { exact: true })).toBeVisible({ timeout: 90_000 });
    // Only the first section starts open, and the Enhanced controls are the point of this baseline.
    await openAllSections(page);
    await expectSettingsPanelScreenshot(page, 'cubes-enhanced-settings-panel.png');
});
