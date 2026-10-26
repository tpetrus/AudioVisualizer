import { chooseInputDevice, expect, expectCanvasRendering, expectSingleCanvas, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST } from './visualizers';

// A direct load of a visualizer URL must be served the app (not a 404) and, with no saved audio source, stay on that
// URL behind the required audio dialog, which offers a way back to the landing page. These need no audio, so they also
// run against production (`BASE_URL=... --grep @smoke`).
for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(
        `loading ${visualizer.path} directly without a saved source asks for one and offers a way back`,
        { tag: '@smoke' },
        async ({ page }) => {
            const response = await page.goto(visualizer.path);
            expect(response?.status()).toBe(200);

            const dialog = page.getByRole('dialog', { name: 'Audio source' });
            await expect(dialog).toBeVisible();
            expect(new URL(page.url()).pathname).toBe(visualizer.path);
            await expect(page.locator('canvas')).toHaveCount(0);

            // Required: Escape does not dismiss it.
            await page.keyboard.press('Escape');
            await expect(dialog).toBeVisible();

            await dialog.getByRole('button', { name: 'Back to home' }).click();
            await expect(page).toHaveURL('/');
            await expect(page.getByRole('heading', { level: 1, name: 'AudioVisualizer' })).toBeAttached();
            await expect(dialog).toBeHidden();
        },
    );
}

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`reloading ${visualizer.path} with a saved input device resumes without going back to the landing page`, async ({
        page,
    }) => {
        await page.goto('/');
        await chooseInputDevice(page);

        // A fresh page load, as when opening a bookmark: the engine starts empty and must resume from storage.
        await page.goto(visualizer.path);

        await expect(page.getByRole('button', { name: '☰ Settings' })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(visualizer.path);
        await expectSingleCanvas(page);
        await expectCanvasRendering(page);
    });
}
