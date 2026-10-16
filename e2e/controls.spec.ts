import { expect, test } from './fixtures';
import { CUBES, VISUALIZERS, openSettings, startVisualizer } from './visualizers';

for (const visualizer of VISUALIZERS) {
    test.describe(visualizer.name, () => {
        test('changing and resetting controls', async ({ page }) => {
            await startVisualizer(page, visualizer);
            await openSettings(page);

            for (const { label, value } of visualizer.rangeControls) {
                await page.getByLabel(label, { exact: true }).fill(value);
                await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
            }
            await expect(page.getByText(`${visualizer.rangeControls.length} changed`)).toBeVisible();

            // One control back to its default through its own reset button.
            const [first, ...rest] = visualizer.rangeControls;
            await page.getByRole('button', { name: `Reset ${first.label} to default` }).click();
            await expect(page.getByLabel(first.label, { exact: true })).toHaveValue(first.defaultValue);
            await expect(page.getByText(`${rest.length} changed`)).toBeVisible();

            await page.getByRole('button', { name: 'Reset all' }).click();
            for (const { label, defaultValue } of visualizer.rangeControls) {
                await expect(page.getByLabel(label, { exact: true })).toHaveValue(defaultValue);
            }
            await expect(page.getByText(/\d+ changed/)).toHaveCount(0);

            await page.getByRole('button', { name: '✕ Close' }).click();
            await expect(page.getByRole('button', { name: '☰ Settings' })).toBeVisible();
        });

        test('camera lock, dragging the view and resetting it', async ({ page }) => {
            await startVisualizer(page, visualizer);

            const locked = page.getByRole('button', { name: 'Camera locked. Click to unlock' });
            const resetView = page.getByRole('button', { name: 'Reset view' });
            await expect(locked).toHaveAttribute('aria-pressed', 'true');

            const box = (await page.locator('canvas').boundingBox())!;
            const drag = async () => {
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                await page.mouse.move(x, y);
                await page.mouse.down();
                await page.mouse.move(x + 200, y + 80, { steps: 10 });
                await page.mouse.up();
            };

            // Locked: dragging does nothing.
            await drag();
            await expect(resetView).toHaveCount(0);

            await locked.click();
            const unlocked = page.getByRole('button', { name: 'Camera unlocked. Click to lock' });
            await expect(unlocked).toHaveAttribute('aria-pressed', 'false');

            // Unlocked: dragging moves the camera, which offers "Reset view".
            await drag();
            await expect(resetView).toBeVisible();
            await resetView.click();
            await expect(resetView).toHaveCount(0);

            await unlocked.click();
            await expect(page.getByRole('button', { name: 'Camera locked. Click to unlock' })).toBeVisible();
        });
    });
}

test('Cubes: colour and checkbox controls, and the setting that reveals another', async ({ page }) => {
    await startVisualizer(page, CUBES);
    await openSettings(page);

    // The Look section starts collapsed.
    await page.getByText('Look', { exact: true }).click();
    await page.getByLabel('Spin speed', { exact: true }).fill('0.03');
    await page.getByLabel('Raised cubes', { exact: true }).fill('#00ff00');
    await expect(page.getByLabel('Raised cubes', { exact: true })).toHaveValue('#00ff00');

    // "Bump intensity" is only shown while "Bass bump" is on.
    await expect(page.getByLabel('Bump intensity', { exact: true })).toBeVisible();
    await page.getByLabel('Bass bump', { exact: true }).uncheck();
    await expect(page.getByLabel('Bump intensity', { exact: true })).toHaveCount(0);
    await page.getByLabel('Bass bump', { exact: true }).check();
    await expect(page.getByLabel('Bump intensity', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Reset all' }).click();
    await expect(page.getByLabel('Raised cubes', { exact: true })).toHaveValue('#893001');
});
