import type { Page } from '@playwright/test';
import { expectPointerCursors } from './cursorSweep';
import { chooseScreenCapture, connectAudio, expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openAllSections, openSettings, startVisualizer } from './visualizers';

// Cursor sweep (design-system AC2): everything a user can click shows the pointer, and anything disabled shows
// not-allowed. The base layer in app/app.css sets these once, so this catches a control that opts out of it (a
// `cursor-default` class, a custom element, an overlay rule) on every surface. The first-visit prompt's own spec
// (enhanced-graphics-prompt.spec.ts) runs the same sweep on it.

const first = VISUALIZERS_UNDER_TEST[0];
const fullscreenButton = (page: Page) => page.getByRole('button', { name: 'Fullscreen (F)', exact: true });
const hasFullscreenElement = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

// A running fake clock would fire the software-rendered scene's frames on a fixed timer; paused, the fullscreen hint
// and exit-button timers cannot hide what the sweep is about to read (the same setup as fullscreen.spec.ts).
async function startWithPausedClock(page: Page): Promise<void> {
    await page.clock.install();
    await startVisualizer(page, first);
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
}

test('landing page controls show the right cursor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: first.name })).toBeVisible();
    await expectPointerCursors(page, 'landing page');
});

test('audio source dialog controls show the right cursor before and after a source is chosen', async ({ page }) => {
    await page.goto('/');
    await connectAudio(page);
    await expectPointerCursors(page, 'audio source dialog, no source');

    await chooseScreenCapture(page);
    await expectPointerCursors(page, 'audio source dialog, active source');
});

test(`${first.name} settings panel with every section open shows the right cursor`, async ({ page }) => {
    test.setTimeout(120_000);
    await startVisualizer(page, first);
    await openSettings(page);
    await openAllSections(page);
    // The footer checkboxes belong in the sweep, so fail loudly if the panel stops rendering them.
    await expect(page.getByRole('checkbox', { name: 'Show performance stats' })).toBeVisible();
    await expectPointerCursors(page, `${first.name} settings panel`);
});

test.describe(`${first.name} fullscreen`, () => {
    test('controls show the right cursor', async ({ page }) => {
        test.setTimeout(120_000);
        await startWithPausedClock(page);
        await fullscreenButton(page).click();
        await expect.poll(() => hasFullscreenElement(page)).toBe(true);
        await expectPointerCursors(page, `${first.name} fullscreen`);
    });

    // The exit control only appears on a coarse pointer, after a tap, so it needs the touch setup of fullscreen.spec.ts.
    test.describe('on a touch device', () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

        test('the exit control shows the right cursor', async ({ page }) => {
            test.setTimeout(120_000);
            await page.addInitScript(() => {
                Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
                Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false });
                Element.prototype.requestFullscreen = undefined as never;
            });
            await startWithPausedClock(page);
            await fullscreenButton(page).tap();
            const exit = page.getByRole('button', { name: 'Exit fullscreen', exact: true });
            await expect(exit).toBeHidden();
            await page.touchscreen.tap(195, 422);
            await expect(exit).toBeVisible();
            await expectPointerCursors(page, `${first.name} fullscreen exit control`);
        });
    });
});
