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
import { openAllSections, openSettings, openVisualizer, VISUALIZERS_UNDER_TEST } from './visualizers';

// Software WebGL is slow and the look is a lazy chunk, so every wait on the enhanced look is generous.
const ENHANCED_READY_TIMEOUT = 90_000;
// A small window keeps the software-rendered bloom passes affordable.
const SMALL_VIEWPORT = { width: 480, height: 320 };
// What the page's hook reads (trioLookMode.ts). CI draws with SwiftShader, which the software check sends to the
// standard look, so only a test that sets this can build the enhanced one.
const FORCE_HARDWARE_FLAG = '__audioVisualizerE2EForceHardware';

const trio = VISUALIZERS_UNDER_TEST.find(({ path }) => path === '/trio-color-wave')!;

const enhancedSwitch = (page: Page) => page.getByRole('switch', { name: /Enhanced graphics/ });
const readyStatus = (page: Page) => page.getByText('Enhanced graphics on', { exact: true });
const lookSection = (page: Page) => page.getByText('Look', { exact: true });

// Records the URL of every request for the lazy look chunk.
function trackLookRequests(page: Page): string[] {
    const requested: string[] = [];
    page.on('request', (request) => {
        if (/trioEnhancedLook/.test(request.url())) {
            requested.push(request.url());
        }
    });
    return requested;
}

async function forceHardware(page: Page): Promise<void> {
    await page.addInitScript((flag) => {
        (window as unknown as Record<string, unknown>)[flag] = true;
    }, FORCE_HARDWARE_FLAG);
}

// From the landing page, choose the fake input device and open the trio with the preference as the caller left it.
async function openTrioFromLanding(page: Page): Promise<void> {
    await chooseInputDevice(page);
    await openVisualizer(page, trio);
}

test.describe('trio color wave enhanced graphics', () => {
    test.setTimeout(240_000);

    test('with the preference off the trio renders and requests no enhanced look', async ({ page }) => {
        const requested = trackLookRequests(page);

        await page.goto('/');
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'false');
        await openTrioFromLanding(page);
        await expectCanvasRendering(page);
        // Give a stray lazy import time to show up.
        await page.waitForTimeout(2000);

        expect(requested).toEqual([]);
    });

    test('on a software renderer the preference keeps the standard look: no chunk, no Look section, no status', async ({
        page,
    }) => {
        const requested = trackLookRequests(page);

        await page.goto('/');
        await enhancedSwitch(page).click();
        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');
        await openTrioFromLanding(page);
        await openSettings(page);
        await openAllSections(page);
        await expectCanvasRendering(page);
        await page.waitForTimeout(2000);

        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');
        expect(requested).toEqual([]);
        await expect(lookSection(page)).toHaveCount(0);
        await expect(readyStatus(page)).toHaveCount(0);
        await expect(page.getByText('Loading enhanced assets')).toHaveCount(0);
        await expect(page.getByText('Could not load enhanced assets, using standard')).toHaveCount(0);
    });

    test('with hardware forced the enhanced look renders, reports it is on and shows the Look controls', async ({
        page,
    }) => {
        await forceHardware(page);
        await page.setViewportSize(SMALL_VIEWPORT);
        await page.goto('/');
        await enhancedSwitch(page).click();
        await openTrioFromLanding(page);
        await openSettings(page);

        await expect(readyStatus(page)).toBeVisible({ timeout: ENHANCED_READY_TIMEOUT });
        await openAllSections(page);
        await expect(lookSection(page)).toBeVisible();
        for (const label of ['Glow', 'Beat accent', 'Depth haze', 'Dust']) {
            await expect(page.getByLabel(label, { exact: true })).toBeVisible();
        }
        await expectSingleCanvas(page);
        await expectCanvasRendering(page);
    });

    test('toggling five times, once mid-load, leaves one canvas and one live context', async ({ page }) => {
        await forceHardware(page);
        await trackWebGLContexts(page);
        await page.setViewportSize(SMALL_VIEWPORT);
        await page.goto('/');
        await openTrioFromLanding(page);
        await openSettings(page);
        const toggle = enhancedSwitch(page);

        for (let cycle = 0; cycle < 5; cycle++) {
            await toggle.click();
            if (cycle > 0) {
                await expect(toggle).toHaveAttribute('aria-checked', 'true');
                await expect(readyStatus(page)).toBeVisible({ timeout: ENHANCED_READY_TIMEOUT });
            }
            // The first cycle flips straight back, with nothing awaited in between, so the look is still loading and that
            // load has to be abandoned cleanly.
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
