import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { computeFraming } from './dancingCharacterFraming';

const FOV = 45;
const AZIMUTHS = [0, Math.PI / 4, Math.PI / 2, Math.PI, (5 * Math.PI) / 4];
const ASPECTS = [16 / 9, 9 / 16, 1];

// About the size of the robot, deliberately off-center so the test proves the box center is used.
function robotBox(): Box3 {
    return new Box3(new Vector3(-0.6, -0.1, -0.4), new Vector3(0.9, 4.4, 0.8));
}

function corners(box: Box3): Vector3[] {
    const result: Vector3[] = [];
    for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) result.push(new Vector3(x, y, z));
    return result;
}

function maxNdc(box: Box3, aspect: number, azimuth: number, zoom: number): number {
    const target = new Vector3();
    const distance = computeFraming(box, FOV, aspect, zoom, target);
    const camera = new PerspectiveCamera(FOV, aspect, 0.1, 100);
    camera.position.set(Math.sin(azimuth), 0, Math.cos(azimuth)).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let worst = 0;
    for (const corner of corners(box)) {
        const ndc = corner.project(camera);
        worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y));
    }
    return worst;
}

describe('computeFraming', () => {
    for (const aspect of ASPECTS) {
        for (const azimuth of AZIMUTHS) {
            it(`keeps every corner in view at aspect ${aspect.toFixed(2)}, azimuth ${azimuth.toFixed(2)}`, () => {
                const worst = maxNdc(robotBox(), aspect, azimuth, 1);
                expect(worst).toBeLessThanOrEqual(1);
                // The fit is not wastefully loose either: the margin is 15 %, so the widest corner uses most of the view.
                expect(worst).toBeGreaterThan(0.5);
            });
        }
    }

    it('writes the box center into out', () => {
        const out = new Vector3();
        computeFraming(robotBox(), FOV, 1, 1, out);
        expect(out.x).toBeCloseTo(0.15, 10);
        expect(out.y).toBeCloseTo(2.15, 10);
        expect(out.z).toBeCloseTo(0.2, 10);
    });

    it('halves the distance at zoom 2 and keeps the zoomed-out view framed', () => {
        const target = new Vector3();
        const one = computeFraming(robotBox(), FOV, 16 / 9, 1, target);
        const two = computeFraming(robotBox(), FOV, 16 / 9, 2, target);
        expect(two).toBeCloseTo(one / 2, 10);
        expect(computeFraming(robotBox(), FOV, 16 / 9, 0.5, target)).toBeCloseTo(one * 2, 10);
        expect(maxNdc(robotBox(), 16 / 9, 0.3, 0.5)).toBeLessThanOrEqual(1);
    });

    it('needs more distance for a narrower view when the width decides, and fits a wide box', () => {
        const target = new Vector3();
        const wide = new Box3(new Vector3(-3, 0, -0.5), new Vector3(3, 1, 0.5));
        expect(computeFraming(wide, FOV, 9 / 16, 1, target)).toBeGreaterThan(
            computeFraming(wide, FOV, 16 / 9, 1, target),
        );
        for (const azimuth of AZIMUTHS) {
            expect(maxNdc(wide, 9 / 16, azimuth, 1)).toBeLessThanOrEqual(1);
            expect(maxNdc(wide, 16 / 9, azimuth, 1)).toBeLessThanOrEqual(1);
        }
    });
});
