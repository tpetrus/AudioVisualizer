import { bassInkConfig, type BrightnessConfig } from './bassInkConfig';
import { BrightnessGovernor } from './brightnessGovernor';
import type { DirectorCue } from './bassInkTypes';

// The single place every global-brightness term goes through (plan F3). Kick flashes, the drop burst and the core gain
// steps all ask the governor, and the level only ever rises on a granted frame, so the total number of brightness
// increases in any second is bounded no matter how the terms line up. Ripples are displacement only and never come here.
export class BrightnessMix {
    // Current global brightness boost, 0 or more.
    level = 0;
    // Monotonic count of granted increases, for telemetry and tests.
    grantCount = 0;
    private lastDropAt = -1;
    private lastTension = 0;
    // Times of recent granted kick flashes, newest overwriting oldest, for the per-second kick cap.
    private readonly kickGrants: Float64Array;
    private kickHead = 0;
    private readonly config: BrightnessConfig;
    private readonly governor: BrightnessGovernor;

    constructor(
        config: BrightnessConfig = bassInkConfig.brightness,
        governor: BrightnessGovernor = new BrightnessGovernor(),
    ) {
        this.config = config;
        this.governor = governor;
        this.kickGrants = new Float64Array(config.kickFlashMaxPerSecond).fill(-Infinity);
    }

    update(
        cue: DirectorCue,
        kickFired: boolean,
        kickStrength: number,
        nowSeconds: number,
        dtSeconds: number,
        intensity: number,
    ): number {
        const config = this.config;
        // Decay first, so a grant on this frame is the peak the frame shows.
        this.level *= Math.exp(-Math.max(0, dtSeconds) / config.decayTauSeconds);

        // Most important term first: if the window is nearly full, the drop gets the slot before a kick flash does.
        if (cue.dropAt !== this.lastDropAt) {
            this.lastDropAt = cue.dropAt;
            if (cue.dropAt >= 0) {
                this.grant(config.dropBurst, nowSeconds, intensity);
            }
        }

        // One request per upward crossing of each step; coming back down re-arms it.
        const steps = config.coreStepTension;
        for (let i = 0; i < steps.length; i++) {
            if (this.lastTension < steps[i] && cue.tension >= steps[i]) {
                this.grant(config.coreStepGain, nowSeconds, intensity);
            }
        }
        this.lastTension = cue.tension;

        // The slot about to be overwritten holds the oldest kick grant: if it is under a second old, the cap is reached.
        if (kickFired && nowSeconds - this.kickGrants[this.kickHead] >= 1) {
            const amount = config.kickFlash * Math.min(1, Math.max(0, kickStrength));
            if (this.grant(amount, nowSeconds, intensity)) {
                this.kickGrants[this.kickHead] = nowSeconds;
                this.kickHead = (this.kickHead + 1) % this.kickGrants.length;
            }
        }
        return this.level;
    }

    private grant(amount: number, nowSeconds: number, intensity: number): boolean {
        const granted = this.governor.request(amount, nowSeconds, intensity);
        if (granted > 0) {
            this.level = Math.max(this.level, granted);
            this.grantCount++;
            return true;
        }
        return false;
    }
}
