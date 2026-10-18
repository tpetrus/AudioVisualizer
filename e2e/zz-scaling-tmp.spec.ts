import { expect, test } from '@playwright/test';

// Throwaway: proves the shard count follows the test count.
for (let i = 1; i <= 20; i += 1) {
    test(`scaling check ${i}`, () => {
        expect(i).toBeGreaterThan(0);
    });
}
