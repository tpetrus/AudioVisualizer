import type { Page } from '@playwright/test';
import { expect } from './fixtures';

// The cursor sweep (design-system AC2) lives here so cursor.spec.ts and the first-visit prompt's spec share it.

const INTERACTIVE = [
    'button',
    'a[href]',
    'summary',
    'select',
    'label[for]',
    '[role=switch]',
    '[role=button]',
    'input[type=checkbox]',
    'input[type=radio]',
    'input[type=range]',
    'input[type=color]',
];

interface WrongCursor {
    tag: string;
    name: string;
    cursor: string;
    expected: string;
}

// Visible interactive elements whose computed cursor is not the expected one. Runs in the page so it reads the cascade
// as the browser resolved it, including the `:hover` rules of whatever the pointer currently rests on.
function wrongCursors(page: Page): Promise<WrongCursor[]> {
    return page.evaluate((selector) => {
        const found: WrongCursor[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
            const style = getComputedStyle(el);
            if (el.getClientRects().length === 0 || style.visibility === 'hidden') continue;
            const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
            const expected = disabled ? 'not-allowed' : 'pointer';
            if (style.cursor === expected) continue;
            const name =
                el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
                (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) ||
                el.id;
            found.push({ tag: el.tagName.toLowerCase(), name, cursor: style.cursor, expected });
        }
        return found;
    }, INTERACTIVE.join(', '));
}

// Sweeps once with no hover and once with the pointer resting on one visible element of each kind, so `:hover` rules
// are covered too (the pointer rests on one element at a time, hence a sweep per kind). `force` skips the actionability
// wait: an element behind a modal is still hovered by position, which is all that is needed here.
export async function expectPointerCursors(page: Page, surface: string): Promise<void> {
    const wrong = new Map<string, WrongCursor>();
    const sweep = async () => {
        for (const entry of await wrongCursors(page)) wrong.set(JSON.stringify(entry), entry);
    };
    await sweep();
    for (const selector of INTERACTIVE) {
        const target = page.locator(selector).locator('visible=true').first();
        if ((await target.count()) > 0) {
            await target.hover({ force: true });
            await sweep();
        }
    }
    expect([...wrong.values()], `${surface}: elements with the wrong cursor`).toEqual([]);
}
