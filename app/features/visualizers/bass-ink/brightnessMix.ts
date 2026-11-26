import { bassInkConfig, type BrightnessConfig } from './bassInkConfig';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { BrightnessGovernor } from './brightnessGovernor';
import type { DirectorCue } from './bassInkTypes';

// The single place every global-brightness term goes through (plan F3). Kick flashes, the drop burst and the core gain
// steps all ask the governor (a core step that finds the soft cap full waits and is retried, and while it waits it goes
// ahead of the kick flashes and bass glows, so a kick-driven build cannot starve it), and the level only ever rises on a granted frame, so the total number of brightness
// increases in any second is bounded no matter how the terms line up. Ripples are displacement only and never come here.
export class BrightnessMix {
    // Current global brightness boost, 0 or more.
    level = 0;
    // Monotonic count of granted increases, for telemetry and tests.
    grantCount = 0;
    private lastDropAt = -1;
    private lastTension = 0;
    // Requests the governor or the soft cap turned down, for telemetry and tests.
    deniedCount = 0;
    // Times of recent granted kick flashes, bass glows and core steps, newest overwriting oldest, for their shared per-second cap.
    private readonly softGrants: Float64Array;
    private softHead = 0;
    // False after a glow crossing until the glow has fallen below the re-arm level.
    private glowArmed = true;
    // The highest core-step threshold whose request was turned down and is still waiting for a slot, or -1 for none. One
    // slot is enough: the steps all add the same gain, and one retry after a crossing of several covers the lot.
    private pendingStepTension = -1;
    private pendingStepGain = 0;
    private readonly config: BrightnessConfig;
    private readonly governor: BrightnessGovernor;

    constructor(
        config: BrightnessConfig = bassInkConfig.brightness,
        governor: BrightnessGovernor = new BrightnessGovernor(),
    ) {
        this.config = config;
        this.governor = governor;
        this.softGrants = new Float64Array(config.kickFlashMaxPerSecond).fill(-Infinity);
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

        // A step that was turned down waits for a free slot, but only while the tension that asked for it still holds:
        // if tension fell back below it, the moment has passed and a late step would be a surprise.
        if (this.pendingStepTension >= 0) {
            if (cue.tension < this.pendingStepTension) {
                this.pendingStepTension = -1;
            } else if (this.grantSoft(this.pendingStepGain, nowSeconds, intensity)) {
                this.pendingStepTension = -1;
            }
        }

        // One request per upward crossing of each step; coming back down re-arms it. A denied request is kept as pending
        // instead of being lost, and a crossing while one is already waiting just raises it (no second request this frame).
        const steps = config.coreStepTension;
        for (let i = 0; i < steps.length; i++) {
            if (this.lastTension < steps[i] && cue.tension >= steps[i]) {
                if (this.pendingStepTension >= 0 || !this.grantSoft(config.coreStepGain, nowSeconds, intensity)) {
                    this.pendingStepTension = Math.max(this.pendingStepTension, steps[i]);
                    this.pendingStepGain = config.coreStepGain;
                }
            }
        }
        this.lastTension = cue.tension;

        // While a core step waits, kick flashes stay out so the next free slot goes to the step.
        if (kickFired && this.pendingStepTension < 0) {
            this.grantSoft(config.kickFlash * Math.min(1, Math.max(0, kickStrength)), nowSeconds, intensity);
        }
        return this.level;
    }

    // A lift on every bass pulse, with no tempo lock needed: asks once when `glow` (0..1) rises through the arm level and
    // again only after it has fallen below the lower re-arm level. It goes through the same soft cap as the kick flashes,
    // so the shared per-second cap and the governor's limit still bound the brightness increases. Call it after update().
    requestBassGlow(glow: number, nowSeconds: number, intensity: number): void {
        const { glowArm, glowRearm, glowAmount } = bassInkSceneConfig.bass;
        if (this.glowArmed) {
            if (glow >= glowArm) {
                this.glowArmed = false;
                // A glow that arrives while a core step waits is spent without lifting anything, so there is no late glow.
                if (this.pendingStepTension < 0) {
                    this.grantSoft(glowAmount * Math.min(1, glow), nowSeconds, intensity);
                }
            }
        } else if (glow < glowRearm) {
            this.glowArmed = true;
        }
    }

    // Core steps, kick flashes and bass glows share one cap below the governor's limit, so the drop burst always finds a slot. The
    // slot about to be overwritten holds the oldest such grant: if it is under a second old, the cap is reached.
    private grantSoft(amount: number, nowSeconds: number, intensity: number): boolean {
        if (nowSeconds - this.softGrants[this.softHead] < 1) {
            this.deniedCount++;
            return false;
        }
        if (this.grant(amount, nowSeconds, intensity)) {
            this.softGrants[this.softHead] = nowSeconds;
            this.softHead = (this.softHead + 1) % this.softGrants.length;
            return true;
        }
        return false;
    }

    private grant(amount: number, nowSeconds: number, intensity: number): boolean {
        const granted = this.governor.request(amount, nowSeconds, intensity);
        if (granted > 0) {
            this.level = Math.max(this.level, granted);
            this.grantCount++;
            return true;
        }
        // A zero amount (silence, intensity 0) is not a denial.
        if (amount > 0) {
            this.deniedCount++;
        }
        return false;
    }
}
