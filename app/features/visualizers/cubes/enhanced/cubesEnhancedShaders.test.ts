import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cubesEnhancedConfig } from './cubesEnhancedConfig';
import {
    BACKDROP_FRAGMENT,
    BACKDROP_VERTEX,
    createCubeFxUniforms,
    createSeedGenerator,
    CUBE_FRAGMENT_ANCHORS,
    CUBE_VERTEX_ANCHORS,
    PARTICLE_FRAGMENT,
    PARTICLE_VERTEX,
    patchCubeShader,
    type PatchableShader,
} from './cubesEnhancedShaders';

function physicalShader(): PatchableShader {
    return {
        uniforms: { existing: { value: 1 } },
        vertexShader: THREE.ShaderLib.physical.vertexShader,
        fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
}

// Every uniform a shader string declares.
function declaredUniforms(source: string): string[] {
    return [...source.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((match) => match[1]);
}

describe('cube shader patch', () => {
    it('finds every anchor in three r186 physical shaders', () => {
        for (const anchor of CUBE_VERTEX_ANCHORS) {
            expect(THREE.ShaderLib.physical.vertexShader).toContain(anchor);
        }
        for (const anchor of CUBE_FRAGMENT_ANCHORS) {
            expect(THREE.ShaderLib.physical.fragmentShader).toContain(anchor);
        }
        // The chunks the injected code reads, and the begin of the instancing and color chunks it relies on.
        expect(THREE.ShaderChunk.project_vertex).toContain('instanceMatrix');
        expect(THREE.ShaderChunk.project_vertex).toContain('mvPosition');
        expect(THREE.ShaderChunk.begin_vertex).toContain('transformed');
        expect(THREE.ShaderChunk.color_pars_fragment).toContain('vColor');
        expect(THREE.ShaderChunk.emissivemap_fragment).toBeDefined();
    });

    it('injects the vertex term after the projection and the emissive term after the emissive map', () => {
        const shader = physicalShader();
        patchCubeShader(shader, createCubeFxUniforms());
        const vertex = shader.vertexShader;
        expect(vertex).toContain('vec3 fxOffset(vec3 cell)');
        expect(vertex.indexOf('#include <project_vertex>')).toBeLessThan(vertex.indexOf('fxOffset(fxCell)'));
        expect(vertex.indexOf('#include <common>')).toBeLessThan(vertex.indexOf('uniform float fxTime'));
        const fragment = shader.fragmentShader;
        expect(fragment.indexOf('#include <emissivemap_fragment>')).toBeLessThan(
            fragment.indexOf('totalEmissiveRadiance += vColor.rgb * fxEmissive'),
        );
        expect(fragment).toContain('uniform float fxEmissive');
    });

    it('adds exactly the uniforms the injected code declares, and keeps the existing ones', () => {
        const shader = physicalShader();
        const uniforms = createCubeFxUniforms();
        patchCubeShader(shader, uniforms);
        expect(shader.uniforms.existing).toEqual({ value: 1 });
        const declared = [...declaredUniforms(shader.vertexShader), ...declaredUniforms(shader.fragmentShader)].filter(
            (name) => name.startsWith('fx'),
        );
        for (const name of new Set(declared)) {
            expect(shader.uniforms[name]).toBe(uniforms[name as keyof typeof uniforms]);
        }
        for (const name of Object.keys(uniforms)) expect(declared).toContain(name);
    });

    it('creates the uniform objects once with the configured grid parameters at 0 for the animated ones', () => {
        const uniforms = createCubeFxUniforms();
        expect(uniforms.fxWaveHeight.value).toBe(cubesEnhancedConfig.gridFx.waveHeight);
        expect(uniforms.fxShatterPush.value).toBe(cubesEnhancedConfig.gridFx.shatterPush);
        expect(uniforms.fxWaveAmplitude.value).toBe(0);
        expect(uniforms.fxShatter.value).toBe(0);
        expect(createCubeFxUniforms().fxTime).not.toBe(uniforms.fxTime);
    });
});

describe('backdrop and particle shaders', () => {
    it('declare the uniforms the look provides', () => {
        expect(declaredUniforms(BACKDROP_FRAGMENT).sort()).toEqual(
            ['uBase', 'uFlash', 'uSheen', 'uTint', 'uVignette'].sort(),
        );
        expect(BACKDROP_VERTEX).toContain('gl_Position');
        expect(declaredUniforms(PARTICLE_VERTEX).sort()).toEqual(
            ['uBass', 'uDepth', 'uEmit', 'uEmitSize', 'uPointScale', 'uRise', 'uSpread', 'uSway', 'uTime'].sort(),
        );
        expect(declaredUniforms(PARTICLE_FRAGMENT).sort()).toEqual(
            ['uAlpha', 'uBrightness', 'uColorA', 'uColorB', 'uEmit'].sort(),
        );
        expect(PARTICLE_VERTEX).toContain('attribute vec2 aRand');
        expect(PARTICLE_VERTEX).toContain('gl_PointSize');
    });
});

describe('createSeedGenerator', () => {
    it('is deterministic and stays in 0..1', () => {
        const a = createSeedGenerator(1234);
        const b = createSeedGenerator(1234);
        const values = Array.from({ length: 500 }, () => a());
        expect(values).toEqual(Array.from({ length: 500 }, () => b()));
        expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
        expect(new Set(values).size).toBeGreaterThan(490);
    });
});
