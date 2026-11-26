import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FORMATION_COUNT } from './bassInkTypes';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { writeFormation } from './formations';
import { bassInkConfig } from './bassInkConfig';
import {
    coreWorstCaseExtent,
    fitScale,
    formationOuterRadius,
    shellWorstCaseReach,
    sprayMaxReach,
    worstCaseExtent,
} from './framing';

const SEED = 7;
const POINTS = 20000;
const ASPECTS = [1920 / 1080, 1024 / 768];
const { camera: cameraConfig, cloud } = bassInkSceneConfig;
const { fov, distance } = cameraConfig;

interface Measure {
    // Largest projected radius of any point after every pulse peaks (share of the smaller half-dimension).
    worst: number;
    // 95th percentile of the resting projected radii (the same share).
    restP95: number;
}

// Projects the real formation points (tilted and scaled as the scene does) through a real perspective camera, at rest
// and again pushed out by the worst case at the default controls: the scale terms at their peak, then the kick-wave cap
// and the turbulence bound outward along the point's direction, then the spectrum amplitude outward in the view plane
// (as the shader does after the camera transform).
function measure(index: number, aspect: number): Measure {
    const camera = new THREE.PerspectiveCamera(fov, aspect, cameraConfig.near, cameraConfig.far);
    camera.position.set(0, 0, distance);
    camera.updateMatrixWorld();

    const points = new Float32Array(POINTS * 3);
    writeFormation(index, SEED, points, POINTS, 0, POINTS);
    const radius = cloud.radius * fitScale(formationOuterRadius(index, SEED), distance, fov, aspect, cloud.fill);
    const object = new THREE.Object3D();
    object.rotation.x = cloud.tilt;
    object.updateMatrixWorld();
    const factor = (1 + cloud.breathingAmplitude) * (1 + cloud.beatPunch) * (1 + cloud.swellAmplitude);
    // Turbulence control 1 and mid level 1; the swirl vector is at most sqrt(3) * 2 long and is scaled by amount * 0.5.
    const turbulence = Math.sqrt(3) * (bassInkSceneConfig.turbulence.base + bassInkSceneConfig.turbulence.midGain);
    const absolute = bassInkSceneConfig.wave.maxDisplacement + turbulence;

    // NDC spans -1..1 on both axes and the width is `aspect` times the height, so scale x to height units first.
    const smaller = Math.min(1, aspect);
    const share = (v: THREE.Vector3) => Math.hypot(v.x * aspect, v.y) / smaller;
    const point = new THREE.Vector3();
    const view = new THREE.Vector3();
    const rest: number[] = [];
    let worst = 0;
    for (let i = 0; i < POINTS; i++) {
        point
            .fromArray(points, i * 3)
            .multiplyScalar(radius)
            .applyMatrix4(object.matrixWorld);
        rest.push(share(view.copy(point).project(camera)));

        // Scale peak, then the absolute pushes outward along the point's own direction from the center.
        const length = point.length() * factor;
        point.multiplyScalar(factor);
        if (length > 0) point.multiplyScalar(1 + absolute / length);
        view.copy(point).applyMatrix4(camera.matrixWorldInverse);
        const sideways = Math.hypot(view.x, view.y);
        if (sideways > 0) {
            view.x += (view.x / sideways) * bassInkSceneConfig.spectrum.amplitude;
            view.y += (view.y / sideways) * bassInkSceneConfig.spectrum.amplitude;
        }
        view.applyMatrix4(camera.projectionMatrix);
        worst = Math.max(worst, share(view));
    }
    rest.sort((a, b) => a - b);
    return { worst, restP95: rest[Math.floor(0.95 * POINTS)] };
}

describe('core and spray fit inside the shell', () => {
    for (const aspect of ASPECTS) {
        for (let index = 0; index < FORMATION_COUNT; index++) {
            it(`formation ${index} at aspect ${aspect.toFixed(2)}: the core's envelope and the spray's reach stay within the shell's worst-case extent`, () => {
                const outer = formationOuterRadius(index, bassInkConfig.director.formationSeed);
                const radius = cloud.radius * fitScale(outer, distance, fov, aspect, cloud.fill);
                const shell = shellWorstCaseReach(radius, outer);
                const core = coreWorstCaseExtent(radius);
                const spray = sprayMaxReach(radius, index);
                expect(core).toBeLessThanOrEqual(shell);
                expect(spray).toBeLessThanOrEqual(shell);
            });
        }
    }

    it('coreWorstCaseExtent grows with the shell radius and is below a core with the shell displacements', () => {
        const { core } = bassInkSceneConfig;
        const outer = formationOuterRadius(core.formation, bassInkConfig.director.formationSeed);
        expect(coreWorstCaseExtent(6)).toBeGreaterThan(coreWorstCaseExtent(3));
        expect(coreWorstCaseExtent(4)).toBeLessThan(shellWorstCaseReach(4 * core.radiusScale, outer));
    });

    it('sprayMaxReach is the rest radius plus speed times drag', () => {
        const { speed, dragSeconds } = bassInkSceneConfig.spray;
        const outer = formationOuterRadius(1, bassInkConfig.director.formationSeed);
        expect(sprayMaxReach(5, 1)).toBeCloseTo(outer * 5 + speed * dragSeconds, 12);
    });
});

describe('framing', () => {
    describe('AC1: the whole cloud stays on screen at the peak of every pulse and the rest shape still fills it', () => {
        for (const aspect of ASPECTS) {
            // Iterated over the count, so a new formation is covered without editing this spec.
            for (let index = 0; index < FORMATION_COUNT; index++) {
                it(`formation ${index} stays within 95% at the worst case and fills at least 40% at rest at aspect ${aspect.toFixed(2)}`, () => {
                    const { worst, restP95 } = measure(index, aspect);
                    expect(worst).toBeLessThanOrEqual(0.95);
                    expect(restP95).toBeGreaterThanOrEqual(0.4);
                });
            }
        }
    });

    describe('fitScale', () => {
        it('solves the radius so the worst-case extent is exactly the fill share', () => {
            for (const aspect of [16 / 9, 4 / 3, 0.5]) {
                const radius = cloud.radius * fitScale(1, distance, fov, aspect, 0.95);
                expect(worstCaseExtent(radius, 1, distance, fov, aspect)).toBeCloseTo(0.95, 6);
            }
        });

        it('shrinks the cloud in a portrait view, where the width is the smaller dimension', () => {
            expect(fitScale(1, distance, fov, 0.5, 0.95)).toBeLessThan(fitScale(1, distance, fov, 16 / 9, 0.95));
        });

        it('grows when the formation is smaller and shrinks as the fill falls', () => {
            expect(fitScale(0.6, distance, fov, 1.5, 0.95)).toBeGreaterThan(fitScale(1, distance, fov, 1.5, 0.95));
            expect(fitScale(1, distance, fov, 1.5, 0.5)).toBeLessThan(fitScale(1, distance, fov, 1.5, 0.95));
        });

        it('is zero when even a point-sized cloud would pass the fill share', () => {
            expect(fitScale(1, distance, fov, 16 / 9, 0.01)).toBe(0);
        });

        it('follows a config passed in: with no pulses the radius is a plain share of the view', () => {
            const quiet = {
                ...bassInkSceneConfig,
                cloud: { ...cloud, breathingAmplitude: 0, beatPunch: 0, swellAmplitude: 0 },
                wave: { ...bassInkSceneConfig.wave, maxDisplacement: 0 },
                spectrum: { ...bassInkSceneConfig.spectrum, amplitude: 0 },
                turbulence: { ...bassInkSceneConfig.turbulence, base: 0, midGain: 0 },
            };
            const radius = cloud.radius * fitScale(1, distance, fov, 16 / 9, 0.8, quiet);
            // A bare sphere of this radius projects to tan(asin(r / d)), against the half-height tan(fov / 2).
            const expected = distance * Math.sin(Math.atan(0.8 * Math.tan((fov * Math.PI) / 360)));
            // The worst direction is sampled every degree, so the answer is within a thousandth of a world unit.
            expect(radius).toBeCloseTo(expected, 2);
        });
    });

    describe('formationOuterRadius', () => {
        it('measures every formation as a positive radius of about one unit, never above one', () => {
            for (let index = 0; index < FORMATION_COUNT; index++) {
                const radius = formationOuterRadius(index, SEED);
                expect(radius).toBeGreaterThan(0.8);
                expect(radius).toBeLessThanOrEqual(1.001);
            }
        });

        it('is the maximum of the sampled points, so fewer samples give a similar answer', () => {
            expect(formationOuterRadius(0, SEED, 2000)).toBeCloseTo(formationOuterRadius(0, SEED), 1);
        });
    });

    describe('worstCaseExtent', () => {
        it('grows with the radius and with the outermost point', () => {
            expect(worstCaseExtent(6, 1, distance, fov, 1.5)).toBeGreaterThan(
                worstCaseExtent(3, 1, distance, fov, 1.5),
            );
            expect(worstCaseExtent(3, 1, distance, fov, 1.5)).toBeGreaterThan(
                worstCaseExtent(3, 0.5, distance, fov, 1.5),
            );
        });

        it('is larger in a portrait view of the same height, where the width limits', () => {
            expect(worstCaseExtent(3, 1, distance, fov, 0.5)).toBeGreaterThan(
                worstCaseExtent(3, 1, distance, fov, 1.5),
            );
        });

        it('is infinite once the pushed-out cloud reaches the camera', () => {
            expect(worstCaseExtent(distance, 1, distance, fov, 1.5)).toBe(Infinity);
        });

        it('adds the absolute displacements on top of the scaled radius', () => {
            const none = {
                ...bassInkSceneConfig,
                wave: { ...bassInkSceneConfig.wave, maxDisplacement: 0 },
                spectrum: { ...bassInkSceneConfig.spectrum, amplitude: 0 },
                turbulence: { ...bassInkSceneConfig.turbulence, base: 0, midGain: 0 },
            };
            expect(worstCaseExtent(3, 1, distance, fov, 1.5)).toBeGreaterThan(
                worstCaseExtent(3, 1, distance, fov, 1.5, none),
            );
        });
    });
});
