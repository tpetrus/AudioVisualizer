// Generates the responsive AVIF/WebP variants of the landing-page card images from their PNG sources.
// For public/visualization-images/<name>.png it writes <name>-640.{avif,webp} and <name>-1280.{avif,webp}, center-cropped
// to 4:3 (the card's aspect ratio, so `object-cover` shows the same crop). The PNGs are only read, never modified.
// Output is deterministic and files are rewritten only when their bytes change, so re-running is a no-op.
// Usage: npm run images
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
// Shared with the card component so the generated files and the srcset it advertises cannot drift apart.
import { CARD_IMAGE_ASPECT, CARD_IMAGE_WIDTHS } from '../app/features/landing/cardImage';

const DIRECTORY = 'public/visualization-images';
const AVIF_QUALITY = 50;
const WEBP_QUALITY = 75;

function kilobytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KB`;
}

// Writes only when the content differs, so unchanged output keeps its timestamp and git sees no change.
function writeIfChanged(path: string, data: Buffer): void {
    if (existsSync(path) && readFileSync(path).equals(data)) return;
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

    for (const width of CARD_IMAGE_WIDTHS) {
        const height = Math.round(width / CARD_IMAGE_ASPECT);
        // `cover` crops to 4:3 around the centre (as object-cover does) and resizes; a source narrower than the
        // target is enlarged slightly so every variant has exactly the dimensions the srcset advertises.
        const resized = () => sharp(sourcePath).resize(width, height, { fit: 'cover', position: 'centre' });
        const outputs = {
            avif: await resized().avif({ quality: AVIF_QUALITY, effort: 6 }).toBuffer(),
            webp: await resized().webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer(),
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
