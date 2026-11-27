import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FORMATION_COUNT } from './bassInkTypes';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { writeFormation } from './formations';
import { bassInkConfig } from './bassInkConfig';
import { SPRAY_JITTER } from './sprayPool';
import {
    coreWorstCaseExtent,
    fitScale,
    formationOuterRadius,
    grownFitScale,
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
    // Largest projected distance of any shell or spray point from the view's center after every pulse peaks, along
    // the width or the height, each as a share of that half of the view (NDC), over every view angle checked.
    worst: number;
    // 95th percentile of the resting projected radii at the reset tilt (share of the smaller half-dimension).
    restP95: number;
}

// The fit the scene gives a formation (useBassInkScene: grownFitScale with the formation's growth).
function fittedScale(index: number, aspect: number): number {
    return grownFitScale(
        formationOuterRadius(index, SEED),
        cloud.formationGrowth[index],
        distance,
        fov,
        aspect,
        cloud.fill,
    );
}

// View angles the worst case is checked at: the section swing's whole tilt range (ends and middle) and turns around
// the whole circle, since the drift turns the cloud through every angle.
const TILTS = [-1, 0, 1].map((k) => cloud.tilt + k * bassInkSceneConfig.view.tiltSwing);
const YAWS = Array.from({ length: 8 }, (_, k) => (k / 8) * 2 * Math.PI);

// Projects the real formation points (tilted, turned and scaled as the scene does) through a real perspective camera,
// at rest and again pushed out by the worst case at the default controls: the scale terms at their peak, then the
// kick-wave cap and the turbulence bound outward along the point's direction, then the spectrum amplitude outward in
// the view plane (as the shader does after the camera transform). A spray point leaves the unscaled rest position and
// travels speed * dragSeconds outward; its direction can stray from straight outward by the jitter's worst (2 * the
// jitter vector's length over the distance, at most 2), counted here both sideways and toward the camera.
function measure(index: number, aspect: number, tilts: readonly number[] = TILTS): Measure {
    const camera = new THREE.PerspectiveCamera(fov, aspect, cameraConfig.near, cameraConfig.far);
    camera.position.set(0, 0, distance);
    camera.updateMatrixWorld();

    const points = new Float32Array(POINTS * 3);
    writeFormation(index, SEED, points, POINTS, 0, POINTS);
    const radius = cloud.radius * fittedScale(index, aspect);
    const object = new THREE.Object3D();
    const factor = (1 + cloud.breathingAmplitude) * (1 + cloud.beatPunch) * (1 + cloud.swellAmplitude);
    // Turbulence control 1 and mid level 1; the swirl vector is at most sqrt(3) * 2 long and is scaled by amount * 0.5.
    const turbulence = Math.sqrt(3) * (bassInkSceneConfig.turbulence.base + bassInkSceneConfig.turbulence.midGain);
    const absolute = bassInkSceneConfig.wave.maxDisplacement + turbulence;
    const travel = bassInkSceneConfig.spray.speed * bassInkSceneConfig.spray.dragSeconds;
    const jitter = (SPRAY_JITTER / 2) * Math.sqrt(3);

    // NDC spans -1..1 on both axes and the width is `aspect` times the height, so scale x to height units first.
    const smaller = Math.min(1, aspect);
    const share = (v: THREE.Vector3) => Math.hypot(v.x * aspect, v.y) / smaller;
    const axisShare = (v: THREE.Vector3) => Math.max(Math.abs(v.x), Math.abs(v.y));
    const point = new THREE.Vector3();
    const view = new THREE.Vector3();
    // Moves a view-space point outward from the view axis by `amount` (the spectrum, a stray spray direction).
    const pushSideways = (v: THREE.Vector3, amount: number) => {
        const sideways = Math.hypot(v.x, v.y);
        if (sideways > 0) {
            v.x += (v.x / sideways) * amount;
            v.y += (v.y / sideways) * amount;
        }
    };
    const rest: number[] = [];
    object.rotation.set(cloud.tilt, 0, 0);
    object.updateMatrixWorld();
    for (let i = 0; i < POINTS; i++) {
        point
            .fromArray(points, i * 3)
            .multiplyScalar(radius)
            .applyMatrix4(object.matrixWorld);
        rest.push(share(view.copy(point).project(camera)));
    }

    let worst = 0;
    for (const tilt of tilts) {
        for (const yaw of YAWS) {
            object.rotation.set(tilt, yaw, 0);
            object.updateMatrixWorld();
            for (let i = 0; i < POINTS; i++) {
                point
                    .fromArray(points, i * 3)
                    .multiplyScalar(radius)
                    .applyMatrix4(object.matrixWorld);
                const restLength = point.length();

                // Shell: scale peak, then the absolute pushes outward along the point's own direction from the center.
                const length = restLength * factor;
                view.copy(point).multiplyScalar(factor);
                if (length > 0) view.multiplyScalar(1 + absolute / length);
                view.applyMatrix4(camera.matrixWorldInverse);
                pushSideways(view, bassInkSceneConfig.spectrum.amplitude);
                view.applyMatrix4(camera.projectionMatrix);
                worst = Math.max(worst, axisShare(view));

                // Spray: from the rest position, outward by the travel, plus the worst stray.
                if (restLength > 0) {
                    const stray = travel * Math.min(2, (2 * jitter * radius) / restLength);
                    view.copy(point).multiplyScalar(1 + travel / restLength);
                    view.applyMatrix4(camera.matrixWorldInverse);
                    pushSideways(view, stray);
                    view.z += stray;
                    view.applyMatrix4(camera.projectionMatrix);
                    worst = Math.max(worst, axisShare(view));
                }
            }
        }
    }
    rest.sort((a, b) => a - b);
    return { worst, restP95: rest[Math.floor(0.95 * POINTS)] };
}

describe('core and spray fit inside the shell', () => {
    for (const aspect of ASPECTS) {
        for (let index = 0; index < FORMATION_COUNT; index++) {
            it(`formation ${index} at aspect ${aspect.toFixed(2)}: the core's envelope and the spray's reach stay within the shell's worst-case extent`, () => {
                const outer = formationOuterRadius(index, bassInkConfig.director.formationSeed);
                const radius = cloud.radius * fittedScale(index, aspect);
                const shell = shellWorstCaseReach(radius, outer);
                const core = coreWorstCaseExtent(radius);
                const spray = sprayMaxReach(radius, index);
                expect(core).toBeLessThanOrEqual(shell);
                expect(spray).toBeLessThanOrEqual(shell);
                // The core is a sphere, so it is held to the fill by its own sphere bound: the sphere of its world
                // reach, seen from the camera, stays within the fill of the smaller half of the view.
                const halfView = Math.tan((fov * Math.PI) / 360) * Math.min(1, aspect);
                expect(Math.tan(Math.asin(core / distance)) / halfView).toBeLessThanOrEqual(cloud.fill);
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

    describe('the camera orbit keeps the cloud on screen at its furthest elevation', () => {
        // At azimuth π the orbiting camera is moved by asin(sin(2 * tilt)) = 2 * tilt in elevation (up for a positive
        // lean, down for a negative one), which shows the cloud as if it were tipped that much further toward (or away
        // from) the camera, on top of the section swing's tilt range. The yaws already cover the cloud being seen from
        // any side.
        const extra = 2 * bassInkSceneConfig.orbit.tilt;
        const tilted = TILTS.flatMap((tilt) => [tilt, tilt + extra]);

        it('never looks at the flat formations closer to edge-on than 0.1 rad', () => {
            expect(Math.min(...tilted)).toBeGreaterThanOrEqual(0.1);
        });

        for (const aspect of ASPECTS) {
            for (let index = 0; index < FORMATION_COUNT; index++) {
                it(`formation ${index} stays within 95% at the extra elevation at aspect ${aspect.toFixed(2)}`, () => {
                    expect(measure(index, aspect, tilted).worst).toBeLessThanOrEqual(0.95);
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

    describe('grownFitScale', () => {
        const outer = 0.9;

        it('is fitScale times the growth on a wide view', () => {
            for (const aspect of [16 / 9, 4 / 3]) {
                const fit = fitScale(outer, distance, fov, aspect, 0.95);
                expect(grownFitScale(outer, 1.1, distance, fov, aspect, 0.95)).toBeCloseTo(fit * 1.1, 12);
            }
        });

        it('is fitScale on a square or portrait view, where the width is as tight as the height', () => {
            for (const aspect of [1, 0.5]) {
                const fit = fitScale(outer, distance, fov, aspect, 0.95);
                expect(grownFitScale(outer, 1.1, distance, fov, aspect, 0.95)).toBe(fit);
            }
        });

        it('caps the growth where the sphere bound would reach the fill of the half-width', () => {
            const aspect = 1.05;
            const capped = fitScale(outer, distance, fov, aspect, 0.95 * aspect);
            expect(grownFitScale(outer, 3, distance, fov, aspect, 0.95)).toBeCloseTo(capped, 12);
            expect(capped).toBeLessThan(3 * fitScale(outer, distance, fov, aspect, 0.95));
        });

        it('is fitScale for a growth of 1 or less or not a number, and 0 when nothing fits', () => {
            const fit = fitScale(outer, distance, fov, 16 / 9, 0.95);
            expect(grownFitScale(outer, 1, distance, fov, 16 / 9, 0.95)).toBe(fit);
            expect(grownFitScale(outer, 0.5, distance, fov, 16 / 9, 0.95)).toBe(fit);
            expect(grownFitScale(outer, Number.NaN, distance, fov, 16 / 9, 0.95)).toBe(fit);
            expect(grownFitScale(outer, 1.1, distance, fov, 16 / 9, 0.01)).toBe(0);
        });

        it('grows only the torus and the disc', () => {
            expect(cloud.formationGrowth).toHaveLength(FORMATION_COUNT);
            expect(cloud.formationGrowth[0]).toBe(1);
            expect(cloud.formationGrowth[2]).toBe(1);
            expect(cloud.formationGrowth[1]).toBeGreaterThan(1);
            expect(cloud.formationGrowth[3]).toBeGreaterThan(1);
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
