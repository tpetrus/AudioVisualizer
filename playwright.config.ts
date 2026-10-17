import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
// E2E_PORT lets a second checkout run the suite while another dev server already holds the default port.
const PORT = Number(process.env.E2E_PORT ?? 8787);

// Set BASE_URL to run the suite (or just the `@smoke` tests) against an already-running site, e.g. production:
//   BASE_URL=https://example.com npx playwright test --grep @smoke
// When it is unset, the build in build/client is served locally with `wrangler dev`, which applies the same
// single-page-application fallback as Cloudflare in production.
const externalBaseURL = process.env.BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    // Software WebGL is slow, so allow generous time for the first frames and for the audio device to open.
    timeout: 60_000,
    expect: {
        timeout: 10_000,
        // Used only by e2e/visual.spec.ts. Baselines are Linux-only. maxDiffPixelRatio absorbs stray anti-aliasing pixels;
        // threshold is the per-pixel colour tolerance, lowered from the 0.2 default because a clear colour change
        // (a dark panel turning dark red) slipped under it.
        toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.1, animations: 'disabled', caret: 'hide' },
    },
    // Every worker's browser plays its own copy of the fake-microphone file (see e2e/fixtures.ts), so workers do not
    // interfere. Sharing one file made getUserMedia hang when browsers ran side by side, which once forced one worker.
    workers: 1,
    forbidOnly: CI,
    retries: CI ? 2 : 0,
    reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]], // TEMP-MEASURE
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        permissions: ['microphone'],
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: [
                        // Auto-accept getUserMedia and serve a fake input device. The audio file it plays is added
                        // per worker by the launchOptions fixture in e2e/fixtures.ts.
                        '--use-fake-ui-for-media-stream',
                        '--use-fake-device-for-media-stream',
                        '--autoplay-policy=no-user-gesture-required',
                        // The visualizers need WebGL; CI runners have no GPU, so render in software.
                        '--use-angle=swiftshader',
                        '--enable-unsafe-swiftshader',
                        '--ignore-gpu-blocklist',
                    ],
                },
            },
        },
    ],
    webServer: externalBaseURL
        ? undefined
        : {
              command: `npx wrangler dev --port ${PORT}`,
              url: baseURL,
              // Requires `npm run build` first; wrangler serves whatever is in build/client.
              reuseExistingServer: !CI,
              timeout: 120_000,
              env: { WRANGLER_SEND_METRICS: 'false' },
          },
});
