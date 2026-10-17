import { chooseInputDevice, expect, expectSingleCanvas, liveWebGLContexts, test, trackWebGLContexts } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openVisualizer } from './visualizers';

const ROUND_TRIPS = 3;

// Leak check, one test per visualizer. Every scene creates a WebGL context and must release it on unmount
// (`forceContextLoss()`, see useThreeScene). Rather than wait for Chromium's "Too many active WebGL contexts" warning
// (about 16 live contexts, which a single leak across a few trips would not reach), the page's contexts are tracked and
// the live ones counted: whatever the landing page owns (its title banner) is all that may be alive back on `/`.
// The `problems` fixture still fails the test on the Chromium warning as a backstop.
for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`navigating between the landing page and ${visualizer.name} ${ROUND_TRIPS} times releases its WebGL context`, async ({
        page,
    }) => {
        await trackWebGLContexts(page);
        await page.goto('/');
        await chooseInputDevice(page);
        await expectSingleCanvas(page);
        await expect
            .poll(() => liveWebGLContexts(page), { message: 'the landing page owns its title context' })
            .toBe(1);
        const landingContexts = await liveWebGLContexts(page);

        for (let trip = 0; trip < ROUND_TRIPS; trip++) {
            await openVisualizer(page, visualizer);
            // The landing page's context is gone and the visualizer's has taken its place.
            await expect
                .poll(() => liveWebGLContexts(page), { message: `trip ${trip + 1}: live contexts on the visualizer` })
                .toBe(1);

            await page.goBack();
            await expect(page).toHaveURL('/');
            await expectSingleCanvas(page);
            await expect
                .poll(() => liveWebGLContexts(page), {
                    message: `trip ${trip + 1}: live contexts back on the landing page`,
                })
                .toBe(landingContexts);
        }
    });
}
