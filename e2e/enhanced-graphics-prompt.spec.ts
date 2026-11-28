import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './a11y';
import { expectPointerCursors } from './cursorSweep';
import { expect, test } from './fixtures';

// The one spec that sees the first-visit prompt, so unlike the rest of the suite it does not pre-answer it.
test.use({ seedPromptSeen: false });

// Software WebGL fails the capability probe, so the prompt would never open here. These values are what
// app/features/settings/capability.ts reads, set to a strong device: a WebGL 2 context with a 16384 texture size and a
// real-looking renderer, and 8 GB and 8 cores from the navigator.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const MAX_TEXTURE_SIZE = 0x0d33;
        const UNMASKED_RENDERER_WEBGL = 0x9246;
        // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with the right `this` below
        const original = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (this: WebGL2RenderingContext, parameter: number) {
            if (parameter === MAX_TEXTURE_SIZE) return 16384;
            if (parameter === UNMASKED_RENDERER_WEBGL) return 'Fake GPU';
            return original.call(this, parameter) as unknown;
        };
        Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    });
});

const prompt = (page: Page) => page.getByRole('dialog', { name: 'Turn on enhanced graphics?' });
const enhancedSwitch = (page: Page) => page.getByRole('switch', { name: 'Enhanced graphics' });

test('the prompt opens on the first visit with Turn on focused, accessible and with the right cursors', async ({
    page,
}, testInfo) => {
    await page.goto('/');

    await expect(prompt(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Turn on' })).toBeFocused();
    await expectNoA11yViolations(page, testInfo, 'enhanced graphics prompt');
    await expectPointerCursors(page, 'enhanced graphics prompt');
});

test('Turn on enables the setting, and a reload shows no prompt', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(prompt(page)).toBeHidden();
    await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'true');
    // The probe resolves after idle, so give a prompt that was going to open time to do it.
    await page.waitForTimeout(1500);
    await expect(prompt(page)).toBeHidden();
});

// Each test gets its own browser context, so this one starts as a first-time visitor again.
test('Not now leaves enhanced graphics off, and a reload shows no prompt', async ({ page }) => {
    await page.goto('/');
    await expect(prompt(page)).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(prompt(page)).toBeHidden();
    await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'false');

    await page.reload();
    await expect(enhancedSwitch(page)).toHaveAttribute('aria-checked', 'false');
    // The badge appears only once the faked probe has passed, which is also what would open the prompt, so this proves
    // the prompt had its chance and stayed closed because of the seen flag.
    await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
    await expect(prompt(page)).toBeHidden();
});
