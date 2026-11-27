import type { Page } from '@playwright/test';
import { chooseScreenCapture, connectAudio, expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openAllSections, openSettings, startVisualizer } from './visualizers';

// Cursor sweep (design-system AC2): everything a user can click shows the pointer, and anything disabled shows
// not-allowed. The base layer in app/app.css sets these once, so this catches a control that opts out of it (a
// `cursor-default` class, a custom element, an overlay rule) on every surface. The first-visit modal joins this sweep
// in the follow-up PR that adds it.

const INTERACTIVE = [
    'button',
    'a[href]',
    'summary',
    'select',
    'label[for]',
    '[role=switch]',
    '[role=button]',
    'input[type=checkbox]',
    'input[type=radio]',
    'input[type=range]',
    'input[type=color]',
];

interface WrongCursor {
    tag: string;
    name: string;
    cursor: string;
    expected: string;
}

// Visible interactive elements whose computed cursor is not the expected one. Runs in the page so it reads the cascade
// as the browser resolved it, including the `:hover` rules of whatever the pointer currently rests on.
function wrongCursors(page: Page): Promise<WrongCursor[]> {
    return page.evaluate((selector) => {
        const found: WrongCursor[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
            const style = getComputedStyle(el);
            if (el.getClientRects().length === 0 || style.visibility === 'hidden') continue;
            const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
            const expected = disabled ? 'not-allowed' : 'pointer';
            if (style.cursor === expected) continue;
            const name =
                el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
                (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) ||
                el.id;
            found.push({ tag: el.tagName.toLowerCase(), name, cursor: style.cursor, expected });
        }
        return found;
    }, INTERACTIVE.join(', '));
}

// Sweeps once with no hover and once with the pointer resting on one visible element of each kind, so `:hover` rules
// are covered too (the pointer rests on one element at a time, hence a sweep per kind). `force` skips the actionability
// wait: an element behind a modal is still hovered by position, which is all that is needed here.
async function expectPointerCursors(page: Page, surface: string): Promise<void> {
    const wrong = new Map<string, WrongCursor>();
    const sweep = async () => {
        for (const entry of await wrongCursors(page)) wrong.set(JSON.stringify(entry), entry);
    };
    await sweep();
    for (const selector of INTERACTIVE) {
        const target = page.locator(selector).locator('visible=true').first();
        if ((await target.count()) > 0) {
            await target.hover({ force: true });
            await sweep();
        }
    }
    expect([...wrong.values()], `${surface}: elements with the wrong cursor`).toEqual([]);
}

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
