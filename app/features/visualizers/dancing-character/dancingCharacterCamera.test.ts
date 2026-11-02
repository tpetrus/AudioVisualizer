import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stepCameraDolly } from './dancingCharacterCamera';
import { DOLLY_CLAMP_FRACTION, NOMINAL_CHARACTER_SIZE } from './dancingCharacterConfig';
import { computeFraming } from './dancingCharacterFraming';

const DEFAULT_STRENGTH = 0.6;

describe('stepCameraDolly', () => {
    it('pulls in at least 12 % of the distance at a full pulse with the default strength', () => {
        expect(stepCameraDolly(1, DEFAULT_STRENGTH, 10)).toBeGreaterThanOrEqual(1.2);
    });

    it('scales with the pulse and the strength', () => {
        expect(stepCameraDolly(0.5, DEFAULT_STRENGTH, 10)).toBeCloseTo(stepCameraDolly(1, DEFAULT_STRENGTH, 10) / 2);
        expect(stepCameraDolly(1, 0.3, 10)).toBeCloseTo(stepCameraDolly(1, DEFAULT_STRENGTH, 10) / 2);
    });

    it('clamps at 25 % of the distance', () => {
        expect(stepCameraDolly(1, 1, 8)).toBeCloseTo(DOLLY_CLAMP_FRACTION * 8);
        expect(stepCameraDolly(1000, 1, 8)).toBeCloseTo(2);
    });

    it('gives 0 for strength 0, bass 0 and invalid inputs', () => {
        expect(stepCameraDolly(1, 0, 10)).toBe(0);
        expect(stepCameraDolly(0, 1, 10)).toBe(0);
        expect(stepCameraDolly(-1, 1, 10)).toBe(0);
        expect(stepCameraDolly(1, -1, 10)).toBe(0);
        expect(stepCameraDolly(1, 1, -10)).toBe(0);
        expect(stepCameraDolly(NaN, 1, 10)).toBe(0);
        expect(stepCameraDolly(1, NaN, 10)).toBe(0);
        expect(stepCameraDolly(1, 1, NaN)).toBe(0);
        expect(stepCameraDolly(1, 1, Infinity)).toBe(0);
        expect(stepCameraDolly(Infinity, 1, 10)).toBe(0);
    });

    it('is proportional to the live distance in portrait and landscape and never exceeds 25 % of it', () => {
        const { width, height, depth } = NOMINAL_CHARACTER_SIZE;
        const box = new THREE.Box3(
            new THREE.Vector3(-width / 2, 0, -depth / 2),
            new THREE.Vector3(width / 2, height, depth / 2),
        );
        const out = new THREE.Vector3();
        const portrait = computeFraming(box, 50, 0.5, 1, out);
        const landscape = computeFraming(box, 50, 16 / 9, 1, out);
        expect(portrait).not.toBeCloseTo(landscape);
        for (const distance of [portrait, landscape]) {
            const dolly = stepCameraDolly(1, DEFAULT_STRENGTH, distance);
            expect(dolly / distance).toBeCloseTo(stepCameraDolly(1, DEFAULT_STRENGTH, 1));
            expect(stepCameraDolly(5, 1, distance)).toBeLessThanOrEqual(distance * DOLLY_CLAMP_FRACTION + 1e-9);
        }
    });
});
