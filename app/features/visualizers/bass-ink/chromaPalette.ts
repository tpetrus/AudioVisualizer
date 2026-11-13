import { bassInkConfig, type ChromaConfig } from './bassInkConfig';
import type { PalettePair } from './bassInkTypes';

const BINS = 12;

// Follows the strongest of the 12 pitch classes, but slowly and with hysteresis: chroma flickers between neighbors in
// real music, and a palette that flickers with it would be unwatchable.
export class DominantPitch {
    // -1 until the chroma has had any energy.
    pitchClass = -1;
    private readonly smoothed = new Float32Array(BINS);
    private seeded = false;
    private challenger = -1;
    private challengerSeconds = 0;
    private readonly config: ChromaConfig;

    constructor(config: ChromaConfig = bassInkConfig.chroma) {
        this.config = config;
    }

    update(chroma: Float32Array, dtSeconds: number): void {
        const config = this.config;
        const smoothed = this.smoothed;
        const dt = Math.max(0, dtSeconds);
        if (this.seeded) {
            const alpha = 1 - Math.exp(-dt / config.smoothingTauSeconds);
            for (let i = 0; i < BINS; i++) {
                smoothed[i] += (chroma[i] - smoothed[i]) * alpha;
            }
        } else {
            // Start from the first reading instead of from zero, so the first frames are not biased to silence.
            smoothed.set(chroma.subarray(0, BINS));
            this.seeded = true;
        }

        let best = 0;
        for (let i = 1; i < BINS; i++) {
            if (smoothed[i] > smoothed[best]) {
                best = i;
            }
        }
        if (smoothed[best] < config.minEnergy) {
            return;
        }
        if (this.pitchClass < 0) {
            this.pitchClass = best;
            return;
        }
        if (best === this.pitchClass || smoothed[best] < smoothed[this.pitchClass] + config.hysteresisMargin) {
            this.challenger = -1;
            this.challengerSeconds = 0;
            return;
        }
        if (best !== this.challenger) {
            this.challenger = best;
            this.challengerSeconds = 0;
        }
        this.challengerSeconds += dt;
        if (this.challengerSeconds >= config.dwellSeconds) {
            this.pitchClass = best;
            this.challenger = -1;
            this.challengerSeconds = 0;
        }
    }
}

function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// HSL (hue in degrees) to linear RGB, written into `out`.
function writeHsl(out: Float32Array, hueDegrees: number, saturation: number, lightness: number): void {
    const hue = (((hueDegrees % 360) + 360) % 360) / 60;
    const chromaAmount = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const second = chromaAmount * (1 - Math.abs((hue % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 1) {
        r = chromaAmount;
        g = second;
    } else if (hue < 2) {
        r = second;
        g = chromaAmount;
    } else if (hue < 3) {
        g = chromaAmount;
        b = second;
    } else if (hue < 4) {
        g = second;
        b = chromaAmount;
    } else if (hue < 5) {
        r = second;
        b = chromaAmount;
    } else {
        r = chromaAmount;
        b = second;
    }
    const m = lightness - chromaAmount / 2;
    out[0] = srgbToLinear(r + m);
    out[1] = srgbToLinear(g + m);
    out[2] = srgbToLinear(b + m);
}

// Maps a pitch class onto the circle of fifths so that harmonically close keys get close hues; -1 (no tonal content
// yet) gives a calm neutral blue-gray.
export function writePalette(pitchClass: number, out: PalettePair, config: ChromaConfig = bassInkConfig.chroma): void {
    if (pitchClass < 0) {
        writeHsl(out.core, 215, 0.2, 0.7);
        writeHsl(out.edge, 215, 0.2, 0.3);
        return;
    }
    const hue = (((pitchClass * 7) % 12) / 12) * 360;
    writeHsl(out.core, hue, config.coreSaturation, config.coreLightness);
    writeHsl(out.edge, hue + config.edgeHueShiftDegrees, config.edgeSaturation, config.edgeLightness);
}

// Linear blend of two palettes (t 0 gives a, 1 gives b).
export function blendPalette(a: PalettePair, b: PalettePair, t: number, out: PalettePair): void {
    for (let i = 0; i < 3; i++) {
        out.core[i] = a.core[i] + (b.core[i] - a.core[i]) * t;
        out.edge[i] = a.edge[i] + (b.edge[i] - a.edge[i]) * t;
    }
}
