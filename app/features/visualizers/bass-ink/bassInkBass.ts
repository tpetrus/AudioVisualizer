import { bassInkSceneConfig } from './bassInkSceneConfig';

// The bass reaction that needs no tempo lock and no learned gate: the whole cloud swells and glows on every bass pulse,
// like the cubes' backdrop does. The input is the scene's own `lastGateBass`, the hub's gate bass already stepped through
// the shared bump envelope each frame, so no second envelope is kept here.
export interface BassSwell {
    // Radial swell of the cloud, 0..1.
    swell: number;
    // Strength of the brightness glow, 0..1 (it still goes through BrightnessMix).
    glow: number;
}

// Pure and allocation-free: a small floor keeps the noise floor still, a gain makes a kick-sized pulse clearly visible,
// and the result is clamped to 0..1. Swell and glow are the same level; the glow's thresholds live in BrightnessMix.
export function swellFromBump(lastGateBass: number, out: BassSwell): void {
    const { swellFloor, swellGain } = bassInkSceneConfig.bass;
    // NaN would pass both clamps below, so it reads as no pulse.
    const level = Number.isFinite(lastGateBass) ? Math.min(1, Math.max(0, (lastGateBass - swellFloor) * swellGain)) : 0;
    out.swell = level;
    out.glow = level;
}
