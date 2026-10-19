import { describe, expect, it } from 'vitest';
import { shippedChanges } from './shippedPaths.ts';

const pkg = (extra: object = {}) =>
    JSON.stringify({
        version: '1.0.0',
        scripts: { a: 'x' },
        dependencies: { react: '^19' },
        devDependencies: {},
        ...extra,
    });

describe('shippedChanges', () => {
    it('is empty for docs, workflows and scripts', () => {
        expect(
            shippedChanges({
                changedFiles: ['README.md', '.github/workflows/ci.yml', 'scripts/release/cli.ts', 'e2e/visual.spec.ts'],
                basePackageJson: pkg(),
                headPackageJson: pkg(),
            }),
        ).toEqual([]);
    });

    it('flags app, public and the shipped config files', () => {
        const changedFiles = [
            'app/root.tsx',
            'public/fonts/a.woff2',
            'vite.config.ts',
            'react-router.config.ts',
            'wrangler.jsonc',
            'application.md',
        ];
        expect(shippedChanges({ changedFiles, basePackageJson: pkg(), headPackageJson: pkg() })).toEqual(
            changedFiles.slice(0, 5),
        );
    });

    it('ignores version and script edits in package.json', () => {
        expect(
            shippedChanges({
                changedFiles: ['package.json'],
                basePackageJson: pkg(),
                headPackageJson: pkg({ version: '1.0.1', scripts: { b: 'y' } }),
            }),
        ).toEqual([]);
    });

    it('ignores reformatting because it compares parsed JSON', () => {
        expect(
            shippedChanges({
                changedFiles: ['package.json'],
                basePackageJson: pkg(),
                headPackageJson: JSON.stringify(JSON.parse(pkg()), null, 8),
            }),
        ).toEqual([]);
    });

    it('flags dependency and devDependency changes', () => {
        expect(
            shippedChanges({
                changedFiles: ['package.json'],
                basePackageJson: pkg(),
                headPackageJson: pkg({ dependencies: { react: '^20' }, devDependencies: { vitest: '^5' } }),
            }),
        ).toEqual(['package.json dependencies', 'package.json devDependencies']);
    });
});
