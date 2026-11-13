import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { SpectrumField } from './spectrumField';

const config = bassInkSceneConfig.spectrum;
// 48 kHz with a 2048-point FFT, as the scene uses.
const BIN_HZ = 48000 / 2048;
const BINS = 1024;
const DT = 1 / 60;

// A byte spectrum that is `base` everywhere, with `level` from lowHz to highHz.
function spectrumWith(base: number, level = base, lowHz = 0, highHz = 0): Uint8Array {
    const spectrum = new Uint8Array(BINS).fill(base);
    for (let bin = Math.floor(lowHz / BIN_HZ); bin <= Math.ceil(highHz / BIN_HZ) && bin < BINS; bin++) {
        spectrum[bin] = level;
    }
    return spectrum;
}

// The newest row of the field's texture.
function newestRow(field: SpectrumField): Uint8Array {
    const data = field.texture.image.data as Uint8Array;
    return data.slice(field.head * field.columns, (field.head + 1) * field.columns);
}

describe('SpectrumField', () => {
    it('makes a one-channel byte texture of columns by rows, smooth across both and repeating in time', () => {
        const field = new SpectrumField();
        expect(field.texture.image.width).toBe(config.columns);
        expect(field.texture.image.height).toBe(config.rows);
        expect(field.texture.format).toBe(THREE.RedFormat);
        expect(field.texture.type).toBe(THREE.UnsignedByteType);
        expect(field.texture.wrapT).toBe(THREE.RepeatWrapping);
        expect(field.texture.magFilter).toBe(THREE.LinearFilter);
        expect(field.texture.generateMipmaps).toBe(false);
    });

    it('writes each frame to the next row of the ring and points the shader at its center', () => {
        const field = new SpectrumField();
        const quiet = spectrumWith(100);
        for (let i = 0; i < config.rows + 2; i++) {
            field.update(quiet, BIN_HZ, DT);
        }
        expect(field.head).toBe(2);
        expect(field.headCoordinate).toBeCloseTo(2.5 / config.rows, 9);
    });

    it('stays flat on a steady spectrum, however loud', () => {
        const field = new SpectrumField();
        const steady = spectrumWith(180);
        for (let i = 0; i < 600; i++) {
            field.update(steady, BIN_HZ, DT);
        }
        expect(Math.max(...newestRow(field))).toBe(0);
    });

    it('moves only the frequencies that rise above their own average', () => {
        const field = new SpectrumField();
        for (let i = 0; i < 300; i++) {
            field.update(spectrumWith(120), BIN_HZ, DT);
        }
        // A burst around 1 to 2 kHz: the middle of the log scale from 35 Hz to 12 kHz.
        const burst = spectrumWith(120, 220, 1000, 2000);
        for (let i = 0; i < 6; i++) {
            field.update(burst, BIN_HZ, DT);
        }
        const row = newestRow(field);
        const column = (hz: number) =>
            Math.round((Math.log(hz / config.lowHz) / Math.log(config.highHz / config.lowHz)) * (config.columns - 1));
        expect(row[column(1400)]).toBeGreaterThan(150);
        expect(row[column(60)]).toBe(0);
        expect(row[column(9000)]).toBe(0);
    });

    it('never moves frequencies near the analyser floor', () => {
        const field = new SpectrumField();
        for (let i = 0; i < 60; i++) {
            field.update(spectrumWith(0, config.peakFloor, 1000, 2000), BIN_HZ, DT);
        }
        expect(Math.max(...newestRow(field))).toBe(0);
    });

    it('rises within a few frames and falls back more slowly', () => {
        const field = new SpectrumField();
        for (let i = 0; i < 300; i++) {
            field.update(spectrumWith(120), BIN_HZ, DT);
        }
        const burst = spectrumWith(220);
        field.update(burst, BIN_HZ, DT);
        field.update(burst, BIN_HZ, DT);
        const risen = newestRow(field)[config.columns >> 1];
        expect(risen).toBeGreaterThan(100);

        field.update(spectrumWith(120), BIN_HZ, DT);
        const after = newestRow(field)[config.columns >> 1];
        expect(after).toBeGreaterThan(risen * 0.8);
        expect(after).toBeLessThan(risen);
    });

    it('settles to flat with no source, a row per frame', () => {
        const field = new SpectrumField();
        for (let i = 0; i < 300; i++) {
            field.update(spectrumWith(120), BIN_HZ, DT);
        }
        field.update(spectrumWith(220), BIN_HZ, DT);
        field.update(spectrumWith(220), BIN_HZ, DT);
        const head = field.head;
        field.fade(DT);
        expect(field.head).toBe((head + 1) % config.rows);
        for (let i = 0; i < 120; i++) {
            field.fade(DT);
        }
        expect(Math.max(...newestRow(field))).toBe(0);
    });

    it('seeds the averages from the first frame, so a new source does not swell the whole cloud', () => {
        const field = new SpectrumField();
        field.update(spectrumWith(200), BIN_HZ, DT);
        field.update(spectrumWith(200), BIN_HZ, DT);
        expect(Math.max(...newestRow(field))).toBe(0);

        // After a reset, a louder steady source is seeded too.
        field.reset();
        for (let i = 0; i < 60; i++) {
            field.update(spectrumWith(240), BIN_HZ, DT);
        }
        expect(Math.max(...newestRow(field))).toBe(0);
    });

    it('treats a negative delta as no time', () => {
        const field = new SpectrumField();
        field.update(spectrumWith(220), BIN_HZ, -1);
        expect(Math.max(...newestRow(field))).toBe(0);
        field.fade(-1);
        expect(Math.max(...newestRow(field))).toBe(0);
    });

    it('frees its texture', () => {
        const field = new SpectrumField();
        let disposed = false;
        field.texture.addEventListener('dispose', () => {
            disposed = true;
        });
        field.dispose();
        expect(disposed).toBe(true);
    });
});
