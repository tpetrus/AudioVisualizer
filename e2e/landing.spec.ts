import { expect, liveWebGLContexts, test, trackWebGLContexts } from './fixtures';

test('landing page renders the title, the cards and the audio source dialog', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Audio Visualizer');
    await expect(page.getByRole('heading', { level: 1, name: 'AudioVisualizer' })).toBeAttached();
    await expect(page.getByRole('img', { name: 'Cubes' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Trio color wave' })).toBeVisible();

    // Without a source the cards are disabled and the dialog asks for one.
    await expect(page.getByRole('link', { name: 'Cubes' })).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'Audio source' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Share audio' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Choose device' })).toBeVisible();

    // The title is a pre-rendered image (scripts/title-banner), so it has actually loaded and the page has no canvas.
    await expect
        .poll(() =>
            page.locator('header img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
    await expect(page.locator('canvas')).toHaveCount(0);
});

test('landing page creates no WebGL context', { tag: '@smoke' }, async ({ page }) => {
    await trackWebGLContexts(page);
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Audio source' })).toBeVisible();

    expect(await liveWebGLContexts(page)).toBe(0);
});
