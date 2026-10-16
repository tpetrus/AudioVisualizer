import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PencilFlagsMesh } from './pencilFlagsMesh';

const DEPTH = 2;
const WIDTH = 3;
const DISTANCE = 10;
const RADIUS = 4;

function createColors(): THREE.Color[] {
    return Array.from({ length: DEPTH * WIDTH }, (_, flag) => new THREE.Color(flag / 10, 0.5, 1 - flag / 10));
}

function create(opacity?: number): PencilFlagsMesh {
    return new PencilFlagsMesh(DEPTH, WIDTH, DISTANCE, createColors(), RADIUS, opacity);
}

function attribute(flags: PencilFlagsMesh, name: string): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
    return flags.geometry.getAttribute(name);
}

describe('PencilFlagsMesh', () => {
    it('draws one instance per flag', () => {
        const flags = create();
        expect(flags.geometry.instanceCount).toBe(DEPTH * WIDTH);
        expect(flags.mesh.geometry).toBe(flags.geometry);
        expect(flags.mesh.material).toBe(flags.material);
        expect(flags.mesh.frustumCulled).toBe(false);
    });

    it('builds a six-sided pencil: six walls and six tip faces, unindexed', () => {
        const flags = create();
        // 6 sides * (6 wall vertices + 3 tip vertices).
        expect(attribute(flags, 'position').count).toBe(54);
        expect(attribute(flags, 'part').count).toBe(54);
        expect(attribute(flags, 'faceNormal').count).toBe(54);
        expect(attribute(flags, 'isTip').count).toBe(54);
        expect(flags.geometry.index).toBeNull();
    });

    it('puts the pencil corners on a circle of the given radius, with the apex on the axis', () => {
        const flags = create();
        const position = attribute(flags, 'position');
        // First wall vertex is the corner at angle 0.
        expect(position.getX(0)).toBeCloseTo(RADIUS, 5);
        expect(position.getZ(0)).toBeCloseTo(0, 5);
        for (let i = 0; i < position.count; i++) {
            expect(position.getY(i)).toBe(0);
            expect(Math.hypot(position.getX(i), position.getZ(i))).toBeLessThanOrEqual(RADIUS + 1e-5);
        }
        // The eighth vertex of each side group is part 2: the apex.
        const part = attribute(flags, 'part');
        expect(part.getX(8)).toBe(2);
        expect(position.getX(8)).toBe(0);
        expect(position.getZ(8)).toBe(0);
        expect(attribute(flags, 'isTip').getX(8)).toBe(1);
        expect(attribute(flags, 'isTip').getX(0)).toBe(0);
    });

    it('lays flags out column by column with their own colours', () => {
        const flags = create();
        const offsets = attribute(flags, 'instanceOffset');
        const colors = attribute(flags, 'instanceColor');
        const source = createColors();
        for (let column = 0; column < WIDTH; column++) {
            for (let row = 0; row < DEPTH; row++) {
                const flag = column * DEPTH + row;
                expect([offsets.getX(flag), offsets.getY(flag), offsets.getZ(flag)]).toEqual([DISTANCE * column, 1, DISTANCE * row]);
                expect(colors.getX(flag)).toBeCloseTo(source[flag].r, 6);
                expect(colors.getY(flag)).toBeCloseTo(source[flag].g, 6);
                expect(colors.getZ(flag)).toBeCloseTo(source[flag].b, 6);
            }
        }
    });

    it('starts with flat bars and a default tip length', () => {
        const flags = create();
        expect(Array.from(flags.heightAttribute.array)).toEqual(new Array(DEPTH * WIDTH).fill(0));
        expect(Array.from(attribute(flags, 'instanceTip').array)).toEqual(new Array(DEPTH * WIDTH).fill(20));
    });

    it('sets a bar height by column and row', () => {
        const flags = create();
        flags.setFlagHeight(2, 1, 42);
        flags.setFlagHeight(0, 0, 7);
        const heights = Array.from(flags.heightAttribute.array);
        expect(heights[2 * DEPTH + 1]).toBe(42);
        expect(heights[0]).toBe(7);
        expect(heights.filter(height => height !== 0)).toHaveLength(2);
    });

    it('sets the tip length for every bar in one row only, and flags the upload', () => {
        const flags = create();
        const tips = attribute(flags, 'instanceTip') as THREE.BufferAttribute;
        const version = tips.version;
        flags.setTipLength(1, 33);
        for (let column = 0; column < WIDTH; column++) {
            expect(tips.getX(column * DEPTH + 0)).toBe(20);
            expect(tips.getX(column * DEPTH + 1)).toBe(33);
        }
        expect(tips.version).toBeGreaterThan(version);
    });

    it('feeds the shader the lighting, apothem and opacity uniforms', () => {
        const flags = create(0.6);
        expect(flags.material.uniforms.opacity.value).toBe(0.6);
        expect(flags.material.uniforms.apothem.value).toBeCloseTo(RADIUS * Math.cos(Math.PI / 6), 8);
        expect(flags.material.uniforms.lightDirection.value).toBeInstanceOf(THREE.Vector3);
        expect(flags.material.transparent).toBe(true);
        expect(flags.material.depthWrite).toBe(false);
        expect(flags.material.side).toBe(THREE.DoubleSide);
    });

    it('is fully opaque by default', () => {
        expect(create().material.uniforms.opacity.value).toBe(1);
    });

    it('detaches the mesh and frees the geometry and material on dispose', () => {
        const flags = create();
        const scene = new THREE.Scene();
        scene.add(flags.mesh);
        const geometry = vi.spyOn(flags.geometry, 'dispose');
        const material = vi.spyOn(flags.material, 'dispose');

        flags.dispose();

        expect(scene.children).toHaveLength(0);
        expect(geometry).toHaveBeenCalledTimes(1);
        expect(material).toHaveBeenCalledTimes(1);
    });
});
