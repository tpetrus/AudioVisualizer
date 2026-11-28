import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Files whose default export is required by a tool (React Router, Vite, Vitest, Playwright) or by ESLint itself.
const DEFAULT_EXPORT_ALLOWED = [
    'app/root.tsx',
    'app/routes.ts',
    'app/routes/**',
    'vite.config.ts',
    'vitest.config.ts',
    'react-router.config.ts',
    'playwright.config.ts',
    'eslint.config.js',
];

// The default-export ban, shared by the base block and the UI block below (a later `no-restricted-syntax` replaces an
// earlier one, so a block that needs both lists spreads both).
const NO_DEFAULT_EXPORT = [
    {
        selector: 'ExportDefaultDeclaration',
        message: 'Use a named export. Default exports are only allowed where a tool requires them.',
    },
    {
        selector: "ExportNamedDeclaration > ExportSpecifier[exported.name='default']",
        message: 'Use a named export. Default exports are only allowed where a tool requires them.',
    },
];

// Design-system guards for UI code (see docs/plans/ui-design-system/contracts.md). Controls come from
// `~/components/ui` so they share one look, cursor and focus ring, and colors come from the C1 tokens in `app/app.css`.
// `black` and `white` stay allowed (dialog backdrop, title banner, primary button text).
const PALETTE_UTILITY =
    '(bg|text|border|ring|outline|from|via|to|fill|stroke|accent|divide|shadow|decoration|placeholder|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]';
// Tailwind 4 names its gradients bg-linear-*, bg-radial and bg-conic, so `gradient` alone no longer catches them.
const COLOR_LITERAL = `/#[0-9a-fA-F]{3,8}\\b|\\b(rgb|rgba|hsl)\\(|gradient|\\bbg-(linear|radial|conic)\\b|\\b${PALETTE_UTILITY}/`;
const COLOR_MESSAGE =
    'No color literals in className. Use the design tokens from app/app.css (bg-surface-1, text-text-muted, border-border, bg-accent, text-accent-text, ...).';
const UI_RESTRICTED = [
    {
        selector: "JSXOpeningElement[name.name='button']",
        message: 'Use Button, IconButton or Switch from ~/components/ui instead of a raw <button>.',
    },
    {
        selector: "JSXOpeningElement[name.name='select']",
        message: 'Use Select from ~/components/ui instead of a raw <select>.',
    },
    {
        selector: "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value='range'])",
        message: 'Use Range from ~/components/ui instead of a raw <input type="range">.',
    },
    {
        // The same input written as type={'range'} or type={`range`}.
        selector:
            "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'] > JSXExpressionContainer > Literal[value='range'])",
        message: 'Use Range from ~/components/ui instead of a raw <input type="range">.',
    },
    {
        selector:
            "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'] > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw='range'])",
        message: 'Use Range from ~/components/ui instead of a raw <input type="range">.',
    },
    {
        // There is no text area primitive yet; adding one keeps the border, radius and focus ring in one place.
        selector: "JSXOpeningElement[name.name='textarea']",
        message: 'Add a Textarea primitive to ~/components/ui instead of using a raw <textarea>.',
    },
    {
        selector: `JSXAttribute[name.name='className'] Literal[value=${COLOR_LITERAL}]`,
        message: COLOR_MESSAGE,
    },
    {
        selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${COLOR_LITERAL}]`,
        message: COLOR_MESSAGE,
    },
];
// The primitives are where raw controls and colors live; specs, fakes and the dev overlay are not product UI.
const UI_GUARD_EXEMPT = [
    'app/components/ui/**',
    '**/*.test.{ts,tsx}',
    'app/test/**',
    'app/components/DevTelemetryOverlay.tsx',
];

export default tseslint.config(
    {
        ignores: [
            'build/',
            '.react-router/',
            '.wrangler/',
            'coverage/',
            'node_modules/',
            'playwright-report/',
            'test-results/',
            '.claude/',
        ],
    },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    reactHooks.configs.flat.recommended,
    jsxA11y.flatConfigs.recommended,
    {
        languageOptions: {
            parserOptions: {
                // Type-aware rules read tsconfig.json, which already includes every linted file.
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Rules of Hooks stays an error (from the preset); a stale dependency list is a real bug here because the
            // scene is built once and reads values through refs.
            'react-hooks/exhaustive-deps': 'error',
            // Passing an async handler to onClick is idiomatic React; the handlers catch their own errors.
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
            // A leading underscore marks a parameter that is intentionally unused (fakes implement full signatures).
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'no-restricted-syntax': ['error', ...NO_DEFAULT_EXPORT],
        },
    },
    {
        files: ['app/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ['*.{js,ts}', 'scripts/**/*.ts'],
        languageOptions: { globals: globals.node },
    },
    {
        // The end-to-end tests are a separate program that imports from the app, never the other way round.
        files: ['app/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/e2e', '**/e2e/**'],
                            message:
                                'App code must not import from e2e/. The end-to-end tests depend on the app, not the reverse.',
                        },
                    ],
                },
            ],
        },
    },
    {
        // Playwright specs run in Node but pass callbacks to `page.evaluate`, which run in the browser.
        files: ['e2e/**/*.ts'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
        // Playwright fixtures hand over their value with a callback named `use`, which the Hooks rule mistakes for
        // React's `use` hook.
        rules: { 'react-hooks/rules-of-hooks': 'off' },
    },
    {
        files: DEFAULT_EXPORT_ALLOWED,
        rules: { 'no-restricted-syntax': 'off' },
    },
    {
        files: ['app/**/*.tsx'],
        ignores: [...UI_GUARD_EXEMPT, ...DEFAULT_EXPORT_ALLOWED],
        rules: { 'no-restricted-syntax': ['error', ...NO_DEFAULT_EXPORT, ...UI_RESTRICTED] },
    },
    {
        // Route modules may default-export, but their markup follows the same UI rules.
        files: ['app/root.tsx', 'app/routes/**/*.tsx'],
        ignores: UI_GUARD_EXEMPT,
        rules: { 'no-restricted-syntax': ['error', ...UI_RESTRICTED] },
    },
    {
        // Specs and fakes stand in for browser APIs, so they cast, mock and use loosely typed spies on purpose.
        files: ['**/*.test.{ts,tsx}', 'app/test/**'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/require-await': 'off',
            // act(() => vi.advanceTimersByTime(...)) resolves to a thenable in React's typings but is synchronous here.
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/prefer-promise-reject-errors': 'off',
        },
    },
    {
        // Plain JS config files are not part of the TypeScript project, so type-aware rules cannot run on them.
        files: ['**/*.js'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    // Must stay last so it can turn off any stylistic rule that would fight Prettier.
    prettier,
);
