import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // `~/` imports come from tsconfig.json `paths`, the single source of truth for aliases.
        tsconfigPaths: true,
    },
    test: {
        // The rhythm modules are pure maths, so no DOM is needed. Component tests can opt in with
        // `// @vitest-environment jsdom` at the top of the file.
        environment: 'node',
        include: ['app/**/*.test.{ts,tsx}'],
        // End-to-end rhythm specs synthesise tens of seconds of audio each.
        testTimeout: 60_000,
    },
});
