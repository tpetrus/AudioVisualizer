import {
    chooseInputDevice,
    chooseScreenCapture,
    connectAudio,
    expect,
    expectSceneStillDrawing,
    expectSingleCanvas,
    observeScreenCapture,
    observedScreenCapture,
    test,
    trackRenderedFrames,
} from './fixtures';
import { VISUALIZERS_UNDER_TEST, openSettings, startVisualizer } from './visualizers';

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`${visualizer.name}: switching between the input device and screen capture keeps one canvas`, async ({
        page,
    }) => {
        await trackRenderedFrames(page);
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
        // Counts draw calls instead of reading pixels. Right after a source switch on CI's software GL, a pixel read
        // never finished within 20 s, and the cause is not the app: the page's JavaScript is idle (a CPU profile shows
        // under 2% busy, and the rebind costs well under a millisecond) while SwiftShader renders each frame in
        // hundreds of milliseconds, and a read-back has to wait for every frame queued ahead of it. A counter read
        // does not wait for the GPU.
        await expectSceneStillDrawing(page);
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
    await expect(page.locator('canvas')).toHaveCount(0);
});

test('landing page: screen capture delivers live, non-silent audio from the browser itself', async ({ page }) => {
    // Observes the stream the browser's own getDisplayMedia returns; nothing is replaced (see chooseScreenCapture).
    await observeScreenCapture(page);
    await page.goto('/');
    await connectAudio(page);
    await chooseScreenCapture(page);

    await expect
        .poll(async () => (await observedScreenCapture(page)).liveAudioTracks, { message: 'no live audio track' })
        .toBe(1);
    await expect
        .poll(async () => (await observedScreenCapture(page)).peak, { message: 'the captured audio is silent' })
        .toBeGreaterThan(0.1);
});
