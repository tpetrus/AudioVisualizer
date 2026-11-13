import { bassInkConfig, type EnergyConfig } from './bassInkConfig';
import type { EnergyEnvelope } from './bassInkTypes';

// Root-mean-square level of a time-domain buffer (0 for an empty one).
// Number of FFT bins from bin 1 (bin 0 is the DC offset) up to `cutoffHz`, at least 1.
export function bassBinCount(sampleRate: number, fftSize: number, cutoffHz: number): number {
    const binHz = sampleRate / fftSize;
    return Math.max(1, Math.floor(cutoffHz / binHz));
}

// Mean 0..1 level of bins 1..count of a byte frequency spectrum (the analyser's dB-scaled 0..255 values).
export function bassLevel(spectrum: Uint8Array, count: number): number {
    const last = Math.min(count, spectrum.length - 1);
    if (last < 1) {
        return 0;
    }
    let sum = 0;
    for (let i = 1; i <= last; i++) {
        sum += spectrum[i];
    }
    return sum / (last * 255);
}

// Fast and slow followers of the loudness. Only their ratio is used downstream, so the result does not depend on the
// master volume or capture gain, the way an absolute threshold would.
export class EnergyTracker implements EnergyEnvelope {
    fast = 0;
    slow = 0;
    ratio = 1;
    private seeded = false;
    // Seconds of signal since seeding, while it is still shorter than the slow time constant.
    private heardSeconds = 0;
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
            this.heardSeconds = 0;
        } else {
            // Exponential smoothing with the exact step, so 30 and 60 fps give the same envelope.
            const dt = Math.max(0, dtSeconds);
            this.fast += (rms - this.fast) * (1 - Math.exp(-dt / config.fastTauSeconds));
            // Until it has heard a full time constant, the slow follower is the plain mean of everything so far. A track
            // that starts on a near-silent fade would otherwise leave it far below the music for many seconds, and the
            // ratio would read the whole intro as a surge.
            this.heardSeconds += dt;
            const slowStep = Math.max(
                1 - Math.exp(-dt / config.slowTauSeconds),
                this.heardSeconds > 0 ? dt / this.heardSeconds : 0,
            );
            this.slow += (rms - this.slow) * Math.min(1, slowStep);
        }
        this.ratio = this.slow > config.silenceFloor ? this.fast / this.slow : 1;
    }

    reset(): void {
        this.fast = 0;
        this.slow = 0;
        this.ratio = 1;
        this.seeded = false;
        this.heardSeconds = 0;
    }
}
