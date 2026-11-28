import { describe, expect, it } from 'vitest';
import { fragmentShader } from '~/features/visualizers/meshes/shaders/fragment';
import { vertexShader } from '~/features/visualizers/meshes/shaders/vertex';
import { trioHdrFragmentShader, trioHdrVertexShader } from './trioHdrShaders';

const declared = (source: string, kind: 'attribute' | 'uniform') =>
    [...source.matchAll(new RegExp(`^${kind} \\w+ (\\w+);`, 'gm'))].map((match) => match[1]);

describe('trioHdrShaders', () => {
    it('keeps every attribute and uniform of the standard vertex shader', () => {
        for (const kind of ['attribute', 'uniform'] as const) {
            expect(declared(trioHdrVertexShader, kind)).toEqual(declared(vertexShader, kind));
        }
    });

    it('keeps the standard opacity uniform and adds its own', () => {
        expect(declared(fragmentShader, 'uniform')).toEqual(['opacity']);
        const uniforms = declared(trioHdrFragmentShader, 'uniform');
        for (const name of ['opacity', 'mixOpacity', 'emissiveGain', 'rimStrength', 'pulse', 'haze', 'hazeColor']) {
            expect(uniforms).toContain(name);
        }
    });

    it('converts to linear and applies no tone mapping or sRGB encode', () => {
        expect(trioHdrFragmentShader).toContain('srgbToLinear(vColor)');
        expect(trioHdrFragmentShader).not.toMatch(/tonemapping|ACES|linearToSRGB/i);
    });

    it('passes the part along to the fragment for the rim', () => {
        expect(trioHdrVertexShader).toContain('varying float vPart;');
        expect(trioHdrFragmentShader).toContain('varying float vPart;');
    });
});
