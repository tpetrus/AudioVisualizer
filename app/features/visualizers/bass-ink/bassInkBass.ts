import { bassInkSceneConfig } from './bassInkSceneConfig';

// The bass reaction that needs no tempo lock and no learned gate: the whole cloud swells and glows on every bass hit,
// like the cubes' backdrop does. The input is the scene's own `lastGateBass`, the hub's gate bass already stepped through
// the shared bump envelope each frame, so no second envelope is kept here.
export interface BassSwell {
    // Radial swell of the cloud, 0..1.
    swell: number;
    // Strength of the brightness glow, 0..1 (it still goes through BrightnessMix).
    glow: number;
}

// A step longer than this is a stalled tab, not time passing, so the running level does not jump on it.
const MAX_STEP_SECONDS = 0.1;

// The bump envelope alone cannot say "a hit": on real music it sits high for long stretches (its median over four
// measured tracks, a beatless one included, was 0.22 to 0.50), so a fixed floor and gain held the cloud enlarged. This
// shaper measures the bump against its own running level, which climbs slowly and drops quickly. A sustained plateau
// is absorbed into that level and rests at 0, a fresh rise stands out above it, and after a hit ends the level falls
// back fast so the next hit is not suppressed. State is the one number; allocates nothing and uses time, not frames.
export class BassSwellShaper {
    private level = 0;
    private seeded = false;

    // Advances by `deltaSeconds` with the latest bump (0..1) and writes swell and glow (the same level, 0..1; the glow's
    // thresholds live in BrightnessMix).
    public step(lastGateBass: number, deltaSeconds: number, out: BassSwell): void {
        const { swellOffset, swellGain, swellRiseSeconds, swellFallSeconds } = bassInkSceneConfig.bass;
        // NaN would pass both clamps below, so it reads as no pulse and leaves the running level alone.
        if (!Number.isFinite(lastGateBass)) {
            out.swell = 0;
            out.glow = 0;
            return;
        }
        // The first frame starts the level at the input so a scene that begins mid-plateau does not open with a swell.
        if (!this.seeded) {
            this.seeded = true;
            this.level = lastGateBass;
        }
        const level = Math.min(1, Math.max(0, (lastGateBass - this.level - swellOffset) * swellGain));
        out.swell = level;
        out.glow = level;

        // A delta that is not finite or not positive reads as no time passing.
        const dt = Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), MAX_STEP_SECONDS) : 0;
        const seconds = lastGateBass > this.level ? swellRiseSeconds : swellFallSeconds;
        this.level += (lastGateBass - this.level) * (1 - Math.exp(-dt / seconds));
    }
}
