import type { Page } from '@playwright/test';

// Must match ENHANCED_GRAPHICS_PROMPT_SEEN_KEY in app/features/settings/enhancedGraphicsPromptStore.ts. App code is
// never imported from e2e/, so the key is repeated here.
const PROMPT_SEEN_KEY = 'audioVisualizer.enhancedGraphicsPromptSeen';

// Marks the first-visit enhanced graphics prompt as already answered, so it cannot cover a page under test. Call it
// before the first navigation. The base fixture in fixtures.ts does it for every test; only the prompt's own spec
// opts out. Software WebGL fails the capability probe anyway, so this is a guard against a capable machine.
export async function seedPromptSeen(page: Page): Promise<void> {
    await page.addInitScript((key) => localStorage.setItem(key, '1'), PROMPT_SEEN_KEY);
}
