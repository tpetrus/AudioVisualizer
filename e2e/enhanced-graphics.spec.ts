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
// Software WebGL is slow, and the enhanced look fetches about 30 MB of assets, so every wait here is generous.
const ENHANCED_READY_TIMEOUT = 90_000;

const dancer = VISUALIZERS_UNDER_TEST.find(({ path }) => path === '/dancing-character')!;

const enhancedSwitch = (page: Page) => page.getByRole('switch', { name: /Enhanced graphics/ });
const readyStatus = (page: Page) => page.getByText('Enhanced graphics on', { exact: true });

// Gives the landing page's capability probe (it runs after idle) time to finish before a test counts WebGL contexts.
async function letProbeRun(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
}

// From the landing page, choose the fake input device and open the dancer with the preference as the caller left it.
async function openDancerFromLanding(page: Page): Promise<void> {
    await chooseInputDevice(page);
    await openVisualizer(page, dancer);
}

test.describe('enhanced graphics', () => {
    test.setTimeout(240_000);

    test('the landing switch is visible, off by default, works from the keyboard and costs no WebGL context', async ({
        page,
    }) => {
        await trackWebGLContexts(page);
        await page.goto('/');
        const toggle = enhancedSwitch(page);

        await expect(toggle).toBeInViewport({ ratio: 1 });
        await expect(toggle).toHaveAttribute('aria-checked', 'false');

        await toggle.focus();
        await page.keyboard.press('Space');
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-checked', 'false');

        await letProbeRun(page);
        expect(await liveWebGLContexts(page), 'the capability probe leaves no context behind').toBe(0);
    });

    test('the preference survives a reload and shows in the dancer panel', async ({ page }) => {
        await page.goto('/');
        await enhancedSwitch(page).click();
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');

        await page.reload();
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');
        expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('true');

        await openDancerFromLanding(page);
        await openSettings(page);
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');
    });

    test('standard mode requests no enhanced asset', async ({ page }) => {
        const requested: string[] = [];
        page.on('request', (request) => {
            if (/ferndale|qwantani|concrete_floor|dancingCharacterEnhanced/.test(request.url())) {
                requested.push(request.url());
            }
        });

        await page.goto('/');
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'false');
        await openDancerFromLanding(page);
        await expectCanvasRendering(page);
        // Give a stray lazy import time to show up.
        await page.waitForTimeout(2000);

        expect(requested).toEqual([]);
    });

    test('the enhanced look renders and reports that it is on', async ({ page }) => {
        await page.goto('/');
        await enhancedSwitch(page).click();
        await openDancerFromLanding(page);
        await openSettings(page);

        await expect(readyStatus(page)).toBeVisible({ timeout: ENHANCED_READY_TIMEOUT });
        await expectSingleCanvas(page);
        await expectCanvasRendering(page);
    });

    test('toggling five times, once mid-load, leaves one canvas and one live context', async ({ page }) => {
        await trackWebGLContexts(page);
        await page.goto('/');
        await openDancerFromLanding(page);
        await openSettings(page);
        const toggle = enhancedSwitch(page);

        for (let cycle = 0; cycle < 5; cycle++) {
            await toggle.click();
            if (cycle > 0) {
                await expect(toggle).toHaveAttribute('aria-checked', 'true');
                await expect(readyStatus(page)).toBeVisible({ timeout: ENHANCED_READY_TIMEOUT });
            }
            // The first cycle flips straight back, with nothing awaited in between, so the assets are still loading and
            // that load has to be abandoned cleanly.
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-checked', 'false');
        }

        await expectSingleCanvas(page);
        await expect
            .poll(() => liveWebGLContexts(page), { message: 'live contexts after the toggle loop', timeout: 20_000 })
            .toBe(1);
        await expectCanvasRendering(page);
    });
});
