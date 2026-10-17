import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { VISUALIZERS_UNDER_TEST, openSettings, startVisualizer } from './visualizers';

// How many of the panel's sliders each test exercises. Taken from the panel itself, so no labels or values are
// hard-coded per visualizer.
const SLIDERS_TO_TRY = 2;

// A valid value other than the current one, derived from the slider's own min, max and step.
async function otherValue(slider: Locator): Promise<number> {
    const { min, max, step, value } = await slider.evaluate((element) => {
        const input = element as HTMLInputElement;
        return {
            min: Number(input.min),
            max: Number(input.max),
            step: Number(input.step) || 1,
            value: Number(input.value),
        };
    });
    const steps = Math.round((max - min) / step);
    for (const fraction of [0.75, 0.25, 1]) {
        const candidate = Number((min + Math.round(steps * fraction) * step).toFixed(6));
        if (candidate !== value) {
            return candidate;
        }
    }
    throw new Error('The slider has only one possible value.');
}

const labelOf = (slider: Locator) =>
    slider.evaluate((element) => (element as HTMLInputElement).labels?.[0]?.textContent ?? '');

for (const visualizer of VISUALIZERS_UNDER_TEST) {
    test.describe(visualizer.name, () => {
        test('changing and resetting controls', async ({ page }) => {
            await startVisualizer(page, visualizer);
            await openSettings(page);

            const sliders = page.getByRole('slider');
            const tried = Math.min(SLIDERS_TO_TRY, await sliders.count());
            expect(tried, 'the control panel has range controls to exercise').toBeGreaterThan(0);

            const initial: string[] = [];
            const labels: string[] = [];
            for (let index = 0; index < tried; index++) {
                const slider = sliders.nth(index);
                initial.push(await slider.inputValue());
                labels.push(await labelOf(slider));

                const target = await otherValue(slider);
                await slider.fill(String(target));
                await expect(slider).toHaveValue(String(target));
            }
            await expect(page.getByText(/\d+ changed/).first()).toBeVisible();

            // One control back to its default through its own reset button.
            await page.getByRole('button', { name: `Reset ${labels[0]} to default` }).click();
            await expect(sliders.nth(0)).toHaveValue(initial[0]);

            await page.getByRole('button', { name: 'Reset all' }).click();
            for (let index = 0; index < tried; index++) {
                await expect(sliders.nth(index)).toHaveValue(initial[index]);
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
