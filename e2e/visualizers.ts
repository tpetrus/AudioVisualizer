import type { Page } from '@playwright/test';
import { chooseInputDevice, expect, expectSingleCanvas } from './fixtures';

export interface Visualizer {
    // Landing-page card (its thumbnail's alt text is the link's accessible name).
    name: string;
    path: string;
    // Controls in the panel's first section, which starts open, with a value that is valid for the control's step.
    rangeControls: { label: string; value: string; defaultValue: string }[];
}

export const VISUALIZERS: readonly Visualizer[] = [
    {
        name: 'Cubes',
        path: '/cubes',
        rangeControls: [
            { label: 'Sensitivity', value: '1.2', defaultValue: '0.6' },
            { label: 'Noise gate', value: '0.2', defaultValue: '0.3' },
            { label: 'Smoothing', value: '0.5', defaultValue: '0.85' },
        ],
    },
    {
        name: 'Trio color wave',
        path: '/trio-color-wave',
        rangeControls: [
            { label: 'Overall height', value: '2', defaultValue: '1' },
            { label: 'Growth per sheet', value: '2', defaultValue: '1.5' },
            { label: 'Highs height', value: '3', defaultValue: '1' },
        ],
    },
];

export const CUBES = VISUALIZERS[0];

// Client-side navigation from the landing page, the way a user opens a visualizer.
export async function openVisualizer(page: Page, visualizer: Visualizer): Promise<void> {
    await page.getByRole('link', { name: visualizer.name }).click();
    await expect(page).toHaveURL(visualizer.path);
    await expectSingleCanvas(page);
}

// Fresh start: pick the fake input device on the landing page, then open the visualizer.
export async function startVisualizer(page: Page, visualizer: Visualizer): Promise<void> {
    await page.goto('/');
    await chooseInputDevice(page);
    await openVisualizer(page, visualizer);
}

export async function openSettings(page: Page): Promise<void> {
    await page.getByRole('button', { name: '☰ Settings' }).click();
    await expect(page.getByRole('button', { name: '✕ Close' })).toBeVisible();
}
