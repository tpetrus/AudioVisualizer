import { expectNoA11yViolations } from './a11y';
import { chooseInputDevice, connectAudio, expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openSettings, startVisualizer } from './visualizers';

// Serious and critical axe violations fail these tests; lesser findings are attached to the test result.

test('landing page has no serious accessibility violations', async ({ page }, testInfo) => {
    await page.goto('/');
    await chooseInputDevice(page);
    await expect(page.getByRole('link', { name: VISUALIZERS_UNDER_TEST[0].name })).toBeVisible();
    await expectNoA11yViolations(page, testInfo, 'landing page');
});

test('audio source dialog has no serious accessibility violations', async ({ page }, testInfo) => {
    await page.goto('/');
    await connectAudio(page);
    await expectNoA11yViolations(page, testInfo, 'audio source dialog');
});

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`required audio source dialog on ${visualizer.path} has no serious accessibility violations`, async ({
        page,
    }, testInfo) => {
        await page.goto(visualizer.path);
        await expect(page.getByRole('dialog', { name: 'Audio source' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Back to home' })).toBeVisible();
        await expectNoA11yViolations(page, testInfo, `required audio source dialog on ${visualizer.path}`);
    });
}

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`${visualizer.name} with the settings panel open has no serious accessibility violations`, async ({
        page,
    }, testInfo) => {
        await startVisualizer(page, visualizer);
        await openSettings(page);
        await expectNoA11yViolations(page, testInfo, `${visualizer.name} settings`);
    });
}
