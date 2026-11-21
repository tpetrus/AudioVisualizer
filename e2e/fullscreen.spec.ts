import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openSettings, startVisualizer, type VisualizerUnderTest } from './visualizers';

const KEYBOARD_HINT = 'Press ESC to exit Fullscreen mode';
const TOUCH_HINT = 'Tap the screen, then the exit icon to leave fullscreen';

const settingsButton = (page: Page) => page.getByRole('button', { name: '☰ Settings' });
const fullscreenButton = (page: Page) => page.getByRole('button', { name: 'Fullscreen (F)', exact: true });
const lockButton = (page: Page) => page.getByRole('button', { name: /^Camera (locked|unlocked)/ });

// Makes the browser report that element fullscreen is unavailable, so the app takes its pseudo-fullscreen path. Run
// before navigation, because the app reads the support once when the page mounts.
async function disableNativeFullscreen(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
        Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false });
        Element.prototype.requestFullscreen = undefined as never;
    });
}

// True when the canvas fills the viewport exactly. Polled by callers because the scene resizes after the layout change.
const canvasFillsViewport = (page: Page) =>
    page.evaluate(() => {
        const canvas = document.querySelector('canvas')!;
        return canvas.clientWidth === window.innerWidth && canvas.clientHeight === window.innerHeight;
    });

// The fullscreen target is the canvas's grandparent (canvas -> host -> wrapper).
const fullscreenElementIsWrapper = (page: Page) =>
    page.evaluate(() => {
        const canvas = document.querySelector('canvas')!;
        return (
            document.fullscreenElement !== null && document.fullscreenElement === canvas.parentElement?.parentElement
        );
    });

const hasFullscreenElement = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

const wrapperOf = (page: Page) => page.locator('canvas').locator('xpath=../..');

// Tests that time the app's 2-3 s timers install `page.clock` and pause it once the scene is up (as visual.spec.ts
// does). A running fake clock fires the scene's animation frames on a fixed timer whatever a frame costs, and a
// software-rendered fullscreen scene costs more than one: the GPU process fell so far behind that the next test's
// `browser.newContext` timed out. Paused, the waits below use `clock.fastForward`, which fires each due timer once
// (`runFor` would replay every frame of the span), and that is all the hint, exit-button and idle-cursor checks need.
async function startWithPausedClock(page: Page, visualizer: VisualizerUnderTest): Promise<void> {
    await page.clock.install();
    await startVisualizer(page, visualizer);
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
}

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`${visualizer.name} fullscreen button, hint and exit`, async ({ page }) => {
        test.setTimeout(120_000);
        await startWithPausedClock(page, visualizer);

        // The button sits right after the Settings button in the same bar, next to the lock button.
        const button = fullscreenButton(page);
        await expect(button).toHaveAttribute('title', 'Fullscreen (F)');
        await expect(settingsButton(page).locator('xpath=following-sibling::button[1]')).toHaveAttribute(
            'title',
            'Fullscreen (F)',
        );
        await expect(lockButton(page)).toBeVisible();

        await button.click();
        await expect.poll(() => fullscreenElementIsWrapper(page)).toBe(true);
        await expect.poll(() => canvasFillsViewport(page)).toBe(true);
        await expect(settingsButton(page)).toBeHidden();
        await expect(lockButton(page)).toBeHidden();

        const toast = page.getByText(KEYBOARD_HINT);
        await expect(toast).toBeVisible();
        await page.clock.fastForward(3000);
        await expect(toast).toBeHidden();

        // The browser's own exit path (what Escape triggers), not the app's button.
        await page.evaluate(() => document.exitFullscreen());
        await expect.poll(() => hasFullscreenElement(page)).toBe(false);
        await expect(settingsButton(page)).toBeVisible();
        await expect(fullscreenButton(page)).toBeFocused();
        await expect.poll(() => canvasFillsViewport(page)).toBe(true);
    });
}

const first = VISUALIZERS_UNDER_TEST[0];

test.describe(`${first.name} fullscreen behavior`, () => {
    test('the F key toggles fullscreen, also from a focused slider', async ({ page }) => {
        test.setTimeout(120_000);
        await startVisualizer(page, first);
        await openSettings(page);
        const statsCheckbox = page.getByRole('checkbox', { name: 'Show performance stats' });
        await statsCheckbox.check();
        // The overlay is the only place that shows the "Rendering" heading.
        const statsOverlay = page.getByText('Rendering', { exact: true });
        await expect(statsOverlay).toBeVisible();
        await page.getByRole('slider').first().focus();

        await page.keyboard.press('f');
        await expect.poll(() => hasFullscreenElement(page)).toBe(true);
        await expect(statsOverlay).toBeHidden();
        await expect(page.getByRole('button', { name: '✕ Close' })).toBeHidden();

        await page.keyboard.press('f');
        await expect.poll(() => hasFullscreenElement(page)).toBe(false);
        // The panel keeps its state across fullscreen: still open, checkbox still checked, overlay back.
        await expect(page.getByRole('button', { name: '✕ Close' })).toBeVisible();
        await expect(statsCheckbox).toBeChecked();
        await expect(statsOverlay).toBeVisible();
    });

    test('the cursor hides after 2 s of rest and returns on movement', async ({ page }) => {
        test.setTimeout(120_000);
        await startWithPausedClock(page, first);
        await fullscreenButton(page).click();
        await expect.poll(() => hasFullscreenElement(page)).toBe(true);
        // The idle timer starts when the app has switched modes; fast-forwarding before that would miss it.
        await expect(page.getByText(KEYBOARD_HINT)).toBeVisible();

        const wrapper = wrapperOf(page);
        const canvasCursor = () => page.locator('canvas').evaluate((canvas) => getComputedStyle(canvas).cursor);

        await page.clock.fastForward(2000);
        await expect(wrapper).toHaveClass(/(^|\s)cursor-none!(\s|$)/);
        expect(await canvasCursor()).toBe('none');

        await page.mouse.move(100, 100);
        await expect(wrapper).not.toHaveClass(/cursor-none!/);
        expect(await canvasCursor()).not.toBe('none');

        // Rest again, then leave: the classes must not outlive fullscreen.
        await page.clock.fastForward(2000);
        await expect(wrapper).toHaveClass(/cursor-none!/);
        await page.evaluate(() => document.exitFullscreen());
        await expect.poll(() => hasFullscreenElement(page)).toBe(false);
        await expect(wrapper).not.toHaveClass(/cursor-none!/);
    });

    test('leaving the page while fullscreen leaves fullscreen', async ({ page }) => {
        test.setTimeout(120_000);
        await startVisualizer(page, first);
        await fullscreenButton(page).click();
        await expect.poll(() => hasFullscreenElement(page)).toBe(true);

        await page.goBack();
        await expect(page).toHaveURL('/');
        await expect.poll(() => hasFullscreenElement(page)).toBe(false);
    });

    test('pseudo-fullscreen when element fullscreen is unavailable', async ({ page }) => {
        test.setTimeout(120_000);
        await disableNativeFullscreen(page);
        await startVisualizer(page, first);

        await fullscreenButton(page).click();
        await expect(settingsButton(page)).toBeHidden();
        await expect(page.getByText(KEYBOARD_HINT)).toBeVisible();
        expect(await hasFullscreenElement(page)).toBe(false);

        await page.keyboard.press('Escape');
        await expect(settingsButton(page)).toBeVisible();

        await page.keyboard.press('f');
        await expect(settingsButton(page)).toBeHidden();
        await page.keyboard.press('f');
        await expect(settingsButton(page)).toBeVisible();
    });
});

test.describe('dancing character fullscreen', () => {
    test('the attribution blurb hides in fullscreen and returns on exit', async ({ page }) => {
        test.setTimeout(120_000);
        const dancer = VISUALIZERS_UNDER_TEST.find(({ path }) => path === '/dancing-character')!;
        await startVisualizer(page, dancer);

        // The default character (MakeHuman) shows no credit, so pick one that does.
        await openSettings(page);
        await page.getByLabel('Character', { exact: true }).selectOption('wario');
        const blurb = page.getByText(/^Wario.*license/);
        await expect(blurb).toBeVisible({ timeout: 30_000 });
        await page.getByRole('button', { name: '✕ Close' }).click();
        await fullscreenButton(page).click();
        await expect.poll(() => hasFullscreenElement(page)).toBe(true);
        await expect(blurb).toBeHidden();
        await page.evaluate(() => document.exitFullscreen());
        await expect.poll(() => hasFullscreenElement(page)).toBe(false);
        await expect(blurb).toBeVisible();
    });
});

test.describe(`${first.name} fullscreen on a touch device`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('pseudo-fullscreen with a tap-revealed exit button', async ({ page }) => {
        test.setTimeout(120_000);
        await disableNativeFullscreen(page);
        await startWithPausedClock(page, first);
        // Guards the premise of the test: the touch hint depends on a coarse primary pointer.
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

        await fullscreenButton(page).tap();
        await expect(settingsButton(page)).toBeHidden();
        await expect(page.getByText(TOUCH_HINT)).toBeVisible();

        const exit = page.getByRole('button', { name: 'Exit fullscreen', exact: true });
        await expect(exit).toBeHidden();
        const tapCenter = () => page.touchscreen.tap(195, 422);
        await tapCenter();
        await expect(exit).toBeVisible();
        await page.clock.fastForward(3000);
        await expect(exit).toBeHidden();

        await tapCenter();
        await expect(exit).toBeVisible();
        await exit.tap();
        await expect(settingsButton(page)).toBeVisible();
    });
});
