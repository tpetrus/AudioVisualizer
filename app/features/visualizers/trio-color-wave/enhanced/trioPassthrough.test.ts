import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PencilFlagsMesh } from '~/features/visualizers/meshes/pencilFlagsMesh';
import { BANDS, FLAG_DEPTH, FLAG_WIDTH } from '../trioColorWaveConfig';
import { createSheetColors } from '../trioColorWaveSheet';
import { acesFilmic, inverseAcesFilmic, passthroughFragmentShader, StandardPassthrough } from './trioPassthrough';

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

// What OutputPass shows for a linear color: ACES, then the sRGB encoding.
function throughOutputPass(color: readonly [number, number, number], exposure = 1): number[] {
    return acesFilmic(color, exposure).map(toSrgb);
}

// The colors the standard vertex shader hands its fragment shader: each flag's color at the base shade, plain, and
// tinted toward white at the tip, under full light and under the darkest side light.
function standardBarColors(): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const band of BANDS) {
        for (const color of createSheetColors(band.startHue, band.endHue, FLAG_WIDTH, FLAG_DEPTH)) {
            const rgb: [number, number, number] = [color.r, color.g, color.b];
            for (const light of [0.9, 1]) {
                out.push(rgb.map((c) => c * 0.5 * light) as [number, number, number]);
                out.push(rgb.map((c) => c * light) as [number, number, number]);
                out.push(rgb.map((c) => (c + (1 - c) * 0.5) * light) as [number, number, number]);
            }
        }
    }
    return out;
}

describe('inverseAcesFilmic', () => {
    it('undoes ACES and the sRGB encoding for every color the standard bars draw', () => {
        const step = 1 / 255;
        let worst = 0;
        let channels = 0;
        let withinOneStep = 0;
        for (const shown of standardBarColors()) {
            const target = shown.map(toLinear) as [number, number, number];
            const back = throughOutputPass(inverseAcesFilmic(target));
            for (let channel = 0; channel < 3; channel++) {
                const error = Math.abs(back[channel] - shown[channel]);
                worst = Math.max(worst, error);
                channels++;
                if (error < step) withinOneStep++;
            }
        }
        // The most saturated purples ask ACES for a color outside what it can produce, so the inverse clamps there and
        // misses by about two 8-bit steps; nearly every other channel comes back within one.
        expect(worst).toBeLessThan(3 * step);
        expect(withinOneStep / channels).toBeGreaterThan(0.95);
    });

    it('honors the tone mapping exposure', () => {
        const shown: [number, number, number] = [0.4, 0.2, 0.7];
        const back = throughOutputPass(inverseAcesFilmic(shown.map(toLinear) as [number, number, number], 1.5), 1.5);
        back.forEach((value, channel) => expect(value).toBeCloseTo(shown[channel], 2));
    });

    it('keeps black black and never goes negative', () => {
        // ACES lifts black very slightly, so its inverse asks for a tiny bit above 0.
        expect(inverseAcesFilmic([0, 0, 0]).every((value) => value >= 0 && value < 0.005)).toBe(true);
        expect(inverseAcesFilmic([1, 0, 0]).every((value) => value >= 0)).toBe(true);
    });
});

describe('passthroughFragmentShader', () => {
    it('writes the inverse with the standard opacity and embeds finite matrices', () => {
        expect(passthroughFragmentShader).toContain('uniform float opacity;');
        expect(passthroughFragmentShader).toContain('gl_FragColor = vec4(');
        expect(passthroughFragmentShader).not.toMatch(/NaN|Infinity/);
    });
});

describe('StandardPassthrough', () => {
    function sheet() {
        const colors = Array.from({ length: 4 }, () => new THREE.Color(0.2, 0.4, 0.6));
        return new PencilFlagsMesh(2, 2, 10, colors, 4, 0.8);
    }

    it('draws the mesh with a material that shares the standard uniforms, and puts the standard one back', () => {
        const flags = sheet();
        const passthrough = new StandardPassthrough(flags.mesh, flags.material);
        const swapped = flags.mesh.material as THREE.RawShaderMaterial;
        expect(swapped).not.toBe(flags.material);
        expect(swapped.vertexShader).toBe(flags.material.vertexShader);
        expect(swapped.transparent).toBe(true);
        expect(swapped.depthWrite).toBe(false);
        expect(swapped.side).toBe(THREE.DoubleSide);

        flags.material.uniforms.opacity.value = 0.3;
        expect(swapped.uniforms.opacity.value).toBe(0.3);

        passthrough.update(THREE.ACESFilmicToneMapping, 1.2);
        expect(swapped.uniforms.acesOn.value).toBe(1);
        expect(swapped.uniforms.exposure.value).toBe(1.2);
        passthrough.update(THREE.NoToneMapping, 0);
        expect(swapped.uniforms.acesOn.value).toBe(0);
        expect(swapped.uniforms.exposure.value).toBe(1);

        let disposed = 0;
        swapped.addEventListener('dispose', () => disposed++);
        passthrough.dispose();
        passthrough.dispose();
        expect(flags.mesh.material).toBe(flags.material);
        expect(disposed).toBe(1);
    });
});
