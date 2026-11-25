import { bassInkSceneConfig } from './bassInkSceneConfig';
import { writeFormation } from './formations';

// Sizing the cloud to the viewport. The camera stays where it is (the orbit view owns it and a user can drag it); what
// changes is the cloud's world radius, so the picture fills the screen at any window shape.

// Points sampled per formation when measuring its extent: enough for a stable 95th percentile, cheap enough for the
// mount and resize that are the only callers.
const DEFAULT_SAMPLE_COUNT = 20000;
const P95 = 0.95;

// Multiplier on bassInkSceneConfig.cloud.radius so a formation whose rest points have 95th-percentile radius
// `p95Radius` (unit-formation units, as seen from the camera after the tilt) projects to `fill` times the viewport's
// smaller half-dimension for a camera at `cameraDistance` on the z axis with vertical field of view `fovDeg` and
// aspect width/height. The 95th percentile, not the maximum, so a few stray points do not shrink the whole picture.
export function fitScale(
    p95Radius: number,
    cameraDistance: number,
    fovDeg: number,
    aspect: number,
    fill: number,
): number {
    // Half-height of the view at the cloud's center plane; the half-width is that times the aspect.
    const halfHeight = cameraDistance * Math.tan((fovDeg * Math.PI) / 360);
    const smallerHalf = halfHeight * Math.min(1, aspect);
    return (fill * smallerHalf) / (bassInkSceneConfig.cloud.radius * p95Radius);
}

// Worst-case outward reach of a rim point at rest radius 1, in world units at a given uRadius, summing breathing,
// beat punch, bass swell, kick-wave max and spectrum amplitude from the config constants. Loud peaks may clip at the edge
// of the view by design: the fit is made for the cloud at rest, and this is what the cloud can briefly reach beyond it.
export function worstCaseExtent(radius: number, config: typeof bassInkSceneConfig = bassInkSceneConfig): number {
    // The scale terms multiply; the shockwave and the spectrum add world units on top of the scaled position.
    const breathing = 1 + config.cloud.breathingAmplitude;
    const punch = 1 + config.cloud.beatPunch;
    // The bass swell joins the multiplied terms, at its full amplitude.
    const swell = 1 + config.cloud.swellAmplitude;
    return radius * breathing * punch * swell + config.wave.maxDisplacement + config.spectrum.amplitude;
}

// 95th-percentile radius of a unit formation's points as the camera sees them: the distance from the view axis after
// the scene's tilt about x. Sampled with writeFormation; allocation is fine, it runs on mount and on resize only, never
// per frame.
export function formationP95Radius(index: number, seed: number, sampleCount: number = DEFAULT_SAMPLE_COUNT): number {
    const points = new Float32Array(sampleCount * 3);
    writeFormation(index, seed, points, sampleCount, 0, sampleCount);
    const cos = Math.cos(bassInkSceneConfig.cloud.tilt);
    const sin = Math.sin(bassInkSceneConfig.cloud.tilt);
    const radii = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
        const x = points[i * 3];
        const y = points[i * 3 + 1];
        const z = points[i * 3 + 2];
        radii[i] = Math.hypot(x, y * cos - z * sin);
    }
    radii.sort();
    return radii[Math.min(sampleCount - 1, Math.floor(P95 * sampleCount))];
}
