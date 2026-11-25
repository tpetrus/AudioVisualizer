import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FORMATION_COUNT } from './bassInkTypes';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { writeFormation } from './formations';
import { fitScale, formationP95Radius, worstCaseExtent } from './framing';

const SEED = 7;
const POINTS = 20000;
const ASPECTS = [1920 / 1080, 1024 / 768];
const { camera: cameraConfig, cloud } = bassInkSceneConfig;

// Sorted fractions of the smaller half-dimension that the points reach on screen, measured by projecting the
// real formation points (tilted and scaled as the scene does) through a real perspective camera.
function projectedRadii(index: number, aspect: number): number[] {
    const camera = new THREE.PerspectiveCamera(cameraConfig.fov, aspect, cameraConfig.near, cameraConfig.far);
    camera.position.set(0, 0, cameraConfig.distance);
    camera.updateMatrixWorld();

    const points = new Float32Array(POINTS * 3);
    writeFormation(index, SEED, points, POINTS, 0, POINTS);
    const fit = fitScale(formationP95Radius(index, SEED), cameraConfig.distance, cameraConfig.fov, aspect, cloud.fill);
    const object = new THREE.Object3D();
    object.rotation.x = cloud.tilt;
    object.scale.setScalar(cloud.radius * fit);
    object.updateMatrixWorld();

    const point = new THREE.Vector3();
    const radii: number[] = [];
    for (let i = 0; i < POINTS; i++) {
        point
            .fromArray(points, i * 3)
            .applyMatrix4(object.matrixWorld)
            .project(camera);
        // NDC is -1..1 on both axes; the width spans `aspect` times the height, so scale x to height units first.
        radii.push(Math.hypot(point.x * aspect, point.y) / Math.min(1, aspect));
    }
    radii.sort((a, b) => a - b);
    return radii;
}

const percentile = (sorted: number[], share: number): number => sorted[Math.floor(share * POINTS)];

describe('framing', () => {
    describe('AC1: the whole resting cloud is in view and still fills most of the screen', () => {
        for (const aspect of ASPECTS) {
            // Iterated over the count, so a new formation is covered without editing this spec.
            for (let index = 0; index < FORMATION_COUNT; index++) {
                it(`formation ${index} keeps its 99th percentile within 95% and its 95th at 65% or more at aspect ${aspect.toFixed(2)}`, () => {
                    const radii = projectedRadii(index, aspect);
                    // Outer points sit inside the view with a small margin ...
                    expect(percentile(radii, 0.99)).toBeLessThanOrEqual(0.95);
                    // ... and the cloud still fills most of it (the floor follows cloud.fill, which is 0.7).
                    expect(percentile(radii, 0.95)).toBeGreaterThanOrEqual(0.65);
                });
            }
        }
    });

    describe('fitScale', () => {
        it('scales a unit radius so it projects to the fill share of the smaller half-dimension', () => {
            const halfHeight = cameraConfig.distance * Math.tan((cameraConfig.fov * Math.PI) / 360);
            // Wide view: the height is the smaller dimension.
            expect(fitScale(1, cameraConfig.distance, cameraConfig.fov, 16 / 9, 0.8) * cloud.radius).toBeCloseTo(
                0.8 * halfHeight,
                10,
            );
            // Portrait view: the width is, so the cloud shrinks with the aspect.
            expect(fitScale(1, cameraConfig.distance, cameraConfig.fov, 0.5, 0.8) * cloud.radius).toBeCloseTo(
                0.8 * halfHeight * 0.5,
                10,
            );
        });

        it('grows when the formation is smaller and shrinks as the fill falls', () => {
            const base = fitScale(1, cameraConfig.distance, cameraConfig.fov, 1.5, 0.8);
            expect(fitScale(0.5, cameraConfig.distance, cameraConfig.fov, 1.5, 0.8)).toBeCloseTo(base * 2, 10);
            expect(fitScale(1, cameraConfig.distance, cameraConfig.fov, 1.5, 0.4)).toBeCloseTo(base / 2, 10);
        });
    });

    describe('formationP95Radius', () => {
        it('measures every formation as a positive radius of about one unit', () => {
            for (let index = 0; index < FORMATION_COUNT; index++) {
                const radius = formationP95Radius(index, SEED);
                expect(radius).toBeGreaterThan(0.3);
                expect(radius).toBeLessThan(1.6);
            }
        });

        it('is the 95th percentile of the sampled points, so fewer samples give a similar answer', () => {
            expect(formationP95Radius(0, SEED, 2000)).toBeCloseTo(formationP95Radius(0, SEED), 1);
        });

        it('never reads past the last sample for a tiny sample count', () => {
            expect(formationP95Radius(0, SEED, 1)).toBeGreaterThan(0);
        });
    });

    describe('worstCaseExtent', () => {
        it('sums the multiplied scale terms and the added displacements from the config', () => {
            const radius = 4;
            const expected =
                radius * (1 + cloud.breathingAmplitude) * (1 + cloud.beatPunch) * (1 + cloud.swellAmplitude) +
                bassInkSceneConfig.wave.maxDisplacement +
                bassInkSceneConfig.spectrum.amplitude;
            expect(worstCaseExtent(radius)).toBeCloseTo(expected, 10);
        });

        it('follows a config passed in and grows with the radius', () => {
            const quiet = {
                ...bassInkSceneConfig,
                cloud: { ...cloud, breathingAmplitude: 0, beatPunch: 0, swellAmplitude: 0 },
                wave: { ...bassInkSceneConfig.wave, maxDisplacement: 0 },
                spectrum: { ...bassInkSceneConfig.spectrum, amplitude: 0 },
            };
            expect(worstCaseExtent(3, quiet)).toBe(3);
            expect(worstCaseExtent(6)).toBeGreaterThan(worstCaseExtent(3));
        });

        // Loud peaks may reach past the edge of the view by design; the fit is for the resting cloud. This only
        // documents by how much, so a tuning change that makes peaks clip far more shows up here.
        it('lets a loud peak of the fitted cloud reach at most about 1.6 times the view edge', () => {
            const halfHeight = cameraConfig.distance * Math.tan((cameraConfig.fov * Math.PI) / 360);
            const fitted = cloud.radius * fitScale(1, cameraConfig.distance, cameraConfig.fov, 16 / 9, cloud.fill);
            expect(worstCaseExtent(fitted)).toBeLessThan(1.6 * halfHeight);
        });
    });
});
