// Generates the responsive AVIF/WebP variants of the landing-page card images from their PNG sources.
// For public/visualization-images/<name>.png it writes <name>-640.{avif,webp} and <name>-1200.{avif,webp}, center-cropped
// to 4:3 (the card's aspect ratio, so `object-cover` shows the same crop). The PNGs are only read, never modified.
// Output is deterministic and files are rewritten only when their bytes change, so re-running is a no-op.
// Usage: npm run images
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
// Shared with the card component so the generated files and the srcset it advertises cannot drift apart.
import { CARD_IMAGE_ASPECT, CARD_IMAGE_WIDTHS } from '../app/features/landing/cardImage';

const DIRECTORY = 'public/visualization-images';
// The cards are saturated, hard-edged renders, which low quality and 4:2:0 chroma subsampling visibly smear (blurry
// on high-DPI screens), so trade some bytes for fidelity: higher quality and full-resolution chroma.
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

const sources = readdirSync(DIRECTORY)
    .filter((file) => file.endsWith('.png'))
    .sort();

const rows: string[][] = [['file', 'size', 'dimensions']];
for (const file of sources) {
    const name = file.replace(/\.png$/, '');
    const sourcePath = join(DIRECTORY, file);
    const meta = await sharp(sourcePath).metadata();
    rows.push([file, kilobytes(statSync(sourcePath).size), `${meta.width}x${meta.height}`]);

    // The width of the largest 4:3 centre crop the source can give.
    const cropWidth = Math.min(meta.width, Math.floor(meta.height * CARD_IMAGE_ASPECT));

    for (const width of CARD_IMAGE_WIDTHS) {
        const height = Math.round(width / CARD_IMAGE_ASPECT);
        // Never enlarge: upscaling a narrow crop and then letting the browser resample it again is what made the cards
        // look soft, so fail instead and let the source be replaced (or the width list shrunk).
        if (cropWidth < width) {
            throw new Error(`${file} only has a ${cropWidth}px wide 4:3 crop, but a ${width}px variant is needed`);
        }
        // `cover` crops to 4:3 around the centre (as object-cover does) and resizes down to the target size.
        const resized = () => sharp(sourcePath).resize(width, height, { fit: 'cover', position: 'centre' });
        const outputs = {
            avif: await resized().avif({ quality: AVIF_QUALITY, chromaSubsampling: '4:4:4', effort: 6 }).toBuffer(),
            webp: await resized().webp({ quality: WEBP_QUALITY, smartSubsample: true, effort: 6 }).toBuffer(),
        };
        for (const [extension, data] of Object.entries(outputs)) {
            const outputName = `${name}-${width}.${extension}`;
            writeIfChanged(join(DIRECTORY, outputName), data);
            rows.push([outputName, kilobytes(data.length), `${width}x${height}`]);
        }
    }
}

const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  '));
}
