import { bassInkConfig, type KickConfig } from './bassInkConfig';
import { KICK_SLOTS, type KickRingView } from './bassInkTypes';

// Start time of an empty slot: so far in the past that its shockwave is long gone.
const EMPTY_TIME = -1e6;

// Turns the peak-held kick onset into discrete kicks and remembers the latest KICK_SLOTS of them.
export class KickRing implements KickRingView {
    readonly times = new Float32Array(KICK_SLOTS).fill(EMPTY_TIME);
    readonly strengths = new Float32Array(KICK_SLOTS);
    count = 0;
    private previous = 0;
    private lastKickTime = -Infinity;
    private readonly config: KickConfig;

    constructor(config: KickConfig = bassInkConfig.kick) {
        this.config = config;
    }

    // Returns true when this frame recorded a kick. The onset is a decaying envelope, not a pulse, so a kick is a
    // jump relative to the previous frame, not merely a high value.
    update(kickOnset: number, nowSeconds: number): boolean {
        const config = this.config;
        const rise = kickOnset - this.previous;
        this.previous = kickOnset;
        if (
            rise < config.riseDelta ||
            kickOnset < config.strengthFloor ||
            nowSeconds - this.lastKickTime < config.refractorySeconds
        ) {
            return false;
        }
        const slot = this.count % KICK_SLOTS;
        this.times[slot] = nowSeconds;
        this.strengths[slot] = Math.min(1, Math.max(0, kickOnset));
        this.count++;
        this.lastKickTime = nowSeconds;
        return true;
    }
}
