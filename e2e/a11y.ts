import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from './fixtures';

// Impacts that fail a test. Moderate and minor findings are not blocking, but they are still attached to the test
// (the full axe result as JSON) so they stay visible in the HTML report.
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

// A rule switched off for one page, with the reason. Keep it narrow and say where the follow-up is tracked.
export interface A11yExclusion {
    rule: string;
    reason: string;
}

// Runs axe (WCAG 2.0/2.1 A and AA) over the page and fails on serious or critical violations. The WebGL canvases are
// left out: axe cannot see inside them, and they are the visualizer's rendered output rather than page content.
export async function expectNoA11yViolations(
    page: Page,
    testInfo: TestInfo,
    context: string,
    exclusions: readonly A11yExclusion[] = [],
): Promise<void> {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('canvas')
        .disableRules(exclusions.map(({ rule }) => rule))
        .analyze();

    await testInfo.attach(`axe-results: ${context}`, {
        body: JSON.stringify(results, null, 2),
        contentType: 'application/json',
    });

    const blocking = results.violations
        .filter(({ impact }) => impact && BLOCKING_IMPACTS.has(impact))
        .map(({ id, impact, help, nodes }) => ({
            id,
            impact,
            help,
            targets: nodes.map(({ target }) => target.join(' ')),
        }));
    expect(blocking, `serious or critical accessibility violations: ${context}`).toEqual([]);
}
