import { DOLLY_CLAMP_FRACTION, DOLLY_MAX_FRACTION } from './dancingCharacterConfig';

// How far the bass pulls the camera in, in scene units. It is a fraction of the live fitted distance rather than a
// fixed length, so the push looks the same in portrait and landscape and can never carry the camera into the dancer.
// The bass value is the shared pulse straight from the frame: it already has its own attack and release, so no extra
// smoothing is added here. Anything that is not a positive finite number gives 0. Allocates nothing.
export function stepCameraDolly(bassValue: number, strength: number, distance: number): number {
    if (!(bassValue > 0 && strength > 0 && distance > 0)) return 0;
    if (!(Number.isFinite(bassValue) && Number.isFinite(strength) && Number.isFinite(distance))) return 0;
    return Math.min(bassValue * strength * DOLLY_MAX_FRACTION, DOLLY_CLAMP_FRACTION) * distance;
}
