import { expect, expectCanvasRendering, expectSingleCanvas, test } from './fixtures';

test('landing page renders the title, the cards and the audio source dialog', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    expect(false).toBe(true); // tmp failure check

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

    // The 3D title is the only canvas, and it has drawn something (so WebGL and the fonts both loaded).
    await expectSingleCanvas(page);
    await expectCanvasRendering(page);
});
