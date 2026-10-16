import { expect, test as base, type Page } from '@playwright/test';

// Browser problems that are tolerated in every test. Empty on purpose: add an entry only for noise we cannot fix, and
// say why, so the list never becomes a place where real errors hide.
interface AllowedProblem {
    pattern: RegExp;
    reason: string;
}
const ALLOWED_PROBLEMS: readonly AllowedProblem[] = [];

const WEBGL_CONTEXT_WARNING = 'Too many active WebGL contexts';

// Stands in for `getDisplayMedia`, which needs a real picker dialog that cannot be automated. It returns what the app
// asks for: a stream with an audio track (a steady tone) and a video track (the app discards the video).
function installScreenCaptureStub(): void {
    navigator.mediaDevices.getDisplayMedia = async () => {
        const context = new AudioContext();
        await context.resume();
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 220;
        const gain = context.createGain();
        gain.gain.value = 0.3;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start();

        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        canvas.getContext('2d')?.fillRect(0, 0, 16, 16);
        const [video] = canvas.captureStream().getVideoTracks();
        return new MediaStream([...destination.stream.getAudioTracks(), video]);
    };
}

interface Fixtures {
    // Every uncaught exception, console error and WebGL-context warning seen during the test. A fixture so that
    // the check cannot be forgotten: it fails the test on teardown if anything was recorded.
    problems: string[];
    // Replaces `getDisplayMedia` with a stub that returns an oscillator tone.
    screenCaptureStub: void;
}

export const test = base.extend<Fixtures>({
    problems: [
        async ({ page }, use) => {
            const problems: string[] = [];
            const record = (message: string) => {
                if (!ALLOWED_PROBLEMS.some(({ pattern }) => pattern.test(message))) {
                    problems.push(message);
                }
            };
            page.on('pageerror', (error) => record(`pageerror: ${error.message}`));
            page.on('console', (message) => {
                const text = message.text();
                if (message.type() === 'error' || text.includes(WEBGL_CONTEXT_WARNING)) {
                    record(`console.${message.type()}: ${text}`);
                }
            });

            await use(problems);

            expect(problems, 'the page logged errors or WebGL context warnings').toEqual([]);
        },
        { auto: true },
    ],
    screenCaptureStub: [
        async ({ page }, use) => {
            await page.addInitScript(installScreenCaptureStub);
            await use();
        },
        { auto: true },
    ],
});

export { expect };

const audioDialog = (page: Page) => page.getByRole('dialog', { name: 'Audio source' });

// Completes the first-run audio dialog with the fake input device. Call it on the landing page with no saved source.
export async function chooseInputDevice(page: Page): Promise<void> {
    const dialog = audioDialog(page);
    await dialog.getByRole('button', { name: 'Choose device' }).click();
    await expect(dialog.getByLabel('Audio input device')).toBeVisible();
    await dialog.getByRole('button', { name: 'Start' }).click();
    // The dialog stays open on the live-source summary until it is dismissed.
    await expect(dialog.getByText('Using:')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
}

// Same, with the stubbed screen capture, but it leaves the dialog open on the live-source summary so callers can
// inspect it. Works from the first-run dialog or after "Choose a different source".
export async function chooseScreenCapture(page: Page): Promise<void> {
    const dialog = audioDialog(page);
    await dialog.getByRole('button', { name: 'Share audio' }).click();
    await expect(dialog.getByText('Using:')).toBeVisible();
}

export function canvasCount(page: Page): Promise<number> {
    return page.locator('canvas').count();
}

// Waits for exactly one canvas, then confirms it stays that way across two animation frames, so a second canvas that
// appears (or an old one that lingers) a moment after the route change is still caught.
export async function expectSingleCanvas(page: Page): Promise<void> {
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.evaluate(
        () =>
            new Promise<void>((done) => {
                requestAnimationFrame(() => requestAnimationFrame(() => done()));
            }),
    );
    expect(await canvasCount(page)).toBe(1);
}

// Counts the distinct colours in a PNG, decoded in the page because the test process has no image decoder.
function distinctColours(page: Page, png: Buffer): Promise<number> {
    return page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const scratch = document.createElement('canvas');
        scratch.width = bitmap.width;
        scratch.height = bitmap.height;
        const context = scratch.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, scratch.width, scratch.height);
        const colours = new Set<number>();
        for (let i = 0; i < data.length; i += 4) {
            colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        }
        return colours.size;
    }, png.toString('base64'));
}

// Passes once the canvas shows more than one flat colour. The WebGL buffer cannot be read back without changing the
// app (it does not preserve the drawing buffer), so this screenshots the composited canvas instead.
export async function expectCanvasRendering(page: Page): Promise<void> {
    const canvas = page.locator('canvas');
    await expect
        .poll(async () => distinctColours(page, await canvas.screenshot()), {
            message: 'the canvas is still a single flat colour',
            timeout: 15_000,
        })
        .toBeGreaterThan(8);
}
