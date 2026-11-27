import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENHANCED_ASSET_URLS } from './enhancedAssetUrls';

const ASSET_DIRECTORY = join(__dirname, '..', 'assets', 'enhanced');
const CREDITS = readFileSync(join(__dirname, '..', 'assets', 'CREDITS.md'), 'utf8');
const FILES = readdirSync(ASSET_DIRECTORY).sort();
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30_000_000;

// Reads the pixel size from a baseline or progressive JPEG's start-of-frame marker.
function jpegSize(bytes: Buffer): { width: number; height: number } {
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) throw new Error(`Bad JPEG marker at ${offset}`);
        const marker = bytes[offset + 1]!;
        // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
        }
        offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    throw new Error('No SOF marker');
}

describe('enhanced graphics assets', () => {
    it('has the five expected files', () => {
        expect(FILES).toEqual([
            'concrete_floor_worn_001_diff_2k.jpg',
            'concrete_floor_worn_001_nor_gl_2k.jpg',
            'concrete_floor_worn_001_rough_2k.jpg',
            'ferndale_studio_02_2k.hdr',
            'qwantani_night_puresky_4k.jpg',
        ]);
    });

    it('keeps every file under 20 MiB and the folder at most 30 MB', () => {
        const sizes = FILES.map((file) => statSync(join(ASSET_DIRECTORY, file)).size);
        for (const size of sizes) expect(size).toBeLessThan(MAX_FILE_BYTES);
        expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
    });

    it('has a 2048x1024 RGBE header on the lighting environment', () => {
        const head = readFileSync(join(ASSET_DIRECTORY, 'ferndale_studio_02_2k.hdr'))
            .subarray(0, 200)
            .toString('latin1');
        expect(head.startsWith('#?RADIANCE') || head.startsWith('#?RGBE')).toBe(true);
        expect(head).toContain('FORMAT=32-bit_rle_rgbe');
        expect(head).toMatch(/\n-Y 1024 \+X 2048\n/);
    });

    it('has the documented pixel sizes on the JPGs', () => {
        const read = (file: string) => jpegSize(readFileSync(join(ASSET_DIRECTORY, file)));
        expect(read('qwantani_night_puresky_4k.jpg')).toEqual({ width: 4096, height: 2048 });
        for (const kind of ['diff', 'nor_gl', 'rough']) {
            expect(read(`concrete_floor_worn_001_${kind}_2k.jpg`)).toEqual({ width: 2048, height: 2048 });
        }
    });

    it('credits every file with its sha256 in CREDITS.md', () => {
        for (const file of FILES) {
            const hash = createHash('sha256')
                .update(readFileSync(join(ASSET_DIRECTORY, file)))
                .digest('hex');
            expect(CREDITS, file).toContain(`## ${file}`);
            expect(CREDITS, file).toContain(`sha256: \`${hash}\``);
        }
    });

    it('exposes a non-empty URL for every asset', () => {
        const { environmentHdr, skyTexture, frame } = ENHANCED_ASSET_URLS;
        for (const url of [environmentHdr, skyTexture, frame.map, frame.normalMap, frame.roughnessMap]) {
            expect(typeof url).toBe('string');
            expect(url.length).toBeGreaterThan(0);
        }
    });
});
