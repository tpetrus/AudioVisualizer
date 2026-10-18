// Renders the landing page's 3D title to static images: public/title-banner.{avif,webp,png} at 1x and
// public/title-banner-2x.{avif,webp,png} at 2x, each the same CSS size (see titleBannerImage.ts) so the 2x files have
// twice the pixels, drawn natively rather than enlarged.
// The scene is drawn in headless Chromium with the same software-WebGL flags the E2E tests use. Output is deterministic
// on a given machine and files are rewritten only when their bytes change, so re-running is a no-op; a different OS or
// Chromium build may rasterise a few pixels differently, so regenerate in one place and commit the result.
// Usage: npm run title-banner (it bundles browser.ts for the page first)
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
// Shared with the banner component so the generated files and the markup that references them cannot drift apart.
import { TITLE_BANNER_HEIGHT, TITLE_BANNER_WIDTH } from '../../app/features/landing/titleBannerImage';

const PAGE_SCRIPT = 'node_modules/.cache/title-banner-browser.js';
const OUTPUT_DIRECTORY = 'public';
const SCALES = [
    { scale: 1, suffix: '' },
    { scale: 2, suffix: '-2x' },
];
// Match the card images: full-resolution chroma and higher quality, because the title is thin white text on black and
// 4:2:0 subsampling or low quality smears its edges on high-DPI screens.
const AVIF_QUALITY = 65;
const WEBP_QUALITY = 85;

function kilobytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KB`;
}

// Writes only when the content differs, so unchanged output keeps its timestamp and git sees no change.
function writeIfChanged(path: string, data: Buffer): void {
    try {
        if (readFileSync(path).equals(data)) return;
    } catch {
        // No existing file to compare with.
    }
    writeFileSync(path, data);
}

const pageScript = readFileSync(PAGE_SCRIPT, 'utf8');
const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const rows: string[][] = [['file', 'size', 'dimensions']];
try {
    for (const { scale, suffix } of SCALES) {
        const context = await browser.newContext({
            viewport: { width: TITLE_BANNER_WIDTH, height: TITLE_BANNER_HEIGHT },
            deviceScaleFactor: scale,
        });
        const page = await context.newPage();
        const errors: Error[] = [];
        page.on('pageerror', (error) => errors.push(error));
        await page.setContent('<!doctype html><body style="margin:0;background:#000"></body>');
        await page.addScriptTag({ content: pageScript });
        await page.evaluate(
            ([width, height]) => {
                (window as unknown as { drawTitleBanner: (w: number, h: number) => void }).drawTitleBanner(
                    width,
                    height,
                );
            },
            [TITLE_BANNER_WIDTH, TITLE_BANNER_HEIGHT],
        );
        const screenshot = await page.screenshot({ type: 'png' });
        await context.close();
        if (errors.length > 0) {
            throw errors[0];
        }

        const width = TITLE_BANNER_WIDTH * scale;
        const height = TITLE_BANNER_HEIGHT * scale;
        const meta = await sharp(screenshot).metadata();
        if (meta.width !== width || meta.height !== height) {
            throw new Error(`Expected a ${width}x${height} screenshot but got ${meta.width}x${meta.height}`);
        }

        const outputs = {
            avif: await sharp(screenshot)
                .avif({ quality: AVIF_QUALITY, chromaSubsampling: '4:4:4', effort: 6 })
                .toBuffer(),
            webp: await sharp(screenshot).webp({ quality: WEBP_QUALITY, smartSubsample: true, effort: 6 }).toBuffer(),
            png: await sharp(screenshot).png({ compressionLevel: 9, effort: 10 }).toBuffer(),
        };
        for (const [extension, data] of Object.entries(outputs)) {
            const outputName = `title-banner${suffix}.${extension}`;
            writeIfChanged(`${OUTPUT_DIRECTORY}/${outputName}`, data);
            rows.push([outputName, kilobytes(data.length), `${width}x${height}`]);
        }
    }
} finally {
    await browser.close();
}

const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  '));
}
