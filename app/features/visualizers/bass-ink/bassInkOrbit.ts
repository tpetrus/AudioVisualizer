import type * as THREE from 'three';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { followLevel } from './energyEnvelope';

const TWO_PI = Math.PI * 2;

function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

// Follows the raw combined band level (0..1) with an attack and a release, so a single loud frame does not speed the
// camera up. A non-finite raw level counts as silence.
export function smoothCombined(prev: number, raw: number, dt: number): number {
    const { attackSeconds, releaseSeconds } = bassInkSceneConfig.orbit;
    const target = Math.min(1, Math.max(0, finiteOrZero(raw)));
    const next = followLevel(finiteOrZero(prev), target, attackSeconds, releaseSeconds, finiteOrZero(dt));
    return Math.min(1, Math.max(0, next));
}

// Angular speed of the camera orbit in rad/s, never negative. A fuller sound orbits faster (smoothstep between the
// floor and the cap speed), silence keeps the floor, and the camera-drift setting scales it all. `prev` is last frame's
// result: the speed eases toward its target and is also rate limited, so the camera never lurches. With reduced motion
// or no drift the speed is exactly 0 at once, which leaves the camera where it is.
export function orbitAngularSpeed(
    combined: number,
    driftSetting: number,
    prev: number,
    dt: number,
    reducedMotion: boolean,
): number {
    if (reducedMotion || !(driftSetting > 0) || !Number.isFinite(driftSetting)) {
        return 0;
    }
    const { levelLow, levelHigh, floorSpeed, capSpeed, slewRate, maxChangePerSecond } = bassInkSceneConfig.orbit;
    const t = Math.min(1, Math.max(0, (finiteOrZero(combined) - levelLow) / (levelHigh - levelLow)));
    const blend = t * t * (3 - 2 * t);
    const target = driftSetting * (floorSpeed + (capSpeed - floorSpeed) * blend);

    const step = Math.max(0, finiteOrZero(dt));
    const previous = Math.max(0, finiteOrZero(prev));
    const eased = (target - previous) * (1 - Math.exp(-slewRate * step));
    const limit = maxChangePerSecond * step;
    return Math.max(0, previous + Math.min(limit, Math.max(-limit, eased)));
}

// Advances the orbit angle by speed * dt, at most maxStepPerFrame, and wraps it to [0, 2π). It never goes backward
// except by the wrap.
export function stepOrbitAngle(angle: number, speed: number, dt: number): number {
    const advance = Math.min(
        Math.max(0, finiteOrZero(speed) * finiteOrZero(dt)),
        bassInkSceneConfig.orbit.maxStepPerFrame,
    );
    const next = finiteOrZero(angle) + advance;
    return ((next % TWO_PI) + TWO_PI) % TWO_PI;
}

// Writes the camera position: (0, 0, distance) turned by `azimuth` about the axis (0, cos tilt, sin tilt), which leans
// from vertical by `tilt`. At azimuth 0 it is exactly (0, 0, distance), the default pose, so Reset view and the first
// frame are unchanged. This is Rodrigues' rotation formula with the start vector on the z axis.
export function writeOrbitPose(out: THREE.Vector3, azimuth: number, tilt: number, distance: number): void {
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    const cosAzimuth = Math.cos(azimuth);
    const sinAzimuth = Math.sin(azimuth);
    out.set(
        cosTilt * sinAzimuth * distance,
        // The added 0 turns a negative zero (a negative tilt at azimuth 0) into the exact 0 of the default pose.
        cosTilt * sinTilt * (1 - cosAzimuth) * distance + 0,
        (cosAzimuth + sinTilt * sinTilt * (1 - cosAzimuth)) * distance,
    );
}
