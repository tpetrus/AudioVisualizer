import type { Page } from '@playwright/test';
import { VISUALIZATIONS } from '../app/features/landing/visualizations';
import { chooseInputDevice, expect, expectSingleCanvas } from './fixtures';

export interface VisualizerUnderTest {
    // The landing-page card; its thumbnail's alt text is the link's accessible name.
    name: string;
    path: string;
}

// Straight from the landing page's own list, so a new visualizer is covered by every spec without editing the specs.
export const VISUALIZERS_UNDER_TEST: readonly VisualizerUnderTest[] = VISUALIZATIONS.map(({ title, to }) => ({
    name: title,
    path: to,
}));

// Client-side navigation from the landing page, the way a user opens a visualizer.
export async function openVisualizer(page: Page, visualizer: VisualizerUnderTest): Promise<void> {
    await page.getByRole('link', { name: visualizer.name }).click();
    await expect(page).toHaveURL(visualizer.path);
    await expectSingleCanvas(page);
}

// Fresh start: pick the fake input device on the landing page, then open the visualizer.
export async function startVisualizer(page: Page, visualizer: VisualizerUnderTest): Promise<void> {
    await page.goto('/');
    await chooseInputDevice(page);
    await openVisualizer(page, visualizer);
}

export async function openSettings(page: Page): Promise<void> {
    await page.getByRole('button', { name: '☰ Settings' }).click();
    await expect(page.getByRole('button', { name: '✕ Close' })).toBeVisible();
}
