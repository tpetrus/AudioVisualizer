import {
    chooseInputDevice,
    chooseScreenCapture,
    expect,
    expectCanvasRendering,
    expectSingleCanvas,
    test,
} from './fixtures';
import { VISUALIZERS, openSettings, startVisualizer } from './visualizers';

for (const visualizer of VISUALIZERS) {
    test(`${visualizer.name}: switching between the input device and screen capture keeps one canvas`, async ({
        page,
    }) => {
        await startVisualizer(page, visualizer);
        await openSettings(page);

        const dialog = page.getByRole('dialog', { name: 'Audio source' });
        const using = dialog.getByText('Using:');
        await page.getByRole('button', { name: 'Audio settings' }).click();
        await expect(using).toBeVisible();
        const deviceSource = await dialog.textContent();

        // Input device -> screen capture (stubbed).
        await dialog.getByRole('button', { name: 'Choose a different source' }).click();
        await chooseScreenCapture(page);
        await expect(using).toBeVisible();
        await expect(dialog).not.toHaveText(deviceSource!);
        await expectSingleCanvas(page);

        // Screen capture -> input device.
        await dialog.getByRole('button', { name: 'Choose a different source' }).click();
        await dialog.getByRole('button', { name: 'Choose device' }).click();
        await dialog.getByRole('button', { name: 'Start' }).click();
        await expect(using).toBeVisible();

        await dialog.getByRole('button', { name: 'Done' }).click();
        await expect(dialog).toBeHidden();
        await expectSingleCanvas(page);
        await expectCanvasRendering(page);
    });
}

test('landing page: the audio source can be changed from "Audio settings"', async ({ page }) => {
    await page.goto('/');
    await chooseInputDevice(page);

    await page.getByRole('button', { name: 'Audio settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Audio source' });
    await dialog.getByRole('button', { name: 'Choose a different source' }).click();
    await chooseScreenCapture(page);
    await expect(dialog.getByText('Using:')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();

    // The cards stay enabled with the new source.
    await expect(page.getByRole('link', { name: 'Cubes' })).toBeVisible();
    await expectSingleCanvas(page);
});
