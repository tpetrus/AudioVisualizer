import { chooseInputDevice, expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openVisualizer, type VisualizerUnderTest } from './visualizers';

// Both visualizers read the shared rhythm hub, so whichever opens second must find it in a usable state no matter which
// one used it first. They are looked up on the landing list so a rename or removal fails with a clear message.
function find(path: string): VisualizerUnderTest {
    const found = VISUALIZERS_UNDER_TEST.find((visualizer) => visualizer.path === path);
    if (!found) {
        throw new Error(`The landing page's VISUALIZATIONS has no entry for ${path}; update e2e/order.spec.ts.`);
    }
    return found;
}

const DANCER = find('/dancing-character');
const CUBES = find('/cubes');

const ORDERS: readonly (readonly [VisualizerUnderTest, VisualizerUnderTest])[] = [
    [DANCER, CUBES],
    [CUBES, DANCER],
];

for (const [first, second] of ORDERS) {
    test(`opens ${first.name} then ${second.name} in one session`, async ({ page }) => {
        await page.goto('/');
        await chooseInputDevice(page);
        // A full reload would drop this, so its survival proves the whole run stayed inside the SPA.
        await page.evaluate(() => {
            (window as unknown as { __orderMarker: string }).__orderMarker = 'x';
        });

        await openVisualizer(page, first);
        await page.goBack();
        await expect(page).toHaveURL('/');
        await expect(page.locator('canvas')).toHaveCount(0);

        // No source is chosen again: the audio source outlives navigation, so the landing page still offers its
        // settings instead of "Connect audio", and no dialog opens by itself.
        await expect(page.getByRole('button', { name: 'Audio settings' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Connect audio' })).toHaveCount(0);

        await openVisualizer(page, second);
        await expect(page.getByRole('dialog', { name: 'Audio source' })).toBeHidden();

        const marker = await page.evaluate(() => (window as unknown as { __orderMarker?: string }).__orderMarker);
        expect(marker, 'the page must not have reloaded').toBe('x');
    });
}
