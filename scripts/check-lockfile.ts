// Fails when package-lock.json lost the entries of bundled dependencies. npm on Windows drops them for platform
// packages it does not install locally (e.g. @tailwindcss/oxide-wasm32-wasi bundles @emnapi/*), and `npm ci` on Linux
// then fails with "Missing: ... from lock file". This only reads the lockfile, so it needs no install and runs first in CI.
// Usage: npm run check:lockfile [-- path/to/package-lock.json]
import { readFileSync } from 'node:fs';

interface LockPackage {
    bundleDependencies?: string[] | boolean;
    bundledDependencies?: string[] | boolean;
    dependencies?: Record<string, string>;
}

const lockPath = process.argv[2] ?? 'package-lock.json';
const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { packages?: Record<string, LockPackage> };
const packages = lock.packages ?? {};

const missing: string[] = [];
for (const [path, pkg] of Object.entries(packages)) {
    if (path === '') continue;
    const declared = pkg.bundleDependencies ?? pkg.bundledDependencies;
    // `true` means "bundle every dependency"; an array names them.
    const names = Array.isArray(declared) ? declared : declared ? Object.keys(pkg.dependencies ?? {}) : [];
    for (const name of names) {
        const childPath = `${path}/node_modules/${name}`;
        if (!(childPath in packages)) missing.push(childPath);
    }
}

if (missing.length > 0) {
    console.error(
        `${lockPath} is missing ${missing.length} bundled dependency entr${missing.length === 1 ? 'y' : 'ies'}:`,
    );
    for (const entry of missing) console.error(`  - ${entry}`);
    console.error(`
npm on Windows drops these entries, and 'npm ci' on Linux CI then fails with "Missing: ... from lock file".
Fix: restore the lockfile from main and redo your change on top of it:
    git checkout origin/main -- package-lock.json
    npm install <your change>
then run 'npm run check:lockfile' again. Alternatively, run the install on Linux or WSL.`);
    process.exit(1);
}
console.log(`${lockPath}: all bundled dependency entries are present.`);
