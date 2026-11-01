import {
    ORBIT_BASE_SPEED,
    ORBIT_MAX_BPM,
    ORBIT_MAX_CHANGE_PER_SECOND,
    ORBIT_MAX_SPEED,
    ORBIT_MIN_BPM,
    ORBIT_SLEW_RATE,
} from './dancingCharacterConfig';

// Angular speed of the camera orbit in rad/s. Faster music orbits faster (smoothstep between the base and the max
// speed), an unknown tempo drifts at the base speed. `prev` is last frame's result: the result eases toward the target
// and is also rate limited, so a tempo estimate flipping an octave never makes the camera lurch.
export function orbitAngularSpeed(
    normalizedBpm: number | undefined,
    orbitSpeedSetting: number,
    prev: number,
    dt: number,
): number {
    let blend = 0;
    if (normalizedBpm !== undefined) {
        const t = Math.min(1, Math.max(0, (normalizedBpm - ORBIT_MIN_BPM) / (ORBIT_MAX_BPM - ORBIT_MIN_BPM)));
        blend = t * t * (3 - 2 * t);
    }
    const target = orbitSpeedSetting * (ORBIT_BASE_SPEED + (ORBIT_MAX_SPEED - ORBIT_BASE_SPEED) * blend);

    const step = (target - prev) * (1 - Math.exp(-ORBIT_SLEW_RATE * dt));
    const limit = ORBIT_MAX_CHANGE_PER_SECOND * dt;
    return prev + Math.min(limit, Math.max(-limit, step));
}
