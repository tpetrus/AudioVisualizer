import { resolve } from 'node:path';
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

// A short click track at 120 BPM. Chromium loops it as the fake microphone, so every test hears the same audio.
const FAKE_AUDIO_FILE = resolve(import.meta.dirname, 'e2e/fixtures/beat-120bpm.wav');

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    // Software WebGL is slow, so allow generous time for the first frames and for the audio device to open.
    timeout: 60_000,
    expect: {
        timeout: 10_000,
        // Used only by e2e/visual.spec.ts. Baselines are Linux-only; the tolerance absorbs sub-pixel anti-aliasing noise.
        toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
    },
    // Browsers sharing the one fake-microphone file made getUserMedia hang when run side by side (seen on Windows),
    // so run one at a time. fullyParallel still lets the suite scale up if that is ever fixed.
    workers: 1,
    forbidOnly: CI,
    retries: CI ? 2 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
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
                        // Auto-accept getUserMedia and serve a fake input device that plays FAKE_AUDIO_FILE.
                        '--use-fake-ui-for-media-stream',
                        '--use-fake-device-for-media-stream',
                        `--use-file-for-fake-audio-capture=${FAKE_AUDIO_FILE}`,
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
