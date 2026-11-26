// Converts the Poly Haven night sky (an equirectangular RGBE .hdr) to the 4096x2048 sRGB JPG the enhanced dancing
// character mode maps on its sky dome. The dome is plain LDR, so the HDR range is squeezed here once: the linear
// radiance is multiplied by an exposure, tone mapped with Reinhard (x / (1 + x), which keeps hues and never clips),
// encoded with the sRGB transfer curve and written with sharp. The HDR is parsed with three's HDRLoader (it needs no
// DOM in node), as FloatType RGBA. The default exposure of 0.1 (mean sRGB byte about 56 of 255, with the stars and the
// Milky Way still visible) is low on purpose: the sky must read as a dark night sky, and the scene darkens it further.
// Dev only: the 4K .hdr input (about 21 MB) is not committed, see the CREDITS.md next to the output for where to get
// it and the exact command.
// Usage: see USAGE below, or run with no arguments.
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { FloatType } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const DEFAULT_EXPOSURE = 0.1;
const JPEG_QUALITY = 85;
const MAX_BYTES = 4 * 1024 * 1024;
const USAGE = `Usage: convert-sky <input.hdr> --out <file.jpg> [--exposure N]
  Converts an equirectangular RGBE .hdr to an sRGB JPG: linear radiance * exposure, Reinhard tone map, sRGB encode,
  JPEG quality ${JPEG_QUALITY} (lowered in steps of 5 if the file would exceed 4 MiB).
  --exposure N   linear multiplier before the tone map (default ${DEFAULT_EXPOSURE})`;

// The sRGB opto-electronic transfer function for a linear value in 0..1.
function encodeSrgb(linear: number): number {
    const value = Math.min(1, Math.max(0, linear));
    return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function parseArguments(argv: string[]): { input: string; out: string; exposure: number } | null {
    let input: string | null = null;
    let out: string | null = null;
    let exposure = DEFAULT_EXPOSURE;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--out') out = argv[++i] ?? null;
        else if (arg === '--exposure') exposure = Number(argv[++i]);
        else if (!arg.startsWith('--') && input === null) input = arg;
        else return null;
    }
    if (input === null || out === null || !Number.isFinite(exposure) || exposure <= 0) return null;
    return { input, out, exposure };
}

const args = parseArguments(process.argv.slice(2));
if (args === null) {
    console.log(USAGE);
    process.exit(process.argv.length > 2 ? 1 : 0);
}

const file = readFileSync(args.input);
const loader = new HDRLoader();
loader.setDataType(FloatType);
const hdr = loader.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const { width, height } = hdr;
if (width === undefined || height === undefined) throw new Error(`${args.input} has no size`);
const source = hdr.data as Float32Array;

const pixels = Buffer.alloc(width * height * 3);
let sum = 0;
for (let i = 0; i < width * height; i++) {
    for (let channel = 0; channel < 3; channel++) {
        const radiance = source[i * 4 + channel] * args.exposure;
        const mapped = radiance / (1 + radiance);
        const byte = Math.round(encodeSrgb(mapped) * 255);
        pixels[i * 3 + channel] = byte;
        sum += byte;
    }
}

let image = sharp(pixels, { raw: { width, height, channels: 3 } });
if (width !== 4096 || height !== 2048) image = image.resize(4096, 2048, { kernel: 'lanczos3' });
let quality = JPEG_QUALITY;
let jpg = await image.jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer();
while (jpg.length > MAX_BYTES && quality > 40) {
    quality -= 5;
    jpg = await image.jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer();
}
writeFileSync(args.out, jpg);
console.log(
    `${args.input}: ${width}x${height}, exposure ${args.exposure}, quality ${quality}, mean sRGB byte ` +
        `${(sum / (width * height * 3)).toFixed(1)}, wrote ${args.out} (${jpg.length} bytes)`,
);
