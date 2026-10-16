import { expect, expectCanvasRendering, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, startVisualizer } from './visualizers';

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test(`${visualizer.name} shows one rendering canvas after choosing an input device`, async ({ page }) => {
        await startVisualizer(page, visualizer);

        await expect(page.getByRole('button', { name: '☰ Settings' })).toBeVisible();
        await expectCanvasRendering(page);
    });
}
