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

const bassInk = VISUALIZERS_UNDER_TEST.find(({ path }) => path === '/bass-ink')!;

const enhancedSwitch = (page: Page) => page.getByRole('switch', { name: /Enhanced graphics/ });

// e2e renders with SwiftShader, a software rasterizer. Bass ink keeps its standard look there even with the preference
// on (AC5), so these specs check that the switch works in place and that the enhanced chunk is never fetched; the
// enhanced look itself is checked on a real GPU (see docs/plans/bass-ink-enhanced-graphics/contracts.md).
test.describe('bass ink enhanced graphics', () => {
    test.setTimeout(180_000);

    test('the panel switch flips in place on a software renderer, fetching nothing and keeping one context', async ({
        page,
    }) => {
        const requested: string[] = [];
        page.on('request', (request) => {
            if (/bassInkEnhanced/.test(request.url())) requested.push(request.url());
        });
        await trackWebGLContexts(page);
        await page.goto('/');
        await chooseInputDevice(page);
        await openVisualizer(page, bassInk);
        await openSettings(page);
        const toggle = enhancedSwitch(page);
        await expect(toggle).toHaveAttribute('aria-checked', 'false');

        for (let cycle = 0; cycle < 3; cycle++) {
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-checked', 'true');
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-checked', 'false');
        }
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        // Give a stray lazy import time to show up.
        await page.waitForTimeout(2000);

        expect(requested, 'a software renderer never loads the enhanced chunk').toEqual([]);
        await expectSingleCanvas(page);
        await expect
            .poll(() => liveWebGLContexts(page), { message: 'the switch never rebuilds the renderer', timeout: 20_000 })
            .toBe(1);
        await expectCanvasRendering(page);
    });

    test('opens with the preference already on and still renders', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('audioVisualizer.enhancedGraphics', 'true'));
        await page.goto('/');
        await chooseInputDevice(page);
        await openVisualizer(page, bassInk);
        await openSettings(page);

        await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');
        await expectSingleCanvas(page);
        await expectCanvasRendering(page);
    });
});
