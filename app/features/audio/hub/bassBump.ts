// A shared bass envelope for the visualizers that read the audio hub (cubes and dancing-character): it bumps when the
// low end of the music (below 130 Hz) gets louder than it has recently been. It keeps the idea of the older BassPulse
// (a fast and a slow follower, a bump being the fast one rising above the slow one, a smooth rise and a slower settle)
// but every rate is per second, so the picture reacts the same at 30, 60 or 144 fps.
import { HUB_BANDS } from '~/features/rhythm/rhythmConfig';

const SUB_BAND = HUB_BANDS.indexOf('sub');
const KICK_BAND = HUB_BANDS.indexOf('kick');

// The kick lives in the hub's `sub` and `kick` bands (20 to 130 Hz). The louder of the two is used, not a mean: kicks
// differ in pitch, and a mean would halve the level of one that sits in a single band.
export function hubLowEnd(bands: ArrayLike<number>): number {
    return Math.max(bands[SUB_BAND], bands[KICK_BAND]);
}

// The per-frame rates this envelope was tuned with, at 60 fps. Each is turned into a time-based rate by `closing`.
const REFERENCE_FPS = 60;
const FAST_RISE = 0.5;
const FAST_FALL = 0.2;
// About 1.5 s of memory, so each new hit stands out against what came before.
const SLOW_RATE = 0.01;
// The pulse rises over a couple of frames and settles over about 0.3 s, so it moves smoothly.
const PULSE_RISE = 0.45;
const PULSE_FALL = 0.12;

// The hub's bands are normalized log energies (1 is the band's loudest of the last few seconds), not linear RMS. A
// log scale squeezes level differences, so the same kick that doubled the old RMS raises the band only by a fraction:
// the margin is lower and the gain higher than BassPulse's 1.15 and 1.5.
export const BUMP_MARGIN = 1.04;
export const BUMP_GAIN = 4;
// Below this slow level the band is near silence (the hub reads 0 for silence and for a room's hiss), and a ratio of
// two tiny numbers means nothing. BassPulse used 0.005 in RMS; here 0.05 is 5% of the band's recent peak.
export const NEAR_SILENCE = 0.05;
// A stalled tab can hand over a frame of seconds; the followers should not jump a whole song's worth on it.
const MAX_STEP_SECONDS = 0.1;

// A per-frame rate k at 60 fps becomes 1 - (1 - k)^(dt * 60): the same fraction of the gap per second at any frame
// rate. Stored as ln(1 - k) so a step is one exp per rate.
const lnKeep = (rate: number) => Math.log(1 - rate);
const FAST_RISE_LN = lnKeep(FAST_RISE);
const FAST_FALL_LN = lnKeep(FAST_FALL);
const SLOW_LN = lnKeep(SLOW_RATE);
const PULSE_RISE_LN = lnKeep(PULSE_RISE);
const PULSE_FALL_LN = lnKeep(PULSE_FALL);

// Fraction of the gap to close over `frames` reference frames.
const closing = (keepLn: number, frames: number) => 1 - Math.exp(keepLn * frames);

// State is public only so DEV telemetry can read it; nothing outside `step` writes it. Allocates nothing.
export class BassBump {
    public input = 0;
    public fast = 0;
    public slow = 0;
    public ratio = 1;
    public pulse = 0;
    // False until the first level above near-silence has seeded the followers.
    private seeded = false;

    // Advances the envelope by `deltaSeconds` with the latest low-end level (0..1) and returns the pulse (0..1).
    public step(input: number, deltaSeconds: number): number {
        // Both followers start at the first audible level, not at 0: from 0 the slow one would need seconds to catch up
        // with a sustained level and the ratio would read as a huge bump the whole time. A later jump still bumps.
        if (!this.seeded && input > NEAR_SILENCE) {
            this.seeded = true;
            this.fast = input;
            this.slow = input;
        }

        const frames = Math.min(Math.max(deltaSeconds, 0), MAX_STEP_SECONDS) * REFERENCE_FPS;

        this.fast += (input - this.fast) * closing(input > this.fast ? FAST_RISE_LN : FAST_FALL_LN, frames);
        this.slow += (input - this.slow) * closing(SLOW_LN, frames);

        const ratio = this.slow > NEAR_SILENCE ? this.fast / this.slow : 1;
        this.input = input;
        this.ratio = ratio;
        const target = Math.min(1, Math.max(0, (ratio - BUMP_MARGIN) * BUMP_GAIN));

        this.pulse += (target - this.pulse) * closing(target > this.pulse ? PULSE_RISE_LN : PULSE_FALL_LN, frames);
        return this.pulse;
    }
}
