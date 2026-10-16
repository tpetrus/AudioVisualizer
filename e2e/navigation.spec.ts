import { chooseInputDevice, expect, expectSingleCanvas, test } from './fixtures';
import { VISUALIZERS, openVisualizer } from './visualizers';

const ROUND_TRIPS = 10;

// Leak check. Every visit creates a WebGL context (the landing banner, then the visualizer). If one is not released,
// Chromium warns "Too many active WebGL contexts" once about 16 are alive; the `problems` fixture fails the test on
// that warning. Both visualizers share one page so a leak of a single kind still adds up past the limit.
test(`navigating between the landing page and each visualizer ${ROUND_TRIPS} times leaves one canvas and no leaks`, async ({
    page,
}) => {
    test.slow();
    await page.goto('/');
    await chooseInputDevice(page);
    await expectSingleCanvas(page);

    for (const visualizer of VISUALIZERS) {
        for (let trip = 0; trip < ROUND_TRIPS; trip++) {
            await openVisualizer(page, visualizer);

            await page.goBack();
            await expect(page).toHaveURL('/');
            await expectSingleCanvas(page);
        }
    }
});
