// Runs the `@smoke` Playwright tests against a deployed site. BASE_URL picks the site and defaults to production, so
// `npm run test:smoke` works with no setup. It is a script rather than inline in package.json because setting an
// environment variable inline is not portable between shells (Windows vs. Linux).
import { spawnSync } from 'node:child_process';

const PRODUCTION_URL = 'https://audio-visualizer.mypoke.workers.dev';
const baseURL = process.env.BASE_URL || PRODUCTION_URL;
console.log(`Running @smoke tests against ${baseURL}`);

const result = spawnSync('npx', ['playwright', 'test', '--grep', '@smoke', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, BASE_URL: baseURL },
    // npx is a .cmd shim on Windows.
    shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
