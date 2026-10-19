import { isDeepStrictEqual } from 'node:util';

// Everything whose change alters what the deployed site does. A change to any of these needs a release, so a title of
// type docs, ci or test (which release nothing) must not touch them.
const SHIPPED_PREFIXES = ['app/', 'public/'];
const SHIPPED_FILES = ['vite.config.ts', 'react-router.config.ts', 'wrangler.jsonc'];
const SHIPPED_PACKAGE_KEYS = ['dependencies', 'devDependencies'] as const;

interface PackageJsonLike {
    dependencies?: unknown;
    devDependencies?: unknown;
}

export interface ShippedInput {
    changedFiles: readonly string[];
    basePackageJson: string;
    headPackageJson: string;
}

// Returns a human-readable reason for each shipped input that changed; empty means nothing shipped changed. The
// package.json comparison is on the parsed objects, so a version bump or a scripts edit is not a shipped change but a
// dependency edit is.
export function shippedChanges({ changedFiles, basePackageJson, headPackageJson }: ShippedInput): string[] {
    const reasons: string[] = [];
    for (const file of changedFiles) {
        if (SHIPPED_PREFIXES.some((prefix) => file.startsWith(prefix)) || SHIPPED_FILES.includes(file)) {
            reasons.push(file);
        }
    }
    const base = JSON.parse(basePackageJson) as PackageJsonLike;
    const head = JSON.parse(headPackageJson) as PackageJsonLike;
    for (const key of SHIPPED_PACKAGE_KEYS) {
        if (!isDeepStrictEqual(base[key], head[key])) reasons.push(`package.json ${key}`);
    }
    return reasons;
}
