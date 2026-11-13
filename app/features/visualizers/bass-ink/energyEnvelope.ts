import { bassInkConfig, type EnergyConfig } from './bassInkConfig';
import type { EnergyEnvelope } from './bassInkTypes';

// Root-mean-square level of a time-domain buffer (0 for an empty one).
export function rmsOfTimeDomain(samples: Float32Array): number {
    if (samples.length === 0) {
        return 0;
    }
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
}

// Fast and slow followers of the loudness. Only their ratio is used downstream, so the result does not depend on the
// master volume or capture gain, the way an absolute threshold would.
export class EnergyTracker implements EnergyEnvelope {
    fast = 0;
    slow = 0;
    ratio = 1;
    private seeded = false;
    private readonly config: EnergyConfig;

    constructor(config: EnergyConfig = bassInkConfig.energy) {
        this.config = config;
    }

    update(rms: number, dtSeconds: number): void {
        const config = this.config;
        if (!this.seeded) {
            // The first real sound seeds both followers, otherwise the slow one would start at 0 and the ratio at
            // "huge", which reads as a drop.
            if (rms <= config.silenceFloor) {
                return;
            }
            this.fast = rms;
            this.slow = rms;
            this.seeded = true;
        } else {
            // Exponential smoothing with the exact step, so 30 and 60 fps give the same envelope.
            const dt = Math.max(0, dtSeconds);
            this.fast += (rms - this.fast) * (1 - Math.exp(-dt / config.fastTauSeconds));
            this.slow += (rms - this.slow) * (1 - Math.exp(-dt / config.slowTauSeconds));
        }
        this.ratio = this.slow > config.silenceFloor ? this.fast / this.slow : 1;
    }

    reset(): void {
        this.fast = 0;
        this.slow = 0;
        this.ratio = 1;
        this.seeded = false;
    }
}
