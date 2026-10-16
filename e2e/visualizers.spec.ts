import { expect, expectCanvasRendering, test } from './fixtures';
import { VISUALIZERS, startVisualizer } from './visualizers';

for (const visualizer of VISUALIZERS) {
    test(`${visualizer.name} shows one rendering canvas after choosing an input device`, async ({ page }) => {
        await startVisualizer(page, visualizer);

        await expect(page.getByRole('button', { name: '☰ Settings' })).toBeVisible();
        await expectCanvasRendering(page);
    });
}
