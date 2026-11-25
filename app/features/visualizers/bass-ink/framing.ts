import { bassInkSceneConfig } from './bassInkSceneConfig';
import { writeFormation } from './formations';

// Sizing the cloud to the viewport. The camera stays where it is (the orbit view owns it and a user can drag it); what
// changes is the cloud's world radius, so the whole cloud, pulses included, stays on screen at any window shape.

// Points sampled per formation when measuring its outermost point: enough to find the rim, cheap enough for the mount
// that is the only caller.
const DEFAULT_SAMPLE_COUNT = 20000;

// The control values the fit is made for: the turbulence control at its default (bassInkControls) and the mid band at
// full level. Tension is 0 because it only squeezes the cloud inward.
const TURBULENCE_CONTROL = 1;
const MID_LEVEL = 1;
// Each swirl component is a sum of two sines, so it lies in [-2, 2] and the swirl vector is at most sqrt(3) * 2 long.
// The shader adds swirl * amount * 0.5; that product of the three bounds is a safe (never exceeded) bound, a little
// above what the sines can reach together.
const SWIRL_MAX = Math.sqrt(3) * 2;
// Bisection steps for the radius; 40 halvings of a range of a few world units is far below a pixel.
const FIT_STEPS = 40;

// Largest distance the shader can push a point beyond its scaled rest position, in world units, at the default control
// values: the kick-wave cap plus the turbulence at full mid level.
function absoluteDisplacement(config: typeof bassInkSceneConfig): number {
    const amount = TURBULENCE_CONTROL * (config.turbulence.base + MID_LEVEL * config.turbulence.midGain);
    return config.wave.maxDisplacement + SWIRL_MAX * amount * 0.5;
}

// Factor by which breathing, beat punch and bass swell, all at their peak together, scale the cloud.
function scaleFactor(config: typeof bassInkSceneConfig): number {
    return (1 + config.cloud.breathingAmplitude) * (1 + config.cloud.beatPunch) * (1 + config.cloud.swellAmplitude);
}

// Angles sampled around the view axis when finding the worst direction for a point to be pushed in; the maximum is
// broad, so 180 samples (every degree) land within a fraction of a percent of it.
const DIRECTION_SAMPLES = 180;

// Worst-case on-screen reach, as a share of the viewport's smaller half-dimension, of a formation whose outermost rest
// point is `outerRadius` (unit-formation units) at world radius `radius`, for a camera at `cameraDistance` on the z axis.
// Every point lies within a sphere about the cloud's center of radius E = radius * outerRadius * scaleFactor plus the
// absolute displacements (the sphere bound does not depend on the tilt or the turn). The spectrum then moves a point
// sideways in the view plane by its amplitude without changing its depth. So the worst point sits at angle phi from the
// view axis, at x = E sin(phi) and depth distance - E cos(phi), and projects to (E sin(phi) + amplitude) / depth; the
// largest over phi is the extent. Perspective is what makes the nearer half of the cloud reach farther than a flat
// model would say. Infinity when the sphere reaches the camera.
export function worstCaseExtent(
    radius: number,
    outerRadius: number,
    cameraDistance: number,
    fovDeg: number,
    aspect: number,
    config: typeof bassInkSceneConfig = bassInkSceneConfig,
): number {
    const reach = radius * outerRadius * scaleFactor(config) + absoluteDisplacement(config);
    if (reach >= cameraDistance) {
        return Infinity;
    }
    let projected = 0;
    for (let step = 0; step <= DIRECTION_SAMPLES; step++) {
        const phi = (step / DIRECTION_SAMPLES) * Math.PI;
        const sideways = reach * Math.sin(phi) + config.spectrum.amplitude;
        projected = Math.max(projected, sideways / (cameraDistance - reach * Math.cos(phi)));
    }
    const halfView = Math.tan((fovDeg * Math.PI) / 360) * Math.min(1, aspect);
    return projected / halfView;
}

// Multiplier on bassInkSceneConfig.cloud.radius that keeps the worst-case extent of a formation with outermost rest
// point `outerRadius` at `fill` of the viewport's smaller half-dimension. The absolute displacements
// do not scale with the radius, so the radius is solved for (bisection; the extent grows with it) instead of
// multiplied. Runs on mount and resize only.
export function fitScale(
    outerRadius: number,
    cameraDistance: number,
    fovDeg: number,
    aspect: number,
    fill: number,
    config: typeof bassInkSceneConfig = bassInkSceneConfig,
): number {
    let low = 0;
    let high = cameraDistance;
    for (let step = 0; step < FIT_STEPS; step++) {
        const mid = (low + high) / 2;
        if (worstCaseExtent(mid, outerRadius, cameraDistance, fovDeg, aspect, config) <= fill) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return low / config.cloud.radius;
}

// Outermost rest point of a unit formation: the largest distance from its center over the sampled points. The maximum,
// not a percentile: every formation is bounded (shell, tube or disc rim), so there are no stray outliers, and the
// fit must hold for the very outermost point. Allocation is fine, it runs on mount only.
export function formationOuterRadius(index: number, seed: number, sampleCount: number = DEFAULT_SAMPLE_COUNT): number {
    const points = new Float32Array(sampleCount * 3);
    writeFormation(index, seed, points, sampleCount, 0, sampleCount);
    let outer = 0;
    for (let i = 0; i < sampleCount; i++) {
        outer = Math.max(outer, Math.hypot(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]));
    }
    return outer;
}
